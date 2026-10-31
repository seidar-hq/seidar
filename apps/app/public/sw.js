// Seidar app shell cache. Some mobile networks intermittently can't reach the addresses Cloudflare
// hands out for app.seidar.xyz; without this the page then never opens until the DNS answer
// changes. With it, a page visited before opens from the cache and the app's API failover
// (src/lib/api.ts) fetches the data.
//
// - Pages (navigations): network first; the cached copy if the network fails or takes over 6 s;
//   with neither, a small page that retries by itself (instead of the browser's error page).
// - Navigations to a route's data file (/<route>.txt, which Next opens after a failed in-app
//   navigation) go straight to the page itself. Only HTML is ever cached as a page.
// - /_next/static/*: cache first (file names are content hashes, so never stale).
// - Other same-origin images and fonts: cached copy at once, refreshed in the background.
// API calls go to another origin and are never touched.

const VERSION = "v3";
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

const isHtml = (res) => res.ok && res.type === "basic" && (res.headers.get("content-type") || "").includes("text/html");

const RETRY_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#1a1a1a"><title>Seidar</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#121212;color:#f4f4f4;font-family:system-ui,"Segoe UI",Roboto,sans-serif;text-align:center}main{padding:2rem;max-width:22rem}p{color:#9a9a9a;line-height:1.5}button{margin-top:1rem;border:0;border-radius:999px;padding:.8rem 1.6rem;background:#346cff;color:#fff;font-weight:600;font-size:1rem}</style></head>
<body><main><h2>Can't reach Seidar right now</h2><p>Your network isn't reaching our servers. This page keeps trying and opens Seidar as soon as it can.</p><button onclick="location.reload()">Try again</button></main>
<script>setInterval(function(){fetch(location.href,{cache:"no-store"}).then(function(r){if(r.ok)location.reload()}).catch(function(){})},5000)</script></body></html>`;

async function page(request) {
  const cache = await caches.open(PAGES);
  // Keyed by URL: a navigation Request object itself is not a reliable cache key. Saving is
  // best effort and can never fail the page.
  const key = request.url;
  const network = fetch(request).then((res) => {
    if (isHtml(res)) cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch {
    /* offline or unreachable: fall back to the cache */
  }
  const cached = await cache.match(key, { ignoreSearch: true });
  if (cached) return cached;
  try {
    return await network; // nothing cached: keep waiting for the network
  } catch {
    return new Response(RETRY_PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
}

// Old deploys' chunks pile up: keep the newest MAX_STATIC entries (insertion order = age).
const MAX_STATIC = 400;
async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(k);
}
// Every cache step is best effort: a cache problem must never fail the request itself.
const save = (cache, key, res) => cache.put(key, res).then(() => trim(cache)).catch(() => {});

async function staticFile(request) {
  try {
    const cache = await caches.open(STATIC);
    const cached = await cache.match(request.url);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok && res.type === "basic") save(cache, request.url, res.clone());
    return res;
  } catch {
    return fetch(request);
  }
}

async function asset(request) {
  let cache = null;
  let cached = null;
  try {
    cache = await caches.open(STATIC);
    cached = await cache.match(request.url);
  } catch {
    /* no cache: network only */
  }
  const refresh = fetch(request).then((res) => {
    if (cache && res.ok && res.type === "basic") save(cache, request.url, res.clone());
    return res;
  });
  if (cached) {
    refresh.catch(() => {});
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (url.pathname.endsWith(".txt")) {
      // A route's data file opened as a page: send the visit to the page itself.
      const p = url.pathname.slice(0, -".txt".length);
      url.pathname = p === "/index" ? "/" : p.endsWith("/index") ? p.slice(0, -"index".length) : p;
      url.searchParams.delete("_rsc");
      event.respondWith(Response.redirect(url.toString(), 302));
      return;
    }
    event.respondWith(page(request));
  } else if (url.pathname.startsWith("/_next/static/")) event.respondWith(staticFile(request));
  else if (/\.(png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname)) event.respondWith(asset(request));
});
