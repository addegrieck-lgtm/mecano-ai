/**
 * Collecte en ligne de commande (même code que la tâche planifiée).
 *   npm run collect                 → collecte de toutes les sources actives
 *   npm run collect -- --daily      → collecte + rapports quotidiens + e-mails + rappels (tâche complète)
 *   npm run collect -- --source=ted --since=2026-09-01 --max-pages=3
 * Code de sortie ≠ 0 si toutes les sources ont échoué (alerte pour l'ordonnanceur).
 */
import { openDb } from "./_db";
import { runCollection } from "../lib/radar/collect";
import { runDailyJob } from "../lib/jobs";
import { applyRetention } from "../lib/services/users";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const { db, close, migrate } = await openDb();
await migrate();
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
let failedAll = false;
if (args.daily) {
  const r = await runDailyJob(db, { trigger: "cli", log, sourceIds: args.source ? [args.source] : undefined, since: args.since, maxPages: args["max-pages"] ? Number(args["max-pages"]) : undefined });
  log(`Rapports : ${r.reports.map((x) => `${x.status} (${x.emailed} e-mail(s))`).join(", ") || "aucune organisation"} · rappels envoyés : ${r.reminders.sent}`);
  log(`Journaux d'audit purgés : ${await applyRetention(db)}`);
  failedAll = r.collection.length > 0 && r.collection.every((c) => c.status === "failed");
} else {
  const r = await runCollection(db, { trigger: "cli", log, sourceIds: args.source ? [args.source] : undefined, since: args.since, maxPages: args["max-pages"] ? Number(args["max-pages"]) : undefined });
  failedAll = r.length > 0 && r.every((c) => c.status === "failed");
}
await close();
process.exit(failedAll ? 2 : 0);
