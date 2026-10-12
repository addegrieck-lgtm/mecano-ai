import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireCtx } from "@/lib/auth/server";
import { dailyReports } from "@/lib/db/schema";
import type { DailyReportContent } from "@/lib/radar/daily-report";
import { Alert, Badge, Card, Empty, PageHeader, ScorePill } from "@/components/ui";
import { CategoryBadge, DomainBadge } from "@/components/radar/badges";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { isEmailConfigured } from "@/lib/email";
import { regenerateReportAction } from "./actions";

export const metadata = { title: "Rapport quotidien" };

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await requireCtx("opps.read");
  const { date } = await searchParams;
  const list = await ctx.db.select({ id: dailyReports.id, reportDate: dailyReports.reportDate, status: dailyReports.status }).from(dailyReports).where(eq(dailyReports.orgId, ctx.org.id)).orderBy(desc(dailyReports.reportDate)).limit(30);
  const target = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : list[0]?.reportDate;
  const [report] = target ? await ctx.db.select().from(dailyReports).where(and(eq(dailyReports.orgId, ctx.org.id), eq(dailyReports.reportDate, target))) : [];
  const c = report?.content as unknown as DailyReportContent | undefined;
  return (
    <>
      <PageHeader
        title={`Rapport quotidien${report ? ` du ${fmtDate(report.reportDate)}` : ""}`}
        subtitle={report ? `Généré le ${fmtDateTime(report.generatedAt)} · période ${fmtDateTime(c?.windowStart)} → ${fmtDateTime(c?.windowEnd)} · ${report.emailedAt ? `envoyé par e-mail le ${fmtDateTime(report.emailedAt)}` : isEmailConfigured() ? "non envoyé par e-mail" : "messagerie non configurée : consultable ici uniquement"}` : undefined}
        actions={
          ctx.perms.has("sources.run") ? (
            <ActionForm action={regenerateReportAction}>
              <SubmitButton variant="secondary" size="sm">Régénérer le rapport du jour (sans collecte)</SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      {list.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {list.map((r) => (
            <Link key={r.id} href={`/reports/daily?date=${r.reportDate}`} className={`rounded px-2 py-1 ring-1 ${r.reportDate === target ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-200 dark:ring-slate-700"}`}>
              {fmtDate(r.reportDate)} {r.status !== "ok" && "⚠"}
            </Link>
          ))}
        </div>
      )}
      {!report || !c ? (
        <Empty title="Aucun rapport généré pour l'instant.">Le rapport est produit après chaque collecte planifiée (tâche quotidienne).</Empty>
      ) : (
        <div className="space-y-6">
          <Alert tone={c.status === "ok" ? "green" : c.status === "degraded" ? "amber" : "red"} title={c.status === "ok" ? "Veille complète" : c.status === "degraded" ? "Veille incomplète" : "Veille NON effectuée"}>
            {c.statusMessage}
            <ul className="mt-2 text-xs">
              {c.sources.map((s) => <li key={s.id}>{s.name} : {s.status}{s.error ? ` — ${s.error}` : ""}</li>)}
            </ul>
          </Alert>
          {c.alerts.length > 0 && (
            <Card title="Alertes de surveillance">
              {c.alerts.map((a) => (
                <div key={a.alertId} className="mb-3">
                  <div className="text-sm font-semibold">{a.name} — {a.items.length} résultat(s)</div>
                  <Items items={a.items} />
                </div>
              ))}
            </Card>
          )}
          {c.sections.map((s) => (
            <Card key={s.key} title={<>{s.title} <Badge>{s.items.length}</Badge></>}>
              {s.items.length === 0 ? <p className="text-sm text-slate-500">{s.empty}</p> : <Items items={s.items} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Items({ items }: { items: DailyReportContent["sections"][number]["items"] }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-3 py-2 text-sm">
          <ScorePill score={i.score} />
          <div className="min-w-0">
            <Link className="font-medium hover:text-brand-600" href={`/radar/${i.id}`}>{i.title}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <DomainBadge domain={i.domain} /> <CategoryBadge category={i.category} />
              {i.buyer} {i.deadlineAt && `· limite ${fmtDateTime(i.deadlineAt)}`} {i.department && `· dép. ${i.department}`}
              {i.officialUrl && <a className="link" href={i.officialUrl} target="_blank" rel="noopener noreferrer">source ↗</a>}
              {i.reason && <span className="text-amber-700">· {i.reason}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
