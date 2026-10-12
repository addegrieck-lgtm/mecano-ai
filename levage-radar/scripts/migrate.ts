import { databaseUrl } from "../lib/db/url";
import { openDb } from "./_db";

if (process.env.VERCEL && !databaseUrl()) {
  // Premier déploiement avant l'ajout de la base : le build continue, l'application affichera un message clair.
  console.warn("⚠ Aucune base PostgreSQL configurée : migrations ignorées. Ajoutez Neon (Vercel → Storage) puis redéployez.");
  process.exit(0);
}
const { migrate, close } = await openDb();
await migrate();
console.log(`Migrations appliquées (${databaseUrl() ? "PostgreSQL" : "PGlite locale"}).`);
await close();
