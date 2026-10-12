"use server";

import { revalidatePath } from "next/cache";
import { withCtx, str, bool } from "@/lib/actions";
import { createUser, issueResetLink, resetRolePermissions, updateRolePermissions, updateUser } from "@/lib/services/users";
import { appUrl, isEmailConfigured, sendEmail } from "@/lib/email";
import { ALL_ROLES } from "@/lib/auth/permissions";
import type { ActionResult } from "@/components/forms";

export async function createUserAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    const { user, token } = await createUser(ctx, { name: str(fd, "name"), email: str(fd, "email"), role: str(fd, "role") });
    const link = appUrl(`/reset-password?token=${token}`);
    revalidatePath("/admin/users");
    if (isEmailConfigured()) {
      try {
        await sendEmail({ to: user.email, subject: "LEVAGE RADAR — activation de votre compte", text: `Bonjour ${user.name},\n\nUn compte a été créé pour vous. Définissez votre mot de passe (lien valable 7 jours, usage unique) :\n${link}` });
        return { ok: true, message: `Compte créé ; lien d'activation envoyé à ${user.email}.` };
      } catch {
        /* repli : lien affiché */
      }
    }
    return { ok: true, message: `Compte créé. Transmettez ce lien d'activation à l'utilisateur par un canal sûr (valable 7 jours, usage unique) : ${link}` };
  });
}

export async function updateUserAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await updateUser(ctx, id, { role: str(fd, "role"), active: bool(fd, "active"), extraPermissions: fd.getAll("extra").map(String) });
    revalidatePath("/admin/users");
    return { ok: true, message: "Utilisateur mis à jour (sessions fermées si le rôle ou l'état a changé)." };
  });
}

export async function resetLinkAction(id: string): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    const token = await issueResetLink(ctx, id);
    return { ok: true, message: `Lien de réinitialisation (1 heure, usage unique) : ${appUrl(`/reset-password?token=${token}`)}` };
  });
}

export async function matrixAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    if (bool(fd, "reset")) {
      await resetRolePermissions(ctx);
      revalidatePath("/admin/users");
      return { ok: true, message: "Matrice par défaut rétablie." };
    }
    const matrix: Record<string, string[]> = {};
    for (const r of ALL_ROLES) matrix[r] = fd.getAll(`perm:${r}`).map(String);
    await updateRolePermissions(ctx, matrix);
    revalidatePath("/admin/users");
    return { ok: true, message: "Matrice des rôles enregistrée." };
  });
}
