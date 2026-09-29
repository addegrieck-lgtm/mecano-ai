/* MECANO AI — Service worker (PWA).
 * - Ressources statiques Next.js : cache d'abord (fichiers versionnés).
 * - Pages : réseau d'abord, puis cache (fonctionnement dégradé hors connexion).
 * - API : réseau uniquement (l'IA bascule côté client sur le moteur de règles hors ligne).
 * Les données métier du mode démo sont dans IndexedDB : elles restent disponibles hors ligne.
 */
const VERSION = "mecano-ai-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/dashboard", "/diagnostics/new", "/vehicles", "/planning"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/dashboard")) || caches.match("/offline.html")),
    );
  }
});
