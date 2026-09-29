import { assertCan, can, isGarageWide, PermissionError } from "@/lib/permissions";
import { nowIso, type TenantRepository } from "@/lib/data/repository";
import { describeDtc, evaluate, getRule, normalizeDtc, outcomeFor, recordAnswer } from "@/lib/diagnostics/engine";
import type { Evaluation, TestAnswerRecord } from "@/lib/diagnostics/types";
import { diagnosticCreateSchema, diagnosticResultSchema, dtcSchema, parse } from "@/lib/validation/schemas";
import type {
  Client,
  Diagnostic,
  DiagnosticCode,
  DiagnosticConclusion,
  DiagnosticLiveData,
  DiagnosticResult,
  DiagnosticTestRecord,
  ObdSession,
  TestAnswer,
  Vehicle,
  VehicleLiveData,
} from "@/types";
import { audit } from "./core";

export interface DiagnosticFull {
  diagnostic: Diagnostic;
  vehicle: Vehicle;
  client: Client | null;
  codes: DiagnosticCode[];
  tests: DiagnosticTestRecord[];
  results: DiagnosticResult[];
  liveData: DiagnosticLiveData[];
  evaluation: Evaluation;
  canEdit: boolean;
}

export function diagnosticsService(r: TenantRepository) {
  const ctx = r.ctx;

  function canSee(d: Diagnostic): boolean {
    if (isGarageWide(ctx.role)) return true;
    if (d.user_id === ctx.userId) return true;
    return !!d.team_id && (ctx.teamIds.includes(d.team_id) || ctx.managedTeamIds.includes(d.team_id));
  }

  function canEdit(d: Diagnostic): boolean {
    if (!can(ctx, "diagnostics:write")) return false;
    if (ctx.role === "OWNER" || ctx.role === "ADMIN") return true;
    return canSee(d);
  }

  async function requireEditable(id: string): Promise<Diagnostic> {
    const d = await r.require("diagnostics", id, "Diagnostic");
    if (!canEdit(d)) throw new PermissionError("Vous ne pouvez pas modifier ce diagnostic");
    return d;
  }

  async function list(filter: { vehicle_id?: string } = {}): Promise<(Diagnostic & { vehicle: Vehicle | null; codes: string[] })[]> {
    assertCan(ctx, "diagnostics:read");
    const [diags, vehicles, codes] = await Promise.all([r.list("diagnostics", filter), r.list("vehicles"), r.list("diagnostic_codes")]);
    return diags
      .filter(canSee)
      .map((d) => ({ ...d, vehicle: vehicles.find((v) => v.id === d.vehicle_id) ?? null, codes: codes.filter((c) => c.diagnostic_id === d.id).map((c) => c.code) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function create(input: unknown): Promise<Diagnostic> {
    assertCan(ctx, "diagnostics:write");
    const data = parse(diagnosticCreateSchema, input);
    const vehicle = await r.require("vehicles", data.vehicle_id, "Véhicule");
    const team_id = data.team_id ?? ctx.teamIds[0] ?? null;
    if (team_id) await r.require("teams", team_id, "Équipe");
    const now = nowIso();
    const d = await r.insert("diagnostics", {
      vehicle_id: vehicle.id,
      client_id: vehicle.client_id ?? null,
      user_id: ctx.userId,
      team_id,
      status: "OPEN",
      symptoms: data.symptoms,
      complaint: data.complaint,
      mileage: data.mileage ?? vehicle.mileage ?? null,
      ai_analysis: null,
      ai_provider: null,
      conclusion: null,
      obd_session_id: data.obd_session_id,
      updated_at: now,
    });
    for (const code of new Set(data.codes)) {
      await r.insert("diagnostic_codes", { diagnostic_id: d.id, code, description: describeDtc(code), source: data.obd_session_id ? "OBD" : "MANUAL" });
    }
    if (data.obd_session_id) {
      const session = await r.require("obd_sessions", data.obd_session_id, "Session OBD");
      await r.update("obd_sessions", session.id, { diagnostic_id: d.id, vehicle_id: vehicle.id });
      const last = session.live_data.at(-1);
      if (last) await r.insert("diagnostic_live_data", { diagnostic_id: d.id, obd_session_id: session.id, data: last, captured_at: now });
    }
    if (data.mileage != null && (vehicle.mileage == null || data.mileage > vehicle.mileage)) {
      await r.update("vehicles", vehicle.id, { mileage: data.mileage, updated_at: now });
    }
    await audit(r, "diagnostic.create", "diagnostic", d.id, { vehicle_id: vehicle.id, codes: data.codes });
    return d;
  }

  async function answersOf(diagnosticId: string): Promise<DiagnosticTestRecord[]> {
    return (await r.list("diagnostic_tests", { diagnostic_id: diagnosticId })).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async function get(id: string): Promise<DiagnosticFull> {
    assertCan(ctx, "diagnostics:read");
    const diagnostic = await r.require("diagnostics", id, "Diagnostic");
    if (!canSee(diagnostic)) throw new PermissionError("Diagnostic non accessible");
    const vehicle = await r.require("vehicles", diagnostic.vehicle_id, "Véhicule");
    const [client, codes, tests, results, liveData] = await Promise.all([
      r.find("clients", vehicle.client_id),
      r.list("diagnostic_codes", { diagnostic_id: id }),
      answersOf(id),
      r.list("diagnostic_results", { diagnostic_id: id }),
      r.list("diagnostic_live_data", { diagnostic_id: id }),
    ]);
    const answers: TestAnswerRecord[] = tests.map((t) => ({ dtc: t.dtc, stepId: t.step_id, answer: t.answer }));
    const evaluation = evaluate(
      codes.map((c) => c.code),
      answers,
      { fuel: vehicle.fuel, symptoms: diagnostic.symptoms },
    );
    return {
      diagnostic,
      vehicle,
      client,
      codes: codes.sort((a, b) => a.code.localeCompare(b.code)),
      tests,
      results: results.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      liveData: liveData.sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
      evaluation,
      canEdit: canEdit(diagnostic),
    };
  }

  async function touch(id: string, patch: Partial<Diagnostic> = {}) {
    return r.update("diagnostics", id, { ...patch, updated_at: nowIso() });
  }

  async function update(id: string, patch: { symptoms?: string[]; complaint?: string | null; team_id?: string | null }) {
    await requireEditable(id);
    if (patch.team_id) await r.require("teams", patch.team_id, "Équipe");
    const d = await touch(id, patch);
    await audit(r, "diagnostic.update", "diagnostic", id, { fields: Object.keys(patch) });
    return d;
  }

  async function addCode(id: string, rawCode: string, source: "OBD" | "MANUAL" = "MANUAL") {
    await requireEditable(id);
    const code = parse(dtcSchema, rawCode);
    const existing = await r.list("diagnostic_codes", { diagnostic_id: id, code });
    if (existing.length) return existing[0];
    const c = await r.insert("diagnostic_codes", { diagnostic_id: id, code, description: describeDtc(code), source });
    await touch(id);
    await audit(r, "diagnostic.update", "diagnostic", id, { add_code: code });
    return c;
  }

  async function removeCode(id: string, codeId: string) {
    await requireEditable(id);
    const c = await r.require("diagnostic_codes", codeId, "Code");
    if (c.diagnostic_id !== id) throw new PermissionError();
    await r.remove("diagnostic_codes", codeId);
    // réponses associées devenues sans objet
    for (const t of await r.list("diagnostic_tests", { diagnostic_id: id, dtc: c.code })) await r.remove("diagnostic_tests", t.id);
    await touch(id);
    await audit(r, "diagnostic.update", "diagnostic", id, { remove_code: c.code });
  }

  /** Enregistre la réponse à une étape du diagnostic guidé. Le parcours est recalculé par le moteur de règles. */
  async function recordTest(id: string, input: { dtc: string; stepId: string; answer: TestAnswer; notes?: string | null }) {
    const d = await requireEditable(id);
    const dtc = normalizeDtc(input.dtc);
    const rule = getRule(dtc);
    const test = rule?.tests.find((t) => t.id === input.stepId);
    if (!rule || !test) throw new Error("Étape de diagnostic inconnue");
    if (!(await r.list("diagnostic_codes", { diagnostic_id: id, code: dtc })).length) throw new Error("Code absent de ce diagnostic");
    if (!["YES", "NO", "UNKNOWN"].includes(input.answer)) throw new Error("Réponse invalide");

    const existing = await answersOf(id);
    const records = existing.map((t) => ({ dtc: t.dtc, stepId: t.step_id, answer: t.answer }));
    const next = recordAnswer(records, { dtc, stepId: test.id, answer: input.answer });
    // supprime les réponses remplacées ou devenues hors parcours
    for (const t of existing) {
      const kept = next.find((n) => n.dtc === t.dtc && n.stepId === t.step_id && n.answer === t.answer);
      if (!kept || (t.dtc === dtc && t.step_id === test.id)) await r.remove("diagnostic_tests", t.id);
    }
    const outcome = outcomeFor(test, input.answer);
    const rec = await r.insert("diagnostic_tests", {
      diagnostic_id: id,
      dtc,
      step_id: test.id,
      title: test.title,
      question: test.question,
      answer: input.answer,
      interpretation: outcome.interpretation,
      notes: input.notes?.slice(0, 1000) ?? null,
      user_id: ctx.userId,
    });
    if (d.status === "OPEN" || d.status === "ANALYSIS") await touch(id, { status: "TESTING" });
    else await touch(id);
    await audit(r, "diagnostic.test", "diagnostic", id, { dtc, step: test.id, answer: input.answer });
    return rec;
  }

  async function resetTests(id: string, dtc: string) {
    await requireEditable(id);
    for (const t of await r.list("diagnostic_tests", { diagnostic_id: id, dtc: normalizeDtc(dtc) })) await r.remove("diagnostic_tests", t.id);
    await touch(id);
  }

  async function addResult(id: string, input: unknown): Promise<DiagnosticResult> {
    await requireEditable(id);
    const data = parse(diagnosticResultSchema, input);
    const res = await r.insert("diagnostic_results", { ...data, diagnostic_id: id, user_id: ctx.userId });
    await touch(id);
    await audit(r, "diagnostic.result", "diagnostic", id, { label: data.label });
    return res;
  }

  async function removeResult(id: string, resultId: string) {
    await requireEditable(id);
    const res = await r.require("diagnostic_results", resultId);
    if (res.diagnostic_id !== id) throw new PermissionError();
    await r.remove("diagnostic_results", resultId);
  }

  async function addLiveData(id: string, data: VehicleLiveData, obdSessionId?: string | null) {
    await requireEditable(id);
    return r.insert("diagnostic_live_data", { diagnostic_id: id, obd_session_id: obdSessionId ?? null, data, captured_at: nowIso() });
  }

  async function saveAnalysis(id: string, analysis: unknown, provider: string) {
    const d = await requireEditable(id);
    const updated = await touch(id, { ai_analysis: analysis, ai_provider: provider, status: d.status === "OPEN" ? "ANALYSIS" : d.status });
    await audit(r, "diagnostic.analysis", "diagnostic", id, { provider });
    return updated;
  }

  async function conclude(id: string, conclusion: DiagnosticConclusion) {
    await requireEditable(id);
    let summary = String(conclusion.summary ?? "").trim().slice(0, 3000);
    if (conclusion.confirmed_by_technician) summary = summary.replace(/^Conclusion à confirmer\s*:\s*/i, "Conclusion confirmée par le technicien : ").replace(/\s*Validation par le technicien requise avant réparation\.?$/i, "");
    if (!summary) throw new Error("La conclusion est requise");
    const d = await touch(id, {
      status: "CONCLUDED",
      conclusion: {
        cause_id: conclusion.cause_id ?? null,
        summary,
        confirmed_by_technician: !!conclusion.confirmed_by_technician,
        recommended_repair: conclusion.recommended_repair?.slice(0, 500) ?? null,
      },
    });
    await audit(r, "diagnostic.conclude", "diagnostic", id, { cause_id: conclusion.cause_id, confirmed: !!conclusion.confirmed_by_technician });
    return d;
  }

  async function reopen(id: string) {
    await requireEditable(id);
    await touch(id, { status: "TESTING" });
    await audit(r, "diagnostic.update", "diagnostic", id, { reopen: true });
  }

  async function remove(id: string) {
    assertCan(ctx, "garage:manage");
    await r.require("diagnostics", id);
    for (const t of ["diagnostic_codes", "diagnostic_tests", "diagnostic_results", "diagnostic_live_data"] as const) {
      for (const row of await r.list(t, { diagnostic_id: id })) await r.remove(t, row.id);
    }
    await r.remove("diagnostics", id);
    await audit(r, "diagnostic.delete", "diagnostic", id);
  }

  // ---------- Sessions OBD ----------
  async function startObdSession(input: { vehicle_id?: string | null; provider: ObdSession["provider"]; device_name?: string | null; vin?: string | null }): Promise<ObdSession> {
    assertCan(ctx, "obd:use");
    if (input.vehicle_id) await r.require("vehicles", input.vehicle_id, "Véhicule");
    const s = await r.insert("obd_sessions", {
      vehicle_id: input.vehicle_id ?? null,
      user_id: ctx.userId,
      team_id: ctx.teamIds[0] ?? null,
      diagnostic_id: null,
      provider: input.provider,
      device_name: input.device_name ?? null,
      vin: input.vin ?? null,
      dtcs: [],
      live_data: [],
      cleared_dtcs: false,
      started_at: nowIso(),
      ended_at: null,
      duration_seconds: null,
    });
    // registre des boîtiers utilisés (obd_connections)
    const name = input.device_name ?? (input.provider === "SIMULATOR" ? "Simulateur" : "Boîtier BLE");
    const [conn] = await r.list("obd_connections", { name });
    if (conn) await r.update("obd_connections", conn.id, { last_used_at: nowIso() });
    else await r.insert("obd_connections", { name, provider: input.provider, device_id: null, last_used_at: nowIso() });
    await audit(r, "obd.connect", "obd_session", s.id, { provider: input.provider, vin: input.vin, vehicle_id: input.vehicle_id });
    return s;
  }

  async function updateObdSession(id: string, patch: { vehicle_id?: string | null; dtcs?: string[]; live?: VehicleLiveData; diagnostic_id?: string | null }) {
    const s = await r.require("obd_sessions", id, "Session OBD");
    if (s.user_id !== ctx.userId) assertCan(ctx, "garage:manage");
    if (patch.vehicle_id) await r.require("vehicles", patch.vehicle_id, "Véhicule");
    if (patch.diagnostic_id) await r.require("diagnostics", patch.diagnostic_id, "Diagnostic");
    return r.update("obd_sessions", id, {
      ...(patch.vehicle_id !== undefined ? { vehicle_id: patch.vehicle_id } : {}),
      ...(patch.diagnostic_id !== undefined ? { diagnostic_id: patch.diagnostic_id } : {}),
      ...(patch.dtcs ? { dtcs: [...new Set([...s.dtcs, ...patch.dtcs])] } : {}),
      ...(patch.live ? { live_data: [...s.live_data, patch.live].slice(-120) } : {}),
    });
  }

  async function endObdSession(id: string) {
    const s = await r.require("obd_sessions", id, "Session OBD");
    if (s.ended_at) return s;
    const ended = new Date();
    const updated = await r.update("obd_sessions", id, {
      ended_at: ended.toISOString(),
      duration_seconds: Math.round((ended.getTime() - new Date(s.started_at).getTime()) / 1000),
    });
    await audit(r, "obd.disconnect", "obd_session", id);
    return updated;
  }

  /** À appeler APRÈS confirmation explicite de l'utilisateur. L'action est journalisée. */
  async function logDtcClear(sessionId: string, codes: string[]) {
    assertCan(ctx, "obd:clear_dtc");
    await r.require("obd_sessions", sessionId, "Session OBD");
    await r.update("obd_sessions", sessionId, { cleared_dtcs: true });
    await audit(r, "obd.clear_dtc", "obd_session", sessionId, { codes });
  }

  async function obdSessions(filter: { vehicle_id?: string } = {}) {
    return (await r.list("obd_sessions", filter)).sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  return {
    canSee,
    canEdit,
    list,
    create,
    get,
    update,
    addCode,
    removeCode,
    recordTest,
    resetTests,
    addResult,
    removeResult,
    addLiveData,
    saveAnalysis,
    conclude,
    reopen,
    remove,
    startObdSession,
    updateObdSession,
    endObdSession,
    logDtcClear,
    obdSessions,
  };
}
