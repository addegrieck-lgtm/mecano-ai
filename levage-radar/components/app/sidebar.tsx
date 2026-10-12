"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BellRing,
  Building2,
  Construction,
  FileCog,
  FileDown,
  History,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Menu,
  MessageSquareText,
  Newspaper,
  PlugZap,
  Radar,
  Settings,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cx } from "@/lib/format";
import type { NavGroup } from "./nav";

const ICONS = { BellRing, Building2, Construction, FileCog, FileDown, History, LayoutDashboard, ListChecks, MapPin, MessageSquareText, Newspaper, PlugZap, Radar, Settings, Users, Zap };

export function Sidebar({ groups, orgName }: { groups: NavGroup[]; orgName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Navigation principale" className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon as keyof typeof ICONS] ?? Radar;
              const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href + "/")) || path === it.href;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
                      active ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  const brand = (
    <div className="mb-6 flex items-center gap-2 px-3">
      <Logo />
      <div>
        <div className="text-sm font-bold tracking-tight text-white">LEVAGE RADAR</div>
        <div className="max-w-[160px] truncate text-[11px] text-slate-400">{orgName}</div>
      </div>
    </div>
  );
  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto bg-ink px-3 py-5 lg:block">
        {brand}
        {nav}
      </aside>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Logo /> LEVAGE RADAR
        </div>
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-white hover:bg-white/10" aria-label="Ouvrir le menu">
          <Menu size={22} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-ink px-3 py-5">
            <button type="button" onClick={() => setOpen(false)} className="absolute top-3 right-3 rounded-md p-2 text-white hover:bg-white/10" aria-label="Fermer le menu">
              <X size={20} />
            </button>
            {brand}
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
