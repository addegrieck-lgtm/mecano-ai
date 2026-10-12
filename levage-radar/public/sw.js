/* LEVAGE RADAR — service worker.
 * - Ressources statiques (_next/static) : cache d'abord.
 * - Pages des dossiers d'inspection : réseau d'abord, copie en cache pour la saisie hors connexion.
 *   Ces pages ne contiennent pas les données des dossiers (chargées par l'API puis chiffrées dans IndexedDB).
 * - Les réponses d'API ne sont JAMAIS mises en cache par le service worker.
 */
const VERSION = "lr-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/offline.html"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    const cacheable = url.pathname.startsWith("/missions/");
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable && res.ok && !res.redirected) {
            const copy = res.clone(); // à cloner avant que le navigateur ne consomme le corps
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/offline.html"))),
    );
  }
});

self.addEventListener("message", (e) => {
  if (e.data === "clear-pages") caches.delete(PAGES);
});
