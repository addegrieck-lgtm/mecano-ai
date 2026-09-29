"use client";

import { useEffect } from "react";

/** Enregistre le service worker en production uniquement (évite les conflits avec le rechargement à chaud). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[MECANO AI] Service worker non enregistré", e));
  }, []);
  return null;
}
