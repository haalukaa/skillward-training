const RELEASE = "20260825-phase8-mobile-pwa-1";
const SAFE_CACHE = `skillward-safe-shell-${RELEASE}`;
const SAFE_ASSETS = new Set([
  "/offline.html",
  "/manifest.webmanifest",
  "/skillward-app-icon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png"
]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SAFE_CACHE);
    await cache.addAll([...SAFE_ASSETS]);
    if (!self.registration.active) await self.skipWaiting();
    else {
      const clients = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
      clients.forEach(client => client.postMessage({ type:"SKILLWARD_UPDATE_READY", release:RELEASE }));
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("skillward-") && name !== SAFE_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKILLWARD_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache:"no-store" }).catch(() => caches.match("/offline.html")));
    return;
  }

  if (SAFE_ASSETS.has(url.pathname) && !url.search) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
