import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import { auditEvents, organizations, userPreferences, users, type OrgSettings } from "@/lib/db/schema";
import { createResetTokenForUser, hashPassword, revokeAllSessions, validatePasswordStrength, verifyPassword } from "@/lib/auth/core";
import { ALL_PERMISSIONS, ALL_ROLES, isRole } from "@/lib/auth/permissions";
import { AppError, invalid, notFound } from "@/lib/errors";
import { normalizeDepartment } from "@/lib/radar/geo";

const EmailSchema = z.email("E-mail invalide").max(200).transform((v) => v.trim().toLowerCase());

/** Première installation : crée l'organisation et son administrateur (uniquement si aucun utilisateur n'existe). */
export async function setupFirstAdmin(db: DB, input: { orgName: string; name: string; email: string; password: string }) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) throw new AppError("L'application est déjà initialisée.", "FORBIDDEN");
  const data = z.object({ orgName: z.string().trim().min(2).max(120), name: z.string().trim().min(2).max(120), email: EmailSchema, password: z.string() }).parse(input);
  const weak = validatePasswordStrength(data.password);
  if (weak) throw invalid(weak);
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: data.orgName }).returning();
    const [u] = await tx.insert(users).values({ orgId: org.id, email: data.email, name: data.name, passwordHash: await hashPassword(data.password), role: "ADMIN" }).returning();
    await tx.insert(auditEvents).values({ orgId: org.id, userId: u.id, entityType: "organization", entityId: org.id, action: "setup", details: {} });
    return { org, user: u };
  });
}

export async function listUsers(ctx: Ctx) {
  requirePerm(ctx, "users.manage");
  return ctx.db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, extraPermissions: users.extraPermissions, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.orgId, ctx.org.id))
    .orderBy(asc(users.name));
}

export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

