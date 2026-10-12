import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import {
  buyers,
  lots,
  notes,
  notices,
  opportunities,
  opportunityHistory,
  opportunityTracking,
  savedSearches,
  sources,
  tasks,
  userPreferences,
  users,
  watchAlerts,
  type ScoreFactor,
} from "@/lib/db/schema";
import { finalScore, personalFactors, type UserScorePrefs } from "@/lib/radar/score";
import { departmentsWithin } from "@/lib/radar/geo";
import { CANDIDATABLE, CATEGORIES, TRACKING_STATUSES, type Category, type TrackingStatus } from "@/lib/radar/types";
import { demoEnabled } from "@/lib/demo";
import { invalid, notFound } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Filtres de recherche
// ---------------------------------------------------------------------------

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)));
const optStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const optNum = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
  .refine((v) => v === undefined || Number.isFinite(v), "Nombre invalide");
const optDate = optStr.refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date invalide (AAAA-MM-JJ)");
const flag = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "1" || v === "true" || v === "on");

export const SearchSchema = z.object({
  q: optStr.refine((v) => !v || v.length <= 200, "Recherche trop longue"),
  domain: z.enum(["", "LEVAGE", "ELECTRICITE", "MIXTE", "BOTH"]).optional().default(""),
  category: csv,
  open: flag,
  sector: z.enum(["", "public", "private"]).optional().default(""),
  country: optStr,
  region: optStr,
  department: optStr,
  city: optStr,
  radiusFrom: optStr,
  radiusKm: optNum,
  publishedFrom: optDate,
  publishedTo: optDate,
  deadlineFrom: optDate,
  deadlineTo: optDate,
  buyer: optStr,
  buyerId: optStr,
  source: optStr,
  minScore: optNum,
  amountMin: optNum,
  amountMax: optNum,
  serviceType: csv,
  status: csv,
  favorite: flag,
  assignedToMe: flag,
  includeIrrelevant: flag,
  newSince: z.enum(["", "today", "last_visit", "7d"]).optional().default(""),
  sort: z.enum(["score", "published", "deadline", "updated"]).optional().default("score"),
  page: optNum,
  pageSize: optNum,
});
export type SearchFilters = z.infer<typeof SearchSchema>;

export function parseSearch(params: Record<string, string | string[] | undefined> | URLSearchParams): SearchFilters {
  const obj: Record<string, string | string[]> = {};
  if (params instanceof URLSearchParams) {
    for (const k of new Set(params.keys())) {
      const all = params.getAll(k);
      obj[k] = all.length > 1 ? all : all[0];
    }
  } else for (const [k, v] of Object.entries(params)) if (v !== undefined) obj[k] = v;
  const r = SearchSchema.safeParse(obj);
  if (!r.success) throw invalid("Filtres invalides : " + r.error.issues.map((i) => i.message).join(", "));
  return r.data;
}

export type OppRow = typeof opportunities.$inferSelect & {
  tracking: { status: string; favorite: boolean; assigneeId: string | null } | null;
  score: number;
  personal: ScoreFactor[];
  isOpen: boolean;
};

export async function getPrefs(ctx: Ctx): Promise<UserScorePrefs & { lastSeen: Date | null; digestFrequency: string; emailEnabled: boolean }> {
  const [p] = await ctx.db.select().from(userPreferences).where(eq(userPreferences.userId, ctx.user.id));
  return {
    homeDepartment: p?.homeDepartment ?? null,
    radiusKm: p?.radiusKm ?? null,
    preferredDepartments: p?.preferredDepartments ?? [],
    domains: p?.domains ?? ["LEVAGE", "ELECTRICITE"],
    lastSeen: p?.lastSeenOpportunitiesAt ?? null,
    digestFrequency: p?.digestFrequency ?? "daily",
    emailEnabled: p?.emailEnabled ?? false,
  };
}

export function isOpen(o: { category: string; deadlineAt: Date | null }, now = new Date()) {
  if (!CANDIDATABLE.includes(o.category as Category)) return false;
  return !o.deadlineAt || o.deadlineAt.getTime() >= now.getTime();
}

const MAX_CANDIDATES = 3000;

