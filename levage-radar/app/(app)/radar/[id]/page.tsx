import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { getOpportunity, STATUS_OPTIONS } from "@/lib/services/opportunities";
import { opportunitySummaryText } from "@/lib/services/opp-exports";
import { AppError } from "@/lib/errors";
import { connectorInfo } from "@/lib/connectors/registry";
import { COUNTRY_NAMES } from "@/lib/radar/geo";
import { CATEGORIES } from "@/lib/radar/types";
import { Alert, Badge, ButtonLink, Card, DemoBanner, KV, Missing, PageHeader, ScorePill } from "@/components/ui";
import { CategoryBadge, Deadline, DomainBadge, ServiceBadge, StatusBadge } from "@/components/radar/badges";
import { ActionForm, CopyButton, SubmitButton } from "@/components/forms";
import { fmtAmount, fmtDate, fmtDateTime } from "@/lib/format";
import { assignAction, favoriteAction, noteAction, statusAction, taskAction, taskDoneAction } from "../actions";

const FIELD_LABELS: Record<string, string> = {
  title: "Titre",
  description: "Description",
  deadlineAt: "Date limite",
  publishedAmount: "Montant publié",
  category: "Catégorie",
  domain: "Domaine",
  durationText: "Durée",
  awardedAt: "Date d'attribution",
  noticeType: "Type d'avis",
  officialUrl: "Lien officiel",
  _raison: "Motif",
};

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("opps.read");
  let d;
  try {
    d = await getOpportunity(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const o = d.opp;
  const canTrack = ctx.perms.has("opps.track");
  const summary = canTrack || ctx.perms.has("opps.export") ? await opportunitySummaryText(ctx, id) : null;
  const factors = [...o.scoreFactors, ...d.personal];
  const status = d.tracking?.status ?? "NOUVEAU";

  return (
    <>
      {o.isDemo && <DemoBanner />}
      <PageHeader
        back={{ href: "/radar", label: "Opportunités" }}
        title={o.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DomainBadge domain={o.domain} />
            <CategoryBadge category={o.category} />
            <ServiceBadge serviceType={o.serviceType} />
            <StatusBadge status={status} />
            {d.tracking?.favorite && <Badge tone="amber">★ Favori</Badge>}
          </span>
        }
        actions={
          <>
            {o.officialUrl && (
              <ButtonLink href={o.officialUrl} external variant="primary">
                Ouvrir la source officielle ↗
              </ButtonLink>
            )}
            {canTrack && (
              <form action={favoriteAction.bind(null, id)}>
                <SubmitButton variant="secondary">{d.tracking?.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}</SubmitButton>
              </form>
            )}
            {ctx.perms.has("opps.export") && <ButtonLink href={`/api/opportunities/${id}/pdf`}>Exporter (PDF)</ButtonLink>}
          </>
        }
      />

      {o.category === "IRRELEVANT" && (
        <div className="mb-4"><Alert tone="amber">Résultat classé non pertinent par le moteur de qualification : {o.relevanceReason}</Alert></div>
      )}
      {status === "TRANSMIS_MANUELLEMENT" && (
        <div className="mb-4"><Alert tone="blue">Marquée comme transmise au logiciel officiel : il s&apos;agit d&apos;une déclaration manuelle de l&apos;utilisateur. Aucune transmission informatique n&apos;a eu lieu.</Alert></div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Informations publiées">
            <KV
              rows={[
                ["Acheteur", o.buyerName ? (d.buyer ? <Link className="link" href={`/buyers/${d.buyer.id}`}>{o.buyerName}</Link> : o.buyerName) : <Missing />],
                ["Localisation", [o.address, o.city, o.department ? `département ${o.department}` : null, o.region, o.country ? (COUNTRY_NAMES[o.country] ?? o.country) : null].filter(Boolean).join(", ") || <Missing />],
                ["Secteur", o.isPublic ? "Public" : "Privé"],
                ["Date de publication", o.publishedAt ? fmtDate(o.publishedAt) : <Missing />],
                ["Date limite de candidature", <Deadline key="d" at={o.deadlineAt} open={d.isOpen} />],
                ["Date d'attribution", o.awardedAt ? fmtDate(o.awardedAt) : <Missing>—</Missing>],
                ["Montant", o.publishedAmount ? `${fmtAmount(o.publishedAmount, o.amountCurrency)} (montant publié par la source)` : <Missing />],
                ["Durée du contrat", o.durationText ?? <Missing />],
                ["Procédure", o.procedureType ?? <Missing>Non précisée</Missing>],
                ["Type d'avis", o.noticeType ?? <Missing>—</Missing>],
                ["Critères de sélection", o.selectionCriteria ?? <Missing>Non collectés (voir le règlement de consultation)</Missing>],
                ["Codes CPV", o.cpvCodes.length ? o.cpvCodes.join(", ") : <Missing>—</Missing>],
                ["Référence de l'avis", o.reference ?? <Missing>—</Missing>],
                ["Collecté le", `${fmtDateTime(o.collectedAt)} · fiabilité des données : ${o.reliability === "high" ? "élevée" : o.reliability === "medium" ? "moyenne" : "faible"}`],
              ]}
            />
            {o.description && (
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="mb-2 text-xs font-semibold text-slate-500 uppercase">Description publiée</h3>
                <p className="text-sm whitespace-pre-line text-slate-800 dark:text-slate-200">{o.description}</p>
              </div>
            )}
          </Card>

          <Card title={`Lots (${d.lots.length})`}>
            {d.lots.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun lot publié ou extrait par la source. Consultez l&apos;avis officiel pour le détail.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.lots.map((l) => (
                  <li key={l.id} className="flex items-start gap-2">
                    {l.relevant ? <Badge tone="green">pertinent</Badge> : <Badge>autre</Badge>}
                    <span>
                      {l.lotNumber && <strong>Lot {l.lotNumber} — </strong>}
                      {l.title}
                      {l.description && <span className="block text-xs text-slate-500">{l.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Sources et avis liés (doublons fusionnés)">
            <ul className="space-y-2 text-sm">
              {d.notices.map((n) => (
                <li key={n.id} className="flex flex-wrap items-baseline gap-x-2">
                  <Badge tone="blue">{connectorInfo(n.sourceId)?.name ?? n.sourceId}</Badge>
                  <span className="font-mono text-xs">{n.sourceRef}</span>
                  <span className="text-slate-600 dark:text-slate-400">{n.noticeType ?? "avis"} du {fmtDate(n.publishedAt)}</span>
                  {n.url && <a className="link" href={n.url} target="_blank" rel="noopener noreferrer">lien officiel ↗</a>}
                  <span className="w-full text-xs text-slate-400">Vu du {fmtDateTime(n.firstSeenAt)} au {fmtDateTime(n.lastSeenAt)} · {n.licence}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Historique des changements">
            {d.history.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun historique.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {d.history.map((h) => (
                  <li key={h.id} className="border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                    <div className="text-xs text-slate-500">
                      {fmtDateTime(h.createdAt)} · {h.kind === "created" ? "création" : h.kind === "merged" ? "fusion d'un avis" : "mise à jour"}
                      {h.sourceId ? ` · ${connectorInfo(h.sourceId)?.name ?? h.sourceId}` : ""} {h.noticeRef ? `(${h.noticeRef})` : ""}
                    </div>
                    {Object.entries(h.changes).length > 0 && (
                      <ul className="mt-1 text-xs">
                        {Object.entries(h.changes).map(([k, c]) => (
                          <li key={k}>
                            <strong>{FIELD_LABELS[k] ?? k}</strong> :{" "}
                            {k === "_raison" ? String(c.to) : <>{String(k === "category" ? (CATEGORIES[c.from as keyof typeof CATEGORIES] ?? c.from ?? "—") : (c.from ?? "—")).slice(0, 120)} → {String(k === "category" ? (CATEGORIES[c.to as keyof typeof CATEGORIES] ?? c.to) : (c.to ?? "—")).slice(0, 120)}</>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Score de pertinence">
            <div className="mb-3 flex items-center gap-3">
              <ScorePill score={d.score} />
              <span className="text-xs text-slate-500">score de base {o.baseScore} + ajustements personnels</span>
            </div>
            <ul className="space-y-1 text-sm">
              {factors.map((f, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-300">{f.label}{f.kind === "personal" && <span className="text-xs text-slate-400"> (préférence)</span>}</span>
                  <span className={`tabular-nums font-medium ${f.points > 0 ? "text-emerald-600" : f.points < 0 ? "text-red-600" : "text-slate-400"}`}>{f.points > 0 ? "+" : ""}{f.points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">{o.relevanceReason}</p>
            <p className="mt-2 text-[11px] text-slate-400">Le score est une aide au tri, pas une décision. Aucun montant n&apos;est estimé.</p>
          </Card>

          {canTrack && (
            <Card title="Suivi commercial">
              <ActionForm action={statusAction.bind(null, id)} className="space-y-2">
                <label className="label" htmlFor="status">Statut</label>
                <select className="input" id="status" name="status" defaultValue={status}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <input className="input" name="reason" placeholder="Motif (ex. pour « non pertinent »)" />
                <SubmitButton size="sm">Mettre à jour</SubmitButton>
              </ActionForm>
              <ActionForm action={assignAction.bind(null, id)} className="mt-4 space-y-2">
                <label className="label" htmlFor="assigneeId">Responsable</label>
                <select className="input" id="assigneeId" name="assigneeId" defaultValue={d.tracking?.assigneeId ?? ""}>
                  <option value="">— Non attribuée —</option>
                  {d.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <SubmitButton size="sm" variant="secondary">Attribuer</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {canTrack && (
            <Card title={`Tâches & rappels (${d.tasks.filter((t) => !t.doneAt).length})`}>
              <ul className="mb-4 space-y-2 text-sm">
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2">
                    <form action={taskDoneAction.bind(null, t.id, !t.doneAt, `/radar/${id}`)}>
                      <button type="submit" className="mt-0.5 h-4 w-4 rounded border border-slate-400 text-[10px] leading-none" aria-label={t.doneAt ? "Rouvrir" : "Terminer"}>
                        {t.doneAt ? "✓" : ""}
                      </button>
                    </form>
                    <div className={t.doneAt ? "text-slate-400 line-through" : ""}>
                      {t.title}
                      <div className="text-xs text-slate-500">
                        {t.assigneeName ?? "—"}{t.dueAt ? ` · échéance ${fmtDate(t.dueAt)}` : ""}{t.remindAt ? ` · rappel ${fmtDateTime(t.remindAt)}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <ActionForm action={taskAction} className="space-y-2" resetOnSuccess>
                <input type="hidden" name="opportunityId" value={id} />
                <input className="input" name="title" placeholder="Nouvelle tâche (ex. télécharger le DCE)" required />
                <select className="input" name="assigneeId" defaultValue={ctx.user.id} aria-label="Responsable de la tâche">
                  {d.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-500">Échéance<input className="input mt-1" type="date" name="dueAt" /></label>
                  <label className="text-xs text-slate-500">Rappel<input className="input mt-1" type="datetime-local" name="remindAt" /></label>
                </div>
                <SubmitButton size="sm">Créer la tâche</SubmitButton>
              </ActionForm>
            </Card>
          )}

          <Card title={`Notes (${d.notes.length})`}>
            <ul className="mb-3 space-y-3 text-sm">
              {d.notes.map((n) => (
                <li key={n.id}>
                  <div className="text-xs text-slate-500">{n.author ?? "—"} · {fmtDateTime(n.createdAt)}</div>
                  <p className="whitespace-pre-line">{n.body}</p>
                </li>
              ))}
            </ul>
            {canTrack && (
              <ActionForm action={noteAction.bind(null, "opportunity", id)} className="space-y-2" resetOnSuccess>
                <textarea className="input" name="body" rows={3} placeholder="Ajouter une note interne…" required />
                <SubmitButton size="sm" variant="secondary">Ajouter la note</SubmitButton>
              </ActionForm>
            )}
          </Card>

          {summary && (
            <Card title="Fiche pour le logiciel officiel" actions={<CopyButton text={summary} />}>
              <p className="mb-2 text-xs text-slate-500">À recopier manuellement : aucune connexion avec le logiciel commercial officiel.</p>
              <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] whitespace-pre-wrap dark:bg-slate-950">{summary}</pre>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
