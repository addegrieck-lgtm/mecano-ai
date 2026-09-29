"use client";

import { MockAIProvider } from "./mock-provider";
import type { DiagnosisInput, DiagnosisResult, TechnicalAnswer, TechnicalQuestion } from "./provider";

/**
 * Accès IA depuis le navigateur : appelle /api/ai (Ollama ou Mock côté serveur).
 * Hors connexion ou serveur indisponible : bascule sur le MockAIProvider embarqué.
 */
const local = new MockAIProvider();

async function post<T>(action: string, input: unknown): Promise<T | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, input }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function analyzeDiagnosis(input: DiagnosisInput): Promise<DiagnosisResult> {
  return (await post<DiagnosisResult>("diagnosis", input)) ?? { ...(await local.generateDiagnosis(input)), provider: "mock (hors ligne)" };
}

export async function askTechnicalQuestion(input: TechnicalQuestion): Promise<TechnicalAnswer> {
  return (await post<TechnicalAnswer>("question", input)) ?? { ...(await local.answerTechnicalQuestion(input)), provider: "mock (hors ligne)" };
}

export interface AIStatusDto {
  provider: "ollama" | "mock";
  model: string | null;
  ollamaReachable: boolean;
  models: string[];
  reason: string | null;
}

export async function fetchAIStatus(refresh = false): Promise<AIStatusDto> {
  try {
    const res = await fetch(`/api/ai${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (res.ok) return (await res.json()) as AIStatusDto;
  } catch {
    /* hors ligne */
  }
  return { provider: "mock", model: null, ollamaReachable: false, models: [], reason: "Serveur injoignable (hors ligne)" };
}
