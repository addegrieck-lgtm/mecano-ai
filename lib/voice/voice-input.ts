/**
 * Préparation du diagnostic vocal (« MECANO AI, j'ai un P0302… »).
 * Interface indépendante du moteur de reconnaissance : Web Speech API aujourd'hui (si disponible,
 * optionnelle), moteur local (whisper.cpp…) ou natif iOS demain.
 */
export interface VoiceInputProvider {
  isSupported(): boolean;
  listen(opts: { lang?: string; onResult: (text: string, final: boolean) => void; onEnd?: () => void; onError?: (e: string) => void }): () => void;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export class WebSpeechVoiceInput implements VoiceInputProvider {
  private ctor(): (new () => SpeechRecognitionLike) | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  isSupported() {
    return this.ctor() !== null;
  }

  listen({ lang = "fr-FR", onResult, onEnd, onError }: Parameters<VoiceInputProvider["listen"]>[0]) {
    const Ctor = this.ctor();
    if (!Ctor) {
      onError?.("Reconnaissance vocale non disponible sur ce navigateur");
      return () => undefined;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      onResult(res[0].transcript, res.isFinal);
    };
    rec.onend = () => onEnd?.();
    rec.onerror = (e) => onError?.(e.error);
    rec.start();
    return () => rec.stop();
  }
}

/** Retire le mot d'appel « MECANO AI » d'une commande vocale. */
export function stripWakeWord(text: string): string {
  return text.replace(/^\s*(m[ée]cano\s*(ai|a\.?i\.?|ia)?)[\s,:]*/i, "").trim();
}
