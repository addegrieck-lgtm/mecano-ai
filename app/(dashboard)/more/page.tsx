"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/app-provider";
import { Avatar, PageHeader } from "@/components/app/common";
import { NAV_GROUPS } from "@/components/app/nav";
import { can, ROLE_LABELS } from "@/lib/permissions";

/** Menu « Plus » de la navigation mobile. */
export default function MorePage() {
  const { services, profile, garage, garages, mode, demoUsers, switchGarage, switchUser } = useApp();
  if (!services) return null;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Plus" />
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <Avatar first={profile?.first_name} last={profile?.name} />
        <div className="flex-1">
          <div className="font-semibold">
            {profile?.first_name} {profile?.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {ROLE_LABELS[services.ctx.role]} · {garage?.name}
          </div>
        </div>
      </div>
      {garages.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Garage actif</span>
          <select className="h-11 rounded-lg border bg-input/30 px-3" value={garage?.id} onChange={(e) => switchGarage(e.target.value)}>
            {garages.map(({ garage: g }) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === "demo" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Démo : se connecter en tant que</span>
          <select className="h-11 rounded-lg border bg-input/30 px-3" value={profile?.id} onChange={(e) => switchUser(e.target.value)}>
            {demoUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.first_name} {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{g.title}</div>
          <div className="overflow-hidden rounded-xl border bg-card">
            {g.items
              .filter((i) => !i.permission || can(services.ctx, i.permission))
              .map((i) => (
                <Link key={i.href} href={i.href} className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 active:bg-muted">
                  <i.icon className="size-5 text-primary" />
                  <span className="flex-1">{i.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
