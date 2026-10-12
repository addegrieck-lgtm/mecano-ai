import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import { missionTemplates, templateVersions, users } from "@/lib/db/schema";
import { reportPerms, type Domain } from "@/lib/auth/permissions";
import { parseDefinition, TemplateDefinitionSchema, type TemplateDefinition } from "@/lib/reports/template-schema";
import { ELECTRICITE_EXAMPLE, LEVAGE_EXAMPLE } from "@/lib/reports/default-templates";
import { forbidden, invalid, notFound } from "@/lib/errors";

export const DomainSchema = z.enum(["LEVAGE", "ELECTRICITE"]);

function canSeeDomain(ctx: Ctx, domain: Domain) {
  const p = reportPerms(domain);
  return ctx.perms.has(p.write) || ctx.perms.has(p.readAll) || ctx.perms.has("templates.manage");
}

export async function listTemplates(ctx: Ctx, domain?: Domain) {
  if (domain && !canSeeDomain(ctx, domain)) throw forbidden();
  const rows = await ctx.db
    .select()
    .from(missionTemplates)
    .where(and(eq(missionTemplates.orgId, ctx.org.id), domain ? eq(missionTemplates.domain, domain) : undefined))
    .orderBy(asc(missionTemplates.domain), asc(missionTemplates.name));
  const visible = rows.filter((t) => canSeeDomain(ctx, t.domain as Domain));
  const versions = visible.length
    ? await ctx.db
        .select({ v: templateVersions, validatedByName: users.name })
        .from(templateVersions)
        .leftJoin(users, eq(users.id, templateVersions.validatedBy))
        .where(sql`${templateVersions.templateId} in ${visible.map((t) => t.id)}`)
        .orderBy(desc(templateVersions.version))
    : [];
  return visible.map((t) => {
    const vs = versions.filter((v) => v.v.templateId === t.id).map((v) => ({ ...v.v, validatedByName: v.validatedByName }));
    return { ...t, versions: vs, latestValidated: vs.find((v) => v.status === "validated") ?? null };
  });
}

export async function getTemplateVersion(ctx: Ctx, versionId: string) {
  if (!z.uuid().safeParse(versionId).success) throw notFound();
  const [row] = await ctx.db
    .select({ v: templateVersions, t: missionTemplates })
    .from(templateVersions)
    .innerJoin(missionTemplates, eq(missionTemplates.id, templateVersions.templateId))
    .where(and(eq(templateVersions.id, versionId), eq(missionTemplates.orgId, ctx.org.id)));
  if (!row) throw notFound();
  if (!canSeeDomain(ctx, row.t.domain as Domain)) throw notFound();
  return { version: row.v, template: row.t, definition: parseDefinition(row.v.definition) };
}

/** Installe les modèles d'exemple (brouillons à valider) si l'organisation n'en a aucun. */
export async function ensureExampleTemplates(ctx: Ctx) {
  requirePerm(ctx, "templates.manage");
  const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(missionTemplates).where(eq(missionTemplates.orgId, ctx.org.id));
  if (n > 0) return false;
  for (const [name, def] of [
    ["Levage — exemple à adapter", LEVAGE_EXAMPLE],
    ["Électricité — exemple à adapter", ELECTRICITE_EXAMPLE],
  ] as const) {
    await createTemplate(ctx, { domain: def.domain, name, description: "Modèle d'exemple fourni avec l'application : à relire, adapter et valider par un responsable technique.", definition: def });
  }
  return true;
}

