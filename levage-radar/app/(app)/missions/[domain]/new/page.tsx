import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireCtx } from "@/lib/auth/server";
import { reportPerms } from "@/lib/auth/permissions";
import { listTemplates } from "@/lib/services/templates";
import { listAllSites, listClients } from "@/lib/services/clients";
import { users } from "@/lib/db/schema";
import { DOMAIN_LABEL, DOMAIN_SLUGS } from "@/lib/reports/domain";
import { Alert, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { createMissionAction } from "../../actions";

export default async function NewMissionPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: slug } = await params;
  const domain = DOMAIN_SLUGS[slug];
  if (!domain) notFound();
  const p = reportPerms(domain);
  const ctx = await requireCtx(p.write, p.manageAll);
  const templates = (await listTemplates(ctx, domain)).filter((t) => !t.archived && t.latestValidated);
  const clients = ctx.perms.has("clients.read") ? await listClients(ctx) : [];
  const sites = ctx.perms.has("clients.read") ? await listAllSites(ctx) : [];
  const members = ctx.perms.has(p.manageAll) ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.org.id), eq(users.active, true))).orderBy(asc(users.name)) : [];
  return (
    <>
      <PageHeader back={{ href: `/missions/${slug}`, label: `Rapports ${DOMAIN_LABEL[domain]}` }} title={`Nouvelle mission ${DOMAIN_LABEL[domain]}`} />
      {templates.length === 0 ? (
        <Alert tone="amber" title="Aucun modèle validé pour ce domaine">
          Une mission ne peut être créée qu&apos;à partir d&apos;une version de modèle validée par un responsable technique. <Link className="link" href="/templates">Voir les modèles</Link>
        </Alert>
      ) : (
        <Card>
          <ActionForm action={createMissionAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="domain" value={domain} />
            <div className="md:col-span-2">
              <label className="label" htmlFor="tpl">Modèle de mission (version validée)</label>
              <select id="tpl" name="templateVersionId" className="input" required>
                {templates.map((t) => <option key={t.id} value={t.latestValidated!.id}>{t.name} — v{t.latestValidated!.version} (validée le {t.latestValidated!.validatedAt?.toLocaleDateString("fr-FR")}{t.latestValidated!.validatedByName ? ` par ${t.latestValidated!.validatedByName}` : ""})</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="title">Intitulé</label>
              <input id="title" name="title" className="input" required minLength={2} placeholder="ex. VGP atelier de maintenance — site Nord" />
            </div>
            <div>
              <label className="label" htmlFor="clientId">Client</label>
              <select id="clientId" name="clientId" className="input">
                <option value="">— à renseigner —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="siteId">Site</label>
              <select id="siteId" name="siteId" className="input">
                <option value="">— à renseigner —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({clients.find((c) => c.id === s.clientId)?.name})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="scheduledAt">Date et heure</label>
              <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="internalRef">Référence interne autorisée</label>
              <input id="internalRef" name="internalRef" className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="address">Adresse (sinon celle du site)</label>
              <input id="address" name="address" className="input" />
            </div>
            {members.length > 0 && (
              <div>
                <label className="label" htmlFor="inspectorId">Inspecteur</label>
                <select id="inspectorId" name="inspectorId" className="input" defaultValue={ctx.user.id}>
                  {members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="label" htmlFor="generalNotes">Notes générales</label>
              <textarea id="generalNotes" name="generalNotes" className="input" rows={3} />
            </div>
            <p className="text-xs text-slate-500 md:col-span-2">Pas de client ? <Link className="link" href="/clients">Créez-le dans « Clients & sites »</Link> (partagé entre levage et électricité).</p>
            <div className="md:col-span-2"><SubmitButton>Créer la mission</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
