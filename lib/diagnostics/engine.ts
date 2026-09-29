import { CAUSES } from "@/data/causes";
import { RULES_BY_DTC } from "@/data/diagnostic-rules";
import type { FuelType, TestAnswer } from "@/types";
import type { Correlation, DiagnosticRule, DiagnosticTest, Evaluation, Hypothesis, TestAnswerRecord, TestOutcome } from "./types";

/**
 * Moteur de diagnostic à base de règles — indépendant de l'IA.
 * Fonctions pures et déterministes : les réponses sont sérialisables (diagnostic_tests).
 */

export const DTC_PATTERN = /^[PCBU][0-3][0-9A-F]{3}$/;

export function normalizeDtc(code: string): string {
  return code.trim().toUpperCase();
}

export function getRule(dtc: string): DiagnosticRule | null {
  return RULES_BY_DTC[normalizeDtc(dtc)] ?? null;
}

export function describeDtc(dtc: string): string {
  return getRule(dtc)?.title ?? "Information non disponible dans la base de démonstration";
}

export function outcomeFor(test: DiagnosticTest, answer: TestAnswer): TestOutcome {
  if (answer === "YES") return test.yes;
  if (answer === "NO") return test.no;
  return test.unknown ?? { interpretation: "Résultat non déterminé : poursuivre avec l'étape suivante." };
}

/** Parcours déjà effectué pour un code (dans l'ordre), et étape courante. */
export function walk(dtc: string, answers: TestAnswerRecord[]): { done: { test: DiagnosticTest; answer: TestAnswer; outcome: TestOutcome }[]; current: DiagnosticTest | null } {
  const rule = getRule(dtc);
  if (!rule || rule.tests.length === 0) return { done: [], current: null };
  const byStep = new Map(answers.filter((a) => normalizeDtc(a.dtc) === rule.dtc).map((a) => [a.stepId, a.answer]));
  const done: { test: DiagnosticTest; answer: TestAnswer; outcome: TestOutcome }[] = [];
  let idx = 0;
  const visited = new Set<string>();
  while (idx >= 0 && idx < rule.tests.length) {
    const test = rule.tests[idx];
    if (visited.has(test.id)) break; // protection contre les boucles
    visited.add(test.id);
    const answer = byStep.get(test.id);
    if (!answer) return { done, current: test };
    const outcome = outcomeFor(test, answer);
    done.push({ test, answer, outcome });
    if (outcome.next === "END") return { done, current: null };
    idx = outcome.next ? rule.tests.findIndex((t) => t.id === outcome.next) : idx + 1;
  }
  return { done, current: null };
}

export function nextStep(dtc: string, answers: TestAnswerRecord[]): DiagnosticTest | null {
  return walk(dtc, answers).current;
}

export function isComplete(dtc: string, answers: TestAnswerRecord[]): boolean {
  return getRule(dtc) !== null && walk(dtc, answers).current === null;
}

/** Enregistre (ou remplace) une réponse, et invalide les réponses postérieures devenues hors parcours. */
export function recordAnswer(answers: TestAnswerRecord[], record: TestAnswerRecord): TestAnswerRecord[] {
  const others = answers.filter((a) => !(normalizeDtc(a.dtc) === normalizeDtc(record.dtc) && a.stepId === record.stepId));
  const next = [...others, { ...record, dtc: normalizeDtc(record.dtc) }];
  const { done } = walk(record.dtc, next);
  const reachable = new Set(done.map((d) => d.test.id));
  return next.filter((a) => normalizeDtc(a.dtc) !== normalizeDtc(record.dtc) || reachable.has(a.stepId));
}

const BASE_SCORE = { fréquente: 3, possible: 2, "plus rare": 1 } as const;

const MISFIRE = /^P030[0-8]$/;

export function correlations(codes: string[]): Correlation[] {
  const set = new Set(codes.map(normalizeDtc));
  const has = (c: string) => set.has(c);
  const misfires = [...set].filter((c) => MISFIRE.test(c));
  const out: Correlation[] = [];
  if (misfires.length > 0 && (has("P0171") || has("P0172"))) {
    out.push({
      codes: [...misfires, ...["P0171", "P0172"].filter(has)],
      message: "Ratés d'allumage associés à un défaut de mélange : privilégier la recherche d'une prise d'air ou d'un défaut d'alimentation avant de remplacer des pièces d'allumage.",
    });
  }
  if (misfires.length > 1 && !has("P0300")) {
    out.push({ codes: misfires, message: "Ratés sur plusieurs cylindres : une cause commune (admission, alimentation, mécanique) est possible." });
  }
  if (has("P0420") && (misfires.length > 0 || has("P0171") || has("P0172") || has("P0130") || has("P0135"))) {
    out.push({
      codes: ["P0420", ...[...set].filter((c) => c !== "P0420")],
      message: "Traiter d'abord les autres défauts moteur : ils peuvent endommager le catalyseur ou fausser le diagnostic P0420.",
    });
  }
  if (has("P0101") && (has("P0171") || has("P0172"))) {
    out.push({ codes: ["P0101", ...["P0171", "P0172"].filter(has)], message: "Défaut débitmètre et défaut de mélange : le débitmètre est une piste commune à contrôler en priorité." });
  }
  if (has("P0401") && has("P0299")) {
    out.push({ codes: ["P0401", "P0299"], message: "EGR et suralimentation : contrôler l'ensemble de la boucle d'air (fuites, encrassement)." });
  }
  return out;
}

