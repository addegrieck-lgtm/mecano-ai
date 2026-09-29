"use client";

import { Bot, Lightbulb, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/app/common";
import { fmtDateTime } from "@/lib/format";
import type { DiagnosisResult, HypothesisLevel } from "@/lib/ai/provider";

export const LEVEL: Record<HypothesisLevel, { label: string; tone: "muted" | "success" | "danger" }> = {
  HYPOTHESE: { label: "Hypothèse", tone: "muted" },
  SOUTENUE: { label: "Soutenue par un test", tone: "success" },
  AFFAIBLIE: { label: "Affaiblie par un test", tone: "danger" },
};

/** Rendu Markdown minimal (gras, listes) — sans HTML injecté. */
export function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {text.split(/\n/).map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const bullet = /^([-*•]|\d+\.)\s+/.test(trimmed);
        const content = trimmed.replace(/^([-*•])\s+/, "").replace(/^#+\s*/, "");
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, k) => (p.startsWith("**") && p.endsWith("**") ? <b key={k}>{p.slice(2, -2)}</b> : <span key={k}>{p.replace(/_/g, "")}</span>));
        return bullet ? (
          <div key={i} className="flex gap-2 pl-1">
            <span className="text-primary">•</span>
            <span>{parts}</span>
          </div>
        ) : (
          <p key={i}>{parts}</p>
        );
      })}
    </div>
  );
}

export function AIAnalysis({ result }: { result: DiagnosisResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Bot className="size-4 text-primary" />
        {result.provider.startsWith("ollama") ? `IA locale Ollama (${result.model})` : "Moteur de règles MECANO AI (MockAIProvider)"} · {fmtDateTime(result.generatedAt)}
      </div>
      <p className="text-sm">{result.summary}</p>
      {result.narrative && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <MiniMarkdown text={result.narrative} />
        </div>
      )}
      {result.hypotheses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Causes possibles</div>
          {result.hypotheses.map((h) => (
            <div key={h.causeId} className="flex items-center gap-2 text-sm">
              <Pill tone={LEVEL[h.level].tone}>{LEVEL[h.level].label}</Pill>
              <span className="flex-1">{h.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{h.relatedCodes.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
      {result.recommendedChecks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contrôles recommandés</div>
          {result.recommendedChecks.map((c) => (
            <div key={c.dtc} className="text-sm">
              <span className="font-mono text-xs text-primary">{c.dtc}</span> <b>{c.title}</b> — <span className="text-muted-foreground">{c.instruction}</span>
            </div>
          ))}
        </div>
      )}
      {result.correlations.map((c) => (
        <div key={c} className="flex items-start gap-2 rounded-lg bg-info/10 p-2 text-sm text-info">
          <Lightbulb className="mt-0.5 size-4 shrink-0" /> {c}
        </div>
      ))}
      {result.unknownCodes.length > 0 && <div className="text-sm text-warning">Codes hors base : {result.unknownCodes.join(", ")} — Information non disponible.</div>}
      {result.safetyWarnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {result.safetyWarnings.map((w) => (
            <div key={w} className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground italic">{result.disclaimer}</p>
    </div>
  );
}
