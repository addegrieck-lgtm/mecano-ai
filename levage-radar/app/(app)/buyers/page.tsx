import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listBuyers } from "@/lib/services/buyers";
import { isDemoView } from "@/lib/demo-server";
import { DemoBanner, Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Acheteurs" };

export default async function BuyersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("opps.read");
  const sp = await searchParams;
  const demo = await isDemoView();
  const page = Number(sp.page) || 1;
  const res = await listBuyers(ctx, { q: sp.q, domain: sp.domain, recurrent: sp.recurrent === "1", demo, page });
  const qs = (p: number) => `/buyers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.domain ? { domain: sp.domain } : {}), ...(sp.recurrent ? { recurrent: sp.recurrent } : {}), page: String(p) })}`;
  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader title="Acheteurs et donneurs d'ordre" subtitle="Organisations ayant publié au moins un avis pertinent détecté par le radar." />
      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <input className="input sm:col-span-2" name="q" defaultValue={sp.q} placeholder="Nom de l'acheteur" aria-label="Nom de l'acheteur" />
        <select className="input" name="domain" defaultValue={sp.domain ?? ""} aria-label="Domaine">
          <option value="">Levage + électricité</option>
          <option value="LEVAGE">Levage</option>
          <option value="ELECTRICITE">Électricité</option>
        </select>
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="recurrent" value="1" defaultChecked={sp.recurrent === "1"} /> Publient régulièrement (≥ 2)</label>
          <button className="rounded-md bg-brand-600 px-3 py-2 text-sm text-white" type="submit">Filtrer</button>
        </div>
      </form>
      {res.items.length === 0 ? (
        <Empty title="Aucun acheteur pour ces critères." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr><th>Acheteur</th><th>Localisation</th><th className="text-right">Avis pertinents</th><th className="text-right">Ouverts</th><th className="text-right">Attribués</th><th>Dernière publication</th></tr>
            </thead>
            <tbody>
              {res.items.map(({ b, relevant, active, awarded, lastPublished }) => (
                <tr key={b.id}>
                  <td><Link className="font-medium hover:text-brand-600" href={`/buyers/${b.id}`}>{b.name}</Link><div className="text-xs text-slate-500">{b.kind === "public" ? "Acheteur public" : b.kind === "private" ? "Privé" : "—"}</div></td>
                  <td className="text-xs">{[b.city, b.department, b.country].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-right tabular-nums">{relevant}</td>
                  <td className="text-right tabular-nums">{active}</td>
                  <td className="text-right tabular-nums">{awarded}</td>
                  <td className="text-xs">{fmtDate(lastPublished)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="mt-4 flex justify-center gap-4 text-sm">
        {res.page > 1 && <Link className="link" href={qs(res.page - 1)}>← Précédent</Link>}
        {res.hasMore && <Link className="link" href={qs(res.page + 1)}>Suivant →</Link>}
      </nav>
    </>
  );
}
