const CACHE_NAME = "threon-cloudflare-split-v20260625";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./products.html",
  "./product.html",
  "./checkout.html",
  "./account.html",
  "./styles.css",
  "./script.js",
  "./assets/threon-fashion-hero.png",
  "./assets/product-hoodie.png",
  "./assets/product-bomber.png",
  "./assets/product-cargo.png",
  "./assets/product-tee.png",
  "./assets/product-sneaker.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;
  const url = new URL(request.url);
  const networkFirst =
    request.mode === "navigate" ||
    [".html", ".js", ".css", ".json"].some((extension) => url.pathname.endsWith(extension));

  if (networkFirst) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }))
  );
});
