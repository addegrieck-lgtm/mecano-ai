import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { databaseUrl, preparedStatementsAllowed } from "./url";

/**
 * Accès base de données.
 *  - DATABASE_URL défini → PostgreSQL (production : Supabase, Neon, serveur dédié…) via postgres.js.
 *  - Sinon → PGlite (PostgreSQL embarqué en WebAssembly) stocké dans PGLITE_DIR (défaut .data/pglite).
 *    Pratique pour le développement local : aucune installation. Non adapté à un hébergement serverless
 *    (système de fichiers éphémère) : en production, renseigner DATABASE_URL.
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db: DB; kind: "postgres" | "pglite"; ready: Promise<void>; close: () => Promise<void> };

const globalForDb = globalThis as unknown as { __levageDb?: Holder };

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

async function createHolder(): Promise<Holder> {
  const url = databaseUrl();
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      prepare: preparedStatementsAllowed(url),
      onnotice: () => {},
    });
    const db = drizzle(client, { schema }) as unknown as DB;
    // En production les migrations sont appliquées explicitement (npm run db:migrate).
    const ready =
      process.env.AUTO_MIGRATE === "true"
        ? import("drizzle-orm/postgres-js/migrator").then(({ migrate }) =>
            migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS_FOLDER }),
          )
        : Promise.resolve();
    return { db, kind: "postgres", ready, close: () => client.end() };
  }
  if (process.env.VERCEL) {
    throw new Error("Base de données non configurée : ajoutez une base PostgreSQL (Vercel → Storage → Neon) ou la variable DATABASE_URL, puis redéployez.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
  const pdb = drizzle(client, { schema });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const ready = migrate(pdb, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: pdb as unknown as DB, kind: "pglite", ready, close: () => client.close() };
}

let pending: Promise<Holder> | null = null;

export async function getDb(): Promise<DB> {
  if (!globalForDb.__levageDb) {
    pending ??= createHolder();
    const holder = await pending;
    globalForDb.__levageDb = holder;
  }
  await globalForDb.__levageDb.ready;
  return globalForDb.__levageDb.db;
}

export function dbKind(): "postgres" | "pglite" {
  return databaseUrl() ? "postgres" : "pglite";
}

/** Tests / scripts : remplace l'instance courante. */
export function setDbForTesting(db: DB | null) {
  if (db) globalForDb.__levageDb = { db, kind: "pglite", ready: Promise.resolve(), close: async () => {} };
  else globalForDb.__levageDb = undefined;
  pending = null;
}

export async function closeDb() {
  const h = globalForDb.__levageDb;
  globalForDb.__levageDb = undefined;
  pending = null;
  if (h) await h.close();
}

export { schema };
