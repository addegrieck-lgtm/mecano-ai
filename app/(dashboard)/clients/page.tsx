"use client";

import Link from "next/link";
import { useState } from "react";
import { Car, Mail, Phone, Plus, Search, Users } from "lucide-react";
import { useData, useServices } from "@/components/app/app-provider";
import { Avatar, Empty, ErrorState, Loading, PageHeader, TextInput } from "@/components/app/common";
import { ClientFormDialog } from "@/components/clients/client-form";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";

export default function ClientsPage() {
  const s = useServices();
  const [q, setQ] = useState("");
  const [withVehicles, setWithVehicles] = useState<"all" | "with" | "without">("all");
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useData((svc) => svc.crm.clients(q), [q]);
  const list = (data ?? []).filter((c) => withVehicles === "all" || (withVehicles === "with" ? c.vehicleCount > 0 : c.vehicleCount === 0));

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${data?.length ?? 0} client(s)`}
        actions={
          can(s.ctx, "clients:write") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nouveau client
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, téléphone, email…" className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["all", "with", "without"] as const).map((k) => (
            <button key={k} onClick={() => setWithVehicles(k)} className={`rounded-md px-3 py-1.5 ${withVehicles === k ? "bg-background font-medium" : "text-muted-foreground"}`}>
              {k === "all" ? "Tous" : k === "with" ? "Avec véhicule" : "Sans véhicule"}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : list.length === 0 ? (
        <Empty title="Aucun client" icon={Users} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="flex gap-3 rounded-xl border bg-card p-4 hover:border-primary/40">
              <Avatar first={c.first_name} last={c.last_name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {c.first_name} {c.last_name}
                </div>
                {c.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3" /> {c.phone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="size-3" /> {c.email}
                  </div>
                )}
              </div>
              <div className="flex items-start gap-1 text-xs text-muted-foreground">
                <Car className="size-3.5" /> {c.vehicleCount}
              </div>
            </Link>
          ))}
        </div>
      )}
      <ClientFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
