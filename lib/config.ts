import "server-only";

/** DEMO_MODE est actif par défaut : l'application fonctionne sans Supabase ni authentification. */
export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "true").toLowerCase() !== "false";
}
