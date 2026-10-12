"use client";

import { useEffect } from "react";

/** Enregistre le service worker (production uniquement) pour l'ouverture des dossiers hors connexion. */
export function OfflineRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
