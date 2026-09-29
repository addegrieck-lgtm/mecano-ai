import { assertCan, can, canEditIntervention, canSeeIntervention, PermissionError } from "@/lib/permissions";
import { nowIso, type TenantRepository } from "@/lib/data/repository";
import { causeLabel } from "@/data/causes";
import { computeTotals, type QuoteTotals } from "@/lib/quotes/calc";
import { suggestQuoteLines } from "@/lib/quotes/suggest";
import { interventionSchema, parse, quoteCreateSchema, quoteItemSchema, reviewSchema } from "@/lib/validation/schemas";
import type { Client, Intervention, InterventionPart, InterventionStatus, Quote, QuoteItem, QuoteStatus, Review, Vehicle } from "@/types";
import { audit } from "./core";

export interface QuoteView extends Quote {
  items: QuoteItem[];
  totals: QuoteTotals;
  vehicle: Vehicle | null;
  client: Client | null;
  needsFollowUp: boolean;
}

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

export function workService(r: TenantRepository) {
  const ctx = r.ctx;

  async function garageSettings() {
    const g = await r.store.get("garages", r.garageId);
    if (!g) throw new Error("Garage introuvable");
    return g.settings;
  }

  // ======================= DEVIS =======================
  async function nextQuoteNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const re = new RegExp(`^D-${year}-(\\d+)$`);
    const max = Math.max(0, ...(await r.list("quotes")).map((q) => Number(re.exec(q.number)?.[1] ?? 0)));
    return `D-${year}-${String(max + 1).padStart(4, "0")}`;
  }

  async function view(q: Quote, vehicles?: Vehicle[], clients?: Client[], allItems?: QuoteItem[]): Promise<QuoteView> {
    const items = (allItems ? allItems.filter((i) => i.quote_id === q.id) : await r.list("quote_items", { quote_id: q.id })).sort((a, b) => a.position - b.position);
    const vehicle = vehicles ? (vehicles.find((v) => v.id === q.vehicle_id) ?? null) : await r.find("vehicles", q.vehicle_id);
    const client = clients ? (clients.find((c) => c.id === q.client_id) ?? null) : await r.find("clients", q.client_id);
    const needsFollowUp = q.status === "SENT" && !!q.follow_up_at && q.follow_up_at <= nowIso();
    return { ...q, items, totals: computeTotals(items, q.vat_rate), vehicle, client, needsFollowUp };
  }

  /** Passe en EXPIRED les devis envoyés dont la validité est dépassée. */
  async function refreshExpired() {
    const now = nowIso();
    for (const q of await r.list("quotes", { status: "SENT" })) {
      if (q.valid_until && q.valid_until < now) await r.update("quotes", q.id, { status: "EXPIRED", updated_at: now });
    }
  }

  async function quotes(filter: { status?: QuoteStatus; vehicle_id?: string; client_id?: string } = {}): Promise<QuoteView[]> {
    assertCan(ctx, "quotes:read");
    if (can(ctx, "quotes:write")) await refreshExpired();
    const [list, vehicles, clients, items] = await Promise.all([r.list("quotes", filter), r.list("vehicles"), r.list("clients"), r.list("quote_items")]);
    const out = await Promise.all(list.map((q) => view(q, vehicles, clients, items)));
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function quote(id: string): Promise<QuoteView> {
    assertCan(ctx, "quotes:read");
    return view(await r.require("quotes", id, "Devis"));
  }

  async function insertItems(quoteId: string, items: unknown[]) {
    let position = 0;
    for (const raw of items) {
      const it = parse(quoteItemSchema, raw);
      await r.insert("quote_items", { ...it, unit_price: it.unit_price ?? null, quote_id: quoteId, position: position++ });
    }
  }

  async function createQuote(input: unknown): Promise<Quote> {
    assertCan(ctx, "quotes:write");
    const data = parse(quoteCreateSchema, input);
    const vehicle = await r.require("vehicles", data.vehicle_id, "Véhicule");
    if (data.diagnostic_id) await r.require("diagnostics", data.diagnostic_id, "Diagnostic");
    if (data.team_id) await r.require("teams", data.team_id, "Équipe");
    if (data.mechanic_id && !(await r.list("garage_members", { user_id: data.mechanic_id })).length) throw new Error("Mécanicien inconnu");
    const settings = await garageSettings();
    const now = nowIso();
    const q = await r.insert("quotes", {
      number: await nextQuoteNumber(),
      client_id: data.client_id ?? vehicle.client_id ?? null,
      vehicle_id: vehicle.id,
      team_id: data.team_id ?? ctx.teamIds[0] ?? null,
      mechanic_id: data.mechanic_id ?? (ctx.role === "MECHANIC" ? ctx.userId : null),
      diagnostic_id: data.diagnostic_id,
      status: "DRAFT",
      vat_rate: settings.vat_rate,
      notes: data.notes,
      sent_at: null,
      accepted_at: null,
      refused_at: null,
      valid_until: null,
      follow_up_at: null,
      created_by: ctx.userId,
      updated_at: now,
    });
    await insertItems(q.id, data.items);
    await audit(r, "quote.create", "quote", q.id, { number: q.number, diagnostic_id: data.diagnostic_id });
    return q;
  }

  /** Pré-remplit un devis depuis la conclusion d'un diagnostic (sans inventer de prix). */
  async function createQuoteFromDiagnostic(diagnosticId: string): Promise<Quote> {
    const d = await r.require("diagnostics", diagnosticId, "Diagnostic");
    const [catalog, parts, settings] = await Promise.all([r.list("price_catalog"), r.list("parts"), garageSettings()]);
    const lines = suggestQuoteLines({
      causeId: d.conclusion?.cause_id ?? null,
      recommendedRepair: d.conclusion?.recommended_repair,
      catalog,
      parts,
      laborHourlyRate: settings.labor_hourly_rate,
    });
    return createQuote({
      vehicle_id: d.vehicle_id,
      client_id: d.client_id,
      team_id: d.team_id,
      mechanic_id: d.user_id,
      diagnostic_id: d.id,
      notes: d.conclusion ? `Suite au diagnostic : ${d.conclusion.summary}` : null,
      items: lines.map(({ kind, label, reference, quantity, unit_price }) => ({ kind, label, reference, quantity, unit_price })),
    });
  }

  async function updateQuote(id: string, patch: { notes?: string | null; items?: unknown[]; team_id?: string | null; mechanic_id?: string | null }) {
    assertCan(ctx, "quotes:write");
    const q = await r.require("quotes", id, "Devis");
    if (q.status === "ACCEPTED" || q.status === "REFUSED") throw new Error("Un devis accepté ou refusé n'est plus modifiable");
    if (patch.items) {
      const parsed = patch.items.map((i) => parse(quoteItemSchema, i)); // valide tout avant d'écrire
      for (const it of await r.list("quote_items", { quote_id: id })) await r.remove("quote_items", it.id);
      await insertItems(id, parsed);
    }
    if (patch.team_id) await r.require("teams", patch.team_id, "Équipe");
    const updated = await r.update("quotes", id, {
      ...(patch.notes !== undefined ? { notes: patch.notes?.slice(0, 2000) ?? null } : {}),
      ...(patch.team_id !== undefined ? { team_id: patch.team_id } : {}),
      ...(patch.mechanic_id !== undefined ? { mechanic_id: patch.mechanic_id } : {}),
      updated_at: nowIso(),
    });
    await audit(r, "quote.update", "quote", id);
    return updated;
  }

  const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
    DRAFT: ["SENT", "ACCEPTED", "REFUSED"],
    SENT: ["ACCEPTED", "REFUSED", "EXPIRED", "DRAFT"],
    ACCEPTED: [],
    REFUSED: ["DRAFT"],
    EXPIRED: ["DRAFT", "SENT"],
  };

  async function setQuoteStatus(id: string, status: QuoteStatus): Promise<Quote> {
    assertCan(ctx, "quotes:write");
    if (status === "ACCEPTED" || status === "REFUSED") assertCan(ctx, "quotes:approve");
    const q = await r.require("quotes", id, "Devis");
    if (!TRANSITIONS[q.status].includes(status)) throw new Error(`Transition impossible : ${q.status} → ${status}`);
    if (status === "SENT" || status === "ACCEPTED") {
      const items = await r.list("quote_items", { quote_id: id });
      if (!items.length) throw new Error("Le devis ne contient aucune ligne");
      if (computeTotals(items, q.vat_rate).missingPrices > 0) throw new Error("Certaines lignes n'ont pas de prix : « Prix à renseigner »");
    }
    const settings = await garageSettings();
    const now = nowIso();
    const patch: Partial<Quote> = { status, updated_at: now };
    if (status === "SENT") {
      patch.sent_at = now;
      patch.valid_until = addDays(now, settings.quote_validity_days);
      patch.follow_up_at = addDays(now, settings.quote_follow_up_days);
    }
    if (status === "ACCEPTED") patch.accepted_at = now;
    if (status === "REFUSED") patch.refused_at = now;
    const updated = await r.update("quotes", id, patch);
    await audit(r, `quote.${status.toLowerCase()}`, "quote", id, { from: q.status, to: status });
    return updated;
  }

  /** Relance : aucun SMS payant. Journalise la relance et reprogramme la suivante. */
  async function markFollowedUp(id: string, channel: "EMAIL_DEMO" | "PHONE" | "OTHER" = "OTHER") {
    assertCan(ctx, "quotes:write");
    const q = await r.require("quotes", id, "Devis");
    const settings = await garageSettings();
    await r.update("quotes", id, { follow_up_at: addDays(nowIso(), settings.quote_follow_up_days), updated_at: nowIso() });
    await audit(r, "quote.follow_up", "quote", id, { channel, number: q.number });
  }

  async function deleteQuote(id: string) {
    assertCan(ctx, "quotes:write");
    const q = await r.require("quotes", id, "Devis");
    if (q.status !== "DRAFT") throw new Error("Seul un brouillon peut être supprimé");
    for (const it of await r.list("quote_items", { quote_id: id })) await r.remove("quote_items", it.id);
    await r.remove("quotes", id);
    await audit(r, "quote.delete", "quote", id);
  }

  // ======================= INTERVENTIONS =======================
  async function validateAssignment(team_id: string | null | undefined, mechanic_id: string | null | undefined, previous?: Intervention) {
    if (team_id) await r.require("teams", team_id, "Équipe");
    if (mechanic_id && !(await r.list("garage_members", { user_id: mechanic_id })).length) throw new Error("Mécanicien inconnu dans ce garage");
    const changed = !previous || previous.team_id !== (team_id ?? null) || previous.mechanic_id !== (mechanic_id ?? null);
    const selfOnly = (!mechanic_id || mechanic_id === ctx.userId) && (!team_id || ctx.teamIds.includes(team_id));
    if (changed && !(team_id == null && mechanic_id == null) && !selfOnly) assertCan(ctx, "interventions:assign");
    if (changed && ctx.role === "TEAM_MANAGER" && team_id && !ctx.managedTeamIds.includes(team_id) && !ctx.teamIds.includes(team_id)) {
      throw new PermissionError("Un chef d'équipe ne peut affecter qu'à son équipe");
    }
  }

  async function interventions(filter: { status?: InterventionStatus; team_id?: string; mechanic_id?: string; vehicle_id?: string; date?: string } = {}) {
    assertCan(ctx, "interventions:read");
    const { date, ...rest } = filter;
    const [list, vehicles, clients] = await Promise.all([r.list("interventions", rest), r.list("vehicles"), r.list("clients")]);
    return list
      .filter((i) => canSeeIntervention(ctx, i))
      .filter((i) => !date || (i.scheduled_at ?? "").slice(0, 10) === date)
      .map((i) => ({
        ...i,
        vehicle: vehicles.find((v) => v.id === i.vehicle_id) ?? null,
        client: clients.find((c) => c.id === i.client_id) ?? null,
        canEdit: canEditIntervention(ctx, i),
      }))
      .sort((a, b) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at));
  }

  async function intervention(id: string) {
    assertCan(ctx, "interventions:read");
    const i = await r.require("interventions", id, "Intervention");
    if (!canSeeIntervention(ctx, i)) throw new PermissionError("Intervention non accessible");
    const [vehicle, client, quote_, diagnostic, review] = await Promise.all([
      r.find("vehicles", i.vehicle_id),
      r.find("clients", i.client_id),
      i.quote_id ? view(await r.require("quotes", i.quote_id)) : Promise.resolve(null),
      r.find("diagnostics", i.diagnostic_id),
      r.list("reviews", { intervention_id: id }).then((l) => l[0] ?? null),
    ]);
    return { intervention: i, vehicle, client, quote: quote_, diagnostic, review, canEdit: canEditIntervention(ctx, i) };
  }

  async function createIntervention(input: unknown): Promise<Intervention> {
    assertCan(ctx, "interventions:write");
    const data = parse(interventionSchema, input);
    const vehicle = await r.require("vehicles", data.vehicle_id, "Véhicule");
    const mechanic_id = data.mechanic_id ?? (ctx.role === "MECHANIC" ? ctx.userId : null);
    await validateAssignment(data.team_id, mechanic_id);
    if (data.quote_id) await r.require("quotes", data.quote_id, "Devis");
    if (data.diagnostic_id) await r.require("diagnostics", data.diagnostic_id, "Diagnostic");
    const now = nowIso();
    const i = await r.insert("interventions", {
      vehicle_id: vehicle.id,
      client_id: vehicle.client_id ?? null,
      team_id: data.team_id,
      mechanic_id,
      title: data.title,
      description: data.description,
      status: data.status ?? "WAITING",
      scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString() : null,
      planned_duration_minutes: data.planned_duration_minutes ?? null,
      actual_duration_minutes: null,
      started_at: null,
      completed_at: null,
      parts: [],
      diagnostic_id: data.diagnostic_id,
      quote_id: data.quote_id,
      created_by: ctx.userId,
      updated_at: now,
    });
    await audit(r, "intervention.create", "intervention", i.id, { vehicle_id: vehicle.id, team_id: data.team_id, mechanic_id });
    return i;
  }

  async function createInterventionFromQuote(quoteId: string, extra: { team_id?: string | null; mechanic_id?: string | null; scheduled_at?: string | null } = {}) {
    const q = await view(await r.require("quotes", quoteId, "Devis"));
    const diagnostic = await r.find("diagnostics", q.diagnostic_id);
    const partsLines: InterventionPart[] = [];
    const garageParts = await r.list("parts");
    for (const it of q.items.filter((x) => x.kind === "PART")) {
      const p = garageParts.find((gp) => it.reference && gp.reference === it.reference);
      partsLines.push({ part_id: p?.id ?? null, name: it.label, reference: it.reference ?? null, quantity: it.quantity });
    }
    const repair = q.items.find((x) => x.kind === "LABOR" || x.kind === "SERVICE");
    const title = diagnostic?.conclusion?.recommended_repair || (diagnostic?.conclusion?.cause_id ? causeLabel(diagnostic.conclusion.cause_id) : null) || repair?.label || `Travaux devis ${q.number}`;
    const i = await createIntervention({
      vehicle_id: q.vehicle_id,
      title: title.replace(/^Main-d'œuvre — /, ""),
      description: q.items.map((x) => `• ${x.label} ×${x.quantity}`).join("\n"),
      team_id: extra.team_id ?? q.team_id,
      mechanic_id: extra.mechanic_id ?? q.mechanic_id,
      scheduled_at: extra.scheduled_at ?? null,
      planned_duration_minutes: q.totals.laborHours ? Math.round(q.totals.laborHours * 60) : null,
      diagnostic_id: q.diagnostic_id,
      quote_id: q.id,
    });
    return r.update("interventions", i.id, { parts: partsLines });
  }

  async function requireEditable(id: string) {
    const i = await r.require("interventions", id, "Intervention");
    if (!canEditIntervention(ctx, i)) throw new PermissionError("Vous ne pouvez pas modifier cette intervention");
    return i;
  }

  async function updateIntervention(id: string, input: unknown) {
    const current = await requireEditable(id);
    const data = parse(interventionSchema.partial().extend({ vehicle_id: interventionSchema.shape.vehicle_id.optional() }), input);
    const team_id = data.team_id !== undefined ? data.team_id : current.team_id;
    const mechanic_id = data.mechanic_id !== undefined ? data.mechanic_id : current.mechanic_id;
    await validateAssignment(team_id, mechanic_id, current);
    const patch: Partial<Intervention> = { updated_at: nowIso(), team_id, mechanic_id };
    if (data.title) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.scheduled_at !== undefined) patch.scheduled_at = data.scheduled_at ? new Date(data.scheduled_at).toISOString() : null;
    if (data.planned_duration_minutes !== undefined) patch.planned_duration_minutes = data.planned_duration_minutes;
    const updated = await r.update("interventions", id, patch);
    await audit(r, "intervention.update", "intervention", id, { team_id, mechanic_id });
    return updated;
  }

  async function setInterventionParts(id: string, parts: InterventionPart[]) {
    await requireEditable(id);
    const clean = parts.slice(0, 100).map((p) => ({
      part_id: p.part_id ?? null,
      name: String(p.name).slice(0, 150),
      reference: p.reference ? String(p.reference).slice(0, 80) : null,
      quantity: Math.max(1, Math.min(1000, Number(p.quantity) || 1)),
    }));
    await r.update("interventions", id, { parts: clean, updated_at: nowIso() });
    await audit(r, "intervention.update", "intervention", id, { parts: clean.length });
  }

  async function setInterventionStatus(id: string, status: InterventionStatus, opts: { actual_duration_minutes?: number | null } = {}) {
    const i = await requireEditable(id);
    if (i.status === "COMPLETED" && status !== "COMPLETED") assertCan(ctx, "interventions:assign");
    const now = nowIso();
    const patch: Partial<Intervention> = { status, updated_at: now };
    if (status === "IN_PROGRESS" && !i.started_at) patch.started_at = now;
    if (status === "COMPLETED") {
      patch.completed_at = now;
      const started = i.started_at ?? now;
      patch.actual_duration_minutes = opts.actual_duration_minutes ?? Math.max(1, Math.round((Date.now() - new Date(started).getTime()) / 60000));
      // décrément du stock pour les pièces du catalogue garage
      for (const p of i.parts) {
        if (!p.part_id) continue;
        const part = await r.find("parts", p.part_id);
        if (part) await r.update("parts", part.id, { stock: Math.max(0, part.stock - p.quantity) });
      }
    }
    const updated = await r.update("interventions", id, patch);
    await audit(r, "intervention.status", "intervention", id, { from: i.status, to: status });
    return updated;
  }

  async function deleteIntervention(id: string) {
    assertCan(ctx, "interventions:delete");
    await r.require("interventions", id);
    await r.remove("interventions", id);
    await audit(r, "intervention.delete", "intervention", id);
  }

  // ======================= AVIS CLIENT =======================
  async function addReview(input: unknown): Promise<Review> {
    const data = parse(reviewSchema, input);
    const i = await r.require("interventions", data.intervention_id, "Intervention");
    if (i.status !== "COMPLETED") throw new Error("L'intervention doit être terminée");
    if ((await r.list("reviews", { intervention_id: i.id })).length) throw new Error("Un avis existe déjà pour cette intervention");
    const rev = await r.insert("reviews", { intervention_id: i.id, vehicle_id: i.vehicle_id, client_id: i.client_id ?? null, rating: data.rating, comment: data.comment });
    await audit(r, "review.create", "review", rev.id, { rating: data.rating });
    return rev;
  }

  async function reviews(): Promise<Review[]> {
    return (await r.list("reviews")).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  return {
    quotes,
    quote,
    createQuote,
    createQuoteFromDiagnostic,
    updateQuote,
    setQuoteStatus,
    markFollowedUp,
    deleteQuote,
    interventions,
    intervention,
    createIntervention,
    createInterventionFromQuote,
    updateIntervention,
    setInterventionParts,
    setInterventionStatus,
    deleteIntervention,
    addReview,
    reviews,
  };
}
