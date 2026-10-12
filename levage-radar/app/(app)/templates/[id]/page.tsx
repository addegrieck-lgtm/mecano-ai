import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { listTemplates } from "@/lib/services/templates";
import { parseDefinition } from "@/lib/reports/template-schema";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { archiveTemplateAction, newVersionAction, validateVersionAction } from "../actions";

const TYPES: Record<string, string> = { text: "texte", textarea: "texte long", number: "nombre", date: "date", datetime: "date/heure", select: "liste", multiselect: "choix multiples", boolean: "oui/non" };

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("templates.manage", "templates.validate", "reports.lift.write", "reports.elec.write", "reports.lift.read_all", "reports.elec.read_all");
  const t = (await listTemplates(ctx)).find((x) => x.id === id);
  if (!t) notFound();
  const { v } = await searchParams;
  const version = t.versions.find((x) => x.id === v) ?? t.versions[0];
  const def = parseDefinition(version.definition);
  const canManage = ctx.perms.has("templates.manage");
  const canValidate = ctx.perms.has("templates.validate");
  return (
    <>
      <PageHeader
        back={{ href: "/templates", label: "Modèles" }}
        title={t.name}
        subtitle={t.description}
        actions={canManage ? <form action={archiveTemplateAction.bind(null, t.id, !t.archived)}><SubmitButton variant="ghost" size="sm">{t.archived ? "Désarchiver" : "Archiver"}</SubmitButton></form> : null}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {t.versions.map((x) => (
          <a key={x.id} href={`/templates/${t.id}?v=${x.id}`} className={`rounded px-2 py-1 ring-1 ${x.id === version.id ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-200 dark:ring-slate-700"}`}>
            v{x.version} · {x.status === "validated" ? "validée" : x.status === "retired" ? "remplacée" : "brouillon"}
          </a>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={<>Version {version.version} <Badge tone={version.status === "validated" ? "green" : version.status === "retired" ? "slate" : "amber"}>{version.status === "validated" ? "validée" : version.status === "retired" ? "remplacée" : "brouillon — non utilisable"}</Badge></>}
            actions={canValidate && version.status === "draft" ? (
              <ActionForm action={validateVersionAction.bind(null, t.id, version.id)}>
                <SubmitButton size="sm" confirm="Confirmez-vous avoir vérifié les champs, règles et libellés de cette version (validation par un responsable technique habilité) ?">Valider cette version</SubmitButton>
              </ActionForm>
            ) : null}>
            <p className="mb-3 text-xs text-slate-500">
              Créée le {fmtDateTime(version.createdAt)}{version.changeNote ? ` — « ${version.changeNote} »` : ""}
              {version.validatedAt && ` · validée le ${fmtDateTime(version.validatedAt)} par ${version.validatedByName ?? "—"}`}
            </p>
            <h3 className="text-sm font-semibold">Champs de la mission</h3>
            <FieldList fields={def.headerFields} />
            {def.itemTypes.map((it) => (
              <div key={it.key} className="mt-4">
                <h3 className="text-sm font-semibold">{it.label}{it.parentTypes?.length ? ` (rattaché à : ${it.parentTypes.join(", ")})` : ""}</h3>
                <FieldList fields={it.fields} />
              </div>
            ))}
            {def.measurementTypes.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold">Relevés possibles</h3>
                <ul className="text-sm">{def.measurementTypes.map((m) => <li key={m.key}>{m.label} — unités : {m.units.join(", ")} — sur : {m.appliesTo.join(", ")}</li>)}</ul>
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div><h3 className="font-semibold">Priorités internes</h3><ul>{def.observationPriorities.map((p) => <li key={p.key}>{p.label}</li>)}</ul></div>
              <div><h3 className="font-semibold">Pièces attendues</h3><ul>{def.requiredAttachments.map((p) => <li key={p.key}>{p.label}{p.itemType ? ` (${p.itemType})` : ""}</li>)}{!def.requiredAttachments.length && <li className="text-slate-400">aucune</li>}</ul></div>
              <div className="sm:col-span-2"><h3 className="font-semibold">Checklist avant export</h3><ul className="list-disc pl-5">{def.checklist.map((c) => <li key={c}>{c}</li>)}</ul></div>
              <div className="sm:col-span-2"><h3 className="font-semibold">Mention d&apos;export</h3><p className="text-xs">{def.notice}</p></div>
            </div>
          </Card>
        </div>
        {canManage && (
          <Card title="Nouvelle version">
            <Alert tone="amber">Modifiez la définition (JSON). Elle est vérifiée à l&apos;enregistrement et créée en brouillon ; un responsable devra la valider.</Alert>
            <ActionForm action={newVersionAction.bind(null, t.id)} className="mt-3 space-y-2">
              <input className="input" name="changeNote" required placeholder="Nature de la modification" aria-label="Nature de la modification" />
              <textarea className="input font-mono !text-[11px]" name="definition" rows={28} defaultValue={JSON.stringify(def, null, 2)} aria-label="Définition JSON" spellCheck={false} />
              <SubmitButton size="sm">Enregistrer la nouvelle version</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}

function FieldList({ fields }: { fields: { key: string; label: string; type: string; required?: boolean; options?: string[]; unit?: string; showIf?: { field: string; equals: unknown } }[] }) {
  return (
    <ul className="mt-1 divide-y divide-slate-100 text-sm dark:divide-slate-800">
      {fields.map((f) => (
        <li key={f.key} className="py-1">
          {f.label} <span className="text-xs text-slate-500">({TYPES[f.type] ?? f.type}{f.unit ? `, ${f.unit}` : ""}{f.required ? ", obligatoire" : ""}{f.showIf ? `, si ${f.showIf.field} = ${String(f.showIf.equals)}` : ""})</span>
          {f.options && <span className="block text-xs text-slate-400">{f.options.join(" · ")}</span>}
        </li>
      ))}
    </ul>
  );
}
