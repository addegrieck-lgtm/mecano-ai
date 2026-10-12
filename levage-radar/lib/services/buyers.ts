import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { auditEvents, buyers, notes, notices, opportunities, users, watchAlerts } from "@/lib/db/schema";
import { demoEnabled } from "@/lib/demo";
import { notFound } from "@/lib/errors";

export async function listBuyers(ctx: Ctx, f: { q?: string; domain?: string; recurrent?: boolean; demo?: boolean; page?: number }) {
  requirePerm(ctx, "opps.read");
  const demo = !!f.demo && demoEnabled();
  const w: SQL[] = [eq(buyers.isDemo, demo)];
  if (f.q) w.push(ilike(buyers.name, `%${f.q.slice(0, 100)}%`));
  const domainCond =
    f.domain === "LEVAGE"
      ? sql`o.domain in ('LEVAGE','MIXTE')`
      : f.domain === "ELECTRICITE"
        ? sql`o.domain in ('ELECTRICITE','MIXTE')`
        : sql`o.domain <> 'AUCUN'`;
  const relevantCount = sql<number>`(select count(*)::int from ${opportunities} o where o.buyer_id = ${buyers.id} and ${domainCond})`;
  const activeCount = sql<number>`(select count(*)::int from ${opportunities} o where o.buyer_id = ${buyers.id} and o.category in ('ACTIVE','UPCOMING','SUPPLIER_CALL','INDIRECT') and (o.deadline_at is null or o.deadline_at >= now()))`;
  const awardedCount = sql<number>`(select count(*)::int from ${opportunities} o where o.buyer_id = ${buyers.id} and o.category in ('AWARDED','CONTRACT_WATCH'))`;
  const lastPub = sql<string | null>`(select max(o.published_at)::text from ${opportunities} o where o.buyer_id = ${buyers.id} and o.domain <> 'AUCUN')`;
  if (f.recurrent) w.push(sql`${relevantCount} >= 2`);
  else w.push(sql`${relevantCount} >= 1`);
  const pageSize = 50;
  const page = Math.max(1, f.page ?? 1);
  const rows = await ctx.db
    .select({ b: buyers, relevant: relevantCount, active: activeCount, awarded: awardedCount, lastPublished: lastPub })
    .from(buyers)
    .where(and(...w))
    .orderBy(desc(relevantCount), asc(buyers.name))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

export async function getBuyer(ctx: Ctx, id: string) {
  requirePerm(ctx, "opps.read");
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [b] = await ctx.db.select().from(buyers).where(eq(buyers.id, id));
  if (!b) throw notFound();
  const opps = await ctx.db.select().from(opportunities).where(eq(opportunities.buyerId, id)).orderBy(desc(opportunities.publishedAt)).limit(500);
  const srcs = await ctx.db
    .selectDistinct({ sourceId: notices.sourceId })
    .from(notices)
    .innerJoin(opportunities, eq(opportunities.id, notices.opportunityId))
    .where(eq(opportunities.buyerId, id));
  const noteList = await ctx.db
    .select({ id: notes.id, body: notes.body, createdAt: notes.createdAt, author: users.name })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.authorId))
    .where(and(eq(notes.orgId, ctx.org.id), eq(notes.entityType, "buyer"), eq(notes.entityId, id)))
    .orderBy(desc(notes.createdAt));
  const actions = await ctx.db
    .select({ id: auditEvents.id, action: auditEvents.action, createdAt: auditEvents.createdAt, details: auditEvents.details, user: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.userId))
    .where(and(eq(auditEvents.orgId, ctx.org.id), eq(auditEvents.entityType, "buyer"), eq(auditEvents.entityId, id)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);
  const alerts = await ctx.db
    .select()
    .from(watchAlerts)
    .where(and(eq(watchAlerts.orgId, ctx.org.id), eq(watchAlerts.kind, "buyer"), sql`${watchAlerts.criteria}->>'buyerId' = ${id}`));
  const relevant = opps.filter((o) => o.domain !== "AUCUN");
  const domains = {
    levage: relevant.filter((o) => o.domain === "LEVAGE" || o.domain === "MIXTE").length,
    electricite: relevant.filter((o) => o.domain === "ELECTRICITE" || o.domain === "MIXTE").length,
  };
  return { buyer: b, opportunities: opps, sources: srcs.map((s) => s.sourceId), notes: noteList, actions, alerts, domains };
}
