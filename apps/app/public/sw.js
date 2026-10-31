// Seidar app shell cache. Some mobile networks intermittently can't reach the addresses Cloudflare
// hands out for app.seidar.xyz; without this the page then never opens until the DNS answer
// changes. With it, a page visited before opens from the cache and the app's API failover
// (src/lib/api.ts) fetches the data.
//
// - Pages (navigations): network first, cached copy if the network fails or takes over 6 s.
// - /_next/static/*: cache first (file names are content hashes, so never stale).
// - Other same-origin files (logos, icons): cached copy at once, refreshed in the background.
// API calls go to another origin and are never touched.

const VERSION = "v1";
const PAGES = `seidar-pages-${VERSION}`;
const STATIC = `seidar-static-${VERSION}`;
const NAV_TIMEOUT_MS = 6000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("seidar-") && !key.endsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function page(request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(async (res) => {
    if (res.ok && res.type === "basic") await cache.put(request, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch {
    /* offline or unreachable: fall back to the cache */
  }
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  return network; // nothing cached: keep waiting for the network
}

// Old deploys' chunks pile up: keep the newest MAX_STATIC entries (insertion order = age).
const MAX_STATIC = 400;
async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(k);
}

async function staticFile(request, event) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    event.waitUntil(trim(cache));
  }
  return res;
}

async function asset(request, event) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (res) => {
    if (res.ok && res.type === "basic") await cache.put(request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(staticFile(request, event));
  else if (/\.(png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname)) event.respondWith(asset(request, event));
});
