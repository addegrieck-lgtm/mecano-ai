"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useApp, useData } from "@/components/app/app-provider";
import { Field, Loading, NativeSelect, PageHeader, Section } from "@/components/app/common";
import { ObdPanel, useObdState } from "@/components/obd/obd-panel";
import { Button } from "@/components/ui/button";

export default function ObdPage() {
  const router = useRouter();
  const { services, refresh } = useApp();
  const state = useObdState();
  const [vehicleId, setVehicleId] = useState(state.meta.vehicleId ?? "");
  const { data } = useData((s) => s.crm.vehicles());
  if (!data || !services) return <Loading />;
  const vehicle = data.find((v) => v.id === (vehicleId || state.meta.vehicleId)) ?? null;

  async function createDiagnostic() {
    if (!services || !vehicle) return toast.error("Sélectionnez le véhicule");
    try {
      const d = await services.diagnostics.create({ vehicle_id: vehicle.id, symptoms: [], codes: state.dtcs.map((c) => c.code), obd_session_id: state.meta.sessionId ?? null });
      if (state.live && !state.meta.sessionId) await services.diagnostics.addLiveData(d.id, state.live);
      refresh();
      router.push(`/diagnostics/${d.id}?analyze=1`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Boîtier OBD" subtitle="Voiture → Port OBD-II → Boîtier Bluetooth/BLE → Téléphone → MECANO AI" />
      <Section>
        <Field label="Véhicule diagnostiqué" hint="Le VIN lu par le boîtier permet aussi de retrouver automatiquement le véhicule.">
          <NativeSelect value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={state.status === "connected"}>
            <option value="">— Sélectionner —</option>
            {data.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} · {v.registration}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </Section>
      <ObdPanel vehicle={vehicle} />
      {state.status === "connected" && (
        <Button size="lg" className="h-14 text-base font-bold" onClick={createDiagnostic} disabled={!vehicle}>
          <Stethoscope className="size-5" /> Analyser avec MECANO AI {state.dtcs.length ? `(${state.dtcs.map((d) => d.code).join(", ")})` : ""}
        </Button>
      )}
    </div>
  );
}
