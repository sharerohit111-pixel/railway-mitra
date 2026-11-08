/* Railway Mitra service worker - versioned cache with safe updates. */
"use strict";

const CACHE_PREFIX = "railway-mitra-";
const CACHE_NAME = "railway-mitra-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/css/main.css",
  "./assets/js/app.js",
  "./assets/js/module-loader.js",
  "./assets/js/module-page.js",
  "./assets/css/module-page.css",
  "./config/modules.json"
];

self.addEventListener("install",event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event => {
  const request = event.request;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !url.pathname.startsWith(scopePath)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request,response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("./index.html")) ||
          new Response("Railway Mitra is offline. Please reconnect to the internet.",{
            status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request,copy));
      }
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    try { return await network; }
    catch { return new Response("Offline",{status:503}); }
  })());
});