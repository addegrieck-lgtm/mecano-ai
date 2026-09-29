"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Stethoscope } from "lucide-react";
import { useData } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, NativeSelect, PageHeader, Pill } from "@/components/app/common";
import { buttonVariants } from "@/components/ui/button";
import { DIAGNOSTIC_STATUS, fmtDateTime } from "@/lib/format";
import { DIAGNOSTIC_STATUSES } from "@/types";

export default function DiagnosticsPage() {
  const [status, setStatus] = useState("");
  const { data, loading, error } = useData(async (s) => ({ list: await s.diagnostics.list(), members: await s.org.members() }));
  const list = (data?.list ?? []).filter((d) => !status || d.status === status);
  const name = (id: string) => data?.members.find((m) => m.profile.id === id)?.profile.first_name ?? "—";
  return (
    <div>
      <PageHeader
        title="Diagnostics"
        subtitle="Véhicule → OBD → Codes → IA → Tests → Conclusion"
        actions={
          <Link href="/diagnostics/new" className={buttonVariants({ size: "lg" })}>
            <Plus className="size-4" /> Nouveau diagnostic
          </Link>
        }
      />
      <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="mb-4 sm:w-60">
        <option value="">Tous les statuts</option>
        {DIAGNOSTIC_STATUSES.map((s) => (
          <option key={s} value={s}>
            {DIAGNOSTIC_STATUS[s].label}
          </option>
        ))}
      </NativeSelect>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : list.length === 0 ? (
        <Empty title="Aucun diagnostic" icon={Stethoscope}>
          Lancez votre premier diagnostic avec le bouton « + Diagnostic ».
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((d) => (
            <Link key={d.id} href={`/diagnostics/${d.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-4 hover:border-primary/40 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {d.codes.map((c) => (
                    <span key={c} className="rounded bg-destructive/15 px-1.5 font-mono text-sm font-bold text-destructive">
                      {c}
                    </span>
                  ))}
                  <span className="font-medium">{d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.registration}` : "Véhicule"}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {fmtDateTime(d.created_at)} · {name(d.user_id)} · {d.symptoms.join(", ") || "sans symptôme"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.conclusion && <Pill tone={d.conclusion.confirmed_by_technician ? "success" : "warning"}>{d.conclusion.confirmed_by_technician ? "Conclusion confirmée" : "À confirmer"}</Pill>}
                <Pill tone={DIAGNOSTIC_STATUS[d.status].tone}>{DIAGNOSTIC_STATUS[d.status].label}</Pill>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
