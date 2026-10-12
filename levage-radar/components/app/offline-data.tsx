"use client";

import { useEffect, useState } from "react";
import { pendingCount, wipeOfflineData } from "@/lib/offline/store";
import { btnClass } from "@/components/ui";

export function OfflineDataPanel() {
  const [count, setCount] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    pendingCount().then(setCount);
  }, []);
  return (
    <div className="space-y-2 text-sm">
      <p>Les dossiers ouverts sont conservés chiffrés sur cet appareil pour la saisie hors connexion. Ils sont effacés à la déconnexion.</p>
      <p>Éléments non synchronisés : <strong>{count ?? "…"}</strong></p>
      <button
        type="button"
        className={btnClass("secondary", "sm")}
        onClick={async () => {
          if (count && !confirm(`${count} élément(s) non synchronisé(s) seront définitivement perdus. Continuer ?`)) return;
          await wipeOfflineData();
          setCount(0);
          setMsg("Données locales effacées.");
        }}
      >
        Effacer les données locales
      </button>
      {msg && <p className="text-emerald-700">{msg}</p>}
    </div>
  );
}