/** Recherche avancée. Les filtres SQL s'appliquent d'abord ; le score personnalisé est calculé ensuite. */
export async function searchOpportunities(ctx: Ctx, f: SearchFilters, opts: { demo?: boolean; now?: Date } = {}) {
  requirePerm(ctx, "opps.read");
  const now = opts.now ?? new Date();
  const demo = !!opts.demo && demoEnabled();
  const prefs = await getPrefs(ctx);
  const w: SQL[] = [eq(opportunities.isDemo, demo)];

  if (f.domain === "LEVAGE") w.push(inArray(opportunities.domain, ["LEVAGE", "MIXTE"]));
  else if (f.domain === "ELECTRICITE") w.push(inArray(opportunities.domain, ["ELECTRICITE", "MIXTE"]));
  else if (f.domain === "MIXTE") w.push(eq(opportunities.domain, "MIXTE"));
  if (f.category.length) w.push(inArray(opportunities.category, f.category));
  else if (!f.includeIrrelevant) w.push(ne(opportunities.category, "IRRELEVANT"));
  if (f.open) {
    w.push(inArray(opportunities.category, CANDIDATABLE));
    w.push(or(isNull(opportunities.deadlineAt), gte(opportunities.deadlineAt, now))!);
  }
  if (f.sector === "public") w.push(eq(opportunities.isPublic, true));
  if (f.sector === "private") w.push(eq(opportunities.isPublic, false));
  if (f.country) w.push(eq(opportunities.country, f.country.toUpperCase()));
  if (f.region) w.push(eq(opportunities.region, f.region));
  if (f.department) w.push(inArray(opportunities.department, f.department.split(",").map((d) => d.trim().toUpperCase())));
  if (f.city) w.push(ilike(opportunities.city, `%${f.city}%`));
  const radiusFrom = f.radiusFrom ?? (f.radiusKm ? prefs.homeDepartment ?? undefined : undefined);
  if (radiusFrom && f.radiusKm) w.push(inArray(opportunities.department, departmentsWithin(radiusFrom.toUpperCase(), f.radiusKm)));
  if (f.publishedFrom) w.push(gte(opportunities.publishedAt, f.publishedFrom));
  if (f.publishedTo) w.push(lte(opportunities.publishedAt, f.publishedTo));
  if (f.deadlineFrom) w.push(gte(opportunities.deadlineAt, new Date(`${f.deadlineFrom}T00:00:00`)));
  if (f.deadlineTo) w.push(lte(opportunities.deadlineAt, new Date(`${f.deadlineTo}T23:59:59`)));
  if (f.buyerId) w.push(eq(opportunities.buyerId, f.buyerId));
  if (f.buyer) w.push(ilike(opportunities.buyerName, `%${f.buyer}%`));
  if (f.source) w.push(sql`exists (select 1 from ${notices} n where n.opportunity_id = ${opportunities.id} and n.source_id = ${f.source})`);
  if (f.amountMin !== undefined) w.push(sql`${opportunities.publishedAmount}::numeric >= ${f.amountMin}`);
  if (f.amountMax !== undefined) w.push(sql`${opportunities.publishedAmount}::numeric <= ${f.amountMax}`);
  if (f.serviceType.length) w.push(inArray(opportunities.serviceType, f.serviceType));
  if (f.q) {
    w.push(
      or(
        sql`to_tsvector('french', coalesce(${opportunities.title}, '') || ' ' || coalesce(${opportunities.description}, '') || ' ' || coalesce(${opportunities.buyerName}, '')) @@ websearch_to_tsquery('french', ${f.q})`,
        ilike(opportunities.reference, `%${f.q}%`),
        ilike(opportunities.title, `%${f.q}%`),
      )!,
    );
  }
  if (f.newSince === "today") w.push(gte(opportunities.createdAt, new Date(now.getFullYear(), now.getMonth(), now.getDate())));
  if (f.newSince === "7d") w.push(gte(opportunities.createdAt, new Date(now.getTime() - 7 * 86400000)));
  if (f.newSince === "last_visit") {
    const ref = ctx.user.previousLoginAt ?? prefs.lastSeen;
    if (ref) w.push(gte(opportunities.createdAt, ref));
  }

  const tr = and(eq(opportunityTracking.opportunityId, opportunities.id), eq(opportunityTracking.orgId, ctx.org.id));
  if (f.status.length) {
    const st = f.status.filter((s) => s in TRACKING_STATUSES);
    if (st.includes("NOUVEAU")) w.push(or(isNull(opportunityTracking.status), inArray(opportunityTracking.status, st))!);
    else w.push(inArray(opportunityTracking.status, st));
  } else {
    // Les opportunités écartées / archivées ne s'affichent que si on les demande explicitement.
    w.push(or(isNull(opportunityTracking.status), sql`${opportunityTracking.status} not in ('NON_PERTINENT','ARCHIVE')`)!);
  }
  if (f.favorite) w.push(eq(opportunityTracking.favorite, true));
  if (f.assignedToMe) w.push(eq(opportunityTracking.assigneeId, ctx.user.id));

  const rows = await ctx.db
    .select({ o: opportunities, t: { status: opportunityTracking.status, favorite: opportunityTracking.favorite, assigneeId: opportunityTracking.assigneeId } })
    .from(opportunities)
    .leftJoin(opportunityTracking, tr)
    .where(and(...w))
    .orderBy(desc(opportunities.baseScore), desc(opportunities.publishedAt))
    .limit(MAX_CANDIDATES);

  let list: OppRow[] = rows.map(({ o, t }) => {
    const personal = personalFactors(o, prefs);
    return { ...o, tracking: t?.status ? t : null, personal, score: finalScore(o.baseScore, personal), isOpen: isOpen(o, now) };
  });
  if (f.minScore !== undefined) list = list.filter((o) => o.score >= f.minScore!);

  const cmpDate = (a: string | Date | null, b: string | Date | null, dir: 1 | -1) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return (new Date(a).getTime() - new Date(b).getTime()) * dir;
  };
  if (f.sort === "score") list.sort((a, b) => b.score - a.score || cmpDate(a.publishedAt, b.publishedAt, -1));
  if (f.sort === "published") list.sort((a, b) => cmpDate(a.publishedAt, b.publishedAt, -1));
  if (f.sort === "deadline") list.sort((a, b) => cmpDate(a.deadlineAt, b.deadlineAt, 1));
  if (f.sort === "updated") list.sort((a, b) => cmpDate(a.updatedAt, b.updatedAt, -1));

  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 500);
  const page = Math.max(f.page ?? 1, 1);
  return {
    total: list.length,
    truncated: rows.length >= MAX_CANDIDATES,
    page,
    pageSize,
    items: list.slice((page - 1) * pageSize, page * pageSize),
    all: list,
  };
}

