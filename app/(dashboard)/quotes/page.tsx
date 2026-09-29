"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, FileText, Plus } from "lucide-react";
import { useData, useServices } from "@/components/app/app-provider";
import { Empty, ErrorState, Loading, PageHeader, Pill } from "@/components/app/common";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { fmtDate, QUOTE_STATUS } from "@/lib/format";
import { formatEuro } from "@/lib/quotes/calc";
import { QUOTE_STATUSES } from "@/types";
import { cn } from "@/lib/utils";

export default function QuotesPage() {
  const s = useServices();
  const [status, setStatus] = useState<string>("");
  const { data, loading, error } = useData((svc) => svc.work.quotes());
  const list = (data ?? []).filter((q) => !status || (status === "FOLLOW" ? q.needsFollowUp : q.status === status));
  const count = (st: string) => (data ?? []).filter((q) => (st === "FOLLOW" ? q.needsFollowUp : q.status === st)).length;
  return (
    <div>
      <PageHeader
        title="Devis"
        subtitle="Brouillon → Envoyé → Accepté / Refusé / Expiré"
        actions={
          can(s.ctx, "quotes:write") && (
            <Link href="/quotes/new" className={buttonVariants()}>
              <Plus className="size-4" /> Nouveau devis
            </Link>
          )
        }
      />
      <div className="-mx-4 mb-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-1.5">
          {[["", "Tous"], ...QUOTE_STATUSES.map((st) => [st, QUOTE_STATUS[st].label]), ["FOLLOW", "Relance à prévoir"]].map(([k, label]) => (
            <button key={k} onClick={() => setStatus(k)} className={cn("rounded-full border px-3 py-1.5 text-sm", status === k ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground")}>
              {label} {k && <span className="ml-1 text-xs">{count(k)}</span>}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : list.length === 0 ? (
        <Empty title="Aucun devis" icon={FileText} />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-4 hover:border-primary/40 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {q.number} <span className="font-normal text-muted-foreground">· {q.client ? `${q.client.first_name} ${q.client.last_name}` : "Sans client"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {q.vehicle ? `${q.vehicle.make} ${q.vehicle.model} · ${q.vehicle.registration}` : "—"} · créé le {fmtDate(q.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {q.needsFollowUp && (
                  <Pill tone="warning">
                    <BellRing className="size-3" /> Relance à prévoir
                  </Pill>
                )}
                {q.totals.missingPrices > 0 && <Pill tone="warning">Prix à renseigner</Pill>}
                <span className="font-semibold tabular-nums">{formatEuro(q.totals.totalTTC)}</span>
                <Pill tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Pill>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
