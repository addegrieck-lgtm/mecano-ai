import "server-only";
import type { Ctx } from "@/lib/context";
import type { AssistantAnswer } from "./engine";

/**
 * Reformulation FACULTATIVE de la réponse par un modèle de langage.
 *  - AI_PROVIDER=anthropic : API Claude (payante, clé ANTHROPIC_API_KEY) — service EXTERNE :
 *    n'est utilisée que si l'administrateur l'a explicitement autorisée (Paramètres → IA externe).
 *  - AI_PROVIDER=ollama : modèle local (gratuit). Considéré externe si OLLAMA_BASE_URL n'est pas local.
 *  - Sinon : réponse « règles » uniquement.
 * Seules les données PUBLIQUES des avis déjà sélectionnés sont transmises (jamais les notes internes, tâches ou rapports).
 */
export type LlmStatus = { provider: "none" | "anthropic" | "ollama"; external: boolean; allowed: boolean; reason: string };

export function llmStatus(ctx: Ctx): LlmStatus {
  const provider = (process.env.AI_PROVIDER ?? "none") as LlmStatus["provider"];
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return { provider, external: true, allowed: false, reason: "ANTHROPIC_API_KEY non configurée." };
    if (!ctx.org.settings.allowExternalAi) return { provider, external: true, allowed: false, reason: "Envoi vers un service d'IA externe non autorisé par l'administrateur." };
    return { provider, external: true, allowed: true, reason: "API Claude (externe, payante) autorisée par l'administrateur." };
  }
  if (provider === "ollama") {
    const url = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(url);
    if (!local && !ctx.org.settings.allowExternalAi) return { provider, external: true, allowed: false, reason: "Serveur Ollama distant non autorisé par l'administrateur." };
    return { provider, external: !local, allowed: true, reason: local ? "Modèle local Ollama." : "Serveur Ollama distant autorisé." };
  }
  return { provider: "none", external: false, allowed: false, reason: "Aucun modèle de langage configuré : réponses par règles (gratuit)." };
}

const SYSTEM = `Tu es l'assistant commercial de LEVAGE RADAR (veille de marchés de vérification levage / électricité).
Règles impératives :
- Réponds en français, de façon concise, UNIQUEMENT à partir des données JSON fournies.
- N'invente aucun appel d'offres, date, montant, contact ou source. Si une information manque, dis-le.
- Cite chaque opportunité mentionnée par son titre exact et rappelle que la source officielle fait foi.
- Ne présente jamais un score comme une décision, ni une estimation comme un montant officiel.`;

export async function rephrase(ctx: Ctx, question: string, answer: AssistantAnswer): Promise<string | null> {
  const st = llmStatus(ctx);
  if (!st.allowed) return null;
  const payload = JSON.stringify({ question, constats: answer.paragraphs, opportunites: answer.items, acheteurs: answer.buyers, manques: answer.missing }).slice(0, 60000);
  try {
    if (st.provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();
      const res = await client.beta.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { effort: "low" },
        // Repli côté serveur si le modèle décline la requête (catégorie de refus gérée par l'API).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: `Données :\n${payload}` }],
      });
      if (res.stop_reason === "refusal") return null;
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || null;
    }
    if (st.provider === "ollama") {
      const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
      const r = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? "llama3.2", stream: false, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Données :\n${payload}` }] }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { message?: { content?: string } };
      return j.message?.content?.trim() || null;
    }
  } catch {
    return null; // la réponse par règles reste affichée
  }
  return null;
}
