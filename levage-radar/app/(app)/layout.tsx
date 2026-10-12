import { cookies } from "next/headers";
import { requireCtx } from "@/lib/auth/server";
import { ROLES, type Role } from "@/lib/auth/permissions";
import { DEMO_COOKIE, demoEnabled } from "@/lib/demo";
import { Sidebar } from "@/components/app/sidebar";
import { NAV } from "@/components/app/nav";
import { btnClass } from "@/components/ui";
import { logoutAction } from "../(auth)/actions";
import { toggleDemoAction } from "./shell-actions";
import { OfflineRegister } from "@/components/app/offline-register";
import { LogoutButton } from "@/components/app/logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.perms.length === 0 || i.perms.some((p) => ctx.perms.has(p))) })).filter((g) => g.items.length);
  const demoOn = demoEnabled() && (await cookies()).get(DEMO_COOKIE)?.value === "1";
  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar groups={groups} orgName={ctx.org.name} />
      <header className="no-print sticky top-0 z-20 hidden items-center justify-end gap-3 border-b border-slate-200 bg-white/90 px-6 py-2.5 backdrop-blur lg:flex dark:border-slate-800 dark:bg-slate-900/90">
        {demoEnabled() && (
          <form action={toggleDemoAction}>
            <button type="submit" className={btnClass(demoOn ? "primary" : "ghost", "sm")} title="Basculer entre données réelles et données de démonstration (jamais mélangées)">
              {demoOn ? "Mode démonstration actif — revenir aux données réelles" : "Voir les données de démonstration"}
            </button>
          </form>
        )}
        <div className="text-right text-xs leading-tight">
          <div className="font-medium text-slate-800 dark:text-slate-100">{ctx.user.name}</div>
          <div className="text-slate-500">{ROLES[ctx.user.role as Role] ?? ctx.user.role}</div>
        </div>
        <LogoutButton action={logoutAction} />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="no-print mx-auto max-w-7xl px-6 pb-8 text-[11px] text-slate-400">
        LEVAGE RADAR — outil de préparation interne, non officiel. Les sources officielles font foi ; aucune donnée n&apos;est transmise au logiciel commercial ni à l&apos;outil officiel de rapports.
        <div className="mt-2 lg:hidden">
          {ctx.user.name} — <LogoutButton action={logoutAction} compact />
        </div>
      </footer>
      <OfflineRegister />
    </div>
  );
}
