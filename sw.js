/*
 * ETHTRENDs Simulator Service Worker
 * Network-first for HTML/CSS/JS so Vercel deployments appear immediately.
 * Runtime API requests are never cached.
 */

const CACHE_NAME = "ethtrends-simulator-v6";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-180.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API/backend responses.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // HTML, JS and CSS MUST be network-first.
  // This prevents old deployments from being shown after a Vercel update.
  const isLiveAsset =
    request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".webmanifest");

  if (isLiveAsset) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("/")))
    );
    return;
  }

  // Images/icons can remain cache-first.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
