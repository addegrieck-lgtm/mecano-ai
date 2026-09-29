"use client";

import Link from "next/link";
import { useState } from "react";
import { Car, Plus, Search } from "lucide-react";
import { useData, useServices } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, NativeSelect, PageHeader, Pill, TextInput } from "@/components/app/common";
import { VehicleFormDialog } from "@/components/vehicles/vehicle-form";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { fmtKm, FUEL_LABELS } from "@/lib/format";
import { FUEL_TYPES } from "@/types";

export default function VehiclesPage() {
  const s = useServices();
  const [q, setQ] = useState("");
  const [fuel, setFuel] = useState("");
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useData((svc) => svc.crm.vehicles(q), [q]);
  const list = (data ?? []).filter((v) => !fuel || v.fuel === fuel);
  return (
    <div>
      <PageHeader
        title="Véhicules"
        subtitle={`${data?.length ?? 0} véhicule(s)`}
        actions={
          can(s.ctx, "vehicles:write") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nouveau véhicule
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Immatriculation, VIN, marque, client…" className="pl-9" />
        </div>
        <NativeSelect value={fuel} onChange={(e) => setFuel(e.target.value)} className="sm:w-52">
          <option value="">Toutes énergies</option>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {FUEL_LABELS[f]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : list.length === 0 ? (
        <Empty title="Aucun véhicule" icon={Car} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <Link key={v.id} href={`/vehicles/${v.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-4 hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold uppercase">
                    {v.make} {v.model}
                  </div>
                  <div className="text-sm text-muted-foreground">{v.engine ?? "Moteur non renseigné"}</div>
                </div>
                <span className="rounded-md border-2 border-foreground/80 bg-foreground px-2 py-0.5 font-mono text-xs font-bold text-background">{v.registration}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Pill tone={v.fuel === "ELECTRIQUE" || v.fuel.startsWith("HYBRIDE") ? "info" : "muted"}>{FUEL_LABELS[v.fuel]}</Pill>
                {v.year && <span>{v.year}</span>}
                <span>{fmtKm(v.mileage)}</span>
                <span className="ml-auto">{v.client ? `${v.client.first_name} ${v.client.last_name}` : "Sans client"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <VehicleFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
