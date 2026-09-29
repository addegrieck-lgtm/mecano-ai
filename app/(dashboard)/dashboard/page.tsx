"use client";

import Link from "next/link";
import { AlertTriangle, BellRing, Car, CheckCircle2, ClipboardList, Clock, Euro, FileText, PackageOpen, Percent, ShoppingBasket, Stethoscope, Users, Wrench } from "lucide-react";
import { useApp, useData } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, PageHeader, Pill, Section, StatCard } from "@/components/app/common";
import { InterventionRow } from "@/components/interventions/intervention-row";
import { buttonVariants } from "@/components/ui/button";
import { can, isGarageWide } from "@/lib/permissions";
import { formatEuro } from "@/lib/quotes/calc";
import { fmtDate, localDayKey, todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { profile, garage, services } = useApp();
  const today = todayKey();
  const { data, loading, error } = useData(async (s) => {
    const [dash, interventions, members, teams, quotes] = await Promise.all([
      s.insights.dashboard(today),
      s.work.interventions(),
      s.org.members(),
      s.org.teams(),
      can(s.ctx, "quotes:read") ? s.work.quotes() : Promise.resolve([]),
    ]);
    return { dash, interventions, members, teams, quotes, now: Date.now() };
  }, [today]);

  if (loading || !services) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Erreur"} />;
  const ctx = services.ctx;
  const { dash, interventions, members, teams, quotes, now } = data;
  const nameOf = (id?: string | null) => {
    const m = members.find((x) => x.profile.id === id);
    return m ? m.profile.first_name : null;
  };
  const teamOf = (id?: string | null) => teams.find((t) => t.id === id) ?? null;
  const todays = interventions.filter((i) => localDayKey(i.scheduled_at) === today && i.status !== "CANCELLED");
  const mine = interventions.filter((i) => i.mechanic_id === ctx.userId && (localDayKey(i.scheduled_at) === today || i.status === "IN_PROGRESS" || i.status === "WAITING_PART") && i.status !== "COMPLETED" && i.status !== "CANCELLED");
  const followUps = quotes.filter((q) => q.needsFollowUp);

  const greeting = (
    <PageHeader
      title={`Bonjour ${profile?.first_name ?? ""}`}
      subtitle={`${garage?.name} · ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`}
      actions={
        <>
          <Link href="/vehicle-intake" className={buttonVariants({ variant: "outline" })}>
            <ClipboardList className="size-4" /> Réception
          </Link>
          <Link href="/diagnostics/new" className={buttonVariants()}>
            <Stethoscope className="size-4" /> Nouveau diagnostic
          </Link>
        </>
      }
    />
  );

  const myTasks = (
    <Section title="Mes interventions — aujourd'hui" icon={Wrench}>
      {mine.length === 0 ? (
        <Empty title="Aucune intervention attribuée aujourd'hui" />
      ) : (
        <div className="flex flex-col gap-2">
          {mine.map((i) => (
            <InterventionRow key={i.id} intervention={i} vehicle={i.vehicle} team={teamOf(i.team_id)} canEdit={i.canEdit} showStart />
          ))}
        </div>
      )}
    </Section>
  );

  // ---------- Mécanicien ----------
  if (ctx.role === "MECHANIC") {
    return (
      <div className="flex flex-col gap-4">
        {greeting}
        {myTasks}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Diagnostics en cours" value={dash.today.diagnosticsInProgress} icon={Stethoscope} tone="info" href="/diagnostics" />
          <StatCard label="Attente pièces" value={mine.filter((i) => i.status === "WAITING_PART").length} icon={PackageOpen} tone="warning" />
        </div>
      </div>
    );
  }

  // ---------- Chef d'équipe ----------
  if (ctx.role === "TEAM_MANAGER") {
    const myTeams = teams.filter((t) => ctx.managedTeamIds.includes(t.id) || ctx.teamIds.includes(t.id));
    const teamIds = new Set(myTeams.map((t) => t.id));
    const teamInts = interventions.filter((i) => i.team_id && teamIds.has(i.team_id));
    const active = teamInts.filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED");
    const late = active.filter((i) => i.scheduled_at && new Date(i.scheduled_at).getTime() + (i.planned_duration_minutes ?? 60) * 60000 < now);
    const memberIds = new Set(myTeams.flatMap((t) => t.memberIds));
    return (
      <div className="flex flex-col gap-4">
        {greeting}
        <Section title={`Mon équipe — ${myTeams.map((t) => t.name).join(", ")}`} icon={Users}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Mécaniciens" value={memberIds.size} icon={Users} />
            <StatCard label="Véhicules" value={new Set(active.map((i) => i.vehicle_id)).size} icon={Car} />
            <StatCard label="Diagnostics" value={dash.teams.filter((t) => teamIds.has(t.team.id)).reduce((s, t) => s + t.activeDiagnostics, 0)} icon={Stethoscope} tone="info" />
            <StatCard label="Terminées aujourd'hui" value={teamInts.filter((i) => localDayKey(i.completed_at) === today).length} icon={CheckCircle2} tone="success" />
            <StatCard label="Retards" value={late.length} icon={AlertTriangle} tone={late.length ? "danger" : "muted"} />
          </div>
        </Section>
        <Section title="Charge de travail" icon={Clock}>
          <div className="flex flex-col gap-2">
            {[...memberIds].map((uid) => {
              const load = active.filter((i) => i.mechanic_id === uid);
              const minutes = load.reduce((s, i) => s + (i.planned_duration_minutes ?? 60), 0);
              return (
                <div key={uid} className="flex items-center gap-3 text-sm">
                  <span className="w-28 truncate">{nameOf(uid) ?? "—"}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (minutes / 480) * 100)}%` }} />
                  </div>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {load.length} tâche(s) · {Math.round(minutes / 6) / 10} h
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
        <Section title="Interventions de l'équipe" icon={Wrench} actions={<Pill tone="warning">{active.filter((i) => i.status === "WAITING_PART").length} attente pièce</Pill>}>
          <div className="flex flex-col gap-2">
            {active.length === 0 && <Empty title="Aucune intervention en cours" />}
            {active.map((i) => (
              <InterventionRow key={i.id} intervention={i} vehicle={i.vehicle} team={teamOf(i.team_id)} mechanicName={nameOf(i.mechanic_id)} canEdit={i.canEdit} showStart />
            ))}
          </div>
        </Section>
        {myTasks}
      </div>
    );
  }

  // ---------- Patron / admin / réception / lecture ----------
  const occupancy = dash.workshop.capacity ? Math.round((dash.workshop.occupied / dash.workshop.capacity) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      {greeting}
      <Section title="Aujourd'hui" icon={Clock}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Véhicules prévus" value={dash.today.planned} icon={Car} href="/planning" />
          <StatCard label="Véhicules présents" value={dash.today.present} icon={Car} tone="primary" />
          <StatCard label="Diagnostics en cours" value={dash.today.diagnosticsInProgress} icon={Stethoscope} tone="info" href="/diagnostics" />
          <StatCard label="Interventions en cours" value={dash.today.interventionsInProgress} icon={Wrench} tone="primary" href="/interventions" />
          <StatCard label="Véhicules terminés" value={dash.today.completed} icon={CheckCircle2} tone="success" />
          <StatCard label="Devis en attente" value={dash.today.quotesPending} icon={FileText} tone="warning" href="/quotes" />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Équipes" icon={Users} className="lg:col-span-1">
          <div className="flex flex-col gap-2">
            {dash.teams.map(({ team, activeInterventions, activeDiagnostics, members: n }) => (
              <Link key={team.id} href="/teams" className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/40">
                <span className="size-3 rounded-full" style={{ background: team.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{team.name}</div>
                  <div className="text-xs text-muted-foreground">{n} membre(s)</div>
                </div>
                <div className="text-right text-xs">
                  <div>
                    <b className="text-base">{activeInterventions}</b> interventions
                  </div>
                  <div className="text-muted-foreground">{activeDiagnostics} diagnostics</div>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Atelier" icon={Wrench} className="lg:col-span-2">
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-sm">
              <span>Capacité occupée</span>
              <span className="tabular-nums">
                {dash.workshop.occupied} / {dash.workshop.capacity} ({occupancy}%)
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", occupancy > 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, occupancy)}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="En attente" value={dash.workshop.waiting} />
            <StatCard label="En réparation" value={dash.workshop.inRepair} tone="primary" icon={Wrench} />
            <StatCard label="Attente pièces" value={dash.workshop.waitingPart} tone="warning" icon={PackageOpen} />
            <StatCard label="Terminés" value={dash.workshop.done} tone="success" icon={CheckCircle2} />
          </div>
        </Section>
      </div>

      {can(ctx, "stats:view") && (
        <Section title="Business (mois en cours)" icon={Euro} actions={<Link href="/stats" className="text-xs text-primary hover:underline">Statistiques →</Link>}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="CA HT (devis acceptés)" value={formatEuro(dash.business.revenueMonthHT)} icon={Euro} tone="primary" />
            <StatCard label="Devis" value={dash.business.quotesCount} icon={FileText} />
            <StatCard label="Taux d'acceptation" value={dash.business.acceptanceRate != null ? `${dash.business.acceptanceRate} %` : "—"} icon={Percent} />
            <StatCard label="Interventions réalisées" value={dash.business.interventionsCompleted} icon={Wrench} />
            <StatCard label="Panier moyen HT" value={dash.business.averageBasketHT != null ? formatEuro(dash.business.averageBasketHT) : "—"} icon={ShoppingBasket} />
          </div>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Planning du jour" icon={Clock} actions={<Link href="/planning" className="text-xs text-primary hover:underline">Planning →</Link>}>
          <div className="flex flex-col gap-2">
            {todays.length === 0 && <Empty title="Aucune intervention planifiée aujourd'hui" />}
            {todays.map((i) => (
              <InterventionRow key={i.id} intervention={i} vehicle={i.vehicle} team={teamOf(i.team_id)} mechanicName={nameOf(i.mechanic_id)} canEdit={i.canEdit} showStart={isGarageWide(ctx.role) ? false : true} />
            ))}
          </div>
        </Section>
        <Section title="Relances devis" icon={BellRing}>
          {followUps.length === 0 ? (
            <Empty title="Aucune relance à prévoir" />
          ) : (
            <div className="flex flex-col gap-2">
              {followUps.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:border-primary/40">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {q.number} · {q.client ? `${q.client.first_name} ${q.client.last_name}` : "Client"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Envoyé le {fmtDate(q.sent_at)} · {formatEuro(q.totals.totalTTC)} TTC
                    </div>
                  </div>
                  <Pill tone="warning">Relance à prévoir</Pill>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
      {dash.late > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {dash.late} intervention(s) en retard sur le planning.
        </div>
      )}
    </div>
  );
}
