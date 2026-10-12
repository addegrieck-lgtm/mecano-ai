import Link from "next/link";
import { requireCtx } from "@/lib/auth/server";
import { dashboardStats, markOpportunitiesSeen } from "@/lib/services/opportunities";
import { isDemoView } from "@/lib/demo-server";
import { connectorInfo } from "@/lib/connectors/registry";
import { Alert, ButtonLink, Card, DemoBanner, Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate, fmtDateTime, isoDateIn } from "@/lib/format";
import { REGIONS } from "@/lib/radar/geo";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const ctx = await requireCtx("opps.read");
  const demo = await isDemoView();
  const s = await dashboardStats(ctx, { demo });
  await markOpportunitiesSeen(ctx);
  const maxRegion = Math.max(1, ...s.byRegion.map((r) => r.n));
  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader
        title="Tableau de bord commercial"
        subtitle={`Bonjour ${ctx.user.name} — ${s.total} opportunité(s) en base${demo ? " (démonstration)" : ""}.`}
        actions={
          <>
            <ButtonLink href="/radar?open=1" variant="primary">Consultations ouvertes</ButtonLink>
            <ButtonLink href="/reports/daily">Rapport du jour</ButtonLink>
          </>
        }
      />

      {s.sourceProblems.length > 0 && (
        <div className="mb-6">
          <Alert tone="red" title="Sources en erreur ou non actualisées">
            <ul className="list-disc pl-5">
              {s.sourceProblems.map((p) => (
                <li key={p.id}>
                  {connectorInfo(p.id)?.name ?? p.id} :{" "}
                  {!p.lastSuccessAt ? "aucune collecte réussie à ce jour" : `dernière collecte réussie le ${fmtDateTime(p.lastSuccessAt)}`}
                  {p.lastError ? ` — ${p.lastError}` : ""}
                </li>
              ))}
            </ul>
            <Link href="/sources" className="link mt-1 inline-block">Voir l&apos;état des connecteurs →</Link>
          </Alert>
        </div>
      )}
      {s.total === 0 && !demo && (
        <div className="mb-6">
          <Alert tone="blue" title="Aucune opportunité collectée pour l'instant">
            Lancez une première collecte depuis <Link className="link" href="/sources">État des connecteurs</Link> ou attendez la collecte quotidienne planifiée. Aucune donnée fictive n&apos;est affichée ici.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Détectées aujourd'hui" value={s.today} href="/radar?newSince=today" tone="blue" />
        <Stat label="Depuis votre dernière connexion" value={s.sinceLast ?? "—"} hint={s.sinceDate ? `depuis le ${fmtDate(s.sinceDate)}` : "première connexion"} href="/radar?newSince=last_visit" />
        <Stat label="Consultations actives" value={s.active} href="/radar?category=ACTIVE&open=1" tone="green" />
        <Stat label="Échéances ≤ 7 jours" value={s.deadlines} href={`/radar?open=1&sort=deadline&deadlineTo=${isoDateIn(7)}`} tone={s.deadlines ? "amber" : "slate"} />
        <Stat label="Opportunités levage" value={s.levage} href="/radar?domain=LEVAGE" />
        <Stat label="Opportunités électricité" value={s.elec} href="/radar?domain=ELECTRICITE" />
        <Stat label="Forte pertinence (≥ 70)" value={s.highScore} href="/radar?open=1&minScore=70" />
        <Stat label="Marchés attribués à surveiller" value={s.awarded} href="/radar?category=AWARDED,CONTRACT_WATCH" />
        <Stat label="Projets / signaux" value={s.signals} href="/radar?category=SIGNAL" />
        <Stat label="Favoris" value={s.favorites} href="/radar?favorite=1" />
        <Stat label="Dossiers en préparation" value={s.inPreparation} href="/radar?status=EN_ANALYSE,EN_PREPARATION" />
        <Stat label="Mes tâches ouvertes" value={s.openTasks} href="/tasks" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Répartition par région (France)" className="lg:col-span-2">
          {s.byRegion.length === 0 ? (
            <Empty title="Pas encore de données localisées" />
          ) : (
            <ul className="space-y-1.5">
              {s.byRegion.map((r) => (
                <li key={r.region}>
                  <Link href={`/radar?region=${encodeURIComponent(r.region)}`} className="group grid grid-cols-[180px_1fr_40px] items-center gap-3 text-sm">
                    <span className="truncate text-slate-700 group-hover:text-brand-600 dark:text-slate-300">{r.region}</span>
                    <span className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-2.5 rounded-full bg-brand-500" style={{ width: `${(r.n / maxRegion) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{r.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Région déduite du département publié par la source. {s.unlocated} opportunité(s) sans localisation exploitable (hors France ou non publiée). {REGIONS.length} régions et DROM référencés.
          </p>
        </Card>
        <Card title="Rappels échus">
          {s.dueReminders.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun rappel en attente.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.dueReminders.map((t) => (
                <li key={t.id}>
                  <Link className="link" href={t.opportunityId ? `/radar/${t.opportunityId}` : "/tasks"}>{t.title}</Link>
                  <div className="text-xs text-slate-500">Rappel : {fmtDateTime(t.remindAt)}{t.dueAt ? ` · échéance ${fmtDate(t.dueAt)}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
            Sources connectées :{" "}
            {s.sourceStates.filter((x) => x.id !== "demo").map((x) => `${connectorInfo(x.id)?.name ?? x.id} (${x.lastSuccessAt ? `OK le ${fmtDateTime(x.lastSuccessAt)}` : "jamais collectée"})`).join(" · ") || "aucune"}
          </div>
        </Card>
      </div>
    </>
  );
}
