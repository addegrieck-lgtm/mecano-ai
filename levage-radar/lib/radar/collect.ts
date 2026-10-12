import { and, eq, gt, lt } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { sources, syncRuns } from "@/lib/db/schema";
import { implementedConnectors } from "@/lib/connectors/registry";
import type { Connector } from "@/lib/connectors/types";
import { closeExpired, ingestNotices } from "./ingest";

export type CollectOptions = {
  sourceIds?: string[];
  trigger: "cron" | "manual" | "retry" | "cli";
  userId?: string | null;
  connectors?: Connector[];
  /** Force une date de début (YYYY-MM-DD) ; sinon dernière collecte réussie − 2 jours, ou LOOKBACK au premier passage. */
  since?: string;
  maxPages?: number;
  now?: Date;
  log?: (msg: string) => void;
};

export type SourceRunSummary = { sourceId: string; status: "success" | "partial" | "failed" | "skipped"; runId?: string; fetched: number; created: number; merged: number; updated: number; error?: string };

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function ensureSources(db: DB, connectors: Connector[]) {
  for (const c of connectors) await db.insert(sources).values({ id: c.info.id }).onConflictDoNothing();
}

export async function runCollection(db: DB, opts: CollectOptions): Promise<SourceRunSummary[]> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const connectors = opts.connectors ?? implementedConnectors();
  await ensureSources(db, connectors);

  // Collectes interrompues (plateforme arrêtée en cours d'exécution) : marquées comme échouées, jamais « en cours » indéfiniment.
  await db
    .update(syncRuns)
    .set({ status: "failed", finishedAt: now, errors: ["Collecte interrompue (dépassement de durée ou arrêt du serveur)."] })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.startedAt, new Date(now.getTime() - 3600_000))));

  const summaries: SourceRunSummary[] = [];
  for (const connector of connectors) {
    const id = connector.info.id;
    if (opts.sourceIds && !opts.sourceIds.includes(id)) continue;
    const [state] = await db.select().from(sources).where(eq(sources.id, id));
    if (!state.enabled) {
      summaries.push({ sourceId: id, status: "skipped", fetched: 0, created: 0, merged: 0, updated: 0, error: "Source désactivée" });
      continue;
    }
    const [running] = await db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(and(eq(syncRuns.sourceId, id), eq(syncRuns.status, "running"), gt(syncRuns.startedAt, new Date(now.getTime() - 3600_000))))
      .limit(1);
    if (running) {
      summaries.push({ sourceId: id, status: "skipped", fetched: 0, created: 0, merged: 0, updated: 0, error: "Une collecte est déjà en cours" });
      continue;
    }

    const lookback = Number(process.env.COLLECT_LOOKBACK_DAYS ?? 30);
    const since =
      opts.since ?? (state.lastSuccessAt ? day(new Date(state.lastSuccessAt.getTime() - 2 * 86400_000)) : day(new Date(now.getTime() - lookback * 86400_000)));
    const maxPages = opts.maxPages ?? Number(process.env.COLLECT_MAX_PAGES ?? 5);

    const [run] = await db
      .insert(syncRuns)
      .values({ sourceId: id, trigger: opts.trigger, triggeredBy: opts.userId ?? null, status: "running", startedAt: now, params: { since, maxPages } })
      .returning();
    log(`[${id}] collecte depuis ${since}`);
    try {
      const result = await connector.fetch({ since, maxPages, log });
      const stats = await ingestNotices(db, result.notices, { now });
      const status = result.warnings.length ? "partial" : "success";
      await db
        .update(syncRuns)
        .set({ status, finishedAt: new Date(), fetched: result.notices.length, ...stats, errors: result.warnings })
        .where(eq(syncRuns.id, run.id));
      await db
        .update(sources)
        .set({
          lastRunAt: now,
          lastSuccessAt: now,
          lastError: result.warnings[0] ?? null,
          consecutiveFailures: 0,
          lastItemCount: result.notices.length,
          cursor: result.nextCursor,
          updatedAt: new Date(),
        })
        .where(eq(sources.id, id));
      summaries.push({ sourceId: id, status, runId: run.id, fetched: result.notices.length, created: stats.created, merged: stats.merged, updated: stats.updated });
      log(`[${id}] ${status} : ${result.notices.length} avis, ${stats.created} créés, ${stats.merged} fusionnés, ${stats.updated} mis à jour`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(syncRuns).set({ status: "failed", finishedAt: new Date(), errors: [msg] }).where(eq(syncRuns.id, run.id));
      await db
        .update(sources)
        .set({ lastRunAt: now, lastError: msg, consecutiveFailures: state.consecutiveFailures + 1, updatedAt: new Date() })
        .where(eq(sources.id, id));
      summaries.push({ sourceId: id, status: "failed", runId: run.id, fetched: 0, created: 0, merged: 0, updated: 0, error: msg });
      log(`[${id}] ÉCHEC : ${msg}`);
    }
  }
  const closed = await closeExpired(db, now);
  if (closed) log(`${closed} consultation(s) passée(s) en « clôturée » (date limite dépassée)`);
  return summaries;
}
