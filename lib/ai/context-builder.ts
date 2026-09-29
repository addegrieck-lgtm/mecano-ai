import type { HistoryEvent } from "@/lib/services/insights";
import type { DiagnosticFull } from "@/lib/services/diagnostics";
import type { DiagnosisInput } from "./provider";

/** Construit le contexte structuré envoyé à l'IA à partir d'un dossier de diagnostic. */
export function buildDiagnosisInput(full: DiagnosticFull, history: HistoryEvent[] = []): DiagnosisInput {
  const v = full.vehicle;
  const lastLive = full.liveData.at(-1)?.data ?? null;
  return {
    vehicle: { make: v.make, model: v.model, version: v.version, year: v.year, engine: v.engine, fuel: v.fuel, mileage: full.diagnostic.mileage ?? v.mileage },
    symptoms: full.diagnostic.symptoms,
    complaint: full.diagnostic.complaint,
    codes: full.codes.map((c) => c.code),
    liveData: lastLive,
    history: history
      .filter((h) => h.kind === "CONCLUSION" || h.kind === "INTERVENTION" || h.kind === "DIAGNOSTIC")
      .filter((h) => !h.href?.endsWith(full.diagnostic.id))
      .slice(-10)
      .map((h) => `${h.date.slice(0, 10)} — ${h.title}${h.detail ? ` : ${h.detail}` : ""}`.slice(0, 300)),
    testResults: full.tests.map((t) => ({ dtc: t.dtc, stepId: t.step_id, title: t.title, answer: t.answer, interpretation: t.interpretation })),
    measurements: full.results.map((r) => ({ label: r.label, value: r.value, unit: r.unit })),
  };
}