// ---------------------------------------------------------------------------
// Fiche détaillée
// ---------------------------------------------------------------------------

export async function getOpportunity(ctx: Ctx, id: string) {
  requirePerm(ctx, "opps.read");
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [o] = await ctx.db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!o) throw notFound();
  const [tracking] = await ctx.db
    .select()
    .from(opportunityTracking)
    .where(and(eq(opportunityTracking.orgId, ctx.org.id), eq(opportunityTracking.opportunityId, id)));
  const [buyer] = o.buyerId ? await ctx.db.select().from(buyers).where(eq(buyers.id, o.buyerId)) : [];
  const linked = await ctx.db
    .select({ id: notices.id, sourceId: notices.sourceId, sourceRef: notices.sourceRef, url: notices.url, title: notices.title, noticeType: notices.noticeType, publishedAt: notices.publishedAt, firstSeenAt: notices.firstSeenAt, lastSeenAt: notices.lastSeenAt, licence: notices.licence })
    .from(notices)
    .where(eq(notices.opportunityId, id))
    .orderBy(asc(notices.firstSeenAt));
  const lotList = await ctx.db.select().from(lots).where(eq(lots.opportunityId, id)).orderBy(asc(lots.lotNumber));
  const history = await ctx.db.select().from(opportunityHistory).where(eq(opportunityHistory.opportunityId, id)).orderBy(desc(opportunityHistory.createdAt));
  const noteList = await ctx.db
    .select({ id: notes.id, body: notes.body, createdAt: notes.createdAt, author: users.name })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.authorId))
    .where(and(eq(notes.orgId, ctx.org.id), eq(notes.entityType, "opportunity"), eq(notes.entityId, id)))
    .orderBy(desc(notes.createdAt));
  const taskList = await ctx.db
    .select({ t: tasks, assignee: users.name })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(eq(tasks.orgId, ctx.org.id), eq(tasks.opportunityId, id)))
    .orderBy(asc(tasks.doneAt), asc(tasks.dueAt));
  const prefs = await getPrefs(ctx);
  const personal = personalFactors(o, prefs);
  const members = await ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.org.id), eq(users.active, true))).orderBy(asc(users.name));
  return {
    opp: o,
    tracking: tracking ?? null,
    buyer: buyer ?? null,
    notices: linked,
    lots: lotList,
    history,
    notes: noteList,
    tasks: taskList.map((r) => ({ ...r.t, assigneeName: r.assignee })),
    personal,
    score: finalScore(o.baseScore, personal),
    isOpen: isOpen(o),
    members,
  };
}

