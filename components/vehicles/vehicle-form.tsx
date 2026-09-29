"use client";

import { useEffect } from "react";
import { Field, FormDialog, NativeSelect, TextArea, TextInput } from "@/components/app/common";
import { useAction, useData } from "@/components/app/app-provider";
import { useForm } from "@/components/app/use-form";
import { FUEL_LABELS } from "@/lib/format";
import { vehicleSchema } from "@/lib/validation/schemas";
import { FUEL_TYPES, type Vehicle } from "@/types";

const EMPTY = { client_id: "", registration: "", vin: "", make: "", model: "", version: "", year: "", engine: "", fuel: "DIESEL", mileage: "", notes: "" };

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicle?: Vehicle | null;
  defaultClientId?: string;
  onSaved?: (v: Vehicle) => void;
}) {
  const f = useForm<Record<string, string>>(EMPTY);
  const { run, pending } = useAction();
  const { data: clients } = useData((s) => s.crm.clients());
  const { reset } = f;
  useEffect(() => {
    if (!open) return;
    reset(
      vehicle
        ? {
            client_id: vehicle.client_id ?? "",
            registration: vehicle.registration,
            vin: vehicle.vin ?? "",
            make: vehicle.make,
            model: vehicle.model,
            version: vehicle.version ?? "",
            year: vehicle.year?.toString() ?? "",
            engine: vehicle.engine ?? "",
            fuel: vehicle.fuel,
            mileage: vehicle.mileage?.toString() ?? "",
            notes: vehicle.notes ?? "",
          }
        : { ...EMPTY, client_id: defaultClientId ?? "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle, defaultClientId]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={vehicle ? "Modifier le véhicule" : "Nouveau véhicule"}
      description="Thermique, diesel, essence, hybride ou électrique."
      pending={pending}
      onSubmit={async () => {
        const data = f.validate(vehicleSchema);
        if (!data) return;
        const saved = await run((s) => (vehicle ? s.crm.updateVehicle(vehicle.id, data) : s.crm.createVehicle(data)), vehicle ? "Véhicule mis à jour" : "Véhicule créé");
        if (saved) {
          onOpenChange(false);
          onSaved?.(saved);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Immatriculation *" error={f.errors.registration}>
          <TextInput {...f.bind("registration")} placeholder="AB-123-CD" className="uppercase" autoComplete="off" />
        </Field>
        <Field label="Client" error={f.errors.client_id}>
          <NativeSelect {...f.bind("client_id")}>
            <option value="">— Aucun —</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.last_name} {c.first_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Marque *" error={f.errors.make}>
          <TextInput {...f.bind("make")} placeholder="Peugeot" />
        </Field>
        <Field label="Modèle *" error={f.errors.model}>
          <TextInput {...f.bind("model")} placeholder="308" />
        </Field>
        <Field label="Version" error={f.errors.version}>
          <TextInput {...f.bind("version")} />
        </Field>
        <Field label="Moteur" error={f.errors.engine}>
          <TextInput {...f.bind("engine")} placeholder="1.6 BlueHDi 120" />
        </Field>
        <Field label="Énergie *" error={f.errors.fuel}>
          <NativeSelect {...f.bind("fuel")}>
            {FUEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {FUEL_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Année" error={f.errors.year}>
          <TextInput {...f.bind("year")} type="number" inputMode="numeric" min={1900} max={2100} />
        </Field>
        <Field label="Kilométrage" error={f.errors.mileage}>
          <TextInput {...f.bind("mileage")} type="number" inputMode="numeric" min={0} />
        </Field>
        <Field label="VIN" error={f.errors.vin} hint="Lu automatiquement par l'OBD lorsqu'il est disponible.">
          <TextInput {...f.bind("vin")} className="uppercase" maxLength={17} autoComplete="off" />
        </Field>
        <Field label="Notes" error={f.errors.notes} className="sm:col-span-2">
          <TextArea {...f.bind("notes")} rows={2} />
        </Field>
      </div>
    </FormDialog>
  );
}
