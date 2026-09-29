"use client";

import { useState } from "react";
import { CheckCircle2, CircleHelp, RotateCcw, ShieldAlert, Wrench, XCircle } from "lucide-react";
import { useAction } from "@/components/app/app-provider";
import { Pill, TextInput } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { getRule, walk } from "@/lib/diagnostics/engine";
import type { DiagnosticTestRecord, TestAnswer } from "@/types";

const ANSWER_LABEL: Record<TestAnswer, string> = { YES: "OUI", NO: "NON", UNKNOWN: "JE NE SAIS PAS" };

/** Diagnostic guidé d'un code : étape courante (OUI / NON / JE NE SAIS PAS) + étapes déjà réalisées. */
export function GuidedTest({ diagnosticId, dtc, tests, canEdit }: { diagnosticId: string; dtc: string; tests: DiagnosticTestRecord[]; canEdit: boolean }) {
  const rule = getRule(dtc);
  const { run, pending } = useAction();
  const [notes, setNotes] = useState("");
  if (!rule) {
    return (
      <div className="rounded-xl border p-4">
        <div className="font-mono font-bold">{dtc}</div>
        <p className="mt-1 text-sm text-muted-foreground">Information non disponible dans la base de démonstration. Se référer à la documentation technique du constructeur.</p>
      </div>
    );
  }
  const answers = tests.filter((t) => t.dtc === dtc).map((t) => ({ dtc: t.dtc, stepId: t.step_id, answer: t.answer }));
  const { done, current } = walk(dtc, answers);
  const stepIndex = current ? rule.tests.findIndex((t) => t.id === current.id) + 1 : null;
  const record = (stepId: string, answer: TestAnswer) =>
    run((s) => s.diagnostics.recordTest(diagnosticId, { dtc, stepId, answer, notes: notes || null }), "Résultat enregistré").then(() => setNotes(""));

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-lg font-bold text-destructive">{rule.dtc}</span>
        <span className="font-semibold">{rule.title}</span>
        <Pill tone={rule.severity === "HIGH" ? "danger" : rule.severity === "MEDIUM" ? "warning" : "muted"}>
          Gravité {rule.severity === "HIGH" ? "élevée" : rule.severity === "MEDIUM" ? "moyenne" : "faible"}
        </Pill>
        {canEdit && done.length > 0 && (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => run((s) => s.diagnostics.resetTests(diagnosticId, dtc), "Parcours réinitialisé")}>
            <RotateCcw className="size-3" /> Recommencer
          </Button>
        )}
      </div>

      {done.map(({ test, answer, outcome }, i) => (
        <div key={test.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">ÉTAPE {rule.tests.findIndex((t) => t.id === test.id) + 1}</span>
            <span className="font-medium">{test.title}</span>
            <Pill tone={answer === "YES" ? "success" : answer === "NO" ? "danger" : "muted"}>
              {answer === "YES" ? <CheckCircle2 className="size-3" /> : answer === "NO" ? <XCircle className="size-3" /> : <CircleHelp className="size-3" />} {ANSWER_LABEL[answer]}
            </Pill>
            {canEdit && i === done.length - 1 && (
              <span className="ml-auto flex gap-1">
                {(["YES", "NO", "UNKNOWN"] as const)
                  .filter((a) => a !== answer)
                  .map((a) => (
                    <Button key={a} size="xs" variant="ghost" disabled={pending} onClick={() => record(test.id, a)}>
                      → {ANSWER_LABEL[a]}
                    </Button>
                  ))}
              </span>
            )}
          </div>
          <div className="mt-1 text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Résultat observé : </span>
            {outcome.interpretation}
          </div>
          {tests.find((t) => t.dtc === dtc && t.step_id === test.id)?.notes && <div className="mt-1 text-xs italic">Note : {tests.find((t) => t.dtc === dtc && t.step_id === test.id)?.notes}</div>}
        </div>
      ))}

      {current ? (
        <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-4">
          <div className="text-xs font-bold tracking-wider text-primary">
            ÉTAPE {stepIndex} / {rule.tests.length} · CONTRÔLE RECOMMANDÉ
          </div>
          <div className="mt-1 text-lg font-semibold">{current.title}</div>
          <p className="mt-2 text-sm">{current.instruction}</p>
          {current.tools && <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Wrench className="size-3.5" /> {current.tools.join(", ")}</div>}
          {current.reference && <div className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{current.reference}</div>}
          {current.safety && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> {current.safety}
            </div>
          )}
          <p className="mt-4 text-base font-semibold">{current.question}</p>
          {canEdit ? (
            <>
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observation (optionnel)" className="mt-3" maxLength={1000} />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button size="lg" className="h-14 bg-success text-background hover:bg-success/80" disabled={pending} onClick={() => record(current.id, "YES")}>
                  OUI
                </Button>
                <Button size="lg" variant="destructive" className="h-14 text-base" disabled={pending} onClick={() => record(current.id, "NO")}>
                  NON
                </Button>
                <Button size="lg" variant="secondary" className="h-14 text-xs sm:text-sm" disabled={pending} onClick={() => record(current.id, "UNKNOWN")}>
                  JE NE SAIS PAS
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Lecture seule.</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">Parcours guidé terminé pour {rule.dtc}. Voir la conclusion à confirmer ci-dessous.</div>
      )}
    </div>
  );
}