// ---------------------------------------------------------------------------
// Suivi commercial (propre à l'organisation)
// ---------------------------------------------------------------------------

async function ensureOppVisible(ctx: Ctx, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [o] = await ctx.db.select({ id: opportunities.id, title: opportunities.title }).from(opportunities).where(eq(opportunities.id, id));
  if (!o) throw notFound();
  return o;
}

async function upsertTracking(ctx: Ctx, id: string, patch: Partial<typeof opportunityTracking.$inferInsert>) {
  await ctx.db
    .insert(opportunityTracking)
    .values({ orgId: ctx.org.id, opportunityId: id, updatedBy: ctx.user.id, ...patch })
    .onConflictDoUpdate({
      target: [opportunityTracking.orgId, opportunityTracking.opportunityId],
      set: { ...patch, updatedBy: ctx.user.id, updatedAt: new Date() },
    });
}

export async function setTrackingStatus(ctx: Ctx, id: string, status: string, reason?: string) {
  requirePerm(ctx, "opps.track");
  if (!(status in TRACKING_STATUSES)) throw invalid("Statut inconnu.");
  await ensureOppVisible(ctx, id);
  const [before] = await ctx.db.select().from(opportunityTracking).where(and(eq(opportunityTracking.orgId, ctx.org.id), eq(opportunityTracking.opportunityId, id)));
  await upsertTracking(ctx, id, { status, dismissReason: status === "NON_PERTINENT" ? (reason?.slice(0, 500) ?? null) : null });
  await audit(ctx, "opportunity", id, "status_change", {
    from: before?.status ?? "NOUVEAU",
    to: status,
    note: status === "TRANSMIS_MANUELLEMENT" ? "Déclaration manuelle de l'utilisateur : aucune transmission informatique n'a eu lieu." : undefined,
    reason,
  });
}

export async function toggleFavorite(ctx: Ctx, id: string) {
  requirePerm(ctx, "opps.track");
  await ensureOppVisible(ctx, id);
  const [t] = await ctx.db.select().from(opportunityTracking).where(and(eq(opportunityTracking.orgId, ctx.org.id), eq(opportunityTracking.opportunityId, id)));
  const fav = !(t?.favorite ?? false);
  await upsertTracking(ctx, id, { favorite: fav });
  await audit(ctx, "opportunity", id, fav ? "favorite_add" : "favorite_remove");
  return fav;
}

export async function assignOpportunity(ctx: Ctx, id: string, assigneeId: string | null) {
  requirePerm(ctx, "opps.track");
  await ensureOppVisible(ctx, id);
  if (assigneeId) {
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.id, assigneeId), eq(users.orgId, ctx.org.id)));
    if (!u) throw invalid("Responsable inconnu.");
  }
  await upsertTracking(ctx, id, { assigneeId });
  await audit(ctx, "opportunity", id, "assign", { assigneeId });
}

const NoteSchema = z.string().trim().min(1, "Note vide").max(5000, "Note trop longue");

export async function addNote(ctx: Ctx, entityType: "opportunity" | "buyer", entityId: string, body: string) {
  requirePerm(ctx, "opps.track");
  const text = NoteSchema.parse(body);
  if (entityType === "opportunity") await ensureOppVisible(ctx, entityId);
  else {
    if (!z.uuid().safeParse(entityId).success) throw notFound();
    const [b] = await ctx.db.select({ id: buyers.id }).from(buyers).where(eq(buyers.id, entityId));
    if (!b) throw notFound();
  }
  const [n] = await ctx.db.insert(notes).values({ orgId: ctx.org.id, entityType, entityId, authorId: ctx.user.id, body: text }).returning();
  await audit(ctx, entityType, entityId, "note_add", { noteId: n.id });
  return n;
}

