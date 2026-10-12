/**
 * URL PostgreSQL : DATABASE_URL, ou les variables créées automatiquement par l'intégration Neon / Vercel Postgres.
 * Les paramètres propres à libpq (ex. « channel_binding=require » ajouté par Neon) sont retirés : le pilote
 * postgres.js les transmettrait comme paramètres de session et le serveur refuserait la connexion.
 */
const LIBPQ_ONLY = ["channel_binding", "gssencmode", "sslcert", "sslkey", "sslpassword", "sslcrl", "sslsni", "requirepeer", "krbsrvname", "options", "connect_timeout", "application_name", "pgbouncer", "schema"];

export function databaseUrl(): string | undefined {
  const raw = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    for (const k of LIBPQ_ONLY) u.searchParams.delete(k);
    // Hébergeurs managés : chiffrement obligatoire.
    if (!u.searchParams.has("sslmode") && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    return raw;
  }
}

/** Les poolers en mode transaction (Neon « -pooler », Supabase port 6543) ne gèrent pas les requêtes préparées nommées. */
export function preparedStatementsAllowed(url: string): boolean {
  if (process.env.DATABASE_PREPARE) return process.env.DATABASE_PREPARE !== "false";
  return !/-pooler\.|:6543\//.test(url);
}
