import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { resolvePermissions, type Role } from "@/lib/auth/permissions";
import { organizations, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/core";
import type { NormalizedNotice } from "@/lib/radar/types";

let template: Uint8Array | Blob | null = null;

/** Base PostgreSQL (PGlite) en mémoire, migrée avec les vraies migrations du projet. */
export async function createTestDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  let client: PGlite;
  if (template) {
    client = new PGlite({ loadDataDir: template as Blob });
  } else {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    template = await client.dumpDataDir("none");
    await client.close();
    client = new PGlite({ loadDataDir: template as Blob });
  }
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as DB;
  return { db, close: () => client.close() };
}

let pwHash: Promise<string> | null = null;

export async function createOrgWithUsers(db: DB, name = "Org Test", roles: Role[] = ["ADMIN", "BUSINESS", "INSPECTOR_LIFT", "INSPECTOR_ELEC", "TECH_MANAGER", "READER"]) {
  const [org] = await db.insert(organizations).values({ name }).returning();
  pwHash ??= hashPassword("Mot-de-passe-Test-123");
  const hash = await pwHash;
  const ctxs: Record<string, Ctx> = {};
  for (const role of roles) {
    const [u] = await db
      .insert(users)
      .values({ orgId: org.id, email: `${role.toLowerCase()}@${name.replace(/\W/g, "").toLowerCase()}.test`, name: `${role} ${name}`, passwordHash: hash, role })
      .returning();
    ctxs[role] = {
      db,
      user: { id: u.id, orgId: org.id, email: u.email, name: u.name, role },
      org: { id: org.id, name: org.name, settings: {} },
      perms: resolvePermissions(role),
    };
  }
  return { org, ctx: ctxs as Record<Role, Ctx> };
}

/** Avis normalisé de test (valeurs explicitement fictives). */
export function notice(over: Partial<NormalizedNotice> = {}): NormalizedNotice {
  return {
    sourceId: "boamp",
    sourceRef: "TEST-" + Math.random().toString(36).slice(2, 8),
    url: null,
    title: "Vérification générale périodique des appareils de levage",
    description: "Vérifications réglementaires des ponts roulants, palans et nacelles des ateliers municipaux.",
    buyerName: "Commune de Test-sur-Mer",
    buyerNationalId: null,
    isPublic: true,
    country: "FR",
    department: "69",
    city: "Lyon",
    address: null,
    noticeKind: "contract",
    noticeTypeRaw: "Avis de marché",
    publishedAt: "2026-10-05",
    deadlineAt: "2026-11-15T12:00:00.000Z",
    sourceUpdatedAt: null,
    awardedAt: null,
    amount: null,
    currency: null,
    durationText: null,
    durationMonths: null,
    selectionCriteria: null,
    procedureType: "Procédure adaptée",
    cpvCodes: ["71631100"],
    lots: [],
    crossRefs: [],
    reliability: "high",
    licence: "test",
    raw: { fixture: true },
    ...over,
  };
}

export const NOW = new Date("2026-10-12T08:00:00.000Z");