export const TaskSchema = z.object({
  title: z.string().trim().min(2, "Titre requis").max(300),
  description: z.string().trim().max(5000).optional().transform((v) => v || null),
  opportunityId: z.uuid().optional().nullable(),
  buyerId: z.uuid().optional().nullable(),
  assigneeId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  dueAt: z.string().optional().transform((v) => (v ? new Date(v) : null)),
  remindAt: z.string().optional().transform((v) => (v ? new Date(v) : null)),
});

export async function createTask(ctx: Ctx, input: z.input<typeof TaskSchema>) {
  requirePerm(ctx, "opps.track");
  const t = TaskSchema.parse(input);
  if (t.dueAt && Number.isNaN(t.dueAt.getTime())) throw invalid("Échéance invalide.");
  if (t.remindAt && Number.isNaN(t.remindAt.getTime())) throw invalid("Date de rappel invalide.");
  if (t.opportunityId) await ensureOppVisible(ctx, t.opportunityId);
  if (t.assigneeId) {
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.id, t.assigneeId), eq(users.orgId, ctx.org.id)));
    if (!u) throw invalid("Responsable inconnu.");
  }
  const [row] = await ctx.db
    .insert(tasks)
    .values({ orgId: ctx.org.id, title: t.title, description: t.description, opportunityId: t.opportunityId ?? null, buyerId: t.buyerId ?? null, assigneeId: t.assigneeId ?? ctx.user.id, dueAt: t.dueAt, remindAt: t.remindAt, createdBy: ctx.user.id })
    .returning();
  await audit(ctx, "task", row.id, "create", { opportunityId: t.opportunityId, title: t.title });
  return row;
}

export async function setTaskDone(ctx: Ctx, taskId: string, done: boolean) {
  requirePerm(ctx, "opps.track");
  if (!z.uuid().safeParse(taskId).success) throw notFound();
  const [t] = await ctx.db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, ctx.org.id)));
  if (!t) throw notFound();
  await ctx.db.update(tasks).set({ doneAt: done ? new Date() : null, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  await audit(ctx, "task", taskId, done ? "done" : "reopen");
}

export async function listTasks(ctx: Ctx, filter: { scope: "mine" | "all"; done: boolean }) {
  requirePerm(ctx, "opps.track");
  const w: SQL[] = [eq(tasks.orgId, ctx.org.id), filter.done ? isNotNull(tasks.doneAt) : isNull(tasks.doneAt)];
  if (filter.scope === "mine") w.push(eq(tasks.assigneeId, ctx.user.id));
  const rows = await ctx.db
    .select({ t: tasks, assignee: users.name, opp: { id: opportunities.id, title: opportunities.title }, buyer: { id: buyers.id, name: buyers.name } })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .leftJoin(buyers, eq(buyers.id, tasks.buyerId))
    .where(and(...w))
    .orderBy(sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt))
    .limit(500);
  return rows.map((r) => ({ ...r.t, assigneeName: r.assignee, opp: r.opp?.id ? r.opp : null, buyer: r.buyer?.id ? r.buyer : null }));
}

// ---------------------------------------------------------------------------
// Recherches enregistrées et alertes de surveillance
// ---------------------------------------------------------------------------

export async function saveSearch(ctx: Ctx, name: string, query: string) {
  requirePerm(ctx, "opps.read");
  const n = z.string().trim().min(1).max(120).parse(name);
  const q = z.string().max(2000).parse(query.replace(/^\?/, ""));
  parseSearch(new URLSearchParams(q)); // valide les filtres
  const [row] = await ctx.db.insert(savedSearches).values({ orgId: ctx.org.id, userId: ctx.user.id, name: n, query: q }).returning();
  return row;
}

export async function listSavedSearches(ctx: Ctx) {
  return ctx.db.select().from(savedSearches).where(and(eq(savedSearches.orgId, ctx.org.id), eq(savedSearches.userId, ctx.user.id))).orderBy(asc(savedSearches.name));
}

