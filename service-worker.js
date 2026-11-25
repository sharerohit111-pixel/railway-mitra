
/* =========================================
   RAILWAY MITRA
   SERVICE WORKER
   Version: 1.0.1
   ========================================= */

const CACHE_NAME = "railway-mitra-v7";

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
    


/* Generic web-push alert support: notification sound is controlled by Android/browser notification settings. */
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = payload.title || "Railway Mitra · Train Alert";
  const options = {
    body: payload.body || "A train movement alert is available.",
    icon: "./assets/icons/icon-192.png",
    badge: "./assets/icons/icon-192.png",
    tag: payload.tag || "railway-mitra-train-alert",
    renotify: false,
    vibrate: [300, 120, 300, 120, 600],
    data: { url: payload.url || "./features/where-is-your-train/index.html" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./features/where-is-your-train/index.html", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const existing = list.find(client => client.url === target);
    return existing ? existing.focus() : self.clients.openWindow(target);
  }));
});
