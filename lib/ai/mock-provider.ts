import { CAUSES } from "@/data/causes";
import { evaluate, getRule, nextStep, vehicleSafety } from "@/lib/diagnostics/engine";
import { suggestQuoteLines } from "@/lib/quotes/suggest";
import { extractCodes } from "./prompt";
import { AI_DISCLAIMER, type AIProvider, type DiagnosisInput, type DiagnosisResult, type QuoteInput, type QuoteSuggestion, type TechnicalAnswer, type TechnicalQuestion } from "./provider";

/**
 * MockAIProvider : « IA » déterministe basée uniquement sur le moteur de règles.
 * Gratuit, hors ligne, sans hallucination possible. Prend le relais quand Ollama est indisponible.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async generateDiagnosis(input: DiagnosisInput): Promise<DiagnosisResult> {
    const answers = (input.testResults ?? []).map((t) => {
      const rule = getRule(t.dtc);
      const step = rule?.tests.find((s) => s.title === t.title);
      return { dtc: t.dtc, stepId: t.stepId ?? step?.id ?? t.title, answer: t.answer };
    });
    const ev = evaluate(input.codes, answers, { fuel: input.vehicle?.fuel, symptoms: input.symptoms });
    const checks: DiagnosisResult["recommendedChecks"] = [];
    for (const code of input.codes) {
      const step = nextStep(code, answers);
      if (step) checks.push({ dtc: code, title: step.title, instruction: step.instruction, reference: step.reference });
    }
    const top = ev.hypotheses.slice(0, 5);
    const v = input.vehicle;
    const vehicleText = v?.make ? `${v.make} ${v.model ?? ""}${v.engine ? ` ${v.engine}` : ""}`.trim() : "le véhicule";
    const summary =
      input.codes.length === 0
        ? `Aucun code défaut transmis pour ${vehicleText}. L'analyse repose sur les symptômes : ${input.symptoms.join(", ") || "non renseignés"}. Réaliser une lecture OBD complète est recommandé.`
        : `${input.codes.length} code(s) analysé(s) pour ${vehicleText} : ${input.codes.join(", ")}. ${top.length} cause(s) possible(s) classée(s) par pertinence. ${
            ev.hypotheses.some((h) => h.status === "SOUTENUE") ? "Au moins une hypothèse est soutenue par un test." : "Aucune hypothèse n'est encore confirmée par un test."
          }`;

    return {
      provider: this.name,
      summary,
      hypotheses: top.map((h) => ({
        causeId: h.causeId,
        label: h.label,
        level: h.status,
        relatedCodes: h.relatedCodes,
        rationale: h.evidence.length ? h.evidence.join(" | ") : `Cause possible associée à ${h.relatedCodes.join(", ")} (base de règles).`,
      })),
      recommendedChecks: checks,
      correlations: ev.correlations.map((c) => c.message),
      safetyWarnings: ev.safety,
      conclusion: ev.suggestedConclusion.text,
      unknownCodes: ev.unknownCodes,
      disclaimer: AI_DISCLAIMER,
      generatedAt: new Date().toISOString(),
    };
  }

  async answerTechnicalQuestion(input: TechnicalQuestion): Promise<TechnicalAnswer> {
    const q = input.question.toLowerCase();
    const mentioned = extractCodes(input.question);
    const codes = mentioned.length ? mentioned : input.context.codes;
    const warnings = vehicleSafety(input.context.vehicle?.fuel);
    const parts: string[] = [];

    const wantsChecks = /contr[ôo]le|test|v[ée]rifi|faire|proc[ée]d|[ée]tape/.test(q);
    const wantsSymptoms = /sympt[ôo]me/.test(q);
    const wantsCauses = /cause|pourquoi|origine|panne/.test(q);
    const wantsExplain = /expli|signifi|c'est quoi|veut dire|d[ée]finition/.test(q) || (!wantsChecks && !wantsSymptoms && !wantsCauses);
    const asksValue = /couple|serrage|valeur|pression|r[ée]sistance|tension|temps|r[ée]f[ée]rence|prix|tarif/.test(q);

    if (codes.length === 0) {
      parts.push(
        "Aucun code défaut n'est associé à la question ni au véhicule sélectionné.",
        "Contrôle recommandé : effectuer une lecture OBD complète (codes mémorisés et en attente) puis relancer l'analyse.",
      );
      if (input.context.symptoms.length) parts.push(`Symptômes connus : ${input.context.symptoms.join(", ")}.`);
    }

    for (const code of codes) {
      const rule = getRule(code);
      if (!rule) {
        parts.push(`**${code}** — Information non disponible dans la base de démonstration. Se référer à la documentation constructeur.`);
        continue;
      }
      parts.push(`**${rule.dtc} — ${rule.title}**`);
      if (wantsExplain) parts.push(rule.description);
      if (wantsCauses || wantsExplain) {
        parts.push("Causes possibles (hypothèses, par fréquence) :\n" + rule.causes.map((c) => `- ${CAUSES[c.id]?.label ?? c.id} — ${c.frequency}`).join("\n"));
      }
      if (wantsSymptoms) parts.push("Symptômes cohérents :\n" + (rule.symptoms ?? []).map((s) => `- ${s}`).join("\n"));
      if (wantsChecks || wantsExplain) {
        const done = (input.context.testResults ?? []).filter((t) => t.dtc === rule.dtc);
        const answers = done.map((t) => ({ dtc: t.dtc, stepId: t.stepId ?? rule.tests.find((s) => s.title === t.title)?.id ?? "", answer: t.answer }));
        const next = nextStep(rule.dtc, answers);
        if (done.length) parts.push("Résultats observés :\n" + done.map((t) => `- ${t.title} : ${t.answer === "YES" ? "Oui" : t.answer === "NO" ? "Non" : "?"} — ${t.interpretation}`).join("\n"));
        parts.push(
          next
            ? `Contrôle recommandé ensuite : **${next.title}** — ${next.instruction}${next.reference ? `\nRéférence : ${next.reference}` : ""}`
            : "Contrôles recommandés (ordre suggéré) :\n" + rule.tests.map((t, i) => `${i + 1}. ${t.title} — ${t.instruction}`).join("\n"),
        );
      }
      warnings.push(...rule.safety);
    }
    if (asksValue) {
      parts.push("Valeur demandée : **Information non disponible**. MECANO AI ne fournit pas de valeurs constructeur (couple, pression, résistance, temps, référence, prix) : consulter la documentation technique officielle ou le catalogue du garage.");
    }
    return { provider: this.name, answer: parts.join("\n\n"), warnings: [...new Set(warnings)], codesReferenced: codes };
  }

  async generateQuoteSuggestion(input: QuoteInput): Promise<QuoteSuggestion> {
    const lines = suggestQuoteLines(input);
    const notes = [
      "Les prix proviennent exclusivement du catalogue du garage.",
      ...(lines.some((l) => l.unit_price === null) ? ["Certaines lignes sont marquées « Prix à renseigner »."] : []),
    ];
    return { provider: this.name, lines, notes };
  }
}
