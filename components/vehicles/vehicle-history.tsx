"use client";

import Link from "next/link";
import { Camera, ClipboardCheck, FileText, FlaskConical, Gauge, Plug, Star, Stethoscope, Target, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useData } from "@/components/app/app-provider";
import { Empty, Loading } from "@/components/app/common";
import { fmtDate, fmtTime } from "@/lib/format";
import type { HistoryKind } from "@/lib/services/insights";

const ICONS: Record<HistoryKind, [LucideIcon, string, string]> = {
  INTAKE: [ClipboardCheck, "Réception", "text-muted-foreground"],
  OBD: [Plug, "OBD", "text-info"],
  DIAGNOSTIC: [Stethoscope, "Diagnostic", "text-info"],
  TEST: [FlaskConical, "Test", "text-primary"],
  RESULT: [Gauge, "Mesure", "text-primary"],
  CONCLUSION: [Target, "Conclusion", "text-warning"],
  QUOTE: [FileText, "Devis", "text-foreground"],
  INTERVENTION: [Wrench, "Réparation", "text-success"],
  PHOTO: [Camera, "Photo", "text-muted-foreground"],
  REVIEW: [Star, "Avis", "text-warning"],
};

/** Historique chronologique du véhicule, reconstruit depuis toutes les données enregistrées. */
export function VehicleHistory({ vehicleId }: { vehicleId: string }) {
  const { data, loading } = useData((s) => s.insights.vehicleHistory(vehicleId), [vehicleId]);
  if (loading) return <Loading />;
  if (!data?.length) return <Empty title="Aucun événement pour ce véhicule" />;
  return (
    <ol className="relative flex flex-col gap-1 border-l border-border pl-5">
      {data.map((e, idx) => {
        const [Icon, label, color] = ICONS[e.kind];
        const day = fmtDate(e.date);
        const showDay = idx === 0 || fmtDate(data[idx - 1].date) !== day;
        const body = (
          <div className="rounded-lg border bg-background/40 p-3 hover:border-primary/30">
            <div className="flex items-center gap-2 text-sm">
              <span className={`text-xs font-semibold uppercase ${color}`}>{label}</span>
              <span className="font-medium">{e.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{fmtTime(e.date)}</span>
            </div>
            {e.detail && <div className="mt-1 text-sm text-muted-foreground">{e.detail}</div>}
          </div>
        );
        return (
          <li key={e.id} className="relative">
            {showDay && <div className="mt-3 mb-1 text-xs font-bold tracking-wide text-primary">{day}</div>}
            <span className="absolute top-4 -left-[27px] flex size-3.5 items-center justify-center rounded-full border-2 border-background bg-card">
              <Icon className={`size-2.5 ${color}`} />
            </span>
            {e.href ? <Link href={e.href}>{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}
