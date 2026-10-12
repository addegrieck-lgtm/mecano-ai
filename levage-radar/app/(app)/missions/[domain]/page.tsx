import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { reportPerms } from "@/lib/auth/permissions";
import { listMissions, MISSION_STATUSES, statusLabel } from "@/lib/services/missions";
import { DOMAIN_LABEL, DOMAIN_SLUGS } from "@/lib/reports/domain";
import { Badge, ButtonLink, Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default async function MissionsPage({ params, searchParams }: { params: Promise<{ domain: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { domain: slug } = await params;
  const domain = DOMAIN_SLUGS[slug];
  if (!domain) notFound();
  const p = reportPerms(domain);
  const ctx = await requireCtx(p.write, p.readAll, p.manageAll);
  const sp = await searchParams;
  const list = await listMissions(ctx, domain, { status: sp.status, scope: sp.scope === "mine" ? "mine" : "all", q: sp.q });
  const canCreate = ctx.perms.has(p.write) || ctx.perms.has(p.manageAll);
  return (
    <>
      <PageHeader
        title={`Rapports ${DOMAIN_LABEL[domain]}`}
        subtitle="Fiches de chantier et brouillons préparatoires. Le rapport officiel est rédigé et validé dans l'outil officiel."
        actions={canCreate ? <ButtonLink href={`/missions/${slug}/new`} variant="primary">+ Nouvelle mission</ButtonLink> : null}
      />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Titre, client, site, référence" aria-label="Recherche" />
        <select className="input !w-60" name="status" defaultValue={sp.status ?? ""} aria-label="Statut">
          <option value="">Dossiers en cours</option>
          {Object.entries(MISSION_STATUSES).map(([k]) => <option key={k} value={k}>{statusLabel(ctx, k)}</option>)}
        </select>
        <select className="input !w-48" name="scope" defaultValue={sp.scope ?? ""} aria-label="Périmètre">
          <option value="">Tous les dossiers visibles</option>
          <option value="mine">Mes dossiers</option>
        </select>
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white" type="submit">Filtrer</button>
      </form>
      {list.length === 0 ? (
        <Empty title="Aucun dossier.">{canCreate ? "Créez une mission à partir d'un modèle validé." : null}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <Link key={m.id} href={`/missions/${slug}/${m.id}`} className="card block p-4 transition hover:border-brand-500">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{m.title}</div>
                <Badge tone={m.status === "PRET_OUTIL_OFFICIEL" ? "green" : m.status === "A_COMPLETER" ? "amber" : "blue"}>{statusLabel(ctx, m.status)}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-500">{[m.clientName, m.siteName].filter(Boolean).join(" — ") || "Client non renseigné"}</div>
              <div className="mt-2 text-xs text-slate-500">Intervention : {fmtDateTime(m.scheduledAt)} · {m.inspectorName ?? "—"}</div>
              <div className="text-[11px] text-slate-400">Modifié le {fmtDateTime(m.updatedAt)} · v{m.version}{m.internalRef ? ` · réf. ${m.internalRef}` : ""}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
