import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { getClient } from "@/lib/services/clients";
import { canRead } from "@/lib/services/missions";
import { missions } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { slugOf } from "@/lib/reports/domain";
import { createSiteAction, updateClientAction } from "../actions";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("clients.read");
  let d;
  try {
    d = await getClient(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const write = ctx.perms.has("clients.write");
  const ms = (await ctx.db.select().from(missions).where(and(eq(missions.orgId, ctx.org.id), eq(missions.clientId, id))).orderBy(desc(missions.updatedAt)).limit(200)).filter((m) => canRead(ctx, m));
  return (
    <>
      <PageHeader back={{ href: "/clients", label: "Clients" }} title={d.client.name} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Sites (${d.sites.length})`}>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {d.sites.map((s) => <li key={s.id} className="py-2"><strong>{s.name}</strong> — {[s.address, s.postalCode, s.city].filter(Boolean).join(" ") || "adresse non renseignée"}{s.contactName && <span className="block text-xs text-slate-500">Contact : {s.contactName} {s.contactPhone}</span>}</li>)}
            </ul>
            {write && (
              <ActionForm action={createSiteAction.bind(null, id)} className="mt-4 grid gap-2 sm:grid-cols-2" resetOnSuccess>
                <input className="input" name="name" required placeholder="Nom du site" aria-label="Nom du site" />
                <input className="input" name="address" placeholder="Adresse" aria-label="Adresse" />
                <input className="input" name="postalCode" placeholder="Code postal" aria-label="Code postal" />
                <input className="input" name="city" placeholder="Ville" aria-label="Ville" />
                <input className="input" name="contactName" placeholder="Contact sur site" aria-label="Contact" />
                <input className="input" name="contactPhone" placeholder="Téléphone" aria-label="Téléphone" />
                <div><SubmitButton size="sm">Ajouter le site</SubmitButton></div>
              </ActionForm>
            )}
          </Card>
          <Card title="Dossiers d'inspection visibles">
            {ms.length === 0 ? <p className="text-sm text-slate-500">Aucun.</p> : (
              <ul className="text-sm">{ms.map((m) => <li key={m.id}><Link className="link" href={`/missions/${slugOf(m.domain)}/${m.id}`}>{m.title}</Link> <span className="text-xs text-slate-500">{m.domain === "LEVAGE" ? "levage" : "électricité"} · {fmtDateTime(m.scheduledAt)}</span></li>)}</ul>
            )}
          </Card>
        </div>
        {write && (
          <Card title="Fiche client">
            <ActionForm action={updateClientAction.bind(null, id)} className="space-y-2">
              <input className="input" name="name" defaultValue={d.client.name} required aria-label="Raison sociale" />
              <input className="input" name="nationalId" defaultValue={d.client.nationalId ?? ""} placeholder="SIRET" aria-label="SIRET" />
              <textarea className="input" name="notes" rows={4} defaultValue={d.client.notes ?? ""} aria-label="Notes" />
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
