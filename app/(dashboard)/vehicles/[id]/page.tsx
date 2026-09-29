"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck, FileText, Pencil, PlugZap, Stethoscope, Trash2, Wrench } from "lucide-react";
import { useAction, useData, useServices } from "@/components/app/app-provider";
import { ConfirmDialog, Empty, ErrorState, KeyValue, Loading, Pill, Section } from "@/components/app/common";
import { TabBar } from "@/components/app/tab-bar";
import { ObdPanel } from "@/components/obd/obd-panel";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { VehicleFormDialog } from "@/components/vehicles/vehicle-form";
import { VehicleHistory } from "@/components/vehicles/vehicle-history";
import { Button, buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { DIAGNOSTIC_STATUS, fmtDate, fmtDateTime, fmtKm, FUEL_LABELS, INTERVENTION_STATUS, QUOTE_STATUS } from "@/lib/format";
import { formatEuro } from "@/lib/quotes/calc";
import { cn } from "@/lib/utils";

type Tab = "overview" | "history" | "diagnostics" | "interventions" | "quotes" | "photos" | "obd";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useServices();
  const { run } = useAction();
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { data, loading, error } = useData(
    async (svc) => {
      const { vehicle, client } = await svc.crm.vehicle(id);
      const [diagnostics, interventions, quotes, intakes, sessions] = await Promise.all([
        svc.diagnostics.list({ vehicle_id: id }),
        svc.work.interventions({ vehicle_id: id }),
        svc.work.quotes({ vehicle_id: id }),
        svc.crm.intakes(id),
        svc.diagnostics.obdSessions({ vehicle_id: id }),
      ]);
      return { vehicle, client, diagnostics, interventions, quotes, intakes, sessions };
    },
    [id],
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Véhicule introuvable"} />;
  const { vehicle: v, client, diagnostics, interventions, quotes, intakes, sessions } = data;
  const lastDiag = diagnostics[0];
  const lastIntervention = [...interventions].filter((i) => i.status === "COMPLETED").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/vehicles" className="text-xs font-medium text-muted-foreground hover:text-primary">
        ← Véhicules
      </Link>
      <div className="rounded-2xl border bg-gradient-to-br from-card to-background p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight uppercase">
                {v.make} {v.model}
              </h1>
              <span className="rounded-md border-2 border-foreground/80 bg-foreground px-2 py-0.5 font-mono text-sm font-bold text-background">{v.registration}</span>
            </div>
            <div className="mt-2 flex flex-col gap-0.5 text-sm">
              <span className="text-lg">{v.engine ?? "Moteur non renseigné"}</span>
              <span className="text-muted-foreground">
                {v.year ?? "Année —"} · {FUEL_LABELS[v.fuel]} · <b className="text-foreground">{fmtKm(v.mileage)}</b>
              </span>
            </div>
            <div className="mt-3 grid gap-1 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Client : </span>
                {client ? (
                  <Link href={`/clients/${client.id}`} className="font-medium text-primary">
                    {client.first_name} {client.last_name}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Dernier diagnostic : </span>
                <b>{fmtDate(lastDiag?.created_at)}</b>
              </div>
              <div>
                <span className="text-muted-foreground">Dernière intervention : </span>
                <b>{fmtDate(lastIntervention?.completed_at)}</b>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:w-60">
            <Button size="lg" className="h-14 text-base font-bold" onClick={() => setTab("obd")}>
              <PlugZap className="size-5" /> CONNECTER OBD
            </Button>
            <Link href={`/diagnostics/new?vehicle=${v.id}`} className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
              <Stethoscope className="size-4" /> Nouveau diagnostic
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/vehicle-intake?vehicle=${v.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ClipboardCheck className="size-3.5" /> Réception
          </Link>
          {can(s.ctx, "quotes:write") && (
            <Link href={`/quotes/new?vehicle=${v.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText className="size-3.5" /> Devis
            </Link>
          )}
          {can(s.ctx, "interventions:write") && (
            <Link href={`/interventions?new=1&vehicle=${v.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Wrench className="size-3.5" /> Intervention
            </Link>
          )}
          {can(s.ctx, "vehicles:write") && (
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil className="size-3.5" /> Modifier
            </Button>
          )}
          {can(s.ctx, "vehicles:delete") && (
            <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
              <Trash2 className="size-3.5" /> Supprimer
            </Button>
          )}
        </div>
      </div>

      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Vue générale" },
          { id: "history", label: "Historique" },
          { id: "diagnostics", label: "Diagnostics", count: diagnostics.length },
          { id: "interventions", label: "Interventions", count: interventions.length },
          { id: "quotes", label: "Devis", count: quotes.length },
          { id: "photos", label: "Photos" },
          { id: "obd", label: "OBD", count: sessions.length },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Fiche technique">
            <KeyValue
              items={[
                ["Marque", v.make],
                ["Modèle", v.model],
                ["Version", v.version ?? "—"],
                ["Année", v.year ?? "—"],
                ["Moteur", v.engine ?? "—"],
                ["Énergie", FUEL_LABELS[v.fuel]],
                ["Kilométrage", fmtKm(v.mileage)],
                ["VIN", <span key="vin" className="font-mono text-xs">{v.vin ?? "—"}</span>],
              ]}
            />
            {v.notes && <p className="mt-3 text-sm text-muted-foreground">{v.notes}</p>}
            {(v.fuel === "ELECTRIQUE" || v.fuel.startsWith("HYBRIDE")) && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                ⚡ Véhicule à haute tension : intervention sur le circuit HT réservée au personnel habilité, selon la procédure constructeur.
              </div>
            )}
          </Section>
          <Section title="Dernières réceptions">
            {intakes.length === 0 ? (
              <Empty title="Aucune réception enregistrée" />
            ) : (
              <div className="flex flex-col gap-2">
                {intakes.slice(0, 3).map((i) => (
                  <div key={i.id} className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">{fmtDateTime(i.created_at)}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtKm(i.mileage)} · Carburant {i.fuel_level} · Voyants : {i.warning_lights.join(", ") || "aucun"}
                    </div>
                    {i.observations && <div className="mt-1 text-xs">{i.observations}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
      {tab === "history" && (
        <Section title="Historique du véhicule">
          <VehicleHistory vehicleId={v.id} />
        </Section>
      )}
      {tab === "diagnostics" && (
        <div className="flex flex-col gap-2">
          {diagnostics.length === 0 && <Empty title="Aucun diagnostic" />}
          {diagnostics.map((d) => (
            <Link key={d.id} href={`/diagnostics/${d.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:border-primary/40">
              <div>
                <div className="font-medium">{d.codes.join(", ") || d.symptoms.join(", ") || "Diagnostic"}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(d.created_at)}</div>
              </div>
              <Pill tone={DIAGNOSTIC_STATUS[d.status].tone}>{DIAGNOSTIC_STATUS[d.status].label}</Pill>
            </Link>
          ))}
        </div>
      )}
      {tab === "interventions" && (
        <div className="flex flex-col gap-2">
          {interventions.length === 0 && <Empty title="Aucune intervention" />}
          {interventions.map((i) => (
            <Link key={i.id} href={`/interventions/${i.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:border-primary/40">
              <div>
                <div className="font-medium">{i.title}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(i.scheduled_at ?? i.created_at)}</div>
              </div>
              <Pill tone={INTERVENTION_STATUS[i.status].tone}>{INTERVENTION_STATUS[i.status].label}</Pill>
            </Link>
          ))}
        </div>
      )}
      {tab === "quotes" && (
        <div className="flex flex-col gap-2">
          {quotes.length === 0 && <Empty title="Aucun devis" />}
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:border-primary/40">
              <div>
                <div className="font-medium">{q.number}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(q.created_at)}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {formatEuro(q.totals.totalTTC)} <Pill tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Pill>
              </div>
            </Link>
          ))}
        </div>
      )}
      {tab === "photos" && (
        <Section title="Galerie du véhicule">
          <PhotoGallery entityType="vehicle" entityId={v.id} vehicleId={v.id} allForVehicle />
        </Section>
      )}
      {tab === "obd" && (
        <div className="flex flex-col gap-4">
          <ObdPanel vehicle={v} />
          <Section title="Sessions OBD enregistrées">
            {sessions.length === 0 ? (
              <Empty title="Aucune session" />
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                {sessions.map((se) => (
                  <div key={se.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <span>
                      {fmtDateTime(se.started_at)} · {se.provider === "SIMULATOR" ? "Simulateur" : se.device_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {se.dtcs.join(", ") || "aucun code"} · {se.live_data.length} mesure(s){se.cleared_dtcs ? " · codes effacés" : ""}
                      {se.duration_seconds != null ? ` · ${Math.round(se.duration_seconds / 60)} min` : " · en cours"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      <VehicleFormDialog open={edit} onOpenChange={setEdit} vehicle={v} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Supprimer ce véhicule ?"
        description="Le véhicule sera supprimé de la liste. L'action est journalisée."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await run((svc) => svc.crm.deleteVehicle(v.id), "Véhicule supprimé");
          router.push("/vehicles");
        }}
      />
    </div>
  );
}
