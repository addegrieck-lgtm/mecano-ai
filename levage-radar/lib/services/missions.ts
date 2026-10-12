import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z, ZodError } from "zod";
import type { Ctx } from "@/lib/context";
import type { DB } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  attachments,
  auditEvents,
  clients,
  measurements,
  missionItems,
  missions,
  missionSnapshots,
  observations,
  sites,
  syncOperations,
  templateVersions,
  missionTemplates,
  users,
} from "@/lib/db/schema";
import { reportPerms, type Domain } from "@/lib/auth/permissions";
import { coerceValue, isEmpty, missingFields, parseDefinition, type Field, type MissingInfo, type TemplateDefinition } from "@/lib/reports/template-schema";
import { AppError, forbidden, invalid, notFound, publicMessage } from "@/lib/errors";

export const MISSION_STATUSES = {
  BROUILLON: "Brouillon",
  EN_SAISIE: "En cours de saisie",
  A_COMPLETER: "À compléter",
  PRET_RELECTURE: "Prêt pour relecture",
  PRET_OUTIL_OFFICIEL: "Prêt à finaliser dans l'outil officiel",
  ARCHIVE: "Archivé",
} as const;
export type MissionStatus = keyof typeof MISSION_STATUSES;

type Mission = typeof missions.$inferSelect;

export function statusLabel(ctx: Ctx, s: string) {
  return ctx.org.settings.missionStatusLabels?.[s] ?? MISSION_STATUSES[s as MissionStatus] ?? s;
}

// ---------------------------------------------------------------------------
// Contrôle d'accès (serveur)
// ---------------------------------------------------------------------------

const isOwn = (ctx: Ctx, m: Pick<Mission, "inspectorId" | "createdBy">) => m.inspectorId === ctx.user.id || m.createdBy === ctx.user.id;

export function canRead(ctx: Ctx, m: Pick<Mission, "domain" | "inspectorId" | "createdBy">) {
  const p = reportPerms(m.domain as Domain);
  return ctx.perms.has(p.readAll) || ctx.perms.has(p.manageAll) || (ctx.perms.has(p.write) && isOwn(ctx, m));
}

export function canEdit(ctx: Ctx, m: Pick<Mission, "domain" | "inspectorId" | "createdBy" | "status">) {
  if (m.status === "ARCHIVE") return false;
  const p = reportPerms(m.domain as Domain);
  return ctx.perms.has(p.manageAll) || (ctx.perms.has(p.write) && isOwn(ctx, m));
}

export async function loadMission(ctx: Ctx, id: string, mode: "read" | "edit" = "read", db: DB = ctx.db): Promise<Mission> {
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [m] = await db.select().from(missions).where(and(eq(missions.id, id), eq(missions.orgId, ctx.org.id)));
  // Dossier d'une autre organisation ou non autorisé : traité comme inexistant (pas de fuite d'existence).
  if (!m || !canRead(ctx, m)) throw notFound();
  if (mode === "edit" && !canEdit(ctx, m)) throw forbidden(m.status === "ARCHIVE" ? "Dossier archivé : lecture seule." : "Vous ne pouvez pas modifier ce dossier.");
  return m;
}

async function definitionFor(db: DB, versionId: string): Promise<TemplateDefinition> {
  const [v] = await db.select({ d: templateVersions.definition }).from(templateVersions).where(eq(templateVersions.id, versionId));
  if (!v) throw notFound("Modèle introuvable.");
  return parseDefinition(v.d);
}

// ---------------------------------------------------------------------------
// Liste / création
// ---------------------------------------------------------------------------

export async function listMissions(ctx: Ctx, domain: Domain, f: { status?: string; scope?: "mine" | "all"; q?: string } = {}) {
  const p = reportPerms(domain);
  const all = ctx.perms.has(p.readAll) || ctx.perms.has(p.manageAll);
  if (!all && !ctx.perms.has(p.write)) throw forbidden();
  const w: SQL[] = [eq(missions.orgId, ctx.org.id), eq(missions.domain, domain)];
  if (!all || f.scope === "mine") w.push(or(eq(missions.inspectorId, ctx.user.id), eq(missions.createdBy, ctx.user.id))!);
  if (f.status && f.status in MISSION_STATUSES) w.push(eq(missions.status, f.status));
  else w.push(inArray(missions.status, ["BROUILLON", "EN_SAISIE", "A_COMPLETER", "PRET_RELECTURE", "PRET_OUTIL_OFFICIEL"]));
  const rows = await ctx.db
    .select({ m: missions, client: clients.name, site: sites.name, inspector: users.name })
    .from(missions)
    .leftJoin(clients, eq(clients.id, missions.clientId))
    .leftJoin(sites, eq(sites.id, missions.siteId))
    .leftJoin(users, eq(users.id, missions.inspectorId))
    .where(and(...w))
    .orderBy(desc(missions.updatedAt))
    .limit(500);
  const q = f.q?.toLowerCase();
  return rows
    .filter((r) => !q || [r.m.title, r.client, r.site, r.m.internalRef].some((v) => v?.toLowerCase().includes(q)))
    .map((r) => ({ ...r.m, clientName: r.client, siteName: r.site, inspectorName: r.inspector }));
}

