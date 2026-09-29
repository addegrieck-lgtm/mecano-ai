import "server-only";
import { MockAIProvider } from "./mock-provider";
import { OllamaProvider } from "./ollama-provider";
import type { AIProvider } from "./provider";

export interface AIStatus {
  provider: "ollama" | "mock";
  model?: string;
  ollamaUrl: string;
  ollamaReachable: boolean;
  models: string[];
  reason?: string;
}

let cache: { at: number; status: AIStatus } | null = null;

/** Détecte Ollama (cache 30 s). Sans Ollama : MockAIProvider prend automatiquement le relais. */
export async function getAIStatus(force = false): Promise<AIStatus> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.status;
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const wanted = process.env.OLLAMA_MODEL?.trim();
  let status: AIStatus;
  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { models?: { name: string }[] };
    const models = (json.models ?? []).map((m) => m.name);
    const model = wanted ? models.find((m) => m === wanted || m.split(":")[0] === wanted) : models[0];
    status = model
      ? { provider: "ollama", model, ollamaUrl, ollamaReachable: true, models }
      : {
          provider: "mock",
          ollamaUrl,
          ollamaReachable: true,
          models,
          reason: wanted ? `Modèle « ${wanted} » non installé (ollama pull ${wanted})` : "Aucun modèle Ollama installé",
        };
  } catch {
    status = { provider: "mock", ollamaUrl, ollamaReachable: false, models: [], reason: "Ollama non détecté" };
  }
  cache = { at: Date.now(), status };
  return status;
}

export async function getAIProvider(): Promise<AIProvider> {
  const status = await getAIStatus();
  if (status.provider === "ollama" && status.model) return new OllamaProvider(status.ollamaUrl, status.model);
  return new MockAIProvider();
}
