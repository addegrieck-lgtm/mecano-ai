import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listAlerts, listSavedSearches } from "@/lib/services/opportunities";
import { SERVICE_TYPES } from "@/lib/radar/types";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { alertAction, deleteAlertAction, deleteSearchAction } from "../radar/actions";

export const metadata = { title: "Alertes et recherches" };

const KIND = { buyer: "Acheteur", keyword: "Mot-clé / entreprise / site", department: "Département", family: "Famille de prestations" };

export default async function AlertsPage() {
  const ctx = await requireCtx("opps.track");
  const [alerts, searches] = await Promise.all([listAlerts(ctx), listSavedSearches(ctx)]);
  return (
    <>
      <PageHeader title="Alertes de surveillance et recherches enregistrées" subtitle="Les alertes sont évaluées lors de chaque rapport quotidien ; leurs résultats y figurent dans une section dédiée." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Mes alertes (${alerts.length})`}>
            {alerts.length === 0 ? <Empty title="Aucune alerte." >Surveillez un acheteur depuis sa fiche, ou créez une alerte ci-contre.</Empty> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-slate-500">
                        <Badge>{KIND[a.kind as keyof typeof KIND]}</Badge>{" "}
                        {a.criteria.keyword ?? a.criteria.department ?? (a.criteria.family ? SERVICE_TYPES[a.criteria.family as keyof typeof SERVICE_TYPES] : null) ?? (a.criteria.buyerId ? <Link className="link" href={`/buyers/${a.criteria.buyerId}`}>voir l&apos;acheteur</Link> : null)}
                        {a.criteria.domain ? ` · ${a.criteria.domain}` : ""} · dernière vérification {fmtDateTime(a.lastCheckedAt)}
                      </div>
                    </div>
                    <form action={deleteAlertAction.bind(null, a.id)}><SubmitButton size="sm" variant="ghost" confirm="Supprimer cette alerte ?">Supprimer</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Recherches enregistrées (${searches.length})`}>
            {searches.length === 0 ? <p className="text-sm text-slate-500">Enregistrez des filtres depuis la page Opportunités.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {searches.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link className="link" href={`/radar?${s.query}`}>{s.name}</Link>
                    <form action={deleteSearchAction.bind(null, s.id)}><SubmitButton size="sm" variant="ghost">Supprimer</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Nouvelle alerte">
          <ActionForm action={alertAction} className="space-y-2" resetOnSuccess>
            <input className="input" name="name" required placeholder="Nom de l'alerte" aria-label="Nom" />
            <select className="input" name="kind" aria-label="Type" defaultValue="keyword">
              <option value="keyword">Mot-clé, entreprise ou site industriel</option>
              <option value="department">Département</option>
              <option value="family">Famille de prestations</option>
            </select>
            <input className="input" name="keyword" placeholder="Mot-clé (si type mot-clé)" aria-label="Mot-clé" />
            <input className="input" name="department" placeholder="Département (ex. 69)" aria-label="Département" />
            <select className="input" name="family" aria-label="Famille" defaultValue="">
              <option value="">Famille (si type famille)</option>
              {Object.entries(SERVICE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="input" name="domain" aria-label="Domaine">
              <option value="">Levage + électricité</option>
              <option value="LEVAGE">Levage</option>
              <option value="ELECTRICITE">Électricité</option>
            </select>
            <SubmitButton size="sm">Créer l&apos;alerte</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
