import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listAudit } from "@/lib/services/users";
import { Card, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Historique des actions" };

const TYPES = ["", "opportunity", "buyer", "task", "alert", "mission", "template", "client", "site", "user", "organization", "export"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("audit.read");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const res = await listAudit(ctx, { entityType: sp.type || undefined, page });
  return (
    <>
      <PageHeader title="Historique des actions" subtitle="Journal d'audit de l'organisation (date, auteur, action, objet)." />
      <form method="get" className="mb-4 flex gap-2">
        <select className="input !w-56" name="type" defaultValue={sp.type ?? ""} aria-label="Type d'objet">
          {TYPES.map((t) => <option key={t} value={t}>{t || "Tous les objets"}</option>)}
        </select>
        <button className="rounded-md bg-brand-600 px-3 text-sm text-white" type="submit">Filtrer</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="table min-w-[760px] text-xs">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Objet</th><th>Action</th><th>Détails</th></tr></thead>
            <tbody>
              {res.items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td>{e.userName ?? "système"}</td>
                  <td>{e.entityType}{e.entityId ? <span className="block font-mono text-[10px] text-slate-400">{e.entityId.slice(0, 8)}</span> : null}</td>
                  <td>{e.action}</td>
                  <td className="max-w-md font-mono text-[10px] break-all">{JSON.stringify(e.details).slice(0, 300)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <nav className="mt-4 flex justify-center gap-4 text-sm">
        {page > 1 && <Link className="link" href={`/audit?type=${sp.type ?? ""}&page=${page - 1}`}>← Plus récents</Link>}
        {res.hasMore && <Link className="link" href={`/audit?type=${sp.type ?? ""}&page=${page + 1}`}>Plus anciens →</Link>}
      </nav>
    </>
  );
}
