import { buildContext, extractCodes, rulesKnowledge, SYSTEM_PROMPT } from "./prompt";
import { MockAIProvider } from "./mock-provider";
import type { AIProvider, DiagnosisInput, DiagnosisResult, QuoteInput, QuoteSuggestion, TechnicalAnswer, TechnicalQuestion } from "./provider";

/**
 * Fournisseur IA local via Ollama (https://ollama.com) — gratuit, données qui ne quittent pas le poste.
 * Les éléments structurés (hypothèses, contrôles, sécurité) viennent TOUJOURS du moteur de règles ;
 * le LLM rédige l'explication et répond aux questions en s'appuyant sur ce contexte.
 * Les prix des devis ne sont jamais générés par le LLM.
 */
export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private readonly rules = new MockAIProvider();

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly timeoutMs = 60_000,
  ) {}

  private async chat(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: false, options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Ollama a répondu ${res.status}`);
    const json = (await res.json()) as { message?: { content?: string } };
    const content = json.message?.content?.trim();
    if (!content) throw new Error("Réponse Ollama vide");
    // certains modèles « raisonnants » renvoient un bloc <think> : on ne le montre pas
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  async generateDiagnosis(input: DiagnosisInput): Promise<DiagnosisResult> {
    const base = await this.rules.generateDiagnosis(input);
    const prompt = [
      buildContext(input),
      "\n## Base de règles MECANO AI",
      rulesKnowledge(input.codes),
      "\n## Analyse du moteur de règles",
      base.hypotheses.map((h) => `- ${h.label} [${h.level}] (${h.relatedCodes.join(", ")})`).join("\n"),
      "\n## Demande",
      "Rédige une analyse courte (max 12 lignes) pour le mécanicien : synthèse, hypothèses à privilégier et pourquoi, prochain contrôle recommandé, précautions. Ne donne aucune valeur chiffrée constructeur. Termine par « Conclusion à confirmer par le technicien ».",
    ].join("\n");
    try {
      const narrative = await this.chat([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ]);
      return { ...base, provider: this.name, model: this.model, narrative };
    } catch {
      return { ...base, provider: "mock", summary: `${base.summary} (Ollama indisponible : analyse par règles)` };
    }
  }

  async answerTechnicalQuestion(input: TechnicalQuestion): Promise<TechnicalAnswer> {
    const codes = [...new Set([...extractCodes(input.question), ...input.context.codes])];
    const grounding = await this.rules.answerTechnicalQuestion(input);
    const history = (input.conversation ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    try {
      const answer = await this.chat([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `CONTEXTE STRUCTURÉ\n${buildContext(input.context)}\n\nBASE DE RÈGLES\n${rulesKnowledge(codes) || "Aucun code"}` },
        { role: "assistant", content: "Contexte reçu. Je m'appuie uniquement sur ces informations et signale « Information non disponible » si besoin." },
        ...history,
        { role: "user", content: input.question.slice(0, 2000) },
      ]);
      return { provider: this.name, model: this.model, answer, warnings: grounding.warnings, codesReferenced: codes };
    } catch {
      return { ...grounding, answer: `${grounding.answer}\n\n_(Ollama indisponible : réponse issue de la base de règles)_` };
    }
  }

  async generateQuoteSuggestion(input: QuoteInput): Promise<QuoteSuggestion> {
    // Volontairement déterministe : les prix proviennent du catalogue garage uniquement.
    const s = await this.rules.generateQuoteSuggestion(input);
    return { ...s, provider: this.name };
  }
}
