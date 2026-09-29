import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_RULES } from "@/data/diagnostic-rules";
import { CAUSES } from "@/data/causes";
import { evaluate, nextStep, recordAnswer, walk } from "@/lib/diagnostics/engine";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const REQUIRED = ["P0300", "P0301", "P0302", "P0303", "P0304", "P0401", "P0420", "P0171", "P0172", "P0101", "P0113", "P0130", "P0135", "P0299"];

describe("Base de règles", () => {
  it("contient les 14 codes de démonstration, avec causes, symptômes, sécurité et étapes", () => {
    for (const code of REQUIRED) {
      const rule = DIAGNOSTIC_RULES.find((r) => r.dtc === code);
      expect(rule, code).toBeDefined();
      expect(rule!.causes.length).toBeGreaterThan(0);
      expect(rule!.tests.length).toBeGreaterThan(0);
      expect(rule!.description.length).toBeGreaterThan(10);
    }
  });

  it("toutes les causes et les étapes référencées existent", () => {
    for (const rule of DIAGNOSTIC_RULES) {
      for (const c of rule.causes) expect(CAUSES[c.id], `${rule.dtc}:${c.id}`).toBeDefined();
      const ids = new Set(rule.tests.map((t) => t.id));
      for (const t of rule.tests) {
        for (const o of [t.yes, t.no, t.unknown].filter(Boolean)) {
          if (o!.next && o!.next !== "END") expect(ids.has(o!.next), `${rule.dtc}:${t.id}->${o!.next}`).toBe(true);
          for (const e of o!.effects ?? []) expect(CAUSES[e.cause], `${rule.dtc}:${e.cause}`).toBeDefined();
        }
      }
    }
  });

  it("n'invente aucune valeur constructeur (aucune valeur numérique avec unité dans les références)", () => {
    for (const rule of DIAGNOSTIC_RULES) {
      for (const t of rule.tests) {
        const text = `${t.instruction} ${t.reference ?? ""}`;
        expect(/\d+([.,]\d+)?\s?(Nm|bar|ohm|Ω|V|kPa|mbar|€)\b/i.test(text), `${rule.dtc}:${t.id}`).toBe(false);
        if (t.reference) expect(t.reference).toMatch(/Information non disponible/);
      }
    }
  });
});

describe("Diagnostic guidé P0302", () => {
  it("commence par la permutation des bobines", () => {
    expect(nextStep("P0302", [])?.id).toBe("swap_coil");
  });

  it("OUI : le résultat soutient l'hypothèse bobine et termine le parcours", () => {
    const answers = recordAnswer([], { dtc: "P0302", stepId: "swap_coil", answer: "YES" });
    expect(nextStep("P0302", answers)).toBeNull();
    const ev = evaluate(["P0302"], answers);
    expect(ev.hypotheses[0].causeId).toBe("ignition_coil");
    expect(ev.hypotheses[0].status).toBe("SOUTENUE");
    expect(ev.suggestedConclusion.causeId).toBe("ignition_coil");
    expect(ev.suggestedConclusion.text).toMatch(/à confirmer/i);
    expect(ev.suggestedConclusion.toConfirm).toBe(true);
  });

  it("NON : poursuit vers la bougie et affaiblit l'hypothèse bobine", () => {
    const answers = recordAnswer([], { dtc: "P0302", stepId: "swap_coil", answer: "NO" });
    expect(nextStep("P0302", answers)?.id).toBe("check_plug");
    const coil = evaluate(["P0302"], answers).hypotheses.find((h) => h.causeId === "ignition_coil")!;
    expect(coil.status).toBe("AFFAIBLIE");
  });

  it("JE NE SAIS PAS : poursuit sans conclure", () => {
    const answers = recordAnswer([], { dtc: "P0302", stepId: "swap_coil", answer: "UNKNOWN" });
    expect(nextStep("P0302", answers)?.id).toBe("check_plug");
    expect(evaluate(["P0302"], answers).suggestedConclusion.causeId).toBeNull();
  });

  it("mémorise toutes les réponses et invalide celles devenues hors parcours", () => {
    let answers = recordAnswer([], { dtc: "P0302", stepId: "swap_coil", answer: "NO" });
    answers = recordAnswer(answers, { dtc: "P0302", stepId: "check_plug", answer: "NO" });
    expect(walk("P0302", answers).done.length).toBe(2);
    // changement de réponse : la bobine devient OUI → l'étape bougie sort du parcours
    answers = recordAnswer(answers, { dtc: "P0302", stepId: "swap_coil", answer: "YES" });
    expect(answers.length).toBe(1);
  });

  it("ne présente jamais une hypothèse comme certaine sans test", () => {
    const ev = evaluate(["P0302"], []);
    expect(ev.hypotheses.every((h) => h.status === "HYPOTHESE")).toBe(true);
    expect(ev.suggestedConclusion.causeId).toBeNull();
  });
});

