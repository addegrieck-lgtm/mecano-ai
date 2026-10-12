import { createHash } from "node:crypto";
import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { buyers, lots, notices, opportunities, opportunityHistory } from "@/lib/db/schema";
import { categorize, classify, type Classification } from "./classify";
import { duplicateReason, type DedupCandidate } from "./dedup";
import { regionOf } from "./geo";
import { baseScore } from "./score";
import { normalize, normalizeBuyer } from "./text";
import type { Category, NormalizedNotice, OppDomain } from "./types";
import type { ServiceType } from "./dictionaries";

export type IngestStats = { created: number; updated: number; unchanged: number; merged: number; irrelevant: number };

type Opp = typeof opportunities.$inferSelect;

export function noticeHash(n: NormalizedNotice): string {
  const { raw: _raw, ...rest } = n;
  void _raw;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

async function upsertBuyer(db: DB, n: NormalizedNotice, isDemo: boolean): Promise<string | null> {
  if (!n.buyerName) return null;
  const norm = normalizeBuyer(n.buyerName);
  if (!norm) return null;
  const [existing] = await db
    .select({ id: buyers.id, department: buyers.department, city: buyers.city, nationalId: buyers.nationalId })
    .from(buyers)
    .where(and(eq(buyers.normalizedName, norm), eq(buyers.isDemo, isDemo)))
    .limit(1);
  if (existing) {
    const patch: Partial<typeof buyers.$inferInsert> = {};
    if (!existing.department && n.department) patch.department = n.department;
    if (!existing.city && n.city) patch.city = n.city;
    if (!existing.nationalId && n.buyerNationalId) patch.nationalId = n.buyerNationalId;
    if (Object.keys(patch).length) await db.update(buyers).set({ ...patch, updatedAt: new Date() }).where(eq(buyers.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(buyers)
    .values({
      name: n.buyerName.slice(0, 300),
      normalizedName: norm,
      kind: n.isPublic ? "public" : "private",
      country: n.country,
      department: n.department,
      city: n.city,
      nationalId: n.buyerNationalId,
      isDemo,
    })
    .onConflictDoNothing()
    .returning({ id: buyers.id });
  if (row) return row.id;
  const [again] = await db.select({ id: buyers.id }).from(buyers).where(and(eq(buyers.normalizedName, norm), eq(buyers.isDemo, isDemo))).limit(1);
  return again?.id ?? null;
}

async function buyerHistoryCount(db: DB, buyerId: string | null, excludeId?: string): Promise<number> {
  if (!buyerId) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(and(eq(opportunities.buyerId, buyerId), ne(opportunities.domain, "AUCUN"), excludeId ? ne(opportunities.id, excludeId) : undefined));
  return r?.n ?? 0;
}

function titleHasDomainTerm(c: Classification) {
  return c.details.matchedTerms.some((m) => m.field === "titre" && m.weight >= 4);
}

type Computed = {
  classification: Classification;
  category: Category;
  reason: string;
  score: number;
  factors: ReturnType<typeof baseScore>["factors"];
};

async function compute(
  db: DB,
  input: {
    title: string;
    description: string | null;
    lots: NormalizedNotice["lots"];
    cpvCodes: string[];
    noticeKind: NormalizedNotice["noticeKind"];
    deadlineAt: string | Date | null;
    durationMonths: number | null;
    publishedAt: string | null;
    amount: number | null;
    reliability: "high" | "medium" | "low";
    buyerId: string | null;
    excludeId?: string;
  },
  now: Date,
): Promise<Computed> {
  const classification = classify({ title: input.title, description: input.description, lots: input.lots, cpvCodes: input.cpvCodes });
  const { category, reason } = categorize(classification, { noticeKind: input.noticeKind, deadlineAt: input.deadlineAt, durationMonths: input.durationMonths }, now);
  const history = await buyerHistoryCount(db, input.buyerId, input.excludeId);
  const { score, factors } = baseScore(
    {
      classification,
      category,
      deadlineAt: input.deadlineAt,
      publishedAt: input.publishedAt,
      amount: input.amount,
      reliability: input.reliability,
      buyerHistoryCount: history,
      titleHasDomainTerm: titleHasDomainTerm(classification),
    },
    now,
  );
  return { classification, category, reason, score, factors };
}

function relevanceText(c: Computed): string {
  return [c.reason, ...c.classification.details.explanation].join(" ");
}

async function replaceLots(db: DB, opportunityId: string, list: NormalizedNotice["lots"]) {
  if (!list.length) return;
  await db.delete(lots).where(eq(lots.opportunityId, opportunityId));
  await db.insert(lots).values(
    list.map((l) => {
      const c = classify({ title: l.title, description: l.description, cpvCodes: l.cpvCodes });
      return {
        opportunityId,
        lotNumber: l.number,
        title: l.title,
        description: l.description,
        cpvCodes: l.cpvCodes,
        domain: c.domain,
        relevant: c.domain !== "AUCUN",
      };
    }),
  );
}

const TRACKED_FIELDS = [
  "title",
  "description",
  "deadlineAt",
  "publishedAmount",
  "category",
  "domain",
  "durationText",
  "awardedAt",
  "noticeType",
  "officialUrl",
] as const;

function diff(before: Opp, after: Partial<Opp>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of TRACKED_FIELDS) {
    if (!(k in after)) continue;
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if ((a ?? null) !== (b ?? null)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}

async function candidatesFor(db: DB, n: NormalizedNotice, buyerId: string | null, isDemo: boolean): Promise<DedupCandidate[]> {
  const ids = new Set<string>();
  const conds = [];
  if (n.crossRefs.length) conds.push(inArray(notices.sourceRef, n.crossRefs));
  if (n.url) conds.push(eq(notices.url, n.url));
  if (conds.length) {
    const rows = await db
      .select({ opp: notices.opportunityId })
      .from(notices)
      .where(and(or(...conds), eq(notices.isDemo, isDemo)));
    rows.forEach((r) => r.opp && ids.add(r.opp));
  }
  if (n.crossRefs.length) {
    const rows = await db.select({ id: opportunities.id }).from(opportunities).where(and(inArray(opportunities.reference, n.crossRefs), eq(opportunities.isDemo, isDemo)));
    rows.forEach((r) => ids.add(r.id));
  }
  if (buyerId) {
    const rows = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.buyerId, buyerId)).limit(300);
    rows.forEach((r) => ids.add(r.id));
  }
  if (!ids.size) return [];
  const opps = await db.select().from(opportunities).where(inArray(opportunities.id, [...ids]));
  const linked = await db
    .select({ opp: notices.opportunityId, ref: notices.sourceRef, url: notices.url })
    .from(notices)
    .where(inArray(notices.opportunityId, [...ids]));
  return opps.map((o) => ({
    id: o.id,
    title: o.title,
    buyerName: o.buyerName,
    publishedAt: o.publishedAt,
    department: o.department,
    reference: o.reference,
    refs: linked.filter((l) => l.opp === o.id).map((l) => l.ref),
    urls: [o.officialUrl, ...linked.filter((l) => l.opp === o.id).map((l) => l.url)].filter((u): u is string => !!u),
  }));
}

/** Champs d'une opportunité issus d'un avis (aucune valeur calculée présentée comme officielle). */
function fieldsFromNotice(n: NormalizedNotice, c: Computed, buyerId: string | null) {
  return {
    title: n.title,
    normalizedTitle: normalize(n.title),
    description: n.description,
    buyerId,
    buyerName: n.buyerName,
    country: n.country,
    region: n.country === "FR" ? regionOf(n.department) : null,
    department: n.department,
    city: n.city,
    address: n.address,
    domain: c.classification.domain as OppDomain,
    category: c.category,
    serviceType: c.classification.serviceType as ServiceType,
    isPublic: n.isPublic,
    publishedAt: n.publishedAt,
    deadlineAt: n.deadlineAt ? new Date(n.deadlineAt) : null,
    sourceUpdatedAt: n.sourceUpdatedAt ? new Date(n.sourceUpdatedAt) : null,
    awardedAt: n.awardedAt,
    publishedAmount: n.amount !== null ? String(n.amount) : null,
    amountCurrency: n.currency,
    durationText: n.durationText,
    selectionCriteria: n.selectionCriteria,
    procedureType: n.procedureType,
    noticeType: n.noticeTypeRaw,
    cpvCodes: n.cpvCodes,
    reference: n.sourceRef,
    officialUrl: n.url,
    reliability: n.reliability,
    relevanceReason: relevanceText(c),
    classification: c.classification.details,
    baseScore: c.score,
    scoreFactors: c.factors,
  };
}

const DURATION_RE = /(\d{1,3})\s*mois/;

/** Intègre un lot d'avis normalisés : enregistrement brut, déduplication, fusion, historique. */
export async function ingestNotices(db: DB, list: NormalizedNotice[], opts: { isDemo?: boolean; now?: Date } = {}): Promise<IngestStats> {
  const isDemo = opts.isDemo ?? false;
  const now = opts.now ?? new Date();
  const stats: IngestStats = { created: 0, updated: 0, unchanged: 0, merged: 0, irrelevant: 0 };

  for (const n of list) {
    const hash = noticeHash(n);
    await db.transaction(async (tx) => {
      const t = tx as unknown as DB;
      const [existing] = await t
        .select()
        .from(notices)
        .where(and(eq(notices.sourceId, n.sourceId), eq(notices.sourceRef, n.sourceRef)))
        .limit(1);

      if (existing && existing.contentHash === hash) {
        await t.update(notices).set({ lastSeenAt: now }).where(eq(notices.id, existing.id));
        stats.unchanged++;
        return;
      }

      const buyerId = await upsertBuyer(t, n, isDemo);

      if (existing) {
        // Avis modifié par la source : mise à jour et historique des changements.
        await t
          .update(notices)
          .set({ title: n.title, url: n.url, noticeType: n.noticeTypeRaw, publishedAt: n.publishedAt, crossRefs: n.crossRefs, contentHash: hash, raw: n.raw, lastSeenAt: now })
          .where(eq(notices.id, existing.id));
        if (existing.opportunityId) {
          const [opp] = await t.select().from(opportunities).where(eq(opportunities.id, existing.opportunityId)).limit(1);
          if (opp) {
            const c = await compute(t, { ...n, buyerId, excludeId: opp.id }, now);
            const fields = fieldsFromNotice(n, c, buyerId);
            const changes = diff(opp, fields);
            await t.update(opportunities).set({ ...fields, updatedAt: now }).where(eq(opportunities.id, opp.id));
            await replaceLots(t, opp.id, n.lots);
            await t.insert(opportunityHistory).values({ opportunityId: opp.id, kind: "updated", sourceId: n.sourceId, noticeRef: n.sourceRef, changes });
          }
        }
        stats.updated++;
        return;
      }

      // Nouvel avis : recherche d'un doublon (autre source, rectificatif, attribution de la même procédure).
      const cands = await candidatesFor(t, n, buyerId, isDemo);
      let match: { cand: DedupCandidate; reason: string } | null = null;
      for (const cand of cands) {
        const reason = duplicateReason({ ...n }, cand);
        if (reason) {
          match = { cand, reason };
          break;
        }
      }

      if (match) {
        const [opp] = await t.select().from(opportunities).where(eq(opportunities.id, match.cand.id)).limit(1);
        await t.insert(notices).values({
          sourceId: n.sourceId,
          sourceRef: n.sourceRef,
          opportunityId: opp.id,
          url: n.url,
          title: n.title,
          noticeType: n.noticeTypeRaw,
          publishedAt: n.publishedAt,
          crossRefs: n.crossRefs,
          contentHash: hash,
          raw: n.raw,
          licence: n.licence,
          isDemo,
        });
        // Fusion : on complète sans écraser ; un avis d'attribution / rectificatif / annulation fait évoluer le statut.
        const lifecycle = n.noticeKind === "award" || n.noticeKind === "corrigendum" || n.noticeKind === "cancellation";
        const mergedDescription = opp.description && n.description && !opp.description.includes(n.description.slice(0, 60)) ? `${opp.description}\n\n${n.description}` : (opp.description ?? n.description);
        const durationMonths = n.durationMonths ?? (opp.durationText ? Number(opp.durationText.match(DURATION_RE)?.[1]) || null : null);
        const c = await compute(
          t,
          {
            title: opp.title,
            description: mergedDescription,
            lots: n.lots,
            cpvCodes: [...new Set([...opp.cpvCodes, ...n.cpvCodes])],
            noticeKind: lifecycle ? n.noticeKind : n.noticeKind === "prior_info" ? (opp.deadlineAt ? "contract" : "prior_info") : "contract",
            deadlineAt: n.noticeKind === "corrigendum" && n.deadlineAt ? n.deadlineAt : (opp.deadlineAt ?? n.deadlineAt),
            durationMonths,
            publishedAt: opp.publishedAt ?? n.publishedAt,
            amount: opp.publishedAmount ? Number(opp.publishedAmount) : n.amount,
            reliability: opp.reliability === "high" || n.reliability === "high" ? "high" : "medium",
            buyerId: opp.buyerId ?? buyerId,
            excludeId: opp.id,
          },
          now,
        );
        // Un avis non « cycle de vie » (doublon d'une autre source) ne fait pas régresser une attribution / annulation.
        if (!lifecycle && ["AWARDED", "CONTRACT_WATCH"].includes(opp.category)) c.category = opp.category as Category;
        const patch: Partial<Opp> = {
          description: mergedDescription,
          cpvCodes: [...new Set([...opp.cpvCodes, ...n.cpvCodes])],
          deadlineAt: n.noticeKind === "corrigendum" && n.deadlineAt ? new Date(n.deadlineAt) : (opp.deadlineAt ?? (n.deadlineAt ? new Date(n.deadlineAt) : null)),
          publishedAmount: opp.publishedAmount ?? (n.amount !== null ? String(n.amount) : null),
          amountCurrency: opp.amountCurrency ?? n.currency,
          durationText: opp.durationText ?? n.durationText,
          selectionCriteria: opp.selectionCriteria ?? n.selectionCriteria,
          procedureType: opp.procedureType ?? n.procedureType,
          department: opp.department ?? n.department,
          region: opp.region ?? (n.country === "FR" ? regionOf(n.department) : null),
          city: opp.city ?? n.city,
          address: opp.address ?? n.address,
          awardedAt: opp.awardedAt ?? n.awardedAt,
          noticeType: lifecycle ? n.noticeTypeRaw : opp.noticeType,
          domain: c.classification.domain,
          serviceType: c.classification.serviceType,
          category: c.category,
          classification: c.classification.details,
          relevanceReason: relevanceText(c),
          baseScore: c.score,
          scoreFactors: c.factors,
          sourceUpdatedAt: now,
        };
        const changes = diff(opp, patch);
        await t.update(opportunities).set({ ...patch, updatedAt: now }).where(eq(opportunities.id, opp.id));
        if (n.lots.length) await replaceLots(t, opp.id, n.lots);
        await t.insert(opportunityHistory).values({
          opportunityId: opp.id,
          kind: "merged",
          sourceId: n.sourceId,
          noticeRef: n.sourceRef,
          changes: { ...changes, _raison: { from: null, to: match.reason } },
        });
        stats.merged++;
        return;
      }

      const c = await compute(t, { ...n, buyerId }, now);
      const [opp] = await t
        .insert(opportunities)
        .values({ ...fieldsFromNotice(n, c, buyerId), primarySourceId: n.sourceId, collectedAt: now, isDemo })
        .returning({ id: opportunities.id });
      await t.insert(notices).values({
        sourceId: n.sourceId,
        sourceRef: n.sourceRef,
        opportunityId: opp.id,
        url: n.url,
        title: n.title,
        noticeType: n.noticeTypeRaw,
        publishedAt: n.publishedAt,
        crossRefs: n.crossRefs,
        contentHash: hash,
        raw: n.raw,
        licence: n.licence,
        isDemo,
      });
      await replaceLots(t, opp.id, n.lots);
      await t.insert(opportunityHistory).values({ opportunityId: opp.id, kind: "created", sourceId: n.sourceId, noticeRef: n.sourceRef, changes: {} });
      stats.created++;
      if (c.category === "IRRELEVANT") stats.irrelevant++;
    });
  }
  return stats;
}

/** Passe en « clôturée » les consultations dont la date limite publiée est dépassée, et recalcule leur score. */
export async function closeExpired(db: DB, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(and(inArray(opportunities.category, ["ACTIVE", "SUPPLIER_CALL", "INDIRECT"]), lt(opportunities.deadlineAt, now)));
  for (const o of rows) {
    const classification: Classification = {
      domain: o.domain as OppDomain,
      serviceType: o.serviceType as ServiceType,
      supplierCall: o.category === "SUPPLIER_CALL",
      details: o.classification,
    };
    const { score, factors } = baseScore(
      {
        classification,
        category: "CLOSED",
        deadlineAt: o.deadlineAt,
        publishedAt: o.publishedAt,
        amount: o.publishedAmount ? Number(o.publishedAmount) : null,
        reliability: o.reliability as "high" | "medium" | "low",
        buyerHistoryCount: await buyerHistoryCount(db, o.buyerId, o.id),
        titleHasDomainTerm: titleHasDomainTerm(classification),
      },
      now,
    );
    await db.update(opportunities).set({ category: "CLOSED", baseScore: score, scoreFactors: factors, updatedAt: now }).where(eq(opportunities.id, o.id));
    await db.insert(opportunityHistory).values({
      opportunityId: o.id,
      kind: "updated",
      sourceId: null,
      changes: { category: { from: o.category, to: "CLOSED" }, _raison: { from: null, to: "Date limite publiée dépassée" } },
    });
  }
  return rows.length;
}
