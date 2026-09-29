"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Mic, MicOff, Send, ShieldAlert, User } from "lucide-react";
import { toast } from "sonner";
import { useApp, useData } from "@/components/app/app-provider";
import { NativeSelect, PageHeader, TextInput } from "@/components/app/common";
import { MiniMarkdown } from "@/components/diagnostics/ai-analysis";
import { useObdState } from "@/components/obd/obd-panel";
import { useMounted } from "@/components/app/use-mounted";
import { Button } from "@/components/ui/button";
import { askTechnicalQuestion, fetchAIStatus, type AIStatusDto } from "@/lib/ai/client";
import { buildDiagnosisInput } from "@/lib/ai/context-builder";
import type { ChatMessage, DiagnosisInput } from "@/lib/ai/provider";
import { stripWakeWord, WebSpeechVoiceInput } from "@/lib/voice/voice-input";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["J'ai P0302 sur cette voiture.", "Quels contrôles dois-je faire ?", "Explique-moi ce code.", "Quels symptômes sont cohérents ?"];

interface Msg extends ChatMessage {
  provider?: string;
  warnings?: string[];
}

export default function AssistantPage() {
  const { services } = useApp();
  const obd = useObdState();
  const [vehicleId, setVehicleId] = useState("");
  const [diagnosticId, setDiagnosticId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AIStatusDto | null>(null);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<() => void>(() => undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = useMemo(() => new WebSpeechVoiceInput(), []);
  const mounted = useMounted();
  const voiceOk = mounted && voice.isSupported();

  useEffect(() => {
    void fetchAIStatus().then(setStatus);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const { data } = useData(async (s) => ({ vehicles: await s.crm.vehicles(), diagnostics: await s.diagnostics.list() }));
  const diagnostics = (data?.diagnostics ?? []).filter((d) => !vehicleId || d.vehicle_id === vehicleId);
  const vehicle = data?.vehicles.find((v) => v.id === vehicleId);

  async function buildContext(): Promise<DiagnosisInput> {
    if (services && diagnosticId) {
      const full = await services.diagnostics.get(diagnosticId);
      return buildDiagnosisInput(full, await services.insights.vehicleHistory(full.vehicle.id));
    }
    const history = services && vehicle ? await services.insights.vehicleHistory(vehicle.id) : [];
    return {
      vehicle: vehicle ? { make: vehicle.make, model: vehicle.model, version: vehicle.version, year: vehicle.year, engine: vehicle.engine, fuel: vehicle.fuel, mileage: vehicle.mileage } : undefined,
      symptoms: [],
      codes: obd.status === "connected" ? obd.dtcs.map((d) => d.code) : [],
      liveData: obd.status === "connected" ? obd.live ?? null : null,
      history: history.filter((h) => h.kind === "CONCLUSION" || h.kind === "INTERVENTION").slice(-10).map((h) => `${h.date.slice(0, 10)} — ${h.title}${h.detail ? ` : ${h.detail}` : ""}`.slice(0, 300)),
    };
  }

  async function send(text: string) {
    const question = stripWakeWord(text).trim();
    if (!question || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const context = await buildContext();
      const res = await askTechnicalQuestion({ question, context, conversation: next.slice(-7, -1).map(({ role, content }) => ({ role, content })) });
      setMessages([...next, { role: "assistant", content: res.answer, provider: res.provider === "ollama" ? `Ollama · ${res.model}` : "Moteur de règles", warnings: res.warnings }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleVoice() {
    if (listening) {
      stopRef.current();
      setListening(false);
      return;
    }
    setListening(true);
    stopRef.current = voice.listen({
      onResult: (t, final) => {
        setInput(t);
        if (final) void send(t);
      },
      onEnd: () => setListening(false),
      onError: (e) => {
        toast.error(`Micro : ${e}`);
        setListening(false);
      },
    });
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col lg:h-[calc(100dvh-6rem)]">
      <PageHeader
        title="Assistant technique"
        subtitle={status ? (status.provider === "ollama" ? `IA locale Ollama · ${status.model}` : "Moteur de règles MECANO AI (Ollama non détecté)") : "…"}
      />
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <NativeSelect
          value={vehicleId}
          onChange={(e) => {
            setVehicleId(e.target.value);
            setDiagnosticId("");
          }}
        >
          <option value="">Véhicule : aucun</option>
          {data?.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.make} {v.model} · {v.registration}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={diagnosticId} onChange={(e) => setDiagnosticId(e.target.value)}>
          <option value="">Diagnostic : aucun (contexte véhicule{obd.status === "connected" ? " + OBD" : ""})</option>
          {diagnostics.map((d) => (
            <option key={d.id} value={d.id}>
              {d.codes.join(", ") || "sans code"} · {d.vehicle?.make} {d.vehicle?.model} · {d.created_at.slice(0, 10)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="size-10 text-primary" />
            <p className="max-w-md text-sm text-muted-foreground">
              Posez une question technique. MECANO AI utilise le véhicule, les codes défaut, les données OBD, les résultats de tests et l&apos;historique. Il distingue toujours hypothèse et résultat, et n&apos;invente aucune valeur.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-secondary" : "bg-primary/15 text-primary")}>
                  {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                </span>
                <div className={cn("max-w-[85%] rounded-xl p-3", m.role === "user" ? "bg-secondary" : "border bg-background/50")}>
                  {m.role === "user" ? <p className="text-sm">{m.content}</p> : <MiniMarkdown text={m.content} />}
                  {m.warnings && m.warnings.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-warning">
                      {m.warnings.map((w) => (
                        <div key={w} className="flex gap-1.5">
                          <ShieldAlert className="mt-0.5 size-3 shrink-0" /> {w}
                        </div>
                      ))}
                    </div>
                  )}
                  {m.provider && <div className="mt-2 text-[10px] text-muted-foreground">{m.provider} · ne remplace pas le jugement du professionnel</div>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> MECANO AI réfléchit…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <TextInput value={input} onChange={(e) => setInput(e.target.value)} placeholder="« J'ai P0302 sur cette voiture… »" maxLength={2000} className="h-12" />
        {voiceOk && (
          <Button type="button" size="icon-lg" variant={listening ? "destructive" : "secondary"} className="size-12" onClick={toggleVoice} aria-label="Dictée vocale">
            {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </Button>
        )}
        <Button type="submit" size="icon-lg" className="size-12" disabled={busy || !input.trim()} aria-label="Envoyer">
          <Send className="size-5" />
        </Button>
      </form>
    </div>
  );
}
