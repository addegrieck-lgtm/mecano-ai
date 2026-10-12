import { desc, eq } from "drizzle-orm";
import { requireCtx } from "@/lib/auth/server";
import { sources, syncRuns, users } from "@/lib/db/schema";
import { IMPLEMENTED_INFOS, PLANNED_SOURCES } from "@/lib/connectors/registry";
import { Alert, Badge, Card, KV, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { collectAction } from "../radar/actions";

export const metadata = { title: "État des connecteurs" };

const RUN_STATUS: Record<string, ["green" | "amber" | "red" | "blue", string]> = {
  success: ["green", "réussie"],
  partial: ["amber", "partielle"],
  failed: ["red", "échec"],
  running: ["blue", "en cours"],
};

export default async function SourcesPage() {
  const ctx = await requireCtx("opps.read");
  const states = await ctx.db.select().from(sources);
  const runs = await ctx.db
    .select({ r: syncRuns, by: users.name })
    .from(syncRuns)
    .leftJoin(users, eq(users.id, syncRuns.triggeredBy))
    .orderBy(desc(syncRuns.startedAt))
    .limit(60);
  const canRun = ctx.perms.has("sources.run");
  const cron = !!process.env.CRON_SECRET;
  return (
    <>
      <PageHeader
        title="État des connecteurs"
        subtitle="Sources réellement intégrées, dernières synchronisations et sources prévues. Aucune source n'est simulée."
        actions={canRun ? (
          <ActionForm action={collectAction}>
            <SubmitButton pendingLabel="Collecte en cours (peut prendre plusieurs minutes)…">Lancer une collecte maintenant</SubmitButton>
          </ActionForm>
        ) : null}
      />
      {!cron && (
        <div className="mb-4">
          <Alert tone="amber" title="Collecte quotidienne non sécurisée / non configurée">
            CRON_SECRET n&apos;est pas défini : l&apos;URL /api/cron/daily refuse les appels. Configurez la tâche planifiée (voir docs/DEPLOIEMENT.md) — sinon seules les collectes manuelles ont lieu.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {IMPLEMENTED_INFOS.map((info) => {
          const st = states.find((s) => s.id === info.id);
          const ok = st?.lastSuccessAt && st.consecutiveFailures === 0;
          return (
            <Card
              key={info.id}
              title={<span className="flex items-center gap-2">{info.name} {st ? (ok ? <Badge tone="green">opérationnel</Badge> : st.lastRunAt ? <Badge tone="red">en erreur</Badge> : <Badge tone="amber">jamais collecté</Badge>) : <Badge tone="amber">jamais collecté</Badge>}</span>}
              actions={canRun ? (
                <ActionForm action={collectAction}>
                  <input type="hidden" name="source" value={info.id} />
                  {st?.consecutiveFailures ? <input type="hidden" name="retry" value="true" /> : null}
                  <SubmitButton size="sm" variant="secondary">{st?.consecutiveFailures ? "Relancer" : "Collecter"}</SubmitButton>
                </ActionForm>
              ) : null}
            >
              <KV
                rows={[
                  ["Couverture", info.geography],
                  ["Données", info.dataTypes.join(", ")],
                  ["Accès", info.access],
                  ["Méthode", info.method],
                  ["Fréquence", info.frequency],
                  ["Licence / réutilisation", info.licence],
                  ["Dernière exécution", fmtDateTime(st?.lastRunAt)],
                  ["Dernière réussite", fmtDateTime(st?.lastSuccessAt)],
                  ["Éléments récupérés (dernier passage)", st?.lastItemCount ?? "—"],
                  ["Échecs consécutifs", st?.consecutiveFailures ?? 0],
                  ["Dernière erreur", st?.lastError ? <span className="text-red-700">{st.lastError}</span> : "—"],
                ]}
              />
              <details className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                <summary className="cursor-pointer font-medium">Limites connues</summary>
                <ul className="mt-1 list-disc pl-4">{info.coverageLimits.map((l) => <li key={l}>{l}</li>)}</ul>
              </details>
            </Card>
          );
        })}
      </div>

      <Card title="Historique des synchronisations" className="mt-6">
        {runs.length === 0 ? <p className="text-sm text-slate-500">Aucune synchronisation n&apos;a encore eu lieu.</p> : (
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead><tr><th>Début</th><th>Source</th><th>Déclencheur</th><th>Statut</th><th className="text-right">Avis</th><th className="text-right">Nouveaux</th><th className="text-right">Fusionnés</th><th className="text-right">Mis à jour</th><th>Erreurs</th></tr></thead>
              <tbody>
                {runs.map(({ r, by }) => {
                  const [tone, label] = RUN_STATUS[r.status] ?? ["blue", r.status];
                  return (
                    <tr key={r.id}>
                      <td className="text-xs whitespace-nowrap">{fmtDateTime(r.startedAt)}</td>
                      <td>{r.sourceId}</td>
                      <td className="text-xs">{{ cron: "planifiée", manual: "manuelle", retry: "relance", cli: "ligne de commande" }[r.trigger] ?? r.trigger}{by ? ` (${by})` : ""}</td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td className="text-right tabular-nums">{r.fetched}</td>
                      <td className="text-right tabular-nums">{r.created}</td>
                      <td className="text-right tabular-nums">{r.merged}</td>
                      <td className="text-right tabular-nums">{r.updated}</td>
                      <td className="max-w-xs text-xs text-red-700">{r.errors.join(" · ").slice(0, 300)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Sources non intégrées (prévues)" className="mt-6">
        <ul className="space-y-3 text-sm">
          {PLANNED_SOURCES.map((p) => (
            <li key={p.id}>
              <div className="flex items-center gap-2 font-medium">{p.name} <Badge>non intégrée</Badge></div>
              <div className="text-xs text-slate-500">{p.access}. {p.plannedNotes}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Le radar ne prétend couvrir ni la totalité des marchés français, ni les marchés mondiaux.</p>
      </Card>
    </>
  );
}
