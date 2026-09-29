"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Bot, Camera, ClipboardList, FileText, FlaskConical, Gauge, Lightbulb, Loader2, Plug, Plus, ShieldAlert, Sparkles, Target, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAction, useApp, useData } from "@/components/app/app-provider";
import { Empty, ErrorState, Field, Loading, NativeSelect, PageHeader, Pill, Section, TextArea, TextInput } from "@/components/app/common";
import { AIAnalysis, LEVEL } from "@/components/diagnostics/ai-analysis";
import { CodeInput } from "@/components/diagnostics/code-input";
import { GuidedTest } from "@/components/diagnostics/guided-test";
import { ObdPanel } from "@/components/obd/obd-panel";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Button } from "@/components/ui/button";
import { analyzeDiagnosis } from "@/lib/ai/client";
import { buildDiagnosisInput } from "@/lib/ai/context-builder";
import type { DiagnosisResult } from "@/lib/ai/provider";
import { CAUSES } from "@/data/causes";
import { LIVE_DATA_LABELS } from "@/lib/obd/obd-parser";
import { DIAGNOSTIC_STATUS, fmtDateTime, fmtKm, FUEL_LABELS, QUOTE_STATUS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatEuro } from "@/lib/quotes/calc";
import { cn } from "@/lib/utils";
import type { VehicleLiveData } from "@/types";

const STEPS = ["Véhicule", "Symptômes", "Codes défaut", "Données OBD", "Analyse", "Hypothèses", "Tests", "Résultats", "Conclusion", "Devis"];

function DiagnosticDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { services, refresh } = useApp();
  const { run, pending } = useAction();
  const [analyzing, setAnalyzing] = useState(false);
  const [showObd, setShowObd] = useState(false);
  const [editCodes, setEditCodes] = useState(false);
  const [measure, setMeasure] = useState({ label: "", value: "", unit: "", notes: "" });
  const autoRan = useRef(false);
  const { data, loading, error } = useData(
    async (s) => {
      const full = await s.diagnostics.get(id);
      const [history, quotes, teams, members] = await Promise.all([s.insights.vehicleHistory(full.vehicle.id), s.work.quotes({ vehicle_id: full.vehicle.id }), s.org.teams(), s.org.members()]);
      return { full, history, quotes: quotes.filter((q) => q.diagnostic_id === id), teams, members };
    },
    [id],
  );

  const [conclusion, setConclusion] = useState<{ cause_id: string; summary: string; recommended_repair: string; confirmed: boolean } | null>(null);

  async function analyze() {
    if (!data || !services) return;
    setAnalyzing(true);
    try {
      const result = await analyzeDiagnosis(buildDiagnosisInput(data.full, data.history));
      await run((s) => s.diagnostics.saveAnalysis(id, result, result.provider), "Analyse MECANO AI terminée");
    } finally {
      setAnalyzing(false);
    }
  }

  // Analyse automatique à l'arrivée depuis le parcours "Nouveau diagnostic"
  useEffect(() => {
    if (!data || autoRan.current || params.get("analyze") !== "1" || data.full.diagnostic.ai_analysis || !data.full.canEdit) return;
    autoRan.current = true;
    void analyze();
    router.replace(`/diagnostics/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading || !services) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Diagnostic introuvable"} />;
  const { full, quotes, teams, members } = data;
  const { diagnostic: d, vehicle: v, client, codes, evaluation: ev, canEdit } = full;
  const ai = d.ai_analysis as DiagnosisResult | null;
  const author = members.find((m) => m.profile.id === d.user_id)?.profile;
  const team = teams.find((t) => t.id === d.team_id);
  const codeList = codes.map((c) => c.code);
  const stepDone = [true, d.symptoms.length > 0, codes.length > 0, full.liveData.length > 0, !!ai, ev.hypotheses.length > 0, full.tests.length > 0, full.results.length > 0 || full.tests.length > 0, !!d.conclusion, quotes.length > 0];
  const concl = conclusion ?? {
    cause_id: d.conclusion?.cause_id ?? ev.suggestedConclusion.causeId ?? "",
    summary: d.conclusion?.summary ?? ev.suggestedConclusion.text,
    recommended_repair: d.conclusion?.recommended_repair ?? (ev.suggestedConclusion.causeId ? CAUSES[ev.suggestedConclusion.causeId]?.repair.label ?? "" : ""),
    confirmed: d.conclusion?.confirmed_by_technician ?? false,
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: "/diagnostics", label: "Diagnostics" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Diagnostic {codeList.length ? codeList.join(" · ") : ""}
            <Pill tone={DIAGNOSTIC_STATUS[d.status].tone}>{DIAGNOSTIC_STATUS[d.status].label}</Pill>
          </span>
        }
        subtitle={`${fmtDateTime(d.created_at)} · ${author ? `${author.first_name} ${author.name}` : "—"}${team ? ` · ${team.name}` : ""}`}
        actions={
          <Button variant="outline" onClick={() => setShowObd((s) => !s)}>
            <Plug className="size-4" /> {showObd ? "Masquer l'OBD" : "Connecter OBD"}
          </Button>
        }
      />

      <div className="-mx-4 overflow-x-auto px-4">
        <ol className="flex min-w-max gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", stepDone[i] ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground")}>
              <span className="font-bold">{i + 1}</span> {s}
            </li>
          ))}
        </ol>
      </div>

      {showObd && (
        <ObdPanel
          vehicle={v}
          onCodes={async (c) => {
            for (const code of c) await services.diagnostics.addCode(id, code, "OBD").catch(() => undefined);
            refresh();
          }}
          onLive={(liveData: VehicleLiveData, sid) => run((s) => s.diagnostics.addLiveData(id, liveData, sid), "Données live ajoutées au diagnostic")}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="1. Véhicule" icon={ClipboardList}>
          <Link href={`/vehicles/${v.id}`} className="block text-lg font-semibold hover:text-primary">
            {v.make} {v.model} <span className="font-mono text-sm text-muted-foreground">{v.registration}</span>
          </Link>
          <div className="text-sm text-muted-foreground">{[v.engine, v.year, FUEL_LABELS[v.fuel], fmtKm(d.mileage ?? v.mileage)].filter(Boolean).join(" · ")}</div>
          <div className="mt-1 text-sm">Client : {client ? `${client.first_name} ${client.last_name}` : "—"}</div>
        </Section>
        <Section title="2. Symptômes" icon={ClipboardList}>
          <div className="flex flex-wrap gap-1.5">
            {d.symptoms.length ? d.symptoms.map((s) => <Pill key={s}>{s}</Pill>) : <span className="text-sm text-muted-foreground">Aucun symptôme renseigné</span>}
          </div>
          {d.complaint && <p className="mt-2 text-sm text-muted-foreground">« {d.complaint} »</p>}
        </Section>
        <Section
          title="3. Codes défaut"
          icon={ClipboardList}
          actions={
            canEdit && (
              <Button size="xs" variant="ghost" onClick={() => setEditCodes((e) => !e)}>
                {editCodes ? <X className="size-3" /> : <Plus className="size-3" />} {editCodes ? "Fermer" : "Modifier"}
              </Button>
            )
          }
        >
          {editCodes ? (
            <CodeInput
              value={codeList}
              onChange={async (next) => {
                for (const c of next.filter((x) => !codeList.includes(x))) await run((s) => s.diagnostics.addCode(id, c));
                for (const c of codes.filter((x) => !next.includes(x.code))) await run((s) => s.diagnostics.removeCode(id, c.id));
              }}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {codes.length === 0 && <span className="text-sm text-muted-foreground">Aucun code</span>}
              {codes.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-destructive/15 px-1.5 font-mono font-bold text-destructive">{c.code}</span>
                  <span className="flex-1 truncate text-muted-foreground">{c.description}</span>
                  <span className="text-[10px] text-muted-foreground">{c.source}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="4. Données OBD" icon={Gauge}>
        {full.liveData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune donnée live associée. Utilisez « Connecter OBD » pour en capturer.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(full.liveData.at(-1)!.data).map(([k, val]) => (
              <div key={k} className="rounded-lg bg-muted/50 p-2">
                <div className="truncate text-[11px] text-muted-foreground">{LIVE_DATA_LABELS[k as keyof VehicleLiveData]?.label ?? k}</div>
                <div className="font-semibold tabular-nums">
                  {val} <span className="text-xs font-normal text-muted-foreground">{LIVE_DATA_LABELS[k as keyof VehicleLiveData]?.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {full.liveData.length > 0 && <div className="mt-2 text-[11px] text-muted-foreground">Capture du {fmtDateTime(full.liveData.at(-1)!.captured_at)} · {full.liveData.length} capture(s)</div>}
      </Section>

      <Section
        title="5. Analyse MECANO AI"
        icon={Bot}
        actions={
          canEdit && (
            <Button size="sm" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {ai ? "Relancer l'analyse" : "Analyser avec MECANO AI"}
            </Button>
          )
        }
      >
        {analyzing && !ai ? <Loading label="Analyse en cours…" /> : ai ? <AIAnalysis result={ai} /> : <Empty title="Analyse non lancée" icon={Bot} />}
      </Section>

      <Section title="6. Hypothèses (moteur de règles, mises à jour en direct)" icon={Lightbulb}>
        {ev.hypotheses.length === 0 ? (
          <Empty title="Aucune hypothèse : ajoutez des codes ou des symptômes" />
        ) : (
          <div className="flex flex-col gap-2">
            {ev.hypotheses.slice(0, 8).map((h, i) => (
              <div key={h.causeId} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                <span className="w-5 text-center font-bold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{h.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.system} · {h.relatedCodes.join(", ")}
                  </div>
                </div>
                <Pill tone={LEVEL[h.status].tone}>{LEVEL[h.status].label}</Pill>
              </div>
            ))}
            {ev.correlations.map((c) => (
              <div key={c.message} className="flex items-start gap-2 rounded-lg bg-info/10 p-2 text-sm text-info">
                <Lightbulb className="mt-0.5 size-4 shrink-0" /> {c.message}
              </div>
            ))}
            {ev.safety.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {ev.safety.map((s) => (
                  <div key={s} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="7. Tests guidés" icon={FlaskConical}>
        {codes.length === 0 ? (
          <Empty title="Aucun code défaut : pas de parcours guidé" />
        ) : (
          <div className="flex flex-col gap-3">
            {codeList.map((c) => (
              <GuidedTest key={c} diagnosticId={id} dtc={c} tests={full.tests} canEdit={canEdit} />
            ))}
          </div>
        )}
      </Section>

      <Section title="8. Résultats et mesures" icon={Gauge}>
        <p className="mb-3 text-xs text-muted-foreground">Mesures relevées par le technicien (valeurs réelles uniquement — MECANO AI ne génère aucune valeur).</p>
        {full.results.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            {full.results.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="font-mono">
                  {r.value} {r.unit}
                </span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{r.notes}</span>
                {canEdit && (
                  <button onClick={() => run((s) => s.diagnostics.removeResult(id, r.id))} className="text-muted-foreground hover:text-destructive" aria-label="Supprimer la mesure">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <form
            className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!measure.label || !measure.value) return toast.error("Libellé et valeur requis");
              const r = await run((s) => s.diagnostics.addResult(id, measure), "Mesure enregistrée");
              if (r) setMeasure({ label: "", value: "", unit: "", notes: "" });
            }}
          >
            <TextInput placeholder="Mesure (ex. compression cyl. 2)" value={measure.label} onChange={(e) => setMeasure({ ...measure, label: e.target.value })} maxLength={120} />
            <TextInput placeholder="Valeur" value={measure.value} onChange={(e) => setMeasure({ ...measure, value: e.target.value })} maxLength={120} />
            <TextInput placeholder="Unité" value={measure.unit} onChange={(e) => setMeasure({ ...measure, unit: e.target.value })} maxLength={20} />
            <TextInput placeholder="Note" value={measure.notes} onChange={(e) => setMeasure({ ...measure, notes: e.target.value })} maxLength={500} />
            <Button type="submit" disabled={pending}>
              <Plus className="size-4" /> Ajouter
            </Button>
          </form>
        )}
      </Section>

      <Section title="9. Conclusion" icon={Target}>
        {d.conclusion && (
          <div className={cn("mb-3 rounded-lg border p-3 text-sm", d.conclusion.confirmed_by_technician ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
            <div className="font-semibold">{d.conclusion.confirmed_by_technician ? "✓ Conclusion confirmée par le technicien" : "Conclusion à confirmer"}</div>
            <div className="mt-1">{d.conclusion.summary}</div>
            {d.conclusion.recommended_repair && <div className="mt-1 text-muted-foreground">Réparation recommandée : {d.conclusion.recommended_repair}</div>}
          </div>
        )}
        {canEdit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cause retenue">
              <NativeSelect value={concl.cause_id} onChange={(e) => setConclusion({ ...concl, cause_id: e.target.value, recommended_repair: CAUSES[e.target.value]?.repair.label ?? concl.recommended_repair })}>
                <option value="">— Non déterminée —</option>
                {ev.hypotheses.map((h) => (
                  <option key={h.causeId} value={h.causeId}>
                    {h.label} ({LEVEL[h.status].label})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Réparation recommandée">
              <TextInput value={concl.recommended_repair} onChange={(e) => setConclusion({ ...concl, recommended_repair: e.target.value })} maxLength={500} />
            </Field>
            <Field label="Conclusion" className="sm:col-span-2">
              <TextArea value={concl.summary} onChange={(e) => setConclusion({ ...concl, summary: e.target.value })} rows={3} maxLength={3000} />
            </Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={concl.confirmed} onChange={(e) => setConclusion({ ...concl, confirmed: e.target.checked })} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Je confirme cette conclusion après mes contrôles (sinon elle reste « à confirmer »).</span>
            </label>
            <div className="sm:col-span-2">
              <Button
                size="lg"
                disabled={pending}
                onClick={() =>
                  run(
                    (s) => s.diagnostics.conclude(id, { cause_id: concl.cause_id || null, summary: concl.summary, recommended_repair: concl.recommended_repair || null, confirmed_by_technician: concl.confirmed }),
                    "Conclusion enregistrée",
                  ).then(() => setConclusion(null))
                }
              >
                <Target className="size-4" /> {d.conclusion ? "Mettre à jour la conclusion" : "Enregistrer la conclusion"}
              </Button>
            </div>
          </div>
        ) : (
          !d.conclusion && <p className="text-sm text-muted-foreground">{ev.suggestedConclusion.text}</p>
        )}
      </Section>

      <Section title="10. Devis" icon={FileText}>
        <div className="flex flex-col gap-2">
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:border-primary/40">
              <span>
                {q.number} · {fmtDateTime(q.created_at)}
              </span>
              <span className="flex items-center gap-2">
                {formatEuro(q.totals.totalTTC)} TTC {q.totals.missingPrices > 0 && <Pill tone="warning">{q.totals.missingPrices} prix à renseigner</Pill>}
                <Pill tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Pill>
              </span>
            </Link>
          ))}
          {can(services.ctx, "quotes:write") && (
            <Button
              size="lg"
              className="h-14 text-base font-bold"
              disabled={!d.conclusion || pending}
              onClick={async () => {
                const q = await run((s) => s.work.createQuoteFromDiagnostic(id), "Devis pré-rempli créé");
                if (q) router.push(`/quotes/${q.id}`);
              }}
            >
              <FileText className="size-5" /> CRÉER UN DEVIS
            </Button>
          )}
          {!d.conclusion && <p className="text-xs text-muted-foreground">Enregistrez une conclusion pour pré-remplir le devis (intervention, pièces, main-d&apos;œuvre). Les prix viennent uniquement du catalogue du garage.</p>}
        </div>
      </Section>

      <Section title="Photos du diagnostic" icon={Camera}>
        <PhotoGallery entityType="diagnostic" entityId={id} vehicleId={v.id} />
      </Section>
    </div>
  );
}

export default function DiagnosticPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DiagnosticDetail />
    </Suspense>
  );
}