export const CreateMissionSchema = z.object({
  domain: z.enum(["LEVAGE", "ELECTRICITE"]),
  templateVersionId: z.uuid("Modèle requis"),
  title: z.string().trim().min(2, "Titre requis").max(200),
  clientId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  siteId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  internalRef: z.string().trim().max(100).optional().transform((v) => v || null),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
  scheduledAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  inspectorId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  generalNotes: z.string().trim().max(10000).optional().transform((v) => v || null),
});

export async function createMission(ctx: Ctx, input: z.input<typeof CreateMissionSchema>) {
  const data = CreateMissionSchema.parse(input);
  const p = reportPerms(data.domain);
  if (!ctx.perms.has(p.write) && !ctx.perms.has(p.manageAll)) throw forbidden();
  if (data.scheduledAt && Number.isNaN(data.scheduledAt.getTime())) throw invalid("Date invalide.");
  const [tv] = await ctx.db
    .select({ v: templateVersions, t: missionTemplates })
    .from(templateVersions)
    .innerJoin(missionTemplates, eq(missionTemplates.id, templateVersions.templateId))
    .where(and(eq(templateVersions.id, data.templateVersionId), eq(missionTemplates.orgId, ctx.org.id)));
  if (!tv || tv.t.domain !== data.domain) throw invalid("Modèle inconnu pour ce domaine.");
  if (tv.v.status !== "validated") throw invalid("Seule une version de modèle VALIDÉE par un responsable technique peut être utilisée.");
  if (tv.t.archived) throw invalid("Modèle archivé.");
  if (data.clientId) {
    const [c] = await ctx.db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, data.clientId), eq(clients.orgId, ctx.org.id)));
    if (!c) throw invalid("Client inconnu.");
  }
  let address = data.address;
  if (data.siteId) {
    const [s] = await ctx.db.select().from(sites).where(and(eq(sites.id, data.siteId), eq(sites.orgId, ctx.org.id)));
    if (!s || (data.clientId && s.clientId !== data.clientId)) throw invalid("Site inconnu pour ce client.");
    address ??= [s.address, s.postalCode, s.city].filter(Boolean).join(" ") || null;
  }
  let inspectorId = data.inspectorId ?? ctx.user.id;
  if (inspectorId !== ctx.user.id) {
    if (!ctx.perms.has(p.manageAll)) inspectorId = ctx.user.id; // un inspecteur ne crée que ses propres dossiers
    else {
      const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.id, inspectorId), eq(users.orgId, ctx.org.id)));
      if (!u) throw invalid("Inspecteur inconnu.");
    }
  }
  const [m] = await ctx.db
    .insert(missions)
    .values({
      orgId: ctx.org.id,
      domain: data.domain,
      templateVersionId: data.templateVersionId,
      clientId: data.clientId,
      siteId: data.siteId,
      title: data.title,
      internalRef: data.internalRef,
      address,
      scheduledAt: data.scheduledAt,
      inspectorId,
      generalNotes: data.generalNotes,
      createdBy: ctx.user.id,
    })
    .returning();
  await audit(ctx, "mission", m.id, "create", { domain: m.domain, templateVersion: tv.v.version, inspectorId });
  return m;
}

// ---------------------------------------------------------------------------
// Lecture complète
// ---------------------------------------------------------------------------

export async function getMissionFull(ctx: Ctx, id: string) {
  const m = await loadMission(ctx, id);
  const def = await definitionFor(ctx.db, m.templateVersionId);
  const [tv] = await ctx.db
    .select({ version: templateVersions.version, name: missionTemplates.name })
    .from(templateVersions)
    .innerJoin(missionTemplates, eq(missionTemplates.id, templateVersions.templateId))
    .where(eq(templateVersions.id, m.templateVersionId));
  const items = await ctx.db.select().from(missionItems).where(eq(missionItems.missionId, id)).orderBy(asc(missionItems.position), asc(missionItems.createdAt));
  const meas = await ctx.db.select().from(measurements).where(eq(measurements.missionId, id)).orderBy(asc(measurements.measuredAt));
  const obs = await ctx.db.select().from(observations).where(eq(observations.missionId, id)).orderBy(asc(observations.createdAt));
  const atts = await ctx.db
    .select({ id: attachments.id, kind: attachments.kind, filename: attachments.filename, mime: attachments.mime, size: attachments.size, itemId: attachments.itemId, observationId: attachments.observationId, caption: attachments.caption, createdAt: attachments.createdAt })
    .from(attachments)
    .where(and(eq(attachments.missionId, id), isNull(attachments.deletedAt)))
    .orderBy(asc(attachments.createdAt));
  const [client] = m.clientId ? await ctx.db.select().from(clients).where(eq(clients.id, m.clientId)) : [];
  const [site] = m.siteId ? await ctx.db.select().from(sites).where(eq(sites.id, m.siteId)) : [];
  const [inspector] = m.inspectorId ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, m.inspectorId)) : [];
  const snapshots = await ctx.db
    .select({ id: missionSnapshots.id, label: missionSnapshots.label, missionVersion: missionSnapshots.missionVersion, createdAt: missionSnapshots.createdAt, author: users.name })
    .from(missionSnapshots)
    .leftJoin(users, eq(users.id, missionSnapshots.createdBy))
    .where(eq(missionSnapshots.missionId, id))
    .orderBy(desc(missionSnapshots.createdAt));
  const full = { mission: m, definition: def, template: tv, items, measurements: meas, observations: obs, attachments: atts, client: client ?? null, site: site ?? null, inspector: inspector ?? null, snapshots };
  return { ...full, missing: computeMissing(full), canEdit: canEdit(ctx, m) };
}

