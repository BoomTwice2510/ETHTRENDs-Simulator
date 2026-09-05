const CACHE = "ethtrends-simulator-v1";

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
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API/backend data ko cache mat karo.
  if (url.pathname.startsWith("/api/")) return;

  // Sirf same-origin app files handle karo.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {

      if (cached) {
        return cached;
      }

      return fetch(request)
        .then(response => {

          const copy = response.clone();

          caches.open(CACHE).then(cache => {
            cache.put(request, copy);
          });

          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});