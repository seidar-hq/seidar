// Cloudflare Pages Function: GET /api/news
// Stellar financial news from Lumen Loop for the dashboard News card, newest first, as
// { items: [{ title, link, pubDate }] }. Fetched server-side (no CORS headers) and cached at the edge.
//
// Two sources, because the RSS feed alone is too thin: it carries 10 items, mostly videos. The /news
// page lists the 30 latest articles as JSON-LD, without dates, so those are dated from the sitemap's
// lastmod. If either of those fails or changes shape, the RSS items still come through.

const SITE = "https://lumenloop.com";
const MAX_ITEMS = 12;
/** Below this many financial stories, the card is topped up with the latest of everything else. */
const MIN_ITEMS = 5;
const TTL_SECONDS = 900;
const HEADERS = { "User-Agent": "SeidarNews/1.0" };
const FETCH_TIMEOUT_MS = 8_000;

type Item = { title: string; link: string; pubDate: string };

const decode = (s: string) =>
  s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

function parseRss(xml: string): Item[] {
  const out: Item[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (title && link) out.push({ title, link, pubDate: tag(block, "pubDate") });
  }
  return out;
}

/** The article list in the page's JSON-LD; empty if it isn't there. */
function parseNewsPage(html: string): Item[] {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of data["@graph"] ?? [data]) {
        if (node["@type"] !== "ItemList") continue;
        return (node.itemListElement ?? [])
          .filter((i: { url?: unknown; name?: unknown }) => typeof i.url === "string" && typeof i.name === "string")
          .map((i: { url: string; name: string }) => ({ title: decode(i.name), link: i.url, pubDate: "" }));
      }
    } catch {
      // Not JSON we can read; try the next block.
    }
  }
  return [];
}

// Matches on the headline. "Stellar Community Fund" is grants, not money markets, and \bhack\b leaves
// out hackathons.
const FINANCIAL =
  /tokeni[sz]|\brwa\b|real.world asset|\bassets?\b|\bfunds?\b|\betfs?\b|payments?\b|stablecoin|\busdc\b|\beurc\b|\bpyusd\b|liquidity|\bdefi\b|\bdex\b|lending|\byield|\bvaults?\b|\binvest|custody|settlement|\bbanks?\b|\bmarkets?\b|\bstocks?\b|treasur|securities|acqui|\btvl\b|\$\d|\bhack\b|exploit|weekly roundup/i;
const isFinancial = (title: string) => FINANCIAL.test(title.replace(/stellar community fund/gi, ""));

const rank = (i: Item) => Date.parse(i.pubDate) || 0;

async function text(url: string) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.text();
}

/** Article link -> lastmod. The site publishes no dated list of its news, and the sitemap is one request. */
function articleDates(sitemap: string) {
  const dates = new Map<string, string>();
  for (const m of sitemap.matchAll(/<loc>([^<]*\/news\/[^<]+)<\/loc>\s*<lastmod>([^<]+)/g)) dates.set(m[1], m[2]);
  return dates;
}

async function latest(): Promise<Item[]> {
  // One at a time: in the Workers runtime the 772 KB sitemap hung until the timeout when fetched
  // alongside the others, yet takes under a second alone.
  const rss = await text(`${SITE}/rss.xml`).catch(() => "");
  const page = await text(`${SITE}/news`).catch(() => "");
  const dates = articleDates(page ? await text(`${SITE}/sitemap.xml`).catch(() => "") : "");
  const all = [...parseRss(rss), ...parseNewsPage(page).map((i) => ({ ...i, pubDate: dates.get(i.link) ?? "" }))];

  // Same story twice is common (the page lists Airtm/BVNK twice, and the feed repeats the page).
  const seen = new Set<string>();
  const unique = all.filter((i) => {
    const key = i.title.toLowerCase();
    if (seen.has(key) || seen.has(i.link)) return false;
    seen.add(key);
    seen.add(i.link);
    return true;
  });

  const financial = unique.filter((i) => isFinancial(i.title));
  const picked = financial.length >= MIN_ITEMS ? financial : [...financial, ...unique.filter((i) => !isFinancial(i.title)).slice(0, MIN_ITEMS - financial.length)];
  return picked.sort((a, b) => rank(b) - rank(a)).slice(0, MAX_ITEMS);
}

export const onRequestGet = async (ctx: { request: Request; waitUntil: (p: Promise<unknown>) => void }) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(ctx.request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const items = await latest();
  const res = new Response(JSON.stringify({ items }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${TTL_SECONDS}`,
    },
  });
  if (items.length) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
};