export async function deleteSavedSearch(ctx: Ctx, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound();
  await ctx.db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, ctx.user.id)));
}

export const AlertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["buyer", "keyword", "department", "family"]),
  buyerId: z.uuid().optional(),
  keyword: z.string().trim().max(120).optional(),
  department: z.string().trim().max(3).optional(),
  family: z.string().trim().max(40).optional(),
  domain: z.enum(["", "LEVAGE", "ELECTRICITE"]).optional(),
});

export async function createAlert(ctx: Ctx, input: z.input<typeof AlertSchema>) {
  requirePerm(ctx, "opps.track");
  const a = AlertSchema.parse(input);
  if (a.kind === "buyer" && !a.buyerId) throw invalid("Acheteur requis.");
  if (a.kind === "keyword" && !a.keyword) throw invalid("Mot-clé requis.");
  if (a.kind === "department" && !a.department) throw invalid("Département requis.");
  if (a.kind === "family" && !a.family) throw invalid("Famille de prestations requise.");
  const [row] = await ctx.db
    .insert(watchAlerts)
    .values({
      orgId: ctx.org.id,
      userId: ctx.user.id,
      name: a.name,
      kind: a.kind,
      criteria: { buyerId: a.buyerId, keyword: a.keyword, department: a.department?.toUpperCase(), family: a.family, domain: a.domain || undefined },
      lastCheckedAt: new Date(),
    })
    .returning();
  await audit(ctx, "alert", row.id, "create", { kind: a.kind });
  return row;
}

export async function listAlerts(ctx: Ctx) {
  return ctx.db.select().from(watchAlerts).where(and(eq(watchAlerts.orgId, ctx.org.id), eq(watchAlerts.userId, ctx.user.id))).orderBy(desc(watchAlerts.createdAt));
}

export async function deleteAlert(ctx: Ctx, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound();
  await ctx.db.delete(watchAlerts).where(and(eq(watchAlerts.id, id), eq(watchAlerts.userId, ctx.user.id), eq(watchAlerts.orgId, ctx.org.id)));
}

/** Conditions SQL d'une alerte (réutilisées par le rapport quotidien). */
export function alertCondition(a: typeof watchAlerts.$inferSelect): SQL | undefined {
  const c = a.criteria;
  const parts: SQL[] = [ne(opportunities.category, "IRRELEVANT")];
  if (c.domain) parts.push(inArray(opportunities.domain, [c.domain, "MIXTE"]));
  if (a.kind === "buyer" && c.buyerId) parts.push(eq(opportunities.buyerId, c.buyerId));
  if (a.kind === "keyword" && c.keyword)
    parts.push(or(ilike(opportunities.title, `%${c.keyword}%`), ilike(opportunities.description, `%${c.keyword}%`), ilike(opportunities.buyerName, `%${c.keyword}%`))!);
  if (a.kind === "department" && c.department) parts.push(eq(opportunities.department, c.department));
  if (a.kind === "family" && c.family) parts.push(eq(opportunities.serviceType, c.family));
  return and(...parts);
}

