import type { TestAnswer } from "@/types";

export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type CauseFrequency = "fréquente" | "possible" | "plus rare";

export interface PossibleCause {
  id: string; // référence vers CAUSES (data/causes.ts)
  frequency: CauseFrequency;
}

export interface TestEffect {
  cause: string;
  /** > 0 : le résultat soutient l'hypothèse ; < 0 : il l'affaiblit. */
  weight: number;
}

export interface TestOutcome {
  interpretation: string;
  effects?: TestEffect[];
  /** Étape suivante. "END" = fin du parcours pour ce code. Absent = étape suivante dans l'ordre. */
  next?: string | "END";
}

export interface DiagnosticTest {
  id: string;
  title: string;
  instruction: string;
  question: string;
  tools?: string[];
  safety?: string;
  /** Valeur de référence : jamais inventée. Si non disponible → "Information non disponible". */
  reference?: string;
  yes: TestOutcome;
  no: TestOutcome;
  unknown?: TestOutcome;
}

export interface DiagnosticRule {
  dtc: string;
  title: string;
  description: string;
  system: string;
  severity: Severity;
  symptoms?: string[];
  causes: PossibleCause[];
  safety: string[];
  tests: DiagnosticTest[];
}

export interface CauseDefinition {
  id: string;
  label: string;
  system: string;
  /** Réparation typiquement envisagée si la cause est confirmée. Pas de prix, pas de référence pièce. */
  repair: {
    label: string;
    /** clé dans le catalogue de prix du garage (price_catalog.key) */
    catalogKey?: string;
    /** noms génériques de pièces à prévoir (sans référence inventée) */
    parts?: string[];
  };
  critical?: boolean;
}

export interface TestAnswerRecord {
  dtc: string;
  stepId: string;
  answer: TestAnswer;
}

export type HypothesisStatus = "HYPOTHESE" | "SOUTENUE" | "AFFAIBLIE";

export interface Hypothesis {
  causeId: string;
  label: string;
  system: string;
  score: number;
  status: HypothesisStatus;
  relatedCodes: string[];
  evidence: string[];
}

export interface Correlation {
  codes: string[];
  message: string;
}

export interface Evaluation {
  hypotheses: Hypothesis[];
  correlations: Correlation[];
  safety: string[];
  unknownCodes: string[];
  completedCodes: string[];
  suggestedConclusion: {
    causeId: string | null;
    text: string;
    /** Toujours vrai : une conclusion doit être confirmée par le professionnel. */
    toConfirm: true;
  };
}