/** Crée un compte inactif côté mot de passe : l'utilisateur définit le sien via un lien à usage unique (7 jours). */
export async function createUser(ctx: Ctx, input: { name: string; email: string; role: string }) {
  requirePerm(ctx, "users.manage");
  const data = z.object({ name: z.string().trim().min(2).max(120), email: EmailSchema, role: z.string() }).parse(input);
  if (!isRole(data.role)) throw invalid("Rôle inconnu.");
  const [exists] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`);
  if (exists) throw invalid("Un compte existe déjà avec cet e-mail.");
  // Mot de passe aléatoire inutilisable tant que le lien d'activation n'a pas servi.
  const randomPw = (await import("node:crypto")).randomBytes(32).toString("base64url");
  const [u] = await ctx.db.insert(users).values({ orgId: ctx.org.id, email: data.email, name: data.name, role: data.role, passwordHash: await hashPassword(randomPw) }).returning();
  const token = await createResetTokenForUser(ctx.db, u.id, INVITE_TTL_MS);
  await audit(ctx, "user", u.id, "create", { role: data.role, email: data.email });
  return { user: u, token };
}

export async function updateUser(ctx: Ctx, id: string, input: { role?: string; active?: boolean; extraPermissions?: string[] }) {
  requirePerm(ctx, "users.manage");
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [u] = await ctx.db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, ctx.org.id)));
  if (!u) throw notFound();
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.role !== undefined) {
    if (!isRole(input.role)) throw invalid("Rôle inconnu.");
    patch.role = input.role;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (input.extraPermissions !== undefined) patch.extraPermissions = input.extraPermissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
  if (id === ctx.user.id && (patch.active === false || (patch.role && patch.role !== "ADMIN"))) throw invalid("Vous ne pouvez pas retirer vos propres droits d'administrateur.");
  if (u.role === "ADMIN" && (patch.active === false || (patch.role && patch.role !== "ADMIN"))) {
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.orgId, ctx.org.id), eq(users.role, "ADMIN"), eq(users.active, true)));
    if (n <= 1) throw invalid("L'organisation doit conserver au moins un administrateur actif.");
  }
  await ctx.db.update(users).set(patch).where(eq(users.id, id));
  // Révocation : un compte désactivé ou dont le rôle change perd ses sessions (et l'effacement local hors ligne est déclenché à la reconnexion).
  if (patch.active === false || (patch.role && patch.role !== u.role)) await revokeAllSessions(ctx.db, id);
  await audit(ctx, "user", id, "update", { role: patch.role, active: patch.active, extraPermissions: patch.extraPermissions });
}

export async function issueResetLink(ctx: Ctx, id: string) {
  requirePerm(ctx, "users.manage");
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.id, id), eq(users.orgId, ctx.org.id)));
  if (!u) throw notFound();
  const token = await createResetTokenForUser(ctx.db, id);
  await audit(ctx, "user", id, "reset_link_issued");
  return token;
}

export async function changeOwnPassword(ctx: Ctx, current: string, next: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw invalid("Mot de passe actuel incorrect.");
  const weak = validatePasswordStrength(next);
  if (weak) throw invalid(weak);
  await ctx.db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, u.id));
  await revokeAllSessions(ctx.db, u.id);
  await audit(ctx, "user", u.id, "password_change");
}

export async function updateRolePermissions(ctx: Ctx, matrix: Record<string, string[]>) {
  requirePerm(ctx, "users.manage");
  const clean: Record<string, string[]> = {};
  for (const r of ALL_ROLES) {
    if (r === "ADMIN") continue; // l'administrateur conserve tous les droits
    clean[r] = (matrix[r] ?? []).filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
  }
  const settings: OrgSettings = { ...ctx.org.settings, rolePermissions: clean };
  await ctx.db.update(organizations).set({ settings, updatedAt: new Date() }).where(eq(organizations.id, ctx.org.id));
  await audit(ctx, "organization", ctx.org.id, "role_permissions_update", { matrix: clean });
}

export async function resetRolePermissions(ctx: Ctx) {
  requirePerm(ctx, "users.manage");
  const { rolePermissions: _r, ...rest } = ctx.org.settings;
  void _r;
  await ctx.db.update(organizations).set({ settings: rest, updatedAt: new Date() }).where(eq(organizations.id, ctx.org.id));
  await audit(ctx, "organization", ctx.org.id, "role_permissions_reset");
}

export async function updateOrgSettings(ctx: Ctx, input: { name?: string; allowExternalAi?: boolean; auditDays?: number | null; archivedMissionDays?: number | null }) {
  requirePerm(ctx, "settings.manage");
  const settings: OrgSettings = { ...ctx.org.settings };
  if (input.allowExternalAi !== undefined) settings.allowExternalAi = input.allowExternalAi;
  if (input.auditDays !== undefined || input.archivedMissionDays !== undefined) {
    const days = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? undefined : Math.min(Math.max(Math.round(v), 30), 3650));
    settings.retentionDays = { audit: days(input.auditDays), archivedMissions: days(input.archivedMissionDays) };
  }
  const name = input.name ? z.string().trim().min(2).max(120).parse(input.name) : undefined;
  await ctx.db.update(organizations).set({ settings, ...(name ? { name } : {}), updatedAt: new Date() }).where(eq(organizations.id, ctx.org.id));
  await audit(ctx, "organization", ctx.org.id, "settings_update", { allowExternalAi: settings.allowExternalAi, retentionDays: settings.retentionDays, name });
}

export const PrefsSchema = z.object({
  homeDepartment: z.string().optional().transform((v) => (v ? normalizeDepartment(v) : null)),
  radiusKm: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Math.min(Math.max(Number(v), 10), 2000))),
  preferredDepartments: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(/[,\s]+/).map((d) => normalizeDepartment(d)).filter((d): d is string => !!d) : [])),
  domains: z.array(z.enum(["LEVAGE", "ELECTRICITE"])).optional().default(["LEVAGE", "ELECTRICITE"]),
  digestFrequency: z.enum(["daily", "weekly", "off"]).default("daily"),
  emailEnabled: z.boolean().default(false),
});

export async function updatePreferences(ctx: Ctx, input: z.input<typeof PrefsSchema>) {
  const p = PrefsSchema.parse(input);
  if (p.radiusKm !== null && Number.isNaN(p.radiusKm)) throw invalid("Rayon invalide.");
  await ctx.db
    .insert(userPreferences)
    .values({ userId: ctx.user.id, ...p })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { ...p, updatedAt: new Date() } });
  await audit(ctx, "user", ctx.user.id, "preferences_update", p);
}

export async function listAudit(ctx: Ctx, f: { entityType?: string; userId?: string; page?: number }) {
  requirePerm(ctx, "audit.read");
  const pageSize = 100;
  const page = Math.max(1, f.page ?? 1);
  const w = [eq(auditEvents.orgId, ctx.org.id)];
  if (f.entityType) w.push(eq(auditEvents.entityType, f.entityType));
  if (f.userId && z.uuid().safeParse(f.userId).success) w.push(eq(auditEvents.userId, f.userId));
  const rows = await ctx.db
    .select({ e: auditEvents, user: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.userId))
    .where(and(...w))
    .orderBy(desc(auditEvents.createdAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return { items: rows.slice(0, pageSize).map((r) => ({ ...r.e, userName: r.user })), hasMore: rows.length > pageSize, page };
}

/** Politique de conservation : purge des journaux d'audit au-delà de la durée configurée. */
export async function applyRetention(db: DB, now = new Date()) {
  const orgs = await db.select().from(organizations);
  let purged = 0;
  for (const o of orgs) {
    const days = o.settings.retentionDays?.audit;
    if (!days) continue;
    const res = await db
      .delete(auditEvents)
      .where(and(eq(auditEvents.orgId, o.id), lt(auditEvents.createdAt, new Date(now.getTime() - days * 86400000))))
      .returning({ id: auditEvents.id });
    purged += res.length;
  }
  return purged;
}

export async function isInitialized(db: DB) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return n > 0;
}
