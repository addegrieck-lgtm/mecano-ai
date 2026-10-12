import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { getBuyer } from "@/lib/services/buyers";
import { AppError } from "@/lib/errors";
import { connectorInfo } from "@/lib/connectors/registry";
import { Card, DemoBanner, KV, PageHeader, ScorePill } from "@/components/ui";
import { CategoryBadge, DomainBadge } from "@/components/radar/badges";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtAmount, fmtDate, fmtDateTime } from "@/lib/format";
import { alertAction, noteAction, taskAction } from "../../radar/actions";

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("opps.read");
  let d;
  try {
    d = await getBuyer(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const b = d.buyer;
  const canTrack = ctx.perms.has("opps.track");
  const relevant = d.opportunities.filter((o) => o.domain !== "AUCUN");
  const open = relevant.filter((o) => ["ACTIVE", "UPCOMING", "SUPPLIER_CALL", "INDIRECT"].includes(o.category) && (!o.deadlineAt || o.deadlineAt > new Date()));
  const awarded = relevant.filter((o) => o.category === "AWARDED" || o.category === "CONTRACT_WATCH");
  return (
    <>
      {b.isDemo && <DemoBanner />}
      <PageHeader back={{ href: "/buyers", label: "Acheteurs" }} title={b.name} subtitle={`${relevant.length} avis pertinents · ${open.length} ouverts · ${awarded.length} attribués`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Fiche">
            <KV
              rows={[
                ["Type", b.kind === "public" ? "Acheteur public" : b.kind === "private" ? "Organisation privée" : "Non déterminé"],
                ["Localisation", [b.city, b.department ? `dép. ${b.department}` : null, b.country].filter(Boolean).join(", ") || null],
                ["Identifiant publié", b.nationalId],
                ["Sources", d.sources.map((s) => connectorInfo(s)?.name ?? s).join(", ") || null],
                ["Domaines", `Levage : ${d.domains.levage} avis · Électricité : ${d.domains.electricite} avis`],
              ]}
            />
          </Card>
          <Card title="Contrats attribués connus">
            {awarded.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun avis d&apos;attribution détecté.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {awarded.map((o) => (
                  <li key={o.id}>
                    <Link className="link" href={`/radar/${o.id}`}>{o.title}</Link>
                    <div className="text-xs text-slate-500">
                      Attribué le {fmtDate(o.awardedAt)} · durée publiée : {o.durationText ?? "non publiée"} · montant : {o.publishedAmount ? fmtAmount(o.publishedAmount, o.amountCurrency) : "non publié"}
                      {o.durationText && o.awardedAt && (
                        <span className="text-amber-700"> · échéance ESTIMÉE (hypothèse non confirmée) : {estimateEnd(o.awardedAt, o.durationText)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Historique des marchés détectés">
            <div className="overflow-x-auto">
              <table className="table min-w-[560px]">
                <thead><tr><th>Score</th><th>Avis</th><th>Classement</th><th>Publié</th></tr></thead>
                <tbody>
                  {d.opportunities.map((o) => (
                    <tr key={o.id}>
                      <td><ScorePill score={o.baseScore} /></td>
                      <td><Link className="hover:text-brand-600" href={`/radar/${o.id}`}>{o.title}</Link></td>
                      <td><div className="flex flex-col gap-1"><DomainBadge domain={o.domain} /><CategoryBadge category={o.category} /></div></td>
                      <td className="text-xs">{fmtDate(o.publishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          {canTrack && (
            <Card title="Surveillance">
              {d.alerts.length > 0 && <p className="mb-2 text-sm text-emerald-700">Cet acheteur est déjà surveillé ({d.alerts.length} alerte(s)).</p>}
              <ActionForm action={alertAction} className="space-y-2">
                <input type="hidden" name="kind" value="buyer" />
                <input type="hidden" name="buyerId" value={b.id} />
                <input className="input" name="name" defaultValue={`Nouveaux avis — ${b.name}`.slice(0, 120)} aria-label="Nom de l'alerte" required />
                <select className="input" name="domain" aria-label="Domaine">
                  <option value="">Levage + électricité</option>
                  <option value="LEVAGE">Levage</option>
                  <option value="ELECTRICITE">Électricité</option>
                </select>
                <SubmitButton size="sm">Surveiller cet acheteur</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card title="Notes commerciales">
            <ul className="mb-3 space-y-3 text-sm">
              {d.notes.map((n) => (
                <li key={n.id}><div className="text-xs text-slate-500">{n.author} · {fmtDateTime(n.createdAt)}</div><p className="whitespace-pre-line">{n.body}</p></li>
              ))}
            </ul>
            {canTrack && (
              <ActionForm action={noteAction.bind(null, "buyer", b.id)} className="space-y-2" resetOnSuccess>
                <textarea className="input" name="body" rows={3} required placeholder="Contact, historique, projet industriel connu…" />
                <SubmitButton size="sm" variant="secondary">Ajouter</SubmitButton>
              </ActionForm>
            )}
          </Card>
          {canTrack && (
            <Card title="Nouvelle tâche">
              <ActionForm action={taskAction} className="space-y-2" resetOnSuccess>
                <input type="hidden" name="buyerId" value={b.id} />
                <input className="input" name="title" required placeholder="ex. Relancer l'acheteur avant renouvellement" />
                <label className="block text-xs text-slate-500">Rappel<input className="input mt-1" type="datetime-local" name="remindAt" /></label>
                <SubmitButton size="sm">Créer</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card title="Historique des actions">
            {d.actions.length === 0 ? <p className="text-sm text-slate-500">Aucune action.</p> : (
              <ul className="space-y-1 text-xs">
                {d.actions.map((a) => <li key={a.id}>{fmtDateTime(a.createdAt)} — {a.user ?? "système"} — {a.action}</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function estimateEnd(awardedAt: string, duration: string): string {
  const m = duration.match(/(\d+)\s*mois/);
  if (!m) return "non calculable";
  const d = new Date(`${awardedAt}T12:00:00`);
  d.setMonth(d.getMonth() + Number(m[1]));
  return `${fmtDate(d)} (date d'attribution + durée publiée ; reconductions et date de début réelle inconnues)`;
}
