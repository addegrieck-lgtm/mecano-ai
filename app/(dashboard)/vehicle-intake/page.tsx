"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ClipboardCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { useApp, useData } from "@/components/app/app-provider";
import { Field, Loading, NativeSelect, PageHeader, Pill, Section, TextArea, TextInput } from "@/components/app/common";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtKm } from "@/lib/format";
import { intakeSchema } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";
import type { ConditionLevel, FuelLevel } from "@/types";

const LIGHTS = ["Voyant moteur", "Voyant préchauffage", "ABS", "Airbag", "Pression pneus", "Batterie", "Huile", "Température", "Freinage", "Anti-pollution", "ESP"];
const CONDITIONS: { key: "bodywork" | "tires" | "rims" | "windshield" | "lighting"; label: string }[] = [
  { key: "bodywork", label: "Carrosserie" },
  { key: "tires", label: "Pneus" },
  { key: "rims", label: "Jantes" },
  { key: "windshield", label: "Pare-brise" },
  { key: "lighting", label: "Éclairage" },
];
const LEVELS: { v: ConditionLevel; label: string; cls: string }[] = [
  { v: "OK", label: "OK", cls: "border-success bg-success/15 text-success" },
  { v: "A_SURVEILLER", label: "À surveiller", cls: "border-warning bg-warning/15 text-warning" },
  { v: "DEFAUT", label: "Défaut", cls: "border-destructive bg-destructive/15 text-destructive" },
];

function Intake() {
  const params = useSearchParams();
  const router = useRouter();
  const { services, refresh } = useApp();
  const [vehicleId, setVehicleId] = useState(params.get("vehicle") ?? "");
  const [form, setForm] = useState({
    mileage: "",
    fuel_level: "1/2" as FuelLevel,
    warning_lights: [] as string[],
    bodywork: "OK" as ConditionLevel,
    tires: "OK" as ConditionLevel,
    rims: "OK" as ConditionLevel,
    windshield: "OK" as ConditionLevel,
    lighting: "OK" as ConditionLevel,
    observations: "",
    client_signature_name: "",
    client_validated: false,
  });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data } = useData(async (s) => ({ vehicles: await s.crm.vehicles(), intakes: await s.crm.intakes() }));
  if (!data || !services) return <Loading />;
  const vehicle = data.vehicles.find((v) => v.id === vehicleId);

  async function save() {
    const parsed = intakeSchema.safeParse({ ...form, vehicle_id: vehicleId });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Formulaire invalide");
    if (parsed.data.client_validated && !parsed.data.client_signature_name) return toast.error("Nom du client requis pour la validation");
    setSaving(true);
    try {
      const intake = await services!.crm.createIntake(parsed.data);
      refresh();
      toast.success("Réception enregistrée");
      setSavedId(intake.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (savedId && vehicle) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader title="Réception enregistrée" subtitle={`${vehicle.make} ${vehicle.model} · ${vehicle.registration}`} />
        <Section title="Photos de réception" icon={Camera}>
          <PhotoGallery entityType="intake" entityId={savedId} vehicleId={vehicle.id} />
        </Section>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={() => router.push(`/diagnostics/new?vehicle=${vehicle.id}`)}>
            Lancer un diagnostic
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
            Fiche véhicule
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title="Réception véhicule" subtitle="État du véhicule à l'arrivée, validé par le client" />
      <Section>
        <Field label="Véhicule *">
          <NativeSelect
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              const v = data.vehicles.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, mileage: v?.mileage?.toString() ?? "", client_signature_name: v?.client ? `${v.client.first_name} ${v.client.last_name}` : "" }));
            }}
          >
            <option value="">— Sélectionner —</option>
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} · {v.registration} {v.client ? `(${v.client.last_name})` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Compteurs">
          <Field label="Kilométrage" hint={vehicle ? `Dernier relevé : ${fmtKm(vehicle.mileage)}` : undefined}>
            <TextInput value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} type="number" inputMode="numeric" />
          </Field>
          <div className="mt-3 text-sm font-medium">Niveau de carburant / charge</div>
          <div className="mt-1.5 grid grid-cols-5 gap-1.5">
            {(["0", "1/4", "1/2", "3/4", "1"] as FuelLevel[]).map((l) => (
              <button key={l} type="button" onClick={() => setForm({ ...form, fuel_level: l })} className={cn("rounded-lg border py-2.5 text-sm", form.fuel_level === l ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground")}>
                {l === "1" ? "Plein" : l === "0" ? "Vide" : l}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Voyants allumés">
          <div className="flex flex-wrap gap-1.5">
            {LIGHTS.map((l) => {
              const on = form.warning_lights.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setForm({ ...form, warning_lights: on ? form.warning_lights.filter((x) => x !== l) : [...form.warning_lights, l] })}
                  className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-warning bg-warning/15 text-warning" : "text-muted-foreground")}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </Section>
      </div>
      <Section title="État du véhicule">
        <div className="flex flex-col gap-2">
          {CONDITIONS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <span className="w-32 text-sm font-medium">{label}</span>
              <div className="grid flex-1 grid-cols-3 gap-1.5">
                {LEVELS.map((lv) => (
                  <button key={lv.v} type="button" onClick={() => setForm({ ...form, [key]: lv.v })} className={cn("rounded-lg border py-2 text-sm", form[key] === lv.v ? lv.cls : "text-muted-foreground")}>
                    {lv.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Field label="Observations" className="mt-3">
          <TextArea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} rows={3} placeholder="Rayures, objets de valeur, demandes du client…" maxLength={3000} />
        </Field>
      </Section>
      <Section title="Validation client">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du client">
            <TextInput value={form.client_signature_name} onChange={(e) => setForm({ ...form, client_signature_name: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:mt-6">
            <input type="checkbox" checked={form.client_validated} onChange={(e) => setForm({ ...form, client_validated: e.target.checked })} className="size-5 accent-[var(--primary)]" />
            Le client a vérifié et valide l&apos;état du véhicule
          </label>
        </div>
      </Section>
      <Button size="lg" className="h-14 text-base font-bold" onClick={save} disabled={saving || !vehicleId}>
        <Save className="size-5" /> Enregistrer la réception
      </Button>

      <Section title="Dernières réceptions" icon={ClipboardCheck}>
        <div className="flex flex-col gap-2">
          {data.intakes.slice(0, 8).map((i) => {
            const v = data.vehicles.find((x) => x.id === i.vehicle_id);
            return (
              <Link key={i.id} href={`/vehicles/${i.vehicle_id}`} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:border-primary/40">
                <span>
                  {v ? `${v.make} ${v.model} · ${v.registration}` : "Véhicule"} <span className="text-xs text-muted-foreground">· {fmtDateTime(i.created_at)}</span>
                </span>
                {i.client_validated_at ? <Pill tone="success">Validé client</Pill> : <Pill tone="warning">Non validé</Pill>}
              </Link>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

export default function VehicleIntakePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Intake />
    </Suspense>
  );
}
