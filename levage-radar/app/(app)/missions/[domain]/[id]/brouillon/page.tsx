import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { buildDraft } from "@/lib/services/mission-export";
import { AppError } from "@/lib/errors";
import { Alert, Badge, ButtonLink, Card, KV, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { PrintButton } from "@/components/missions/print-button";

export default async function DraftPage({ params }: { params: Promise<{ domain: string; id: string }> }) {
  const { domain: slug, id } = await params;
  const ctx = await requireCtx();
  let d;
  try {
    d = await buildDraft(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const m = d.mission;
  const prio = (k: string | null) => d.priorities.find((p) => p.key === k)?.label;
  const obs = (list: typeof d.observationsWithoutItem) =>
    list.length ? (
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {list.map((o) => (
          <li key={o.id}>
            <strong>{o.kind === "anomalie" ? "Anomalie" : "Observation"}</strong> : {o.description}
            {o.location && ` — ${o.location}`}
            {o.internalPriority && ` — ${prio(o.internalPriority)} (priorité interne)`}
            {o.technicalReference && ` — réf. ${o.technicalReference} ${o.referenceVerified ? "(vérifiée)" : "(NON vérifiée)"}`}
            {o.needsVerification && <Badge tone="amber">à vérifier</Badge>}
          </li>
        ))}
      </ul>
    ) : null;
  const roots = d.items.filter((i) => !i.parentId);
  const render = (it: (typeof d.items)[number], depth: number): React.ReactNode => (
    <div key={it.id} className={depth ? "mt-3 ml-4 border-l-2 border-slate-200 pl-4" : "mt-4"}>
      <h3 className="font-semibold">{it.typeLabel} — {it.label}</h3>
      <KV rows={it.fields.map((f) => [`${f.label}${f.pending ? " (en attente)" : ""}`, f.display])} />
      {it.measurements.length > 0 && (
        <ul className="mt-2 text-sm">{it.measurements.map((x) => <li key={x.id}>{x.label} : <strong>{x.value} {x.unit}</strong> — {fmtDateTime(x.measuredAt)}{x.instrument ? ` — ${x.instrument}` : ""}</li>)}</ul>
      )}
      <div className="mt-2">{obs(it.observations)}</div>
      {it.remainingChecks && <p className="mt-1 text-sm text-amber-700">Reste à vérifier : {it.remainingChecks}</p>}
      {it.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {it.attachments.map((a) =>
            a.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.id} src={`/api/attachments/${a.id}`} alt={a.caption ?? a.filename} className="h-32 rounded border object-cover" />
            ) : (
              <a key={a.id} className="link text-sm" href={`/api/attachments/${a.id}`}>{a.filename}</a>
            ),
          )}
        </div>
      )}
      {d.items.filter((c) => c.parentId === it.id).map((c) => render(c, depth + 1))}
    </div>
  );
  return (
    <>
      <div className="no-print">
        <PageHeader back={{ href: `/missions/${slug}/${id}`, label: "Retour à la saisie" }} title="Brouillon structuré" actions={<><PrintButton /><ButtonLink href={`/api/missions/${id}/export?format=pdf`} variant="primary">PDF</ButtonLink></>} />
      </div>
      <div className="mb-4"><Alert tone="amber" title="BROUILLON NON OFFICIEL">{d.notice}</Alert></div>
      <Card title={m.title}>
        <KV rows={[["Client", m.client], ["Site", m.site ? `${m.site.name} ${m.site.address}` : null], ["Adresse", m.address], ["Date", fmtDateTime(m.scheduledAt)], ["Inspecteur", m.inspector], ["Référence interne", m.internalRef], ["Statut", m.status], ["Version", `v${m.version}`], ["Modèle", m.template ? `${m.template.name} v${m.template.version}` : null]]} />
        <div className="mt-4"><KV rows={m.fields.map((f) => [`${f.label}${f.pending ? " (en attente)" : ""}`, f.display])} /></div>
        {m.generalNotes && <p className="mt-3 text-sm whitespace-pre-line">{m.generalNotes}</p>}
      </Card>
      <Card title="Éléments" className="mt-4">
        {roots.length ? roots.map((r) => render(r, 0)) : <p className="text-sm text-amber-700">Aucun élément saisi.</p>}
        {d.observationsWithoutItem.length > 0 && <><h3 className="mt-4 font-semibold">Observations générales</h3>{obs(d.observationsWithoutItem)}</>}
      </Card>
      <Card title={`Informations manquantes ou à vérifier (${d.missing.length})`} className="mt-4">
        <ul className="list-disc pl-5 text-sm">{d.missing.map((x, i) => <li key={i}>{x.level === "bloquant" ? "[obligatoire] " : "[à vérifier] "}{x.message}</li>)}</ul>
        {d.missing.length === 0 && <p className="text-sm">Aucun écart avec le modèle — ce n&apos;est ni une validation, ni une conclusion de conformité.</p>}
      </Card>
    </>
  );
}
