// Price charts from Horizon trade aggregations (classic order book + AMM trades, free, no key).
// Any classic asset can be charted against any other; USD charts use Circle USDC, routing through
// XLM when an asset has no direct USDC market. Buckets without trades are forward-filled.

import { withCache } from "@seidar/cache";
import { horizonUrl } from "./net.js";

export type ChartRange = "1h" | "1d" | "7d" | "14d" | "30d" | "90d" | "1y";
export type ChartPoint = { t: number; px: number };
export type AssetRef = { code: string; issuer: string | null };

const USDC: AssetRef = { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" };
const XLM: AssetRef = { code: "XLM", issuer: null };

// Horizon only accepts these resolutions; long ranges page through 200-bucket pages.
const RANGES: Record<ChartRange, { res: number; buckets: number; ttl: number }> = {
  "1h": { res: 60_000, buckets: 60, ttl: 60_000 },
  "1d": { res: 900_000, buckets: 96, ttl: 120_000 },
  "7d": { res: 3_600_000, buckets: 168, ttl: 600_000 },
  "14d": { res: 3_600_000, buckets: 336, ttl: 600_000 },
  "30d": { res: 3_600_000, buckets: 720, ttl: 900_000 },
  "90d": { res: 86_400_000, buckets: 90, ttl: 3_600_000 },
  "1y": { res: 86_400_000, buckets: 365, ttl: 3_600_000 },
};

export const isChartRange = (r: string): r is ChartRange => r in RANGES;

const isNative = (a: AssetRef) => !a.issuer && a.code.toUpperCase() === "XLM";
const sameAsset = (a: AssetRef, b: AssetRef) =>
  a.code.toUpperCase() === b.code.toUpperCase() && (a.issuer ?? null) === (b.issuer ?? null);

/** "native", "XLM", or "CODE:ISSUER". */
export function parseAsset(s: string): AssetRef | null {
  const v = s.trim();
  if (!v) return null;
  if (/^(native|xlm)$/i.test(v)) return XLM;
  const [code, issuer] = v.split(":");
  if (!/^[A-Za-z0-9]{1,12}$/.test(code ?? "") || !/^G[A-Z2-7]{55}$/.test(issuer ?? "")) return null;
  return { code, issuer };
}

function assetParams(prefix: "base" | "counter", a: AssetRef): string {
  if (isNative(a)) return `${prefix}_asset_type=native`;
  const type = a.code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
  return `${prefix}_asset_type=${type}&${prefix}_asset_code=${a.code}&${prefix}_asset_issuer=${a.issuer}`;
}

async function getJson(url: string, tries = 3): Promise<unknown> {
  for (let i = 0; ; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
      if (r.ok) return await r.json();
      if ((r.status !== 429 && r.status < 500) || i >= tries - 1) throw new Error(`horizon ${r.status}`);
    } catch (e) {
      if (i >= tries - 1) throw e;
    } finally {
      clearTimeout(t);
    }
    await new Promise((res) => setTimeout(res, 700 * 2 ** i));
  }
}

type Agg = { timestamp: string | number; close: string; avg?: string; base_volume: string };

/** Raw close prices of `base` in units of `counter`, oldest first, only buckets that traded. */
async function rawPair(base: AssetRef, counter: AssetRef, range: ChartRange): Promise<ChartPoint[]> {
  const { res, buckets } = RANGES[range];
  const end = Math.ceil(Date.now() / res) * res;
  const start = end - res * buckets;
  const out: ChartPoint[] = [];
  let url: string | null =
    `${horizonUrl()}/trade_aggregations?${assetParams("base", base)}&${assetParams("counter", counter)}` +
    `&resolution=${res}&start_time=${start}&end_time=${end}&limit=200&order=asc`;
  for (let page = 0; url && page < 5; page++) {
    const j = (await getJson(url)) as { _embedded?: { records?: Agg[] }; _links?: { next?: { href?: string } } };
    const recs = j._embedded?.records ?? [];
    for (const r of recs) {
      // Volume-weighted average per bucket: thin markets bounce between bid and ask on "close".
      const px = Number(r.avg ?? r.close);
      if (px > 0) out.push({ t: Number(r.timestamp), px });
    }
    url = recs.length === 200 ? (j._links?.next?.href ?? null) : null;
  }
  return out;
}

/** Fill every bucket of the range, carrying the last traded price forward (and the first one back). */
function fill(points: ChartPoint[], range: ChartRange): ChartPoint[] {
  if (points.length === 0) return [];
  const { res, buckets } = RANGES[range];
  const end = Math.floor(Date.now() / res) * res;
  const start = end - res * (buckets - 1);
  const out: ChartPoint[] = [];
  let i = 0;
  let last = points[0].px;
  for (let t = start; t <= end; t += res) {
    while (i < points.length && points[i].t <= t) last = points[i++].px;
    out.push({ t, px: last });
  }
  return out;
}

async function pair(base: AssetRef, counter: AssetRef, range: ChartRange): Promise<ChartPoint[]> {
  if (sameAsset(base, counter)) {
    const { res, buckets } = RANGES[range];
    const end = Math.floor(Date.now() / res) * res;
    return Array.from({ length: buckets }, (_, k) => ({ t: end - res * (buckets - 1 - k), px: 1 }));
  }
  const direct = await rawPair(base, counter, range).catch(() => [] as ChartPoint[]);
  // A thin direct market (few traded buckets) routes through XLM instead, when that is better covered.
  const thin = direct.length < RANGES[range].buckets * 0.15;
  if (thin && !isNative(base) && !isNative(counter)) {
    const [a, b] = await Promise.all([
      rawPair(base, XLM, range).catch(() => [] as ChartPoint[]),
      rawPair(XLM, counter, range).catch(() => [] as ChartPoint[]),
    ]);
    if (a.length > direct.length && b.length > 0) {
      const fa = fill(a, range);
      const fb = fill(b, range);
      return fa.map((p, k) => ({ t: p.t, px: p.px * (fb[k]?.px ?? 0) })).filter((p) => p.px > 0);
    }
  }
  return fill(direct, range);
}

/** Chart of `base` priced in `counter` (default USD via Circle USDC). Cached per range. */
export async function priceChart(
  base: AssetRef,
  range: ChartRange,
  counter: AssetRef = USDC,
): Promise<{ ok: true; points: ChartPoint[]; change: number | null } | { ok: false; error: string }> {
  const key = `chart2:${base.code}:${base.issuer ?? "native"}:${counter.code}:${counter.issuer ?? "native"}:${range}`;
  // Empty results throw so a transient Horizon failure is never cached as "no trades".
  const { value } = await withCache(
    key,
    RANGES[range].ttl,
    async () => {
      const pts = await pair(base, counter, range);
      if (pts.length < 2) throw new Error("no-trades");
      return pts;
    },
    { swr: true },
  );
  const points = value ?? [];
  if (points.length < 2) return { ok: false, error: "no-trades" };
  const first = points[0].px;
  const last = points[points.length - 1].px;
  return { ok: true, points, change: first > 0 ? ((last - first) / first) * 100 : null };
}

/** % change over `range` for several assets at once (limited concurrency, Horizon friendly). */
export async function priceChanges(assets: AssetRef[], range: ChartRange): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const queue = [...assets];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        const k = isNative(a) ? "native" : `${a.code}:${a.issuer}`;
        const r = await priceChart(a, range).catch(() => null);
        out[k] = r && r.ok ? r.change : null;
      }
    }),
  );
  return out;
}
