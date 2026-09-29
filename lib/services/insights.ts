import { assertCan, canSeeIntervention } from "@/lib/permissions";
import type { TenantRepository } from "@/lib/data/repository";
import { causeLabel } from "@/data/causes";
import { computeTotals, formatEuro, roundCents } from "@/lib/quotes/calc";
import type { AuditLog, Intervention } from "@/types";

export type HistoryKind = "INTAKE" | "OBD" | "DIAGNOSTIC" | "TEST" | "RESULT" | "CONCLUSION" | "QUOTE" | "INTERVENTION" | "PHOTO" | "REVIEW";

export interface HistoryEvent {
  id: string;
  date: string;
  kind: HistoryKind;
  title: string;
  detail?: string;
  href?: string;
}

const dayKey = (iso: string) => iso.slice(0, 10);
const monthKey = (iso: string) => iso.slice(0, 7);

export function insightsService(r: TenantRepository) {
  const ctx = r.ctx;

  /**
   * Historique du véhicule — reconstruit à partir de toutes les données enregistrées
   * (toujours cohérent, aucun événement « oublié »). Ordre chronologique.
   */
  async function vehicleHistory(vehicleId: string): Promise<HistoryEvent[]> {
    await r.require("vehicles", vehicleId, "Véhicule");
    const [intakes, sessions, diagnostics, codes, tests, results, quotes, items, interventions, photos, reviews] = await Promise.all([
      r.list("vehicle_intakes", { vehicle_id: vehicleId }),
      r.list("obd_sessions", { vehicle_id: vehicleId }),
      r.list("diagnostics", { vehicle_id: vehicleId }),
      r.list("diagnostic_codes"),
      r.list("diagnostic_tests"),
      r.list("diagnostic_results"),
      r.list("quotes", { vehicle_id: vehicleId }),
      r.list("quote_items"),
      r.list("interventions", { vehicle_id: vehicleId }),
      r.list("photos", { vehicle_id: vehicleId }),
      r.list("reviews", { vehicle_id: vehicleId }),
    ]);
    const ev: HistoryEvent[] = [];
    for (const i of intakes) {
      ev.push({
        id: `intake-${i.id}`,
        date: i.created_at,
        kind: "INTAKE",
        title: "Réception véhicule",
        detail: [i.mileage != null ? `${i.mileage.toLocaleString("fr-FR")} km` : null, i.warning_lights.length ? `Voyants : ${i.warning_lights.join(", ")}` : null, i.client_validated_at ? "Validé par le client" : null]
          .filter(Boolean)
          .join(" · "),
      });
    }
    for (const s of sessions) {
      ev.push({
        id: `obd-${s.id}`,
        date: s.started_at,
        kind: "OBD",
        title: `Session OBD (${s.provider === "SIMULATOR" ? "simulateur" : "boîtier"})`,
        detail: [s.dtcs.length ? `Codes lus : ${s.dtcs.join(", ")}` : "Aucun code lu", s.cleared_dtcs ? "Codes effacés" : null].filter(Boolean).join(" · "),
      });
    }
    const diagIds = new Set(diagnostics.map((d) => d.id));
    for (const d of diagnostics) {
      const dc = codes.filter((c) => c.diagnostic_id === d.id).map((c) => c.code);
      ev.push({ id: `diag-${d.id}`, date: d.created_at, kind: "DIAGNOSTIC", title: "Diagnostic", detail: dc.length ? dc.join(", ") : d.symptoms.join(", ") || undefined, href: `/diagnostics/${d.id}` });
      if (d.conclusion) {
        ev.push({
          id: `concl-${d.id}`,
          date: d.updated_at,
          kind: "CONCLUSION",
          title: d.conclusion.confirmed_by_technician ? "Conclusion confirmée par le technicien" : "Conclusion à confirmer",
          detail: d.conclusion.cause_id ? `${causeLabel(d.conclusion.cause_id)} — ${d.conclusion.summary}` : d.conclusion.summary,
          href: `/diagnostics/${d.id}`,
        });
      }
    }
    for (const t of tests.filter((t) => diagIds.has(t.diagnostic_id))) {
      ev.push({ id: `test-${t.id}`, date: t.created_at, kind: "TEST", title: t.title, detail: `Réponse : ${t.answer === "YES" ? "Oui" : t.answer === "NO" ? "Non" : "Je ne sais pas"} — ${t.interpretation}`, href: `/diagnostics/${t.diagnostic_id}` });
    }
    for (const res of results.filter((x) => diagIds.has(x.diagnostic_id))) {
      ev.push({ id: `res-${res.id}`, date: res.created_at, kind: "RESULT", title: `Mesure : ${res.label}`, detail: `${res.value}${res.unit ? ` ${res.unit}` : ""}${res.notes ? ` — ${res.notes}` : ""}` });
    }
    for (const q of quotes) {
      const totals = computeTotals(items.filter((i) => i.quote_id === q.id), q.vat_rate);
      ev.push({ id: `quote-${q.id}`, date: q.created_at, kind: "QUOTE", title: `Devis ${q.number}`, detail: `${formatEuro(totals.totalTTC)} TTC${totals.missingPrices ? ` (${totals.missingPrices} prix à renseigner)` : ""}`, href: `/quotes/${q.id}` });
      if (q.accepted_at) ev.push({ id: `quote-acc-${q.id}`, date: q.accepted_at, kind: "QUOTE", title: `Devis ${q.number} accepté`, href: `/quotes/${q.id}` });
      if (q.refused_at) ev.push({ id: `quote-ref-${q.id}`, date: q.refused_at, kind: "QUOTE", title: `Devis ${q.number} refusé`, href: `/quotes/${q.id}` });
    }
    for (const i of interventions) {
      ev.push({ id: `int-${i.id}`, date: i.created_at, kind: "INTERVENTION", title: `Intervention planifiée : ${i.title}`, href: `/interventions/${i.id}` });
      if (i.started_at) ev.push({ id: `int-s-${i.id}`, date: i.started_at, kind: "INTERVENTION", title: `Intervention démarrée : ${i.title}`, href: `/interventions/${i.id}` });
      if (i.completed_at)
        ev.push({
          id: `int-c-${i.id}`,
          date: i.completed_at,
          kind: "INTERVENTION",
          title: `Réparation terminée : ${i.title}`,
          detail: i.parts.length ? `Pièces : ${i.parts.map((p) => `${p.name} ×${p.quantity}`).join(", ")}` : undefined,
          href: `/interventions/${i.id}`,
        });
    }
    for (const p of photos) ev.push({ id: `photo-${p.id}`, date: p.created_at, kind: "PHOTO", title: "Photo ajoutée", detail: p.caption ?? undefined });
    for (const rv of reviews) ev.push({ id: `rev-${rv.id}`, date: rv.created_at, kind: "REVIEW", title: `Avis client : ${"★".repeat(rv.rating)}${"☆".repeat(5 - rv.rating)}`, detail: rv.comment ?? undefined });
    return ev.sort((a, b) => a.date.localeCompare(b.date));
  }

  async function dashboard(today = new Date().toISOString().slice(0, 10)) {
    const [garage, interventions, diagnostics, quotes, items, intakes, teams, members, teamMembers] = await Promise.all([
      r.store.get("garages", r.garageId),
      r.list("interventions"),
      r.list("diagnostics"),
      r.list("quotes"),
      r.list("quote_items"),
      r.list("vehicle_intakes"),
      r.list("teams"),
      r.list("garage_members"),
      r.list("team_members"),
    ]);
    const visible = interventions.filter((i) => canSeeIntervention(ctx, i));
    const active = (i: Intervention) => i.status !== "COMPLETED" && i.status !== "CANCELLED";
    const plannedToday = visible.filter((i) => i.scheduled_at && dayKey(i.scheduled_at) === today && i.status !== "CANCELLED");
    const presentVehicles = new Set([
      ...intakes.filter((i) => dayKey(i.created_at) === today).map((i) => i.vehicle_id),
      ...visible.filter((i) => i.status === "IN_PROGRESS" || i.status === "WAITING_PART").map((i) => i.vehicle_id),
    ]);
    const diagnosticsOpen = diagnostics.filter((d) => d.status !== "CONCLUDED" && d.status !== "CLOSED");
    const completedToday = visible.filter((i) => i.completed_at && dayKey(i.completed_at) === today);

    const quoteTotal = (id: string, vat: number) => computeTotals(items.filter((i) => i.quote_id === id), vat);
    const month = today.slice(0, 7);
    const accepted = quotes.filter((q) => q.status === "ACCEPTED");
    const acceptedMonth = accepted.filter((q) => q.accepted_at && monthKey(q.accepted_at) === month);
    const revenueMonth = roundCents(acceptedMonth.reduce((s, q) => s + quoteTotal(q.id, q.vat_rate).totalHT, 0));
    const decided = quotes.filter((q) => q.status === "ACCEPTED" || q.status === "REFUSED" || q.status === "EXPIRED").length;

    const teamStats = teams.map((t) => ({
      team: t,
      members: teamMembers.filter((m) => m.team_id === t.id).length,
      activeInterventions: interventions.filter((i) => i.team_id === t.id && active(i)).length,
      activeDiagnostics: diagnosticsOpen.filter((d) => d.team_id === t.id).length,
    }));

    const now = Date.now();
    const late = visible.filter((i) => active(i) && i.scheduled_at && new Date(i.scheduled_at).getTime() + (i.planned_duration_minutes ?? 60) * 60000 < now);

    return {
      today: {
        planned: plannedToday.length,
        present: presentVehicles.size,
        diagnosticsInProgress: diagnosticsOpen.length,
        interventionsInProgress: visible.filter((i) => i.status === "IN_PROGRESS").length,
        completed: completedToday.length,
        quotesPending: quotes.filter((q) => q.status === "SENT").length,
      },
      workshop: {
        capacity: garage?.settings.workshop_capacity ?? 0,
        waiting: visible.filter((i) => i.status === "WAITING").length,
        inRepair: visible.filter((i) => i.status === "IN_PROGRESS").length,
        waitingPart: visible.filter((i) => i.status === "WAITING_PART").length,
        done: completedToday.length,
        occupied: new Set(visible.filter((i) => i.status === "IN_PROGRESS" || i.status === "WAITING_PART").map((i) => i.vehicle_id)).size,
      },
      business: {
        revenueMonthHT: revenueMonth,
        quotesCount: quotes.length,
        acceptanceRate: decided ? Math.round((accepted.length / decided) * 100) : null,
        interventionsCompleted: interventions.filter((i) => i.status === "COMPLETED").length,
        averageBasketHT: acceptedMonth.length ? roundCents(revenueMonth / acceptedMonth.length) : null,
      },
      teams: teamStats,
      late: late.length,
      waitingPart: visible.filter((i) => i.status === "WAITING_PART").length,
      mechanics: members.filter((m) => m.role === "MECHANIC" || m.role === "TEAM_MANAGER").length,
      plannedToday,
    };
  }

  /** Statistiques du patron (rentabilité). Aucune donnée inventée : les indicateurs non calculables sont signalés. */
  async function stats(monthsBack = 6) {
    assertCan(ctx, "stats:view");
    const [quotes, items, interventions, diagnostics, teams, members] = await Promise.all([
      r.list("quotes"),
      r.list("quote_items"),
      r.list("interventions"),
      r.list("diagnostics"),
      r.list("teams"),
      r.list("garage_members"),
    ]);
    const totals = new Map(quotes.map((q) => [q.id, computeTotals(items.filter((i) => i.quote_id === q.id), q.vat_rate)]));
    const accepted = quotes.filter((q) => q.status === "ACCEPTED");
    const now = new Date();
    const months: string[] = [];
    for (let k = monthsBack - 1; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const monthly = months.map((m) => {
      const acc = accepted.filter((q) => q.accepted_at && monthKey(q.accepted_at) === m);
      const done = interventions.filter((i) => i.completed_at && monthKey(i.completed_at) === m);
      return {
        month: m,
        label: new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" }),
        revenueHT: roundCents(acc.reduce((s, q) => s + (totals.get(q.id)?.totalHT ?? 0), 0)),
        quotes: quotes.filter((q) => monthKey(q.created_at) === m).length,
        interventions: done.length,
        hoursWorked: roundCents(done.reduce((s, i) => s + (i.actual_duration_minutes ?? 0), 0) / 60),
      };
    });
    const revenueHT = roundCents(accepted.reduce((s, q) => s + (totals.get(q.id)?.totalHT ?? 0), 0));
    const hoursSold = roundCents(accepted.reduce((s, q) => s + (totals.get(q.id)?.laborHours ?? 0), 0));
    const completed = interventions.filter((i) => i.status === "COMPLETED");
    const hoursWorked = roundCents(completed.reduce((s, i) => s + (i.actual_duration_minutes ?? 0), 0) / 60);
    const decided = quotes.filter((q) => ["ACCEPTED", "REFUSED", "EXPIRED"].includes(q.status)).length;
    const technicians = members.filter((m) => m.role === "MECHANIC" || m.role === "TEAM_MANAGER").length;
    // capacité théorique sur la période : techniciens × 35 h × semaines (hypothèse affichée dans l'UI)
    const weeks = (monthsBack * 52) / 12;
    const capacityHours = technicians * 35 * weeks;

    const byTeam = teams.map((t) => {
      const tInt = completed.filter((i) => i.team_id === t.id);
      return {
        team: t,
        interventions: tInt.length,
        diagnostics: diagnostics.filter((d) => d.team_id === t.id).length,
        hours: roundCents(tInt.reduce((s, i) => s + (i.actual_duration_minutes ?? 0), 0) / 60),
        revenueHT: roundCents(accepted.filter((q) => q.team_id === t.id).reduce((s, q) => s + (totals.get(q.id)?.totalHT ?? 0), 0)),
      };
    });

    return {
      monthly,
      kpis: {
        revenueHT,
        margin: null as number | null, // coût d'achat des pièces non renseigné → non calculable
        hoursSold,
        hoursWorked,
        occupancyRate: capacityHours > 0 ? Math.round((hoursWorked / capacityHours) * 1000) / 10 : null,
        averageBasketHT: accepted.length ? roundCents(revenueHT / accepted.length) : null,
        acceptanceRate: decided ? Math.round((accepted.length / decided) * 100) : null,
        quotes: quotes.length,
        interventions: completed.length,
        diagnostics: diagnostics.length,
        technicians,
      },
      byTeam,
      quoteStatus: (["DRAFT", "SENT", "ACCEPTED", "REFUSED", "EXPIRED"] as const).map((s) => ({ status: s, count: quotes.filter((q) => q.status === s).length })),
    };
  }

  async function auditLogs(limit = 200): Promise<AuditLog[]> {
    assertCan(ctx, "audit:view");
    return (await r.list("audit_logs")).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  return { vehicleHistory, dashboard, stats, auditLogs };
}
