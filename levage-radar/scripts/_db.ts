/** Accès base pour les scripts en ligne de commande (même logique que l'application). */
import path from "node:path";
import * as schema from "../lib/db/schema";
import type { DB } from "../lib/db";
import { databaseUrl, preparedStatementsAllowed } from "../lib/db/url";

export async function openDb(): Promise<{ db: DB; close: () => Promise<void>; migrate: () => Promise<void> }> {
  const folder = path.join(process.cwd(), "drizzle");
  if (databaseUrl()) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const url = databaseUrl()!;
    const client = postgres(url, { max: 2, onnotice: () => {}, prepare: preparedStatementsAllowed(url) });
    const db = drizzle(client, { schema });
    return { db: db as unknown as DB, close: () => client.end(), migrate: () => migrate(db, { migrationsFolder: folder }) };
  }
  if (process.env.VERCEL) throw new Error("Base de données non configurée : ajoutez Neon (Vercel → Storage) ou DATABASE_URL, puis redéployez.");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  const db = drizzle(client, { schema });
  return { db: db as unknown as DB, close: () => client.close(), migrate: () => migrate(db, { migrationsFolder: folder }) };
}