describe("Diagnostic P0420", () => {
  it("oriente vers le catalyseur quand le signal aval recopie l'amont", () => {
    let answers = recordAnswer([], { dtc: "P0420", stepId: "other_faults", answer: "NO" });
    answers = recordAnswer(answers, { dtc: "P0420", stepId: "exhaust_leak", answer: "NO" });
    answers = recordAnswer(answers, { dtc: "P0420", stepId: "o2_signals", answer: "YES" });
    const ev = evaluate(["P0420"], answers);
    expect(ev.hypotheses[0].causeId).toBe("catalyst");
    expect(ev.suggestedConclusion.causeId).toBe("catalyst");
    expect(ev.safety.join(" ")).toMatch(/refroidir/);
  });

  it("oriente vers la sonde aval si son signal est incohérent", () => {
    let answers = recordAnswer([], { dtc: "P0420", stepId: "other_faults", answer: "NO" });
    answers = recordAnswer(answers, { dtc: "P0420", stepId: "exhaust_leak", answer: "NO" });
    answers = recordAnswer(answers, { dtc: "P0420", stepId: "o2_signals", answer: "NO" });
    expect(evaluate(["P0420"], answers).suggestedConclusion.causeId).toBe("o2_downstream");
  });
});

describe("Codes multiples", () => {
  it("détecte les corrélations et renforce les causes communes", () => {
    const ev = evaluate(["P0300", "P0171", "P0420"], []);
    expect(ev.correlations.length).toBeGreaterThanOrEqual(2);
    const vacuum = ev.hypotheses.find((h) => h.causeId === "vacuum_leak")!;
    expect(vacuum.relatedCodes).toEqual(expect.arrayContaining(["P0300", "P0171"]));
    expect(ev.hypotheses[0].causeId).toBe("vacuum_leak");
  });

  it("signale les codes inconnus comme « Information non disponible »", async () => {
    const ev = evaluate(["P1234"], []);
    expect(ev.unknownCodes).toEqual(["P1234"]);
    const ai = new MockAIProvider();
    const answer = await ai.answerTechnicalQuestion({ question: "Explique P1234", context: { codes: [], symptoms: [] } });
    expect(answer.answer).toMatch(/Information non disponible/);
  });

  it("ajoute l'avertissement haute tension pour les véhicules électrifiés", () => {
    const ev = evaluate(["P0420"], [], { fuel: "HYBRIDE" });
    expect(ev.safety.join(" ")).toMatch(/haute tension/i);
  });
});

describe("MockAIProvider", () => {
  it("refuse de fournir une valeur constructeur", async () => {
    const ai = new MockAIProvider();
    const a = await ai.answerTechnicalQuestion({ question: "Quel est le couple de serrage des bougies pour P0302 ?", context: { codes: [], symptoms: [] } });
    expect(a.answer).toMatch(/Information non disponible/);
    expect(a.codesReferenced).toEqual(["P0302"]);
  });

  it("produit des hypothèses et des contrôles à partir du contexte", async () => {
    const ai = new MockAIProvider();
    const r = await ai.generateDiagnosis({ codes: ["P0302"], symptoms: ["Moteur qui broute"], vehicle: { make: "Volkswagen", model: "Golf", fuel: "ESSENCE" } });
    expect(r.hypotheses.length).toBeGreaterThan(0);
    expect(r.recommendedChecks[0].title).toMatch(/bobines/i);
    expect(r.disclaimer).toMatch(/ne remplace pas/);
  });
});
