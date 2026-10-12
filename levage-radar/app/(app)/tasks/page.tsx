import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { listTasks } from "@/lib/services/opportunities";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { taskAction, taskDoneAction } from "../radar/actions";

export const metadata = { title: "Tâches et rappels" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("opps.track");
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "mine";
  const done = sp.done === "1";
  const list = await listTasks(ctx, { scope, done });
  const tab = (label: string, href: string, active: boolean) => (
    <Link href={href} className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"}`}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Tâches et rappels" subtitle="Les rappels arrivés à échéance apparaissent sur le tableau de bord et sont envoyés par e-mail si la messagerie est configurée." />
      <div className="mb-4 flex flex-wrap gap-2">
        {tab("Mes tâches", "/tasks", scope === "mine" && !done)}
        {tab("Toutes les tâches", "/tasks?scope=all", scope === "all" && !done)}
        {tab("Terminées", `/tasks?scope=${scope}&done=1`, done)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {list.length === 0 ? <Empty title="Aucune tâche." /> : (
            <div className="card divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((t) => {
                const late = !t.doneAt && t.dueAt && t.dueAt < new Date();
                return (
                  <div key={t.id} className="flex items-start gap-3 p-3">
                    <form action={taskDoneAction.bind(null, t.id, !t.doneAt, "/tasks")}>
                      <button type="submit" className="mt-0.5 h-5 w-5 rounded border border-slate-400 text-xs" aria-label={t.doneAt ? "Rouvrir la tâche" : "Marquer comme terminée"}>{t.doneAt ? "✓" : ""}</button>
                    </form>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className={t.doneAt ? "text-slate-400 line-through" : "font-medium"}>{t.title}</div>
                      {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                      <div className="mt-0.5 text-xs text-slate-500">
                        {t.assigneeName ?? "—"}
                        {t.dueAt && <span className={late ? " font-semibold text-red-600" : ""}> · échéance {fmtDate(t.dueAt)}</span>}
                        {t.remindAt && ` · rappel ${fmtDateTime(t.remindAt)}${t.reminderSentAt ? " (envoyé)" : ""}`}
                        {t.opp && <> · <Link className="link" href={`/radar/${t.opp.id}`}>{t.opp.title.slice(0, 70)}</Link></>}
                        {t.buyer && <> · <Link className="link" href={`/buyers/${t.buyer.id}`}>{t.buyer.name}</Link></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Card title="Nouvelle tâche">
          <ActionForm action={taskAction} className="space-y-2" resetOnSuccess>
            <input className="input" name="title" required placeholder="Intitulé" aria-label="Intitulé" />
            <textarea className="input" name="description" rows={2} placeholder="Détails (facultatif)" aria-label="Détails" />
            <label className="block text-xs text-slate-500">Échéance<input className="input mt-1" type="date" name="dueAt" /></label>
            <label className="block text-xs text-slate-500">Rappel<input className="input mt-1" type="datetime-local" name="remindAt" /></label>
            <SubmitButton size="sm">Créer</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