export async function missionHistory(ctx: Ctx, id: string) {
  await loadMission(ctx, id);
  return ctx.db
    .select({ id: auditEvents.id, action: auditEvents.action, details: auditEvents.details, createdAt: auditEvents.createdAt, user: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.userId))
    .where(and(eq(auditEvents.orgId, ctx.org.id), eq(auditEvents.entityType, "mission"), eq(auditEvents.entityId, id)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(500);
}

// ---------------------------------------------------------------------------
// Informations manquantes (jamais un verdict de conformité)
// ---------------------------------------------------------------------------

type FullData = {
  mission: Mission;
  definition: TemplateDefinition;
  items: (typeof missionItems.$inferSelect)[];
  observations: (typeof observations.$inferSelect)[];
  attachments: { kind: string; itemId: string | null }[];
};

export function checklistState(m: Mission, def: TemplateDefinition): boolean[] {
  const raw = (m.data as Record<string, unknown>)._checklist;
  const arr = Array.isArray(raw) ? raw : [];
  return def.checklist.map((_, i) => arr[i] === true);
}

export function computeMissing(d: FullData): MissingInfo[] {
  const out: MissingInfo[] = [];
  const m = d.mission;
  if (!m.clientId) out.push({ level: "bloquant", message: "Client non renseigné", target: "clientId" });
  if (!m.scheduledAt) out.push({ level: "bloquant", message: "Date d'intervention non renseignée", target: "scheduledAt" });
  if (!m.inspectorId) out.push({ level: "bloquant", message: "Inspecteur non renseigné", target: "inspectorId" });
  out.push(...missingFields(d.definition.headerFields, m.data, m.pendingFields, ""));
  const topLevel = d.items.filter((i) => !i.parentId);
  if (!topLevel.length) out.push({ level: "bloquant", message: d.definition.domain === "LEVAGE" ? "Aucun équipement saisi" : "Aucun élément (zone, tableau, équipement) saisi" });
  for (const it of d.items) {
    const t = d.definition.itemTypes.find((x) => x.key === it.itemType);
    if (!t) {
      out.push({ level: "a_verifier", message: `${it.label} : type d'élément absent du modèle` });
      continue;
    }
    out.push(...missingFields(t.fields, it.data, it.pendingFields, `${it.label} — `));
    if (it.remainingChecks?.trim()) out.push({ level: "a_verifier", message: `${it.label} — éléments restant à vérifier : ${it.remainingChecks.trim().slice(0, 120)}` });
    for (const req of d.definition.requiredAttachments.filter((r) => r.itemType === it.itemType)) {
      if (!d.attachments.some((a) => a.itemId === it.id && a.kind === req.kind)) out.push({ level: "bloquant", message: `${it.label} — pièce attendue : ${req.label}` });
    }
  }
  for (const req of d.definition.requiredAttachments.filter((r) => !r.itemType)) {
    if (!d.attachments.some((a) => a.kind === req.kind)) out.push({ level: "bloquant", message: `Pièce attendue : ${req.label}` });
  }
  for (const o of d.observations) {
    if (o.needsVerification) out.push({ level: "a_verifier", message: `Observation à vérifier / compléter : ${o.description.slice(0, 80)}` });
    if (o.technicalReference && !o.referenceVerified) out.push({ level: "a_verifier", message: `Référence technique non vérifiée : ${o.technicalReference.slice(0, 80)}` });
  }
  const cl = checklistState(m, d.definition);
  const unchecked = d.definition.checklist.filter((_, i) => !cl[i]);
  if (unchecked.length) out.push({ level: "a_verifier", message: `Checklist avant export : ${unchecked.length} point(s) non coché(s)` });
  return out;
}

// ---------------------------------------------------------------------------
// Opérations de modification (en ligne ET hors ligne : même chemin de code)
// ---------------------------------------------------------------------------

const change = z.object({ base: z.unknown().optional(), value: z.unknown() });
const OpBase = { opId: z.uuid(), clientCreatedAt: z.string().optional() };

export const OpSchema = z.discriminatedUnion("kind", [
  z.object({ ...OpBase, kind: z.literal("patchMission"), changes: z.record(z.string().max(80), change) }),
  z.object({
    ...OpBase,
    kind: z.literal("createItem"),
    itemId: z.uuid(),
    itemType: z.string().max(50),
    parentId: z.uuid().nullable().optional(),
    label: z.string().trim().min(1).max(200),
    data: z.record(z.string(), z.unknown()).optional(),
    position: z.number().int().min(0).max(100000).optional(),
  }),
  z.object({ ...OpBase, kind: z.literal("patchItem"), itemId: z.uuid(), changes: z.record(z.string().max(80), change) }),
  z.object({ ...OpBase, kind: z.literal("deleteItem"), itemId: z.uuid(), baseVersion: z.number().int().optional() }),
  z.object({
    ...OpBase,
    kind: z.literal("addMeasurement"),
    id: z.uuid(),
    itemId: z.uuid().nullable().optional(),
    measurementType: z.string().max(50),
    value: z.union([z.number(), z.string()]),
    unit: z.string().max(20),
    measuredAt: z.string(),
    instrument: z.string().trim().max(200).optional(),
    context: z.string().trim().max(2000).optional(),
  }),
  z.object({ ...OpBase, kind: z.literal("deleteMeasurement"), id: z.uuid() }),
  z.object({
    ...OpBase,
    kind: z.literal("upsertObservation"),
    id: z.uuid(),
    baseUpdatedAt: z.string().nullable().optional(),
    itemId: z.uuid().nullable().optional(),
    obsKind: z.enum(["observation", "anomalie"]),
    description: z.string().trim().min(1, "Description requise").max(5000),
    location: z.string().trim().max(300).optional().nullable(),
    measurementId: z.uuid().nullable().optional(),
    internalPriority: z.string().max(50).optional().nullable(),
    technicalReference: z.string().trim().max(300).optional().nullable(),
    referenceVerified: z.boolean().optional(),
    inspectorComment: z.string().trim().max(5000).optional().nullable(),
    treatmentStatus: z.string().max(50).optional(),
    needsVerification: z.boolean().optional(),
  }),
  z.object({ ...OpBase, kind: z.literal("deleteObservation"), id: z.uuid() }),
]);
export type MissionOp = z.infer<typeof OpSchema>;

export type OpResult = {
  opId: string;
  status: "applied" | "conflict" | "rejected" | "duplicate";
  message?: string;
  conflicts?: { key: string; base: unknown; server: unknown; mine: unknown }[];
  server?: unknown;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const MISSION_KEYS = ["title", "internalRef", "address", "scheduledAt", "inspectorId", "clientId", "siteId", "generalNotes", "pendingFields", "checklist"] as const;

function fieldMap(fields: Field[]) {
  return new Map(fields.map((f) => [f.key, f]));
}

/** Applique une liste d'opérations, dans l'ordre. Chaque opération est idempotente (opId). */
export async function applyOps(ctx: Ctx, missionId: string, rawOps: unknown[]): Promise<{ results: OpResult[]; version: number }> {
  if (!Array.isArray(rawOps) || rawOps.length > 200) throw invalid("Lot d'opérations invalide (200 maximum).");
  const results: OpResult[] = [];
  for (const raw of rawOps) {
    const parsed = OpSchema.safeParse(raw);
    if (!parsed.success) {
      const opId = (raw as { opId?: string })?.opId ?? "inconnu";
      results.push({ opId, status: "rejected", message: parsed.error.issues.map((i) => i.message).join(", ") });
      continue;
    }
    results.push(await applyOne(ctx, missionId, parsed.data));
  }
  const [m] = await ctx.db.select({ version: missions.version }).from(missions).where(eq(missions.id, missionId));
  return { results, version: m?.version ?? 0 };
}

async function applyOne(ctx: Ctx, missionId: string, op: MissionOp): Promise<OpResult> {
  return ctx.db.transaction(async (txAny) => {
    const tx = txAny as unknown as DB;
    const [done] = await tx.select().from(syncOperations).where(eq(syncOperations.opId, op.opId));
    if (done) {
      if (done.missionId !== missionId || done.orgId !== ctx.org.id) return { opId: op.opId, status: "rejected", message: "Identifiant d'opération déjà utilisé." } as OpResult;
      return { ...(done.result as OpResult), status: "duplicate" } as OpResult;
    }
    // Verrou sur la mission pendant l'opération (séquence cohérente des versions).
    if (z.uuid().safeParse(missionId).success) await tx.execute(sql`select id from missions where id = ${missionId} for update`);
    const m = await loadMission(ctx, missionId, "edit", tx);
    const def = await definitionFor(tx, m.templateVersionId);
    let result: OpResult;
    try {
      result = await dispatch(ctx, tx, m, def, op);
    } catch (e) {
      if (e instanceof ZodError || (e instanceof AppError && e.code === "VALIDATION")) result = { opId: op.opId, status: "rejected", message: publicMessage(e) };
      else throw e;
    }
    if (result.status === "applied" || result.status === "conflict") {
      const touched = result.status === "applied" || (result.conflicts && result.conflicts.length < Object.keys((op as { changes?: object }).changes ?? {}).length);
      if (touched) {
        await tx
          .update(missions)
          .set({ version: m.version + 1, updatedAt: new Date(), status: m.status === "BROUILLON" ? "EN_SAISIE" : m.status })
          .where(eq(missions.id, missionId));
      }
    }
    await tx.insert(syncOperations).values({
      opId: op.opId,
      orgId: ctx.org.id,
      missionId,
      userId: ctx.user.id,
      kind: op.kind,
      status: result.status,
      result: result as unknown as Record<string, unknown>,
      clientCreatedAt: op.clientCreatedAt && !Number.isNaN(Date.parse(op.clientCreatedAt)) ? new Date(op.clientCreatedAt) : null,
    });
    return result;
  });
}


async function dispatch(ctx: Ctx, tx: DB, m: Mission, def: TemplateDefinition, op: MissionOp): Promise<OpResult> {
  const auditTx = { ...ctx, db: tx };
  switch (op.kind) {
    case "patchMission": {
      const headerFields = fieldMap(def.headerFields);
      const current: Record<string, unknown> = {
        title: m.title,
        internalRef: m.internalRef,
        address: m.address,
        scheduledAt: m.scheduledAt?.toISOString() ?? null,
        inspectorId: m.inspectorId,
        clientId: m.clientId,
        siteId: m.siteId,
        generalNotes: m.generalNotes,
        pendingFields: m.pendingFields,
        checklist: checklistState(m, def),
      };
      const data = { ...m.data } as Record<string, unknown>;
      const patch: Partial<typeof missions.$inferInsert> = {};
      const conflicts: NonNullable<OpResult["conflicts"]> = [];
      const applied: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, ch] of Object.entries(op.changes)) {
        const isData = key.startsWith("data.");
        const fk = isData ? key.slice(5) : key;
        if (!isData && !(MISSION_KEYS as readonly string[]).includes(key)) throw invalid(`Champ non modifiable : ${key}`);
        if (isData && !headerFields.has(fk)) throw invalid(`Champ inconnu dans le modèle : ${fk}`);
        const serverVal = isData ? (data[fk] ?? null) : current[key];
        let value = ch.value;
        if (isData) {
          const c = coerceValue(headerFields.get(fk)!, value);
          if (!c.ok) throw invalid(c.error);
          value = c.value;
        }
        if ("base" in ch && !same(serverVal, ch.base) && !same(serverVal, value)) {
          conflicts.push({ key, base: ch.base, server: serverVal, mine: value });
          continue;
        }
        if (same(serverVal, value)) continue;
        applied[key] = { from: serverVal, to: value };
        if (isData) data[fk] = value;
        else await assignMissionKey(ctx, tx, patch, data, key, value, def);
      }
      if (Object.keys(applied).length) {
        await tx.update(missions).set({ ...patch, data }).where(eq(missions.id, m.id));
        await audit(auditTx, "mission", m.id, "edit", { changes: applied });
      }
      if (conflicts.length) {
        if (Object.keys(applied).length === 0) return { opId: op.opId, status: "conflict", conflicts, message: "Modifié entre-temps par un autre utilisateur ou appareil." };
        return { opId: op.opId, status: "conflict", conflicts, message: "Certaines modifications sont en conflit ; les autres ont été appliquées." };
      }
      return { opId: op.opId, status: "applied" };
    }
    case "createItem": {
      const t = def.itemTypes.find((x) => x.key === op.itemType);
      if (!t) throw invalid("Type d'élément inconnu dans le modèle.");
      const [exists] = await tx.select({ id: missionItems.id }).from(missionItems).where(eq(missionItems.id, op.itemId));
      if (exists) throw invalid("Identifiant d'élément déjà utilisé.");
      if (op.parentId) {
        const [parent] = await tx.select().from(missionItems).where(and(eq(missionItems.id, op.parentId), eq(missionItems.missionId, m.id)));
        if (!parent) throw invalid("Élément parent introuvable.");
        if (!t.parentTypes?.includes(parent.itemType)) throw invalid(`Un « ${t.label} » ne peut pas être rattaché à cet élément.`);
      } else if (t.parentTypes?.length) throw invalid(`Un « ${t.label} » doit être rattaché à un élément parent.`);
      const data = validateData(t.fields, op.data ?? {});
      await tx.insert(missionItems).values({ id: op.itemId, orgId: ctx.org.id, missionId: m.id, parentId: op.parentId ?? null, itemType: op.itemType, label: op.label, position: op.position ?? 0, data });
      await audit(auditTx, "mission", m.id, "item_create", { itemId: op.itemId, itemType: op.itemType, label: op.label });
      return { opId: op.opId, status: "applied" };
    }
    case "patchItem": {
      const [it] = await tx.select().from(missionItems).where(and(eq(missionItems.id, op.itemId), eq(missionItems.missionId, m.id)));
      if (!it) throw invalid("Élément introuvable (peut-être supprimé).");
      const t = def.itemTypes.find((x) => x.key === it.itemType);
      if (!t) throw invalid("Type d'élément absent du modèle.");
      const fields = fieldMap(t.fields);
      const data = { ...it.data } as Record<string, unknown>;
      const current: Record<string, unknown> = { label: it.label, remainingChecks: it.remainingChecks, pendingFields: it.pendingFields, position: it.position };
      const patch: Partial<typeof missionItems.$inferInsert> = {};
      const conflicts: NonNullable<OpResult["conflicts"]> = [];
      const applied: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, ch] of Object.entries(op.changes)) {
        const isData = key.startsWith("data.");
        const fk = isData ? key.slice(5) : key;
        if (!isData && !(key in current)) throw invalid(`Champ non modifiable : ${key}`);
        if (isData && !fields.has(fk)) throw invalid(`Champ inconnu : ${fk}`);
        let value = ch.value;
        if (isData) {
          const c = coerceValue(fields.get(fk)!, value);
          if (!c.ok) throw invalid(c.error);
          value = c.value;
        } else if (key === "label") value = z.string().trim().min(1).max(200).parse(value);
        else if (key === "remainingChecks") value = value ? z.string().max(5000).parse(value) : null;
        else if (key === "pendingFields") value = z.array(z.string()).max(100).parse(value).filter((k) => fields.has(k));
        else if (key === "position") value = z.number().int().min(0).max(100000).parse(value);
        const serverVal = isData ? (data[fk] ?? null) : current[key];
        if ("base" in ch && !same(serverVal, ch.base) && !same(serverVal, value)) {
          conflicts.push({ key, base: ch.base, server: serverVal, mine: value });
          continue;
        }
        if (same(serverVal, value)) continue;
        applied[key] = { from: serverVal, to: value };
        if (isData) data[fk] = value;
        else (patch as Record<string, unknown>)[key] = value;
      }
      if (Object.keys(applied).length) {
        await tx.update(missionItems).set({ ...patch, data, version: it.version + 1, updatedAt: new Date() }).where(eq(missionItems.id, it.id));
        await audit(auditTx, "mission", m.id, "item_edit", { itemId: it.id, label: it.label, changes: applied });
      }
      if (conflicts.length) return { opId: op.opId, status: "conflict", conflicts, message: "Élément modifié entre-temps ailleurs." };
      return { opId: op.opId, status: "applied" };
    }
    case "deleteItem": {
      const [it] = await tx.select().from(missionItems).where(and(eq(missionItems.id, op.itemId), eq(missionItems.missionId, m.id)));
      if (!it) return { opId: op.opId, status: "applied", message: "Déjà supprimé." };
      if (op.baseVersion !== undefined && op.baseVersion !== it.version)
        return { opId: op.opId, status: "conflict", message: "L'élément a été modifié ailleurs depuis votre dernière synchronisation : suppression non appliquée.", server: it };
      const children = await tx.select({ id: missionItems.id }).from(missionItems).where(eq(missionItems.parentId, it.id));
      if (children.length) throw invalid("Supprimez d'abord les éléments rattachés.");
      await tx.update(attachments).set({ itemId: null }).where(eq(attachments.itemId, it.id));
      await tx.delete(missionItems).where(eq(missionItems.id, it.id));
      await audit(auditTx, "mission", m.id, "item_delete", { itemId: it.id, label: it.label, data: it.data });
      return { opId: op.opId, status: "applied" };
    }
    case "addMeasurement": {
      const mt = def.measurementTypes.find((x) => x.key === op.measurementType);
      if (!mt) throw invalid("Type de relevé non prévu par le modèle.");
      if (!mt.units.includes(op.unit)) throw invalid(`Unité non autorisée pour ce relevé (${mt.units.join(", ")}).`);
      const value = typeof op.value === "number" ? op.value : Number(String(op.value).replace(",", ".").replace(/\s/g, ""));
      if (!Number.isFinite(value)) throw invalid("Valeur mesurée invalide.");
      const measuredAt = new Date(op.measuredAt);
      if (Number.isNaN(measuredAt.getTime())) throw invalid("Date de mesure invalide.");
      if (measuredAt.getTime() > Date.now() + 3600_000) throw invalid("La date de mesure ne peut pas être dans le futur.");
      if (op.itemId) {
        const [it] = await tx.select().from(missionItems).where(and(eq(missionItems.id, op.itemId), eq(missionItems.missionId, m.id)));
        if (!it) throw invalid("Élément introuvable.");
        if (!mt.appliesTo.includes(it.itemType)) throw invalid("Ce relevé ne s'applique pas à ce type d'élément.");
      }
      const [exists] = await tx.select({ id: measurements.id }).from(measurements).where(eq(measurements.id, op.id));
      if (exists) throw invalid("Identifiant de relevé déjà utilisé.");
      await tx.insert(measurements).values({
        id: op.id,
        orgId: ctx.org.id,
        missionId: m.id,
        itemId: op.itemId ?? null,
        measurementType: op.measurementType,
        label: mt.label,
        value: String(value),
        unit: op.unit,
        measuredAt,
        instrument: op.instrument || null,
        context: op.context || null,
        origin: "saisie",
        enteredBy: ctx.user.id,
      });
      await audit(auditTx, "mission", m.id, "measurement_add", { id: op.id, type: op.measurementType, value, unit: op.unit, itemId: op.itemId });
      return { opId: op.opId, status: "applied" };
    }
    case "deleteMeasurement": {
      const [row] = await tx.select().from(measurements).where(and(eq(measurements.id, op.id), eq(measurements.missionId, m.id)));
      if (!row) return { opId: op.opId, status: "applied", message: "Déjà supprimé." };
      await tx.delete(measurements).where(eq(measurements.id, op.id));
      await audit(auditTx, "mission", m.id, "measurement_delete", { id: op.id, type: row.measurementType, value: row.value, unit: row.unit });
      return { opId: op.opId, status: "applied" };
    }
    case "upsertObservation": {
      if (op.internalPriority && !def.observationPriorities.some((p) => p.key === op.internalPriority)) throw invalid("Priorité interne inconnue.");
      if (op.treatmentStatus && !def.treatmentStatuses.some((p) => p.key === op.treatmentStatus)) throw invalid("État de traitement inconnu.");
      if (op.itemId) {
        const [it] = await tx.select({ id: missionItems.id }).from(missionItems).where(and(eq(missionItems.id, op.itemId), eq(missionItems.missionId, m.id)));
        if (!it) throw invalid("Élément introuvable.");
      }
      if (op.measurementId) {
        const [me] = await tx.select({ id: measurements.id }).from(measurements).where(and(eq(measurements.id, op.measurementId), eq(measurements.missionId, m.id)));
        if (!me) throw invalid("Relevé introuvable.");
      }
      const values = {
        itemId: op.itemId ?? null,
        kind: op.obsKind,
        description: op.description,
        location: op.location ?? null,
        measurementId: op.measurementId ?? null,
        internalPriority: op.internalPriority ?? null,
        technicalReference: op.technicalReference ?? null,
        referenceVerified: op.referenceVerified ?? false,
        inspectorComment: op.inspectorComment ?? null,
        treatmentStatus: op.treatmentStatus ?? def.treatmentStatuses[0]?.key ?? "a_traiter",
        needsVerification: op.needsVerification ?? false,
      };
      const [existing] = await tx.select().from(observations).where(eq(observations.id, op.id));
      if (existing) {
        if (existing.missionId !== m.id) throw invalid("Observation inconnue.");
        if (op.baseUpdatedAt !== undefined && op.baseUpdatedAt !== null && existing.updatedAt.toISOString() !== op.baseUpdatedAt)
          return { opId: op.opId, status: "conflict", message: "Observation modifiée ailleurs entre-temps.", server: existing };
        await tx.update(observations).set({ ...values, updatedAt: new Date() }).where(eq(observations.id, op.id));
        await audit(auditTx, "mission", m.id, "observation_edit", { id: op.id, from: { description: existing.description, priority: existing.internalPriority }, to: { description: values.description, priority: values.internalPriority } });
      } else {
        await tx.insert(observations).values({ id: op.id, orgId: ctx.org.id, missionId: m.id, createdBy: ctx.user.id, ...values });
        await audit(auditTx, "mission", m.id, "observation_add", { id: op.id, kind: op.obsKind });
      }
      return { opId: op.opId, status: "applied" };
    }
    case "deleteObservation": {
      const [row] = await tx.select().from(observations).where(and(eq(observations.id, op.id), eq(observations.missionId, m.id)));
      if (!row) return { opId: op.opId, status: "applied", message: "Déjà supprimée." };
      await tx.update(attachments).set({ observationId: null }).where(eq(attachments.observationId, op.id));
      await tx.delete(observations).where(eq(observations.id, op.id));
      await audit(auditTx, "mission", m.id, "observation_delete", { id: op.id, description: row.description });
      return { opId: op.opId, status: "applied" };
    }
  }
}

