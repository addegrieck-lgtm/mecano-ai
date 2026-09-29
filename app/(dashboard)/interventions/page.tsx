"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import { useData, useServices } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, NativeSelect, PageHeader } from "@/components/app/common";
import { InterventionFormDialog } from "@/components/interventions/intervention-form";
import { InterventionRow } from "@/components/interventions/intervention-row";
import { Button } from "@/components/ui/button";
import { can, isGarageWide } from "@/lib/permissions";
import { fmtDate, INTERVENTION_STATUS, localDayKey } from "@/lib/format";
import { INTERVENTION_STATUSES } from "@/types";

function Interventions() {
  const s = useServices();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [status, setStatus] = useState("ACTIVE");
  const [team, setTeam] = useState("");
  const [mechanic, setMechanic] = useState("");
  const { data, loading, error } = useData(async (svc) => ({ list: await svc.work.interventions(), teams: await svc.org.teams(), members: await svc.org.members() }));
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Erreur"} />;
  const list = data.list
    .filter((i) => (status === "ACTIVE" ? i.status !== "COMPLETED" && i.status !== "CANCELLED" : !status || i.status === status))
    .filter((i) => !team || i.team_id === team)
    .filter((i) => !mechanic || i.mechanic_id === mechanic);
  const groups = new Map<string, typeof list>();
  for (const i of list) {
    const k = localDayKey(i.scheduled_at) || "Non planifiée";
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const name = (id?: string | null) => data.members.find((m) => m.profile.id === id)?.profile.first_name ?? null;

  return (
    <div>
      <PageHeader
        title="Interventions"
        subtitle={isGarageWide(s.ctx.role) ? "Tout le garage" : s.ctx.role === "TEAM_MANAGER" ? "Mon équipe et mes interventions" : "Mes interventions"}
        actions={
          can(s.ctx, "interventions:write") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nouvelle intervention
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ACTIVE">En cours / à venir</option>
          <option value="">Tous les statuts</option>
          {INTERVENTION_STATUSES.map((st) => (
            <option key={st} value={st}>
              {INTERVENTION_STATUS[st].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Toutes les équipes</option>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={mechanic} onChange={(e) => setMechanic(e.target.value)}>
          <option value="">Tous les mécaniciens</option>
          {data.members.map((m) => (
            <option key={m.profile.id} value={m.profile.id}>
              {m.profile.first_name} {m.profile.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {list.length === 0 ? (
        <Empty title="Aucune intervention" icon={Wrench} />
      ) : (
        <div className="flex flex-col gap-4">
          {[...groups.entries()]
            .sort(([a], [b]) => (status === "COMPLETED" ? b.localeCompare(a) : a.localeCompare(b)))
            .map(([day, items]) => (
              <div key={day}>
                <div className="mb-2 text-xs font-bold tracking-wide text-primary uppercase">{day === "Non planifiée" ? day : fmtDate(`${day}T12:00:00`)}</div>
                <div className="flex flex-col gap-2">
                  {items.map((i) => (
                    <InterventionRow key={i.id} intervention={i} vehicle={i.vehicle} team={data.teams.find((t) => t.id === i.team_id)} mechanicName={name(i.mechanic_id)} canEdit={i.canEdit} showStart />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
      <InterventionFormDialog open={open} onOpenChange={setOpen} defaults={{ vehicle_id: params.get("vehicle") ?? "" }} />
    </div>
  );
}

export default function InterventionsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Interventions />
    </Suspense>
  );
}
