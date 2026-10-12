import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { authAttempts, organizations, passwordResetTokens, sessions, users } from "@/lib/db/schema";
import { resolvePermissions } from "./permissions";
import type { Ctx } from "@/lib/context";
import { AppError } from "@/lib/errors";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// Paramètres scrypt (N=2^15, r=8, p=1) : ~32 Mo de mémoire, recommandation OWASP.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const SESSION_RENEW_AFTER_MS = 24 * 3600 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export const PASSWORD_MIN = 12;

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
  if (pw.length > 200) return "Mot de passe trop long.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Utilisez au moins trois types de caractères (minuscules, majuscules, chiffres, symboles).";
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(pw.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash factice pour égaliser le temps de réponse quand l'e-mail n'existe pas. */
let dummyHash: Promise<string> | null = null;

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

// ---------------------------------------------------------------------------
// Limitation des tentatives
// ---------------------------------------------------------------------------

export const RATE = { windowMs: 15 * 60 * 1000, perAccount: 5, perIp: 30 };

export async function isRateLimited(db: DB, keys: { email: string; ip?: string | null }): Promise<boolean> {
  const since = new Date(Date.now() - RATE.windowMs);
  const count = async (key: string) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(authAttempts)
      .where(and(eq(authAttempts.key, key), eq(authAttempts.success, false), gte(authAttempts.createdAt, since)));
    return row?.n ?? 0;
  };
  if ((await count(`email:${keys.email.toLowerCase()}`)) >= RATE.perAccount) return true;
  if (keys.ip && (await count(`ip:${keys.ip}`)) >= RATE.perIp) return true;
  return false;
}

async function recordAttempt(db: DB, keys: { email: string; ip?: string | null }, success: boolean) {
  const rows = [{ key: `email:${keys.email.toLowerCase()}`, success }];
  if (keys.ip) rows.push({ key: `ip:${keys.ip}`, success });
  await db.insert(authAttempts).values(rows);
  // Nettoyage opportuniste des anciennes tentatives.
  if (Math.random() < 0.05) await db.delete(authAttempts).where(lt(authAttempts.createdAt, new Date(Date.now() - 24 * 3600 * 1000)));
}

// ---------------------------------------------------------------------------
// Connexion / sessions
// ---------------------------------------------------------------------------

export type LoginResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string };

export async function login(
  db: DB,
  input: { email: string; password: string; ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  if (await isRateLimited(db, { email, ip: input.ip })) {
    return { ok: false, error: "Trop de tentatives. Réessayez dans 15 minutes." };
  }
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!user || !user.active) {
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(input.password, await dummyHash);
    await recordAttempt(db, { email, ip: input.ip }, false);
    return { ok: false, error: "Identifiants incorrects." };
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await recordAttempt(db, { email, ip: input.ip }, false);
    return { ok: false, error: "Identifiants incorrects." };
  }
  await recordAttempt(db, { email, ip: input.ip }, true);
  await db
    .update(users)
    .set({ previousLoginAt: user.lastLoginAt, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  const { token, expiresAt } = await createSession(db, user.id, input);
  return { ok: true, token, expiresAt };
}

export async function createSession(db: DB, userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

/** Valide un jeton de session et construit le contexte (utilisateur, organisation, permissions). */
export async function contextFromToken(db: DB, token: string | undefined | null): Promise<(Ctx & { renewed?: Date }) | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const [row] = await db
    .select({ session: sessions, user: users, org: organizations })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.user.active) return null;
  let renewed: Date | undefined;
  if (row.session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - SESSION_RENEW_AFTER_MS) {
    renewed = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt: renewed }).where(eq(sessions.id, id));
  }
  return {
    db,
    user: {
      id: row.user.id,
      orgId: row.user.orgId,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      previousLoginAt: row.user.previousLoginAt,
    },
    org: { id: row.org.id, name: row.org.name, settings: row.org.settings },
    perms: resolvePermissions(row.user.role, row.user.extraPermissions, row.org.settings.rolePermissions),
    renewed,
  };
}

export async function revokeSession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function revokeAllSessions(db: DB, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ---------------------------------------------------------------------------
// Récupération de compte
// ---------------------------------------------------------------------------

/** Crée un jeton de réinitialisation (renvoyé en clair UNE fois, stocké haché). Null si e-mail inconnu. */
export async function createResetToken(db: DB, email: string): Promise<{ token: string; userId: string; name: string; email: string } | null> {
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).limit(1);
  if (!user || !user.active) return null;
  const token = newToken();
  await db.insert(passwordResetTokens).values({
    tokenHash: sha256(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  return { token, userId: user.id, name: user.name, email: user.email };
}

export async function createResetTokenForUser(db: DB, userId: string, ttlMs = RESET_TTL_MS): Promise<string> {
  const token = newToken();
  await db.insert(passwordResetTokens).values({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

export async function resetPassword(db: DB, token: string, newPassword: string): Promise<void> {
  const weak = validatePasswordStrength(newPassword);
  if (weak) throw new AppError(weak, "VALIDATION");
  const hash = sha256(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, hash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new AppError("Lien invalide ou expiré.", "VALIDATION");
  await db.transaction(async (tx) => {
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.tokenHash, hash));
    await tx.update(users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
}