export async function createTemplate(ctx: Ctx, input: { domain: string; name: string; description?: string; definition: unknown }) {
  requirePerm(ctx, "templates.manage");
  const domain = DomainSchema.parse(input.domain);
  const name = z.string().trim().min(2).max(120).parse(input.name);
  const def = validateDefinition(input.definition, domain);
  return ctx.db.transaction(async (tx) => {
    const [t] = await tx.insert(missionTemplates).values({ orgId: ctx.org.id, domain, name, description: input.description?.slice(0, 1000) ?? null, createdBy: ctx.user.id }).returning();
    const [v] = await tx.insert(templateVersions).values({ templateId: t.id, version: 1, definition: def, status: "draft", createdBy: ctx.user.id, changeNote: "Création" }).returning();
    await audit({ ...ctx, db: tx as unknown as Ctx["db"] }, "template", t.id, "create", { versionId: v.id, domain });
    return { template: t, version: v };
  });
}

export function validateDefinition(raw: unknown, domain: Domain): TemplateDefinition {
  const obj = typeof raw === "string" ? safeJson(raw) : raw;
  const r = TemplateDefinitionSchema.safeParse(obj);
  if (!r.success) throw invalid("Définition de modèle invalide : " + r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join(" ; "));
  if (r.data.domain !== domain) throw invalid("Le domaine de la définition ne correspond pas au modèle.");
  return r.data;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    throw invalid("JSON invalide.");
  }
}

/** Nouvelle version (brouillon). Les versions existantes restent inchangées : les missions déjà créées gardent la leur. */
export async function createTemplateVersion(ctx: Ctx, templateId: string, definition: unknown, changeNote: string) {
  requirePerm(ctx, "templates.manage");
  if (!z.uuid().safeParse(templateId).success) throw notFound();
  const [t] = await ctx.db.select().from(missionTemplates).where(and(eq(missionTemplates.id, templateId), eq(missionTemplates.orgId, ctx.org.id)));
  if (!t) throw notFound();
  const def = validateDefinition(definition, t.domain as Domain);
  const [{ max }] = await ctx.db.select({ max: sql<number>`coalesce(max(${templateVersions.version}),0)::int` }).from(templateVersions).where(eq(templateVersions.templateId, templateId));
  const [v] = await ctx.db
    .insert(templateVersions)
    .values({ templateId, version: max + 1, definition: def, status: "draft", createdBy: ctx.user.id, changeNote: z.string().trim().max(500).parse(changeNote || "Modification") })
    .returning();
  await ctx.db.update(missionTemplates).set({ updatedAt: new Date() }).where(eq(missionTemplates.id, templateId));
  await audit(ctx, "template", templateId, "version_create", { versionId: v.id, version: v.version });
  return v;
}

/** Validation par un responsable habilité : la version devient utilisable pour créer des missions. */
export async function validateTemplateVersion(ctx: Ctx, versionId: string) {
  requirePerm(ctx, "templates.validate");
  const { version, template } = await getTemplateVersion(ctx, versionId);
  if (version.status === "validated") return version;
  if (template.archived) throw invalid("Modèle archivé.");
  const [v] = await ctx.db.update(templateVersions).set({ status: "validated", validatedBy: ctx.user.id, validatedAt: new Date() }).where(eq(templateVersions.id, versionId)).returning();
  // Les versions validées plus anciennes sont retirées pour les NOUVELLES missions (les missions existantes ne changent pas).
  await ctx.db
    .update(templateVersions)
    .set({ status: "retired" })
    .where(and(eq(templateVersions.templateId, template.id), eq(templateVersions.status, "validated"), sql`${templateVersions.version} < ${version.version}`));
  await audit(ctx, "template", template.id, "version_validate", { versionId, version: version.version });
  return v;
}

export async function archiveTemplate(ctx: Ctx, templateId: string, archived: boolean) {
  requirePerm(ctx, "templates.manage");
  if (!z.uuid().safeParse(templateId).success) throw notFound();
  const res = await ctx.db
    .update(missionTemplates)
    .set({ archived, updatedAt: new Date() })
    .where(and(eq(missionTemplates.id, templateId), eq(missionTemplates.orgId, ctx.org.id)))
    .returning({ id: missionTemplates.id });
  if (!res.length) throw notFound();
  await audit(ctx, "template", templateId, archived ? "archive" : "unarchive");
}
