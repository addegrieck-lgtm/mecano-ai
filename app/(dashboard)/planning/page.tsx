"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { useData, useServices } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, NativeSelect, PageHeader, Pill, TextInput } from "@/components/app/common";
import { InterventionFormDialog } from "@/components/interventions/intervention-form";
import { Button } from "@/components/ui/button";
import { can, isGarageWide } from "@/lib/permissions";
import { fmtDuration, fmtTime, INTERVENTION_STATUS, localDayKey, todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Intervention } from "@/types";

type GroupBy = "team" | "mechanic" | "vehicle";

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDayKey(d.toISOString());
};

export default function PlanningPage() {
  const s = useServices();
  const [day, setDay] = useState(todayKey());
  const [team, setTeam] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("team");
  const [editing, setEditing] = useState<Intervention | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, loading, error } = useData(async (svc) => ({ list: await svc.work.interventions(), teams: await svc.org.teams(), members: await svc.org.members() }));
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Erreur"} />;

  const items = data.list.filter((i) => localDayKey(i.scheduled_at) === day && i.status !== "CANCELLED" && (!team || i.team_id === team));
  const unplanned = data.list.filter((i) => !i.scheduled_at && i.status === "WAITING");
  const memberName = (id?: string | null) => {
    const p = data.members.find((m) => m.profile.id === id)?.profile;
    return p ? `${p.first_name} ${p.name}` : "Non attribué";
  };
  const groups: { key: string; label: string; color?: string; items: typeof items }[] = [];
  const push = (key: string, label: string, i: (typeof items)[number], color?: string) => {
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label, color, items: [] }));
    g.items.push(i);
  };
  if (groupBy === "team") {
    for (const t of data.teams.filter((t) => !team || t.id === team)) groups.push({ key: t.id, label: t.name, color: t.color, items: [] });
    for (const i of items) {
      const t = data.teams.find((x) => x.id === i.team_id);
      push(t?.id ?? "none", t?.name ?? "Sans équipe", i, t?.color);
    }
  } else if (groupBy === "mechanic") {
    for (const i of items) push(i.mechanic_id ?? "none", memberName(i.mechanic_id), i);
  } else {
    for (const i of items) push(i.vehicle_id, i.vehicle ? `${i.vehicle.make} ${i.vehicle.model} · ${i.vehicle.registration}` : "Véhicule", i);
  }

  const label = new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const scope = isGarageWide(s.ctx.role) ? "Tout le garage" : s.ctx.role === "TEAM_MANAGER" ? "Mon équipe" : "Mes tâches";

  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle={`${scope} · ${label}`}
        actions={
          can(s.ctx, "interventions:write") && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Planifier
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setDay(shift(day, -1))} aria-label="Jour précédent">
            <ChevronLeft className="size-4" />
          </Button>
          <TextInput type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" onClick={() => setDay(shift(day, 1))} aria-label="Jour suivant">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" onClick={() => setDay(todayKey())}>
            Aujourd&apos;hui
          </Button>
        </div>
        <NativeSelect value={team} onChange={(e) => setTeam(e.target.value)} className="lg:w-56">
          <option value="">Toutes les équipes</option>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["team", "Par équipe"],
              ["mechanic", "Par mécanicien"],
              ["vehicle", "Par véhicule"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setGroupBy(k)} className={cn("flex-1 rounded-md px-3 py-1.5 whitespace-nowrap", groupBy === k ? "bg-background font-medium" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && groups.every((g) => g.items.length === 0) ? (
        <Empty title="Aucune intervention planifiée ce jour" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key} className="rounded-xl border bg-card p-3">
              <div className="mb-3 flex items-center gap-2 border-b pb-2">
                {g.color && <span className="size-3 rounded-full" style={{ background: g.color }} />}
                <span className="font-semibold">{g.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{g.items.length} tâche(s)</span>
              </div>
              <div className="flex flex-col gap-2">
                {g.items.length === 0 && <span className="py-4 text-center text-xs text-muted-foreground">Libre</span>}
                {g.items.map((i) => (
                  <div key={i.id} className="flex gap-3 rounded-lg bg-background/50 p-2.5">
                    <div className="w-12 shrink-0 text-sm font-bold tabular-nums text-primary">{fmtTime(i.scheduled_at)}</div>
                    <Link href={`/interventions/${i.id}`} className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.vehicle ? `${i.vehicle.make} ${i.vehicle.model}` : "Véhicule"}</div>
                      <div className="truncate text-xs text-muted-foreground">{i.title}</div>
                      <div className="truncate text-xs">
                        {groupBy !== "mechanic" && memberName(i.mechanic_id)} · {fmtDuration(i.planned_duration_minutes)}
                      </div>
                    </Link>
                    <div className="flex flex-col items-end gap-1">
                      <Pill tone={INTERVENTION_STATUS[i.status].tone}>{INTERVENTION_STATUS[i.status].label}</Pill>
                      {i.canEdit && i.status !== "COMPLETED" && (
                        <button onClick={() => setEditing(i)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                          <Pencil className="size-3" /> Affecter
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {unplanned.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">À planifier ({unplanned.length})</div>
          <div className="flex flex-col gap-2">
            {unplanned.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <span className="flex-1 truncate">
                  {i.vehicle?.make} {i.vehicle?.model} — {i.title}
                </span>
                {i.canEdit && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(i)}>
                    Planifier
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <InterventionFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} intervention={editing} />
      <InterventionFormDialog open={creating} onOpenChange={setCreating} defaults={{ team_id: team, scheduled_at: `${day}T09:00` }} />
    </div>
  );
}
