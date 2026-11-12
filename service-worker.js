
/* =========================================
   RAILWAY MITRA
   SERVICE WORKER
   Version: 1.0.0
   ========================================= */

const CACHE_NAME = "railway-mitra-v3";

/* INSTALL */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
  );

  self.skipWaiting();
});

/* ACTIVATE */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim()
  );
});

/* FETCH */
self.addEventListener("fetch", (event) => {

  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(
      new URL("./", self.registration.scope).pathname
    )
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {

        if (response && response.ok) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }

        return response;
      })
      .catch(async () => {

        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        if (request.mode === "navigate") {
          return (
            await caches.match(
              new URL("./app.html", self.registration.scope).href
            )
          ) || new Response(
            "Railway Mitra is offline. Please connect to the internet.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            }
          );
        }

        return new Response("Offline", {
          status: 503
        });

      })
  );

});
    
