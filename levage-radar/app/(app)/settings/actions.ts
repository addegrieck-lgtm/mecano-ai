"use server";

import { revalidatePath } from "next/cache";
import { withCtx, str, bool } from "@/lib/actions";
import { changeOwnPassword, updateOrgSettings, updatePreferences } from "@/lib/services/users";
import type { ActionResult } from "@/components/forms";

export async function prefsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await updatePreferences(ctx, {
      homeDepartment: str(fd, "homeDepartment"),
      radiusKm: str(fd, "radiusKm"),
      preferredDepartments: str(fd, "preferredDepartments"),
      domains: fd.getAll("domains").map(String) as ("LEVAGE" | "ELECTRICITE")[],
      digestFrequency: (str(fd, "digestFrequency") || "daily") as "daily" | "weekly" | "off",
      emailEnabled: bool(fd, "emailEnabled"),
    });
    revalidatePath("/settings");
    return { ok: true, message: "Préférences enregistrées." };
  });
}

export async function passwordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  if (str(fd, "next") !== str(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  return withCtx(async (ctx) => {
    await changeOwnPassword(ctx, str(fd, "current"), str(fd, "next"));
    return { ok: true, message: "Mot de passe modifié. Toutes vos sessions ont été fermées : reconnectez-vous." };
  });
}

export async function orgSettingsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await updateOrgSettings(ctx, {
      name: str(fd, "name"),
      allowExternalAi: bool(fd, "allowExternalAi"),
      allowBrowserDictation: bool(fd, "allowBrowserDictation"),
      auditDays: str(fd, "auditDays") ? Number(str(fd, "auditDays")) : null,
    });
    revalidatePath("/settings");
    return { ok: true, message: "Paramètres de l'organisation enregistrés." };
  });
}
