import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/server";
import { missionHistory } from "@/lib/services/missions";
import { AppError } from "@/lib/errors";
import { Card, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

const ACTIONS: Record<string, string> = {
  create: "Création du dossier",
  edit: "Modification de champs",
  item_create: "Ajout d'un élément",
  item_edit: "Modification d'un élément",
  item_delete: "Suppression d'un élément",
  measurement_add: "Ajout d'un relevé",
  measurement_delete: "Suppression d'un relevé",
  observation_add: "Ajout d'une observation",
  observation_edit: "Modification d'une observation",
  observation_delete: "Suppression d'une observation",
  attachment_add: "Ajout d'une pièce jointe",
  attachment_delete: "Suppression d'une pièce jointe",
  status_change: "Changement de statut",
  snapshot: "Version enregistrée",
  export: "Export",
};

export default async function HistoryPage({ params }: { params: Promise<{ domain: string; id: string }> }) {
  const { domain: slug, id } = await params;
  const ctx = await requireCtx();
  let list;
  try {
    list = await missionHistory(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <>
      <PageHeader back={{ href: `/missions/${slug}/${id}`, label: "Retour au dossier" }} title="Historique du dossier" subtitle="Date, auteur et nature de chaque action." />
      <Card>
        <ol className="space-y-3">
          {list.map((h) => (
            <li key={h.id} className="border-l-2 border-slate-200 pl-3 text-sm dark:border-slate-700">
              <div className="text-xs text-slate-500">{fmtDateTime(h.createdAt)} · {h.user ?? "système"}</div>
              <div className="font-medium">{ACTIONS[h.action] ?? h.action}</div>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px] whitespace-pre-wrap dark:bg-slate-950">{JSON.stringify(h.details, null, 1)}</pre>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
