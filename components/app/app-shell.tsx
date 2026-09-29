"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { Building2, CalendarDays, Car, Check, ChevronsUpDown, Home, LogOut, Menu, Plus, WifiOff } from "lucide-react";
import { useApp } from "./app-provider";
import { NAV_GROUPS } from "./nav";
import { Avatar, ErrorState, Loading } from "./common";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { getObdService } from "@/lib/obd/obd-service";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

function ObdIndicator() {
  const obd = getObdService();
  const state = useSyncExternalStore(obd.subscribe, obd.getSnapshot, obd.getSnapshot);
  const map = {
    connected: ["bg-success", "OBD connecté"],
    connecting: ["bg-info animate-pulse", "Connexion…"],
    error: ["bg-destructive", "OBD en erreur"],
    disconnected: ["bg-muted-foreground/40", "OBD déconnecté"],
  } as const;
  const [dot, label] = map[state.status];
  return (
    <Link href="/obd" className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground" title={label}>
      <span className={cn("size-2 rounded-full", dot)} />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">M</span>
      <span className="text-sm font-bold tracking-wide">
        MECANO <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}

function UserMenu() {
  const { profile, garage, garages, services, mode, demoUsers, switchGarage, switchUser, signOut } = useApp();
  const role = services?.ctx.role;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left hover:bg-muted" aria-label="Compte et garage">
        <Avatar first={profile?.first_name} last={profile?.name} size="sm" />
        <span className="hidden min-w-0 flex-col md:flex">
          <span className="truncate text-xs font-semibold">
            {profile?.first_name} {profile?.name}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {role ? ROLE_LABELS[role] : ""} · {garage?.name}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Garage actif</DropdownMenuLabel>
          {garages.map(({ garage: g, member }) => (
            <DropdownMenuItem key={g.id} onClick={() => switchGarage(g.id)}>
              <Building2 className="size-4" />
              <span className="flex-1 truncate">{g.name}</span>
              <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[member.role]}</span>
              {g.id === garage?.id && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {mode === "demo" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Démo : se connecter en tant que</DropdownMenuLabel>
              <div className="max-h-64 overflow-y-auto">
                {demoUsers.map((u) => (
                  <DropdownMenuItem key={u.id} onClick={() => switchUser(u.id)}>
                    <Avatar first={u.first_name} last={u.name} size="sm" />
                    <span className="flex-1 truncate">
                      {u.first_name} {u.name}
                    </span>
                    {u.id === profile?.id && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuGroup>
          </>
        )}
        {mode === "supabase" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/profile" />}>Mon profil</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="size-4" /> Se déconnecter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { services } = useApp();
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b px-4">
        <Brand />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <Link href="/diagnostics/new" className={cn(buttonVariants({ size: "lg" }), "mb-5 w-full font-semibold")}>
          <Plus className="size-5" /> DIAGNOSTIC
        </Link>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">{group.title}</div>
            {group.items
              .filter((i) => !i.permission || (services && can(services.ctx, i.permission)))
              .map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4", active && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const item = (href: string, label: string, Icon: typeof Home, match?: string) => {
    const active = pathname === href || pathname.startsWith(`${match ?? href}/`);
    return (
      <Link href={href} className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px]", active ? "text-primary" : "text-muted-foreground")}>
        <Icon className="size-5" />
        {label}
      </Link>
    );
  };
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="flex items-stretch">
        {item("/dashboard", "Accueil", Home)}
        {item("/vehicles", "Véhicules", Car)}
        <div className="flex flex-1 items-center justify-center">
          <Link href="/diagnostics/new" aria-label="Nouveau diagnostic" className="-mt-6 flex size-14 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Plus className="size-6" />
            <span className="text-[9px] font-bold">DIAG</span>
          </Link>
        </div>
        {item("/planning", "Planning", CalendarDays)}
        {item("/more", "Plus", Menu)}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, error, services, garages, mode } = useApp();
  const pathname = usePathname();
  const online = useOnline();

  let content: ReactNode = children;
  if (!ready) content = <Loading label="Démarrage de MECANO AI…" />;
  else if (error && !services) content = <ErrorState message={error} />;
  else if (!services && garages.length === 0 && pathname !== "/garage")
    content = (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Bienvenue sur MECANO AI</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vous n&apos;êtes membre d&apos;aucun garage. Créez votre garage ou demandez une invitation.</p>
        <Link href="/garage" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
          Créer mon garage
        </Link>
      </div>
    );

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="flex-1" />
          {!online && (
            <span className="flex items-center gap-1 rounded-md bg-warning/15 px-2 py-1 text-xs text-warning">
              <WifiOff className="size-3.5" /> Hors ligne
            </span>
          )}
          {mode === "demo" && <span className="hidden rounded-md bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary sm:inline">MODE DÉMO</span>}
          {services && <ObdIndicator />}
          {services && <UserMenu />}
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 lg:pb-10">{content}</main>
      </div>
      <BottomNav />
    </div>
  );
}
