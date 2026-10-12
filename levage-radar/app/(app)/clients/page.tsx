import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listClients } from "@/lib/services/clients";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { createClientAction } from "./actions";

export const metadata = { title: "Clients et sites" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx("clients.read");
  const { q } = await searchParams;
  const list = await listClients(ctx, q);
  return (
    <>
      <PageHeader title="Clients et sites" subtitle="Référentiel commun aux rapports levage et électricité." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form method="get" className="mb-3"><input className="input" name="q" defaultValue={q} placeholder="Rechercher un client" aria-label="Rechercher" /></form>
          {list.length === 0 ? <Empty title="Aucun client." /> : (
            <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((c) => <li key={c.id}><Link className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800" href={`/clients/${c.id}`}>{c.name}{c.nationalId && <span className="ml-2 text-xs text-slate-500">{c.nationalId}</span>}</Link></li>)}
            </ul>
          )}
        </div>
        {ctx.perms.has("clients.write") && (
          <Card title="Nouveau client">
            <ActionForm action={createClientAction} className="space-y-2" resetOnSuccess>
              <input className="input" name="name" required placeholder="Raison sociale" aria-label="Raison sociale" />
              <input className="input" name="nationalId" placeholder="SIRET (facultatif)" aria-label="SIRET" />
              <textarea className="input" name="notes" rows={2} placeholder="Notes" aria-label="Notes" />
              <SubmitButton size="sm">Créer</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
