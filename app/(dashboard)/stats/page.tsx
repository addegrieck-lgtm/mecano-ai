"use client";

import { BarChart3, Clock, Euro, FileText, Gauge, Percent, ShoppingBasket, TrendingUp, Users, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useData, useServices } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, PageHeader, Section, StatCard } from "@/components/app/common";
import { can } from "@/lib/permissions";
import { formatEuro } from "@/lib/quotes/calc";
import { QUOTE_STATUS } from "@/lib/format";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 };

export default function StatsPage() {
  const s = useServices();
  const { data, loading, error } = useData(async (svc) => (can(svc.ctx, "stats:view") ? svc.insights.stats(6) : null));
  if (!can(s.ctx, "stats:view")) return <Empty title="Statistiques réservées à la direction et aux chefs d'équipe" icon={BarChart3} />;
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Erreur"} />;
  const k = data.kpis;
  const maxRevenue = Math.max(1, ...data.byTeam.map((t) => t.revenueHT));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Statistiques du garage" subtitle="6 derniers mois · calculées uniquement sur les données enregistrées" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="CA HT (devis acceptés)" value={formatEuro(k.revenueHT)} icon={Euro} tone="primary" />
        <StatCard label="Marge" value="—" hint="Information non disponible : coût d'achat des pièces non renseigné" icon={TrendingUp} />
        <StatCard label="Heures vendues" value={`${k.hoursSold} h`} icon={Clock} />
        <StatCard label="Heures travaillées" value={`${k.hoursWorked} h`} icon={Wrench} />
        <StatCard label="Taux d'occupation" value={k.occupancyRate != null ? `${k.occupancyRate} %` : "—"} hint={`Base : ${k.technicians} technicien(s) × 35 h/semaine`} icon={Gauge} />
        <StatCard label="Panier moyen HT" value={k.averageBasketHT != null ? formatEuro(k.averageBasketHT) : "—"} icon={ShoppingBasket} />
        <StatCard label="Taux d'acceptation" value={k.acceptanceRate != null ? `${k.acceptanceRate} %` : "—"} icon={Percent} />
        <StatCard label="Interventions réalisées" value={k.interventions} hint={`${k.diagnostics} diagnostic(s) · ${k.quotes} devis`} icon={FileText} />
      </div>

      <Section title="Chiffre d'affaires HT par mois" icon={Euro}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={(v: number) => `${Math.round(v)} €`} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} contentStyle={tooltipStyle} formatter={(v) => [formatEuro(Number(v)), "CA HT"]} />
              <Bar dataKey="revenueHT" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Mois</th>
              <th className="py-1 text-right">CA HT</th>
              <th className="py-1 text-right">Devis créés</th>
              <th className="py-1 text-right">Interventions</th>
              <th className="py-1 text-right">Heures</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map((m) => (
              <tr key={m.month} className="border-t border-border/40">
                <td className="py-1 capitalize">{m.label}</td>
                <td className="py-1 text-right tabular-nums">{formatEuro(m.revenueHT)}</td>
                <td className="py-1 text-right tabular-nums">{m.quotes}</td>
                <td className="py-1 text-right tabular-nums">{m.interventions}</td>
                <td className="py-1 text-right tabular-nums">{m.hoursWorked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Comparaison des équipes" icon={Users}>
        <p className="mb-3 text-xs text-muted-foreground">Vue collective par équipe — pas de classement individuel.</p>
        <div className="flex flex-col gap-3">
          {data.byTeam.map((t) => (
            <div key={t.team.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: t.team.color }} />
                <span className="font-semibold">{t.team.name}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Interventions</div>
                  <b>{t.interventions}</b>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Diagnostics</div>
                  <b>{t.diagnostics}</b>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Heures</div>
                  <b>{t.hours}</b>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">CA HT</div>
                  <b>{formatEuro(t.revenueHT)}</b>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" title={`CA HT : ${formatEuro(t.revenueHT)}`}>
                <div className="h-full rounded-full" style={{ width: `${(t.revenueHT / maxRevenue) * 100}%`, background: t.team.color }} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Devis par statut" icon={FileText}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {data.quoteStatus.map((q) => (
            <div key={q.status} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{QUOTE_STATUS[q.status].label}</div>
              <div className="text-xl font-semibold tabular-nums">{q.count}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
