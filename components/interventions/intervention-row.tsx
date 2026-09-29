"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/common";
import { useAction } from "@/components/app/app-provider";
import { fmtTime, INTERVENTION_STATUS } from "@/lib/format";
import type { Intervention, Team, Vehicle } from "@/types";

export function InterventionRow({
  intervention: i,
  vehicle,
  team,
  mechanicName,
  canEdit,
  showStart,
}: {
  intervention: Intervention;
  vehicle: Vehicle | null;
  team?: Team | null;
  mechanicName?: string | null;
  canEdit?: boolean;
  showStart?: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const status = INTERVENTION_STATUS[i.status];
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/40 p-3" style={team ? { borderLeft: `3px solid ${team.color}` } : undefined}>
      <div className="w-12 shrink-0 text-center">
        <div className="text-sm font-semibold tabular-nums">{fmtTime(i.scheduled_at)}</div>
      </div>
      <Link href={`/interventions/${i.id}`} className="min-w-0 flex-1">
        <div className="truncate font-medium">{vehicle ? `${vehicle.make} ${vehicle.model}` : "Véhicule"} <span className="text-xs text-muted-foreground">{vehicle?.registration}</span></div>
        <div className="truncate text-xs text-muted-foreground">
          {i.title}
          {mechanicName ? ` · ${mechanicName}` : ""}
          {team ? ` · ${team.name}` : ""}
        </div>
      </Link>
      <Pill tone={status.tone}>{status.label}</Pill>
      {showStart && canEdit && i.status === "WAITING" && (
        <Button
          size="sm"
          disabled={pending}
          onClick={async () => {
            const res = await run((s) => s.work.setInterventionStatus(i.id, "IN_PROGRESS"), "Intervention démarrée");
            if (res) router.push(`/interventions/${i.id}`);
          }}
        >
          <Play className="size-3.5" /> COMMENCER
        </Button>
      )}
    </div>
  );
}
