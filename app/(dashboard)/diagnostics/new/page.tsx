"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Car, Check, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp, useData } from "@/components/app/app-provider";
import { Field, Loading, NativeSelect, PageHeader, Section, TextArea, TextInput } from "@/components/app/common";
import { CodeInput } from "@/components/diagnostics/code-input";
import { SymptomPicker } from "@/components/diagnostics/symptom-picker";
import { ObdPanel } from "@/components/obd/obd-panel";
import { Button } from "@/components/ui/button";
import { LIVE_DATA_LABELS } from "@/lib/obd/obd-parser";
import { fmtKm, FUEL_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VehicleLiveData } from "@/types";

const STEPS = ["Véhicule", "Symptômes", "Codes défaut", "Données OBD"];

function NewDiagnostic() {
  const params = useSearchParams();
  const router = useRouter();
  const { services, refresh } = useApp();
  const [step, setStep] = useState(params.get("vehicle") ? 1 : 0);
  const [vehicleId, setVehicleId] = useState(params.get("vehicle") ?? "");
  const [q, setQ] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [complaint, setComplaint] = useState("");
  const [mileage, setMileage] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [live, setLive] = useState<VehicleLiveData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);
  const { data } = useData(async (s) => ({ vehicles: await s.crm.vehicles(), teams: await s.org.teams() }));
  if (!data || !services) return <Loading />;
  const vehicle = data.vehicles.find((v) => v.id === vehicleId) ?? null;
  const filtered = data.vehicles.filter((v) => `${v.registration} ${v.make} ${v.model} ${v.client?.last_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  async function create() {
    if (!services || !vehicle) return;
    setSaving(true);
    try {
      const d = await services.diagnostics.create({
        vehicle_id: vehicle.id,
        team_id: teamId || null,
        symptoms,
        complaint: complaint || null,
        mileage: mileage || null,
        codes,
        obd_session_id: sessionId,
      });
      if (live && !sessionId) await services.diagnostics.addLiveData(d.id, live);
      refresh();
      toast.success("Diagnostic créé");
      router.push(`/diagnostics/${d.id}?analyze=1`);
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nouveau diagnostic" subtitle="Véhicule → Symptômes → Codes défaut → Données OBD → Analyse" back={{ href: "/diagnostics", label: "Diagnostics" }} />
      <ol className="mb-5 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              onClick={() => (i === 0 || vehicle) && setStep(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs sm:text-sm",
                i === step ? "border-primary bg-primary/10 text-foreground" : i < step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", i < step ? "bg-success text-background" : i === step ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {vehicle && step > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3">
          <Car className="size-5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">
              {vehicle.make} {vehicle.model} · {vehicle.registration}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {[vehicle.engine, vehicle.year, FUEL_LABELS[vehicle.fuel], fmtKm(vehicle.mileage)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
            Changer
          </Button>
        </div>
      )}

      {step === 0 && (
        <Section title="1. Sélectionner le véhicule">
          <div className="relative mb-3">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Immatriculation, marque, client…" className="pl-9" autoFocus />
          </div>
          <div className="grid max-h-[50dvh] gap-2 overflow-y-auto sm:grid-cols-2">
            {filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setVehicleId(v.id);
                  setMileage(v.mileage?.toString() ?? "");
                  setStep(1);
                }}
                className={cn("rounded-lg border p-3 text-left hover:border-primary/50", v.id === vehicleId && "border-primary bg-primary/10")}
              >
                <div className="font-semibold">
                  {v.make} {v.model} <span className="font-mono text-xs text-muted-foreground">{v.registration}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {v.engine} · {v.client ? `${v.client.first_name} ${v.client.last_name}` : "Sans client"}
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {step === 1 && (
        <Section title="2. Symptômes">
          <SymptomPicker value={symptoms} onChange={setSymptoms} />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Description du client" className="sm:col-span-2">
              <TextArea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} placeholder="Ex. : à-coups à froid depuis une semaine" maxLength={2000} />
            </Field>
            <div className="flex flex-col gap-3">
              <Field label="Kilométrage">
                <TextInput value={mileage} onChange={(e) => setMileage(e.target.value)} type="number" inputMode="numeric" />
              </Field>
              <Field label="Équipe">
                <NativeSelect value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Mon équipe</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </div>
        </Section>
      )}

      {step === 2 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="3. Codes défaut">
            <p className="mb-3 text-sm text-muted-foreground">Saisissez les codes manuellement ou lisez-les avec le boîtier OBD.</p>
            <CodeInput value={codes} onChange={setCodes} />
          </Section>
          <ObdPanel
            vehicle={vehicle}
            onCodes={(c, sid) => {
              setCodes((prev) => [...new Set([...prev, ...c])]);
              if (sid) setSessionId(sid);
            }}
            onLive={(d, sid) => {
              setLive(d);
              if (sid) setSessionId(sid);
            }}
          />
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="4. Données OBD">
            {live ? (
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(live) as (keyof VehicleLiveData)[]).map((k) => (
                  <div key={k} className="rounded-lg bg-muted/50 p-2">
                    <div className="text-[11px] text-muted-foreground">{LIVE_DATA_LABELS[k]?.label ?? k}</div>
                    <div className="font-semibold tabular-nums">
                      {live[k]} {LIVE_DATA_LABELS[k]?.unit}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée live capturée. Vous pouvez les lire avec le boîtier (bouton « Lire ») ou poursuivre sans.</p>
            )}
            <div className="mt-4 rounded-lg border p-3 text-sm">
              <div className="font-medium">Récapitulatif</div>
              <div className="text-muted-foreground">Symptômes : {symptoms.join(", ") || "—"}</div>
              <div className="text-muted-foreground">Codes : {codes.join(", ") || "aucun"}</div>
              <div className="text-muted-foreground">Session OBD : {sessionId ? "enregistrée" : "—"}</div>
            </div>
          </Section>
          <ObdPanel
            vehicle={vehicle}
            onCodes={(c, sid) => {
              setCodes((prev) => [...new Set([...prev, ...c])]);
              if (sid) setSessionId(sid);
            }}
            onLive={(d, sid) => {
              setLive(d);
              if (sid) setSessionId(sid);
            }}
          />
        </div>
      )}

      <div className="no-print sticky bottom-20 z-10 mt-5 flex justify-between gap-2 rounded-xl border bg-background/95 p-3 backdrop-blur lg:bottom-4">
        <Button variant="outline" size="lg" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4" /> Retour
        </Button>
        {step < 3 ? (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!vehicle}>
            Suivant <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={create} disabled={!vehicle || saving} className="font-bold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Analyser avec MECANO AI
          </Button>
        )}
      </div>
    </div>
  );
}

export default function NewDiagnosticPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewDiagnostic />
    </Suspense>
  );
}