function validateData(fields: Field[], raw: Record<string, unknown>) {
  const map = fieldMap(fields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const f = map.get(k);
    if (!f) throw invalid(`Champ inconnu : ${k}`);
    const c = coerceValue(f, v);
    if (!c.ok) throw invalid(c.error);
    if (!isEmpty(c.value)) out[k] = c.value;
  }
  return out;
}

async function assignMissionKey(ctx: Ctx, tx: DB, patch: Partial<typeof missions.$inferInsert>, data: Record<string, unknown>, key: string, value: unknown, def: TemplateDefinition) {
  const p = reportPerms(def.domain);
  switch (key) {
    case "title":
      patch.title = z.string().trim().min(2).max(200).parse(value);
      break;
    case "internalRef":
    case "address":
    case "generalNotes":
      patch[key] = value ? z.string().max(key === "generalNotes" ? 10000 : 300).parse(value) : null;
      break;
    case "scheduledAt": {
      const d = value ? new Date(String(value)) : null;
      if (d && Number.isNaN(d.getTime())) throw invalid("Date invalide.");
      patch.scheduledAt = d;
      break;
    }
    case "inspectorId": {
      if (!ctx.perms.has(p.manageAll)) throw invalid("Seul un responsable peut réattribuer un dossier.");
      if (value) {
        const [u] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, String(value)), eq(users.orgId, ctx.org.id)));
        if (!u) throw invalid("Inspecteur inconnu.");
      }
      patch.inspectorId = (value as string) || null;
      break;
    }
    case "clientId": {
      if (value) {
        const [c] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, String(value)), eq(clients.orgId, ctx.org.id)));
        if (!c) throw invalid("Client inconnu.");
      }
      patch.clientId = (value as string) || null;
      break;
    }
    case "siteId": {
      if (value) {
        const [s] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, String(value)), eq(sites.orgId, ctx.org.id)));
        if (!s) throw invalid("Site inconnu.");
      }
      patch.siteId = (value as string) || null;
      break;
    }
    case "pendingFields":
      patch.pendingFields = z.array(z.string()).max(100).parse(value).filter((k) => def.headerFields.some((f) => f.key === k));
      break;
    case "checklist": {
      const arr = z.array(z.boolean()).max(40).parse(value);
      data._checklist = def.checklist.map((_, i) => arr[i] === true);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Statuts, versions figées
// ---------------------------------------------------------------------------

export async function setMissionStatus(ctx: Ctx, id: string, status: string, opts: { confirmManual?: boolean } = {}) {
  if (!(status in MISSION_STATUSES)) throw invalid("Statut inconnu.");
  const m = await loadMission(ctx, id);
  const p = reportPerms(m.domain as Domain);
  if (m.status === "ARCHIVE") {
    if (!ctx.perms.has(p.manageAll)) throw forbidden("Seul un responsable peut désarchiver un dossier.");
    if (status === "ARCHIVE") return m;
  } else if (!canEdit(ctx, m)) throw forbidden();
  const full = await getMissionFull(ctx, id);
  const blocking = full.missing.filter((x) => x.level === "bloquant");
  if ((status === "PRET_RELECTURE" || status === "PRET_OUTIL_OFFICIEL") && blocking.length)
    throw invalid(`Informations obligatoires manquantes (${blocking.length}) : ${blocking.slice(0, 3).map((b) => b.message).join(" ; ")}`);
  if (status === "PRET_OUTIL_OFFICIEL") {
    if (!opts.confirmManual) throw invalid("Confirmez que la finalisation sera faite manuellement dans l'outil officiel par l'inspecteur habilité.");
    const cl = checklistState(m, full.definition);
    if (cl.some((c) => !c)) throw invalid("Tous les points de la checklist doivent être cochés.");
  }
  const [updated] = await ctx.db.update(missions).set({ status, version: m.version + 1, updatedAt: new Date() }).where(eq(missions.id, id)).returning();
  await audit(ctx, "mission", id, "status_change", {
    from: m.status,
    to: status,
    note: status === "PRET_OUTIL_OFFICIEL" ? "Marquage manuel : aucune transmission vers l'outil officiel, aucune validation réglementaire." : undefined,
  });
  return updated;
}

export async function saveSnapshot(ctx: Ctx, id: string, label: string) {
  const full = await getMissionFull(ctx, id);
  const name = z.string().trim().min(1).max(120).parse(label || `Version ${full.mission.version}`);
  const snapshot = {
    mission: full.mission,
    template: full.template,
    items: full.items,
    measurements: full.measurements,
    observations: full.observations,
    attachments: full.attachments,
    client: full.client,
    site: full.site,
  };
  const [s] = await ctx.db.insert(missionSnapshots).values({ orgId: ctx.org.id, missionId: id, missionVersion: full.mission.version, label: name, snapshot, createdBy: ctx.user.id }).returning();
  await audit(ctx, "mission", id, "snapshot", { snapshotId: s.id, label: name, version: full.mission.version });
  return s;
}

export async function getSnapshot(ctx: Ctx, missionId: string, snapshotId: string) {
  await loadMission(ctx, missionId);
  if (!z.uuid().safeParse(snapshotId).success) throw notFound();
  const [s] = await ctx.db.select().from(missionSnapshots).where(and(eq(missionSnapshots.id, snapshotId), eq(missionSnapshots.missionId, missionId)));
  if (!s) throw notFound();
  return s;
}

