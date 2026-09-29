import type { SuggestedLine } from "@/lib/quotes/suggest";
import type { FuelType, Part, PriceCatalogItem, VehicleLiveData } from "@/types";

/**
 * Contrat IA de MECANO AI. Implémentations : MockAIProvider (par défaut, 0 €, déterministe),
 * OllamaProvider (LLM local). Futures : OpenAI, Anthropic… sans changer le reste de l'application.
 */

export interface AIVehicleContext {
  make?: string;
  model?: string;
  version?: string | null;
  year?: number | null;
  engine?: string | null;
  fuel?: FuelType | null;
  mileage?: number | null;
}

export interface AITestResult {
  dtc: string;
  stepId?: string;
  title: string;
  answer: "YES" | "NO" | "UNKNOWN";
  interpretation: string;
}

export interface DiagnosisInput {
  vehicle?: AIVehicleContext;
  symptoms: string[];
  codes: string[];
  complaint?: string | null;
  liveData?: VehicleLiveData | null;
  /** Événements pertinents de l'historique véhicule (texte court). */
  history?: string[];
  testResults?: AITestResult[];
  measurements?: { label: string; value: string; unit?: string | null }[];
}

export type HypothesisLevel = "HYPOTHESE" | "SOUTENUE" | "AFFAIBLIE";

export interface DiagnosisResult {
  provider: string;
  model?: string;
  summary: string;
  hypotheses: { causeId: string; label: string; level: HypothesisLevel; relatedCodes: string[]; rationale: string }[];
  recommendedChecks: { dtc: string; title: string; instruction: string; reference?: string }[];
  correlations: string[];
  safetyWarnings: string[];
  conclusion: string;
  unknownCodes: string[];
  /** Texte rédigé par le LLM (Ollama). Absent avec le MockAIProvider. */
  narrative?: string;
  disclaimer: string;
  generatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TechnicalQuestion {
  question: string;
  context: DiagnosisInput;
  conversation?: ChatMessage[];
}

export interface TechnicalAnswer {
  provider: string;
  model?: string;
  answer: string;
  warnings: string[];
  codesReferenced: string[];
}

export interface QuoteInput {
  causeId: string | null;
  recommendedRepair?: string | null;
  vehicle?: AIVehicleContext;
  catalog: PriceCatalogItem[];
  parts: Part[];
  laborHourlyRate?: number | null;
}

export interface QuoteSuggestion {
  provider: string;
  lines: SuggestedLine[];
  notes: string[];
}

export interface AIProvider {
  readonly name: string;
  generateDiagnosis(input: DiagnosisInput): Promise<DiagnosisResult>;
  answerTechnicalQuestion(input: TechnicalQuestion): Promise<TechnicalAnswer>;
  generateQuoteSuggestion(input: QuoteInput): Promise<QuoteSuggestion>;
}

export const AI_DISCLAIMER =
  "MECANO AI propose des hypothèses et des contrôles. Il ne remplace pas le jugement d'un professionnel. Aucune valeur constructeur n'est inventée : se référer à la documentation technique officielle.";
