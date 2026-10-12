"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { clientMeta, cookieOptions, SESSION_COOKIE } from "@/lib/auth/server";
import { createResetToken, login, resetPassword, revokeSession } from "@/lib/auth/core";
import { setupFirstAdmin } from "@/lib/services/users";
import { appUrl, isEmailConfigured, sendEmail } from "@/lib/email";
import { publicMessage } from "@/lib/errors";
import type { ActionResult } from "@/components/forms";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const db = await getDb();
  const meta = await clientMeta();
  const r = await login(db, { email: s(fd, "email"), password: s(fd, "password"), ...meta });
  if (!r.ok) return { error: r.error };
  (await cookies()).set(SESSION_COOKIE, r.token, cookieOptions(r.expiresAt));
  redirect(safeNext(s(fd, "next")));
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login?logout=1");
}

export async function forgotAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const db = await getDb();
  const email = s(fd, "email").trim();
  const neutral = { ok: true, message: "Si un compte correspond à cette adresse, un lien de réinitialisation valable 1 heure a été envoyé." };
  if (!email) return { error: "Adresse e-mail requise." };
  if (!isEmailConfigured())
    return { ok: true, message: "L'envoi d'e-mails n'est pas configuré sur ce serveur : demandez à votre administrateur de générer un lien de réinitialisation (Utilisateurs)." };
  const t = await createResetToken(db, email);
  if (t) {
    try {
      await sendEmail({
        to: t.email,
        subject: "LEVAGE RADAR — réinitialisation du mot de passe",
        text: `Bonjour ${t.name},\n\nPour définir un nouveau mot de passe (lien valable 1 heure, usage unique) :\n${appUrl(`/reset-password?token=${t.token}`)}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      });
    } catch (e) {
      console.error("[forgot] envoi impossible", e);
    }
  }
  return neutral;
}

export async function resetAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const pw = s(fd, "password");
  if (pw !== s(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  try {
    await resetPassword(await getDb(), s(fd, "token"), pw);
  } catch (e) {
    return { error: publicMessage(e) };
  }
  redirect("/login?reset=1");
}

export async function setupAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const expected = process.env.SETUP_TOKEN;
  if (expected && s(fd, "setupToken") !== expected) return { error: "Jeton d'installation invalide." };
  if (s(fd, "password") !== s(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  const db = await getDb();
  try {
    await setupFirstAdmin(db, { orgName: s(fd, "orgName"), name: s(fd, "name"), email: s(fd, "email"), password: s(fd, "password") });
  } catch (e) {
    return { error: publicMessage(e) };
  }
  const meta = await clientMeta();
  const r = await login(db, { email: s(fd, "email"), password: s(fd, "password"), ...meta });
  if (r.ok) (await cookies()).set(SESSION_COOKIE, r.token, cookieOptions(r.expiresAt));
  redirect("/settings?welcome=1");
}
