import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listTemplates } from "@/lib/services/templates";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { createTemplateAction, installExamplesAction } from "./actions";

export const metadata = { title: "Modèles de mission" };

export default async function TemplatesPage() {
  const ctx = await requireCtx("templates.manage", "templates.validate", "reports.lift.write", "reports.elec.write", "reports.lift.read_all", "reports.elec.read_all");
  const list = await listTemplates(ctx);
  const canManage = ctx.perms.has("templates.manage");
  return (
    <>
      <PageHeader title="Modèles de mission" subtitle="Champs, sections, listes de valeurs, relevés, pièces attendues et checklist — versionnés et validés par un responsable technique." />
      <div className="mb-4"><Alert tone="blue">Une mission ne peut être créée qu&apos;à partir d&apos;une version <strong>validée</strong>. Les missions existantes conservent la version avec laquelle elles ont été créées.</Alert></div>
      {list.length === 0 ? (
        <Empty title="Aucun modèle.">
          {canManage && (
            <ActionForm action={installExamplesAction} className="mt-3 inline-block">
              <SubmitButton>Installer les modèles d&apos;exemple (brouillons)</SubmitButton>
            </ActionForm>
          )}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((t) => (
            <Link key={t.id} href={`/templates/${t.id}`} className="card block p-4 hover:border-brand-500">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t.name}</span>
                <Badge tone={t.domain === "LEVAGE" ? "teal" : "amber"}>{t.domain === "LEVAGE" ? "Levage" : "Électricité"}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-500">{t.description}</div>
              <div className="mt-2 text-xs">
                {t.archived ? <Badge>archivé</Badge> : t.latestValidated ? <Badge tone="green">v{t.latestValidated.version} validée le {fmtDate(t.latestValidated.validatedAt)}</Badge> : <Badge tone="amber">aucune version validée</Badge>}{" "}
                <span className="text-slate-400">{t.versions.length} version(s)</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {canManage && list.length > 0 && (
        <Card title="Nouveau modèle" className="mt-6">
          <ActionForm action={createTemplateAction} className="grid gap-2 md:grid-cols-3">
            <input className="input" name="name" required placeholder="Nom du modèle" aria-label="Nom" />
            <select className="input" name="domain" aria-label="Domaine"><option value="LEVAGE">Levage</option><option value="ELECTRICITE">Électricité</option></select>
            <input className="input" name="description" placeholder="Description" aria-label="Description" />
            <p className="text-xs text-slate-500 md:col-span-3">Le modèle est créé à partir de l&apos;exemple du domaine ; adaptez ensuite sa définition (nouvelle version) puis faites-la valider.</p>
            <div><SubmitButton size="sm">Créer</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