export function vehicleSafety(fuel?: FuelType | null): string[] {
  if (fuel === "ELECTRIQUE" || fuel === "HYBRIDE" || fuel === "HYBRIDE_RECHARGEABLE") {
    return [
      "Véhicule à haute tension : toute intervention sur le circuit HT doit être réalisée par un personnel habilité, selon la procédure de consignation du constructeur.",
    ];
  }
  return [];
}

export function evaluate(codes: string[], answers: TestAnswerRecord[], opts: { fuel?: FuelType | null; symptoms?: string[] } = {}): Evaluation {
  const normalized = [...new Set(codes.map(normalizeDtc))];
  const scores = new Map<string, Hypothesis>();
  const safety = new Set<string>(vehicleSafety(opts.fuel));
  const unknownCodes: string[] = [];
  const completedCodes: string[] = [];
  /** Somme des poids issus des tests, par cause (preuves). */
  const positive = new Map<string, number>();
  const symptoms = new Set((opts.symptoms ?? []).map((s) => s.toLowerCase()));

  const ensure = (causeId: string, code: string): Hypothesis => {
    let h = scores.get(causeId);
    if (!h) {
      const def = CAUSES[causeId];
      h = { causeId, label: def?.label ?? causeId, system: def?.system ?? "—", score: 0, status: "HYPOTHESE", relatedCodes: [], evidence: [] };
      scores.set(causeId, h);
    }
    if (!h.relatedCodes.includes(code)) h.relatedCodes.push(code);
    return h;
  };

  for (const code of normalized) {
    const rule = getRule(code);
    if (!rule) {
      unknownCodes.push(code);
      continue;
    }
    rule.safety.forEach((s) => safety.add(s));
    const symptomMatches = (rule.symptoms ?? []).filter((s) => symptoms.has(s.toLowerCase())).length;
    for (const c of rule.causes) {
      const h = ensure(c.id, code);
      h.score += BASE_SCORE[c.frequency] + Math.min(symptomMatches, 3) * 0.25;
    }
    const { done, current } = walk(code, answers);
    if (!current) completedCodes.push(code);
    for (const step of done) {
      for (const eff of step.outcome.effects ?? []) {
        const h = ensure(eff.cause, code);
        h.score += eff.weight;
        h.evidence.push(`${code} · ${step.test.title} : ${step.answer === "YES" ? "OUI" : step.answer === "NO" ? "NON" : "?"} → ${step.outcome.interpretation}`);
        positive.set(eff.cause, (positive.get(eff.cause) ?? 0) + eff.weight);
      }
      if (step.test.safety) safety.add(step.test.safety);
    }
  }

  // Une cause partagée par plusieurs codes est renforcée.
  for (const h of scores.values()) {
    if (h.relatedCodes.length > 1) h.score += h.relatedCodes.length;
    const p = positive.get(h.causeId) ?? 0;
    h.status = p >= 4 ? "SOUTENUE" : p < 0 ? "AFFAIBLIE" : "HYPOTHESE";
    if (CAUSES[h.causeId]?.critical) safety.add(`${h.label} : système critique — appliquer la procédure constructeur.`);
  }

  const hypotheses = [...scores.values()].sort((a, b) => b.score - a.score);
  const top = hypotheses.find((h) => h.status === "SOUTENUE");
  const suggestedConclusion = top
    ? {
        causeId: top.causeId,
        text: `Conclusion à confirmer : les contrôles effectués soutiennent l'hypothèse « ${top.label} ». Validation par le technicien requise avant réparation.`,
        toConfirm: true as const,
      }
    : {
        causeId: null,
        text:
          normalized.length === 0
            ? "Aucun code défaut : baser l'analyse sur les symptômes et les contrôles."
            : "Aucune conclusion à ce stade : poursuivre les contrôles recommandés.",
        toConfirm: true as const,
      };

  return { hypotheses, correlations: correlations(normalized), safety: [...safety], unknownCodes, completedCodes, suggestedConclusion };
}
