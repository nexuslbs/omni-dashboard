/* OmniAgent Dashboard service worker.
 *
 * Chrome's PWA installability criteria require a registered service worker
 * with a fetch handler; without one Android Chrome only offers
 * "Add to Home screen" (a shortcut with a generated icon) instead of
 * "Install app" (the real PWA with the manifest icon + navy splash).
 *
 * Caching policy (must never break the SPA or serve stale API data):
 *  - /api/*        : never intercepted (network only).
 *  - navigations   : network-first, cached /index.html as offline fallback.
 *  - /assets/*     : cache-first (Vite content-hashed files, immutable).
 *  - everything else same-origin GET: network-first with cache fallback.
 */

const CACHE_NAME = "omniagent-dashboard-v1";

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The dashboard API must always hit the network (live data, auth, mutations).
  if (url.pathname.startsWith("/api/")) return;

  // Navigation: network-first so the shell is always current; fall back to the
  // cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/index.html", response.clone());
          return response;
        } catch (err) {
          const cached = await caches.match("/index.html");
          if (cached) return cached;
          throw err;
        }
      })(),
    );
    return;
  }

  // Content-hashed build assets: immutable, cache-first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Other same-origin GETs (manifest, icons, favicon): network-first with a
  // cache fallback so the install icon/splash still resolve offline.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
