/**
 * URL PostgreSQL : DATABASE_URL, ou les variables créées automatiquement par l'intégration Neon / Vercel Postgres.
 */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || undefined;
}

/** Les poolers en mode transaction (Neon « -pooler », Supabase port 6543) ne gèrent pas les requêtes préparées nommées. */
export function preparedStatementsAllowed(url: string): boolean {
  if (process.env.DATABASE_PREPARE) return process.env.DATABASE_PREPARE !== "false";
  return !/-pooler\.|:6543\//.test(url);
}
