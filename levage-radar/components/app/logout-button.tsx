"use client";

import { LogOut } from "lucide-react";
import { pendingCount, wipeOfflineData } from "@/lib/offline/store";
import { btnClass } from "@/components/ui";

/** Déconnexion : efface les données hors ligne de l'appareil (après avertissement s'il reste des modifications). */
export function LogoutButton({ action, compact }: { action: () => Promise<void>; compact?: boolean }) {
  return (
    <form
      action={action}
      onSubmit={async (e) => {
        const form = e.currentTarget;
        e.preventDefault();
        const n = await pendingCount();
        if (n > 0 && !confirm(`${n} modification(s) non synchronisée(s) sur cet appareil seront perdues à la déconnexion. Continuer ?`)) return;
        await wipeOfflineData();
        void form;
        await action();
      }}
    >
      <button type="submit" className={compact ? "link" : btnClass("ghost", "sm")}>
        {!compact && <LogOut size={16} aria-hidden="true" />} Déconnexion
      </button>
    </form>
  );
}
