"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Car, FileText, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useAction, useData, useServices } from "@/components/app/app-provider";
import { ConfirmDialog, Empty, ErrorState, KeyValue, Loading, PageHeader, Pill, Section } from "@/components/app/common";
import { ClientFormDialog } from "@/components/clients/client-form";
import { VehicleFormDialog } from "@/components/vehicles/vehicle-form";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { fmtDate, fmtKm, FUEL_LABELS, INTERVENTION_STATUS, QUOTE_STATUS } from "@/lib/format";
import { formatEuro } from "@/lib/quotes/calc";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useServices();
  const { run } = useAction();
  const [edit, setEdit] = useState(false);
  const [addVehicle, setAddVehicle] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { data, loading, error } = useData(
    async (svc) => {
      const client = await svc.crm.client(id);
      const [vehicles, quotes, interventions] = await Promise.all([
        svc.crm.vehicles("", id),
        svc.work.quotes({ client_id: id }),
        svc.work.interventions().then((l) => l.filter((i) => i.client_id === id)),
      ]);
      return { client, vehicles, quotes, interventions };
    },
    [id],
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Client introuvable"} />;
  const { client, vehicles, quotes, interventions } = data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        title={`${client.first_name} ${client.last_name}`}
        subtitle={`Client depuis le ${fmtDate(client.created_at)}`}
        actions={
          <>
            {can(s.ctx, "clients:write") && (
              <Button variant="outline" onClick={() => setEdit(true)}>
                <Pencil className="size-4" /> Modifier
              </Button>
            )}
            {can(s.ctx, "clients:delete") && (
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" /> Supprimer
              </Button>
            )}
          </>
        }
      />
      <Section title="Coordonnées">
        <KeyValue
          items={[
            ["Téléphone", client.phone ? <a href={`tel:${client.phone}`} className="text-primary">{client.phone}</a> : "—"],
            ["Email", client.email ? <a href={`mailto:${client.email}`} className="text-primary">{client.email}</a> : "—"],
            ["Adresse", client.address ?? "—"],
            ["Notes", client.notes ?? "—"],
          ]}
        />
      </Section>
      <Section
        title={`Véhicules (${vehicles.length})`}
        icon={Car}
        actions={
          can(s.ctx, "vehicles:write") && (
            <Button size="sm" onClick={() => setAddVehicle(true)}>
              <Plus className="size-4" /> Véhicule
            </Button>
          )
        }
      >
        {vehicles.length === 0 ? (
          <Empty title="Aucun véhicule" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {vehicles.map((v) => (
              <Link key={v.id} href={`/vehicles/${v.id}`} className="rounded-lg border p-3 hover:border-primary/40">
                <div className="font-semibold">
                  {v.make} {v.model} <span className="text-xs text-muted-foreground">{v.registration}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {[v.engine, v.year, FUEL_LABELS[v.fuel], fmtKm(v.mileage)].filter(Boolean).join(" · ")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Devis" icon={FileText}>
          {quotes.length === 0 ? (
            <Empty title="Aucun devis" />
          ) : (
            <div className="flex flex-col gap-2">
              {quotes.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:border-primary/40">
                  <span>
                    {q.number} · {fmtDate(q.created_at)}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatEuro(q.totals.totalTTC)} <Pill tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Pill>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>
        <Section title="Interventions" icon={Wrench}>
          {interventions.length === 0 ? (
            <Empty title="Aucune intervention" />
          ) : (
            <div className="flex flex-col gap-2">
              {interventions.map((i) => (
                <Link key={i.id} href={`/interventions/${i.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:border-primary/40">
                  <span className="truncate">
                    {fmtDate(i.scheduled_at ?? i.created_at)} · {i.title}
                  </span>
                  <Pill tone={INTERVENTION_STATUS[i.status].tone}>{INTERVENTION_STATUS[i.status].label}</Pill>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
      <ClientFormDialog open={edit} onOpenChange={setEdit} client={client} />
      <VehicleFormDialog open={addVehicle} onOpenChange={setAddVehicle} defaultClientId={client.id} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Supprimer ce client ?"
        description="Les véhicules seront conservés mais détachés du client. Cette action est journalisée."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await run((svc) => svc.crm.deleteClient(client.id), "Client supprimé");
          router.push("/clients");
        }}
      />
    </div>
  );
}
