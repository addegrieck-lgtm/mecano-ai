import { and, asc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { requirePerm } from "@/lib/context";
import { audit } from "@/lib/audit";
import { clients, sites } from "@/lib/db/schema";
import { notFound } from "@/lib/errors";

/** Clients et sites : partagés entre les modules levage et électricité (aucune duplication). */
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const ClientSchema = z.object({ name: z.string().trim().min(2, "Nom requis").max(200), nationalId: opt(30), notes: opt(5000) });
export const SiteSchema = z.object({
  clientId: z.uuid(),
  name: z.string().trim().min(2, "Nom requis").max(200),
  address: opt(300),
  postalCode: opt(10),
  city: opt(120),
  contactName: opt(120),
  contactPhone: opt(40),
  notes: opt(5000),
});

export async function listClients(ctx: Ctx, q?: string) {
  requirePerm(ctx, "clients.read");
  return ctx.db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, ctx.org.id), q ? ilike(clients.name, `%${q.slice(0, 100)}%`) : undefined))
    .orderBy(asc(clients.name))
    .limit(500);
}

export async function getClient(ctx: Ctx, id: string) {
  requirePerm(ctx, "clients.read");
  if (!z.uuid().safeParse(id).success) throw notFound();
  const [c] = await ctx.db.select().from(clients).where(and(eq(clients.id, id), eq(clients.orgId, ctx.org.id)));
  if (!c) throw notFound();
  const siteList = await ctx.db.select().from(sites).where(and(eq(sites.clientId, id), eq(sites.orgId, ctx.org.id))).orderBy(asc(sites.name));
  return { client: c, sites: siteList };
}

export async function createClient(ctx: Ctx, input: z.input<typeof ClientSchema>) {
  requirePerm(ctx, "clients.write");
  const data = ClientSchema.parse(input);
  const [c] = await ctx.db.insert(clients).values({ orgId: ctx.org.id, ...data }).returning();
  await audit(ctx, "client", c.id, "create", { name: c.name });
  return c;
}

export async function updateClient(ctx: Ctx, id: string, input: z.input<typeof ClientSchema>) {
  requirePerm(ctx, "clients.write");
  await getClient(ctx, id);
  const data = ClientSchema.parse(input);
  await ctx.db.update(clients).set({ ...data, updatedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.orgId, ctx.org.id)));
  await audit(ctx, "client", id, "update", data);
}

export async function createSite(ctx: Ctx, input: z.input<typeof SiteSchema>) {
  requirePerm(ctx, "clients.write");
  const data = SiteSchema.parse(input);
  await getClient(ctx, data.clientId);
  const [s] = await ctx.db.insert(sites).values({ orgId: ctx.org.id, ...data }).returning();
  await audit(ctx, "site", s.id, "create", { clientId: data.clientId, name: s.name });
  return s;
}

export async function listAllSites(ctx: Ctx) {
  requirePerm(ctx, "clients.read");
  return ctx.db.select().from(sites).where(eq(sites.orgId, ctx.org.id)).orderBy(asc(sites.name)).limit(2000);
}
