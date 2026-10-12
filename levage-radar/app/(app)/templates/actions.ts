"use server";

import { revalidatePath } from "next/cache";
import { withCtx, str } from "@/lib/actions";
import { archiveTemplate, createTemplate, createTemplateVersion, ensureExampleTemplates, validateTemplateVersion } from "@/lib/services/templates";
import type { ActionResult } from "@/components/forms";
import { ELECTRICITE_EXAMPLE, LEVAGE_EXAMPLE } from "@/lib/reports/default-templates";

export async function installExamplesAction(): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    const done = await ensureExampleTemplates(ctx);
    revalidatePath("/templates");
    return done ? { ok: true, message: "Modèles d'exemple installés en brouillon : à relire et valider." } : { error: "Des modèles existent déjà." };
  });
}

export async function createTemplateAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    const domain = str(fd, "domain");
    const base = domain === "LEVAGE" ? LEVAGE_EXAMPLE : ELECTRICITE_EXAMPLE;
    await createTemplate(ctx, { domain, name: str(fd, "name"), description: str(fd, "description"), definition: str(fd, "definition") || base });
    revalidatePath("/templates");
    return { ok: true, message: "Modèle créé (version 1 en brouillon)." };
  });
}

export async function newVersionAction(templateId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    const v = await createTemplateVersion(ctx, templateId, str(fd, "definition"), str(fd, "changeNote"));
    revalidatePath(`/templates/${templateId}`);
    return { ok: true, message: `Version ${v.version} enregistrée en brouillon.` };
  });
}

export async function validateVersionAction(templateId: string, versionId: string): Promise<ActionResult> {
  return withCtx(async (ctx) => {
    await validateTemplateVersion(ctx, versionId);
    revalidatePath(`/templates/${templateId}`);
    revalidatePath("/templates");
    return { ok: true, message: "Version validée : elle peut désormais servir à créer des missions." };
  });
}

export async function archiveTemplateAction(templateId: string, archived: boolean): Promise<void> {
  await withCtx(async (ctx) => {
    await archiveTemplate(ctx, templateId, archived);
    revalidatePath("/templates");
    revalidatePath(`/templates/${templateId}`);
  });
}
