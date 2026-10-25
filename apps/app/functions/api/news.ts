// Cloudflare Pages Function: GET /api/news
// Fetches crypto news RSS server-side (the feeds don't send CORS headers) and returns
// { items: [{ title, link, pubDate }] } for the dashboard News card. Cached at the edge.

const FEEDS = ["https://cointelegraph.com/rss"];
const MAX_ITEMS = 12;
const TTL_SECONDS = 900;

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

function parse(xml: string): Item[] {
  const out: Item[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (title && link) out.push({ title, link, pubDate: tag(block, "pubDate") });
  }
  return out;
}

export const onRequestGet = async (ctx: { request: Request; waitUntil: (p: Promise<unknown>) => void }) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(ctx.request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const results = await Promise.allSettled(
    FEEDS.map((u) => fetch(u, { headers: { "User-Agent": "SeidarNews/1.0" } }).then((r) => r.text())),
  );
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? parse(r.value) : []))
    .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))
    .slice(0, MAX_ITEMS);

  const res = new Response(JSON.stringify({ items }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${TTL_SECONDS}`,
    },
  });
  if (items.length) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
};
