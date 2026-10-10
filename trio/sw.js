const CACHE_NAME = "triotrends-pwa-v1";
const APP_SHELL = [
  "/trio/",
  "/trio/index.html",
  "/trio/manifest.webmanifest",
  "/trio/trio.css?v=cost-month-dd-1",
  "/trio/trio.js?v=cost-month-dd-1",
  "/trio/icons/trio-192.png",
  "/trio/icons/trio-512.png",
  "/trio/icons/trio-180.png",
  "/trio/trio-logo.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("triotrends-pwa-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" || url.pathname === "/trio/" || url.pathname.startsWith("/trio/")) {
    event.respondWith(fetch(request, { cache: "no-store" }).then(response => {
      if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match("/trio/index.html"))));
  }
});