export async function alertMatches(ctx: Ctx, alertId: string, limit = 50) {
  const [a] = await ctx.db.select().from(watchAlerts).where(and(eq(watchAlerts.id, alertId), eq(watchAlerts.orgId, ctx.org.id)));
  if (!a) throw notFound();
  return ctx.db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.isDemo, false), alertCondition(a)))
    .orderBy(desc(opportunities.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export async function dashboardStats(ctx: Ctx, opts: { demo?: boolean; now?: Date } = {}) {
  requirePerm(ctx, "opps.read");
  const now = opts.now ?? new Date();
  const demo = !!opts.demo && demoEnabled();
  const prefs = await getPrefs(ctx);
  const since = ctx.user.previousLoginAt ?? prefs.lastSeen;
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const d = opportunities;
  const relevant = and(eq(d.isDemo, demo), ne(d.category, "IRRELEVANT"));
  const cnt = sql<number>`count(*)::int`;
  const one = async (where: SQL | undefined) => (await ctx.db.select({ n: cnt }).from(d).where(and(relevant, where)))[0]?.n ?? 0;

  const [today, sinceLast, levage, elec, active, deadlines, awarded, signals, highScore] = await Promise.all([
    one(gte(d.createdAt, startOfDay)),
    since ? one(gte(d.createdAt, since)) : Promise.resolve(null),
    one(and(inArray(d.domain, ["LEVAGE", "MIXTE"]), ne(d.category, "CLOSED"))),
    one(and(inArray(d.domain, ["ELECTRICITE", "MIXTE"]), ne(d.category, "CLOSED"))),
    one(and(eq(d.category, "ACTIVE"), or(isNull(d.deadlineAt), gte(d.deadlineAt, now)))),
    one(and(inArray(d.category, CANDIDATABLE), gte(d.deadlineAt, now), lte(d.deadlineAt, in7))),
    one(inArray(d.category, ["AWARDED", "CONTRACT_WATCH"])),
    one(eq(d.category, "SIGNAL")),
    one(and(gte(d.baseScore, 70), inArray(d.category, CANDIDATABLE))),
  ]);
  const tracked = await ctx.db
    .select({ status: opportunityTracking.status, favorite: opportunityTracking.favorite, n: cnt })
    .from(opportunityTracking)
    .innerJoin(d, eq(d.id, opportunityTracking.opportunityId))
    .where(and(eq(opportunityTracking.orgId, ctx.org.id), eq(d.isDemo, demo)))
    .groupBy(opportunityTracking.status, opportunityTracking.favorite);
  const favorites = tracked.filter((t) => t.favorite).reduce((s, t) => s + t.n, 0);
  const inPreparation = tracked.filter((t) => t.status === "EN_PREPARATION" || t.status === "EN_ANALYSE").reduce((s, t) => s + t.n, 0);
  const byRegion = await ctx.db
    .select({ region: d.region, n: cnt })
    .from(d)
    .where(and(relevant, eq(d.country, "FR"), isNotNull(d.region), ne(d.category, "CLOSED")))
    .groupBy(d.region)
    .orderBy(desc(cnt));
  const [unlocated] = await ctx.db.select({ n: cnt }).from(d).where(and(relevant, isNull(d.region), ne(d.category, "CLOSED")));
  const sourceStates = await ctx.db.select().from(sources);
  const staleLimit = new Date(now.getTime() - 36 * 3600000);
  const sourceProblems = demo
    ? []
    : sourceStates.filter((s) => s.enabled && s.id !== "demo" && (s.consecutiveFailures > 0 || !s.lastSuccessAt || s.lastSuccessAt < staleLimit));
  const [total] = await ctx.db.select({ n: cnt }).from(d).where(eq(d.isDemo, demo));
  const openTasks = await ctx.db
    .select({ n: cnt })
    .from(tasks)
    .where(and(eq(tasks.orgId, ctx.org.id), isNull(tasks.doneAt), or(eq(tasks.assigneeId, ctx.user.id), isNull(tasks.assigneeId))));
  const dueReminders = await ctx.db
    .select({ id: tasks.id, title: tasks.title, remindAt: tasks.remindAt, dueAt: tasks.dueAt, opportunityId: tasks.opportunityId })
    .from(tasks)
    .where(and(eq(tasks.orgId, ctx.org.id), isNull(tasks.doneAt), eq(tasks.assigneeId, ctx.user.id), lte(tasks.remindAt, now)))
    .limit(10);

  return {
    total: total?.n ?? 0,
    today,
    sinceLast,
    sinceDate: since,
    levage,
    elec,
    active,
    deadlines,
    awarded,
    signals,
    highScore,
    favorites,
    inPreparation,
    byRegion: byRegion.map((r) => ({ region: r.region!, n: r.n })),
    unlocated: unlocated?.n ?? 0,
    sourceProblems,
    sourceStates,
    openTasks: openTasks[0]?.n ?? 0,
    dueReminders,
  };
}

export async function markOpportunitiesSeen(ctx: Ctx) {
  await ctx.db
    .insert(userPreferences)
    .values({ userId: ctx.user.id, lastSeenOpportunitiesAt: new Date() })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { lastSeenOpportunitiesAt: new Date(), updatedAt: new Date() } });
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }));
export const STATUS_OPTIONS = Object.entries(TRACKING_STATUSES).map(([value, label]) => ({ value: value as TrackingStatus, label }));
