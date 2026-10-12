/** Accès base pour les scripts en ligne de commande (même logique que l'application). */
import path from "node:path";
import * as schema from "../lib/db/schema";
import type { DB } from "../lib/db";

export async function openDb(): Promise<{ db: DB; close: () => Promise<void>; migrate: () => Promise<void> }> {
  const folder = path.join(process.cwd(), "drizzle");
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
    const db = drizzle(client, { schema });
    return { db: db as unknown as DB, close: () => client.end(), migrate: () => migrate(db, { migrationsFolder: folder }) };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  const db = drizzle(client, { schema });
  return { db: db as unknown as DB, close: () => client.close(), migrate: () => migrate(db, { migrationsFolder: folder }) };
}
