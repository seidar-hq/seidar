// Market overview for the Home page: Stellar assets by category, DeFi TVL, protocols and network
// activity. Public data only (no wallet), cached and refreshed by the cron.
//
// Sources
//   Stellar Expert  api.stellar.expert/explorer/public   assets (USD price, supply, holders =
//                   funded trustlines, 7d DEX volume, 7d daily prices) and daily network stats
//   DefiLlama       api.llama.fi                          Stellar DeFi TVL history, protocols
//                   stablecoins.llama.fi                  stablecoin market cap on Stellar
//   CoinGecko       XLM market cap only (Stellar Expert's XLM supply is the total, not circulating)
//
// Asset codes are not unique on Stellar and look-alike issuers are common (USDC, BTC, SOL, SHX…), so
// categories come from a registry of verified issuers (home domains checked on Stellar Expert,
// 2026-10-30). Anything else is listed under "other" only when Stellar Expert rates it well, it has
// a home domain and it does not reuse a registered code.

import { withCache } from "@seidar/cache";

export const CATEGORIES = ["stable", "rwa", "yield", "defi", "major", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

type Registered = {
  code: string;
  /** null: native XLM. */
  issuer: string | null;
  cats: Category[];
  /** Price for assets with no market price that track a fixed NAV (money-market fund shares). */
  navUsd?: number;
};

const ETHERFUSE = "GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC";
const ULTRA = (code: string, issuer: string, cats: Category[]): Registered => ({ code, issuer, cats });

export const REGISTRY: Registered[] = [
  { code: "XLM", issuer: null, cats: ["major"] },
  // Stablecoins
  { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", cats: ["stable"] }, // centre.io
  { code: "EURC", issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2", cats: ["stable"] }, // circle.com
  { code: "PYUSD", issuer: "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5", cats: ["stable"] }, // paxos.com
  { code: "USDT0", issuer: "GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q", cats: ["stable"] }, // usdt0.to
  { code: "USDGLO", issuer: "GBBS25EGYQPGEZCGCFBKG4OAGFXU6DSOQBGTHELLJT3HZXZJ34HWS6XV", cats: ["stable"] }, // glodollar.org
  { code: "USDZ", issuer: "GAKTLPC4ZV37SSCITQ5IS5AQ4WPF4CF4VZJQPPAROSGXMYOATF5U6XPR", cats: ["stable"] }, // zeam.money
  { code: "USDx", issuer: "GAVH5ZWACAY2PHPUG4FL3LHHJIYIHOFPSIUGM2KHK25CJWXHAV6QKDMN", cats: ["stable"] }, // fxdao.io
  { code: "ARST", issuer: "GCSAZVWXZKWS4XS223M5F54H2B6XPIIXZZGP7KEAIU6YSL5HDRGCI3DG", cats: ["stable"] }, // latamex.com
  { code: "ARS", issuer: "GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS", cats: ["stable"] }, // anclap.com
  { code: "NGNC", issuer: "GASBV6W7GGED66MXEVC7YZHTWWYMSVYEY35USF2HJZBLABLYIFQGXZY6", cats: ["stable"] }, // ngnc.online
  { code: "ZARZ", issuer: "GAROH4EV3WVVTRQKEY43GZK3XSRBEYETRVZ7SVG5LHWOAANSMCTJBB3U", cats: ["stable"] }, // zeam.money
  { code: "GYEN", issuer: "GDF6VOEGRWLOZ64PQQGKD2IYWA22RLT37GJKS2EJXZHT2VLAGWLC5TOB", cats: ["stable"] }, // z.com
  // Real-world assets (tokenised funds and government bonds); all of them accrue yield
  { code: "BENJI", issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5", cats: ["rwa", "yield"], navUsd: 1 }, // franklintempleton.com, FOBXX, $1 NAV
  { code: "USDY", issuer: "GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6", cats: ["rwa", "yield"] }, // ondo.finance
  { code: "CETES", issuer: ETHERFUSE, cats: ["rwa", "yield"] }, // etherfuse.com (Mexican T-bills)
  { code: "USTRY", issuer: ETHERFUSE, cats: ["rwa", "yield"] }, // etherfuse.com (US Treasuries)
  { code: "TESOURO", issuer: ETHERFUSE, cats: ["rwa", "yield"] }, // etherfuse.com (Brazilian bonds)
  // Yield-bearing crypto (Ultra Capital's yield tokens, ultracapital.xyz)
  ULTRA("yUSDC", "GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF", ["yield"]),
  ULTRA("yXLM", "GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55", ["yield"]),
  ULTRA("yBTC", "GBUVRNH4RW4VLHP4C5MOF46RRIRZLAVHYGX45MVSTKA2F6TMR7E7L6NW", ["yield"]),
  ULTRA("yETH", "GDYQNEF2UWTK4L6HITMT53MZ6F5QWO3Q4UVE6SCGC4OMEQIZQQDERQFD", ["yield"]),
  // DeFi protocol tokens
  { code: "AQUA", issuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA", cats: ["defi"] }, // aqua.network
  { code: "BLND", issuer: "GDJEHTBE6ZHUXSWFI642DCGLUOECLHPF3KSXHPXTSTJ7E3JF6MQ5EZYY", cats: ["defi"] }, // Blend (no home domain set)
  { code: "PHO", issuer: "GAX5TXB5RYJNLBUR477PEXM4X75APK2PGMTN6KEFQSESGWFXEAKFSXJO", cats: ["defi"] }, // phoenix-hub.io
  { code: "XRF", issuer: "GCHI6I3X62ND5XUMWINNNKXS2HPYZWKFQBZZYBSMHJ4MIP2XJXSZTXRF", cats: ["defi"] }, // reflector.network
  // Wrapped majors (Ultra Capital, fchain)
  ULTRA("BTC", "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM", ["major"]),
  ULTRA("ETH", "GBFXOHVAS43OIWNIO7XLRJAHT3BICFEIKOJLZVXNT572MISM4CMGSOCC", ["major"]),
  { code: "XRP", issuer: "GBXRPL45NPHCVMFFAYZVUVFFVKSIZ362ZXFP7I2ETNQ3QKZMFLPRDTD5", cats: ["major"] }, // fchain.io
];

/**
 * Soroban-only tokens (SEP-41 contracts with no classic asset), which Stellar Expert's asset list
 * doesn't carry. Centrifuge's deRWA tokens (DeFi-wrapped Janus Henderson Anemoy funds: JTRSY US
 * Treasuries, JAAA AAA CLOs) are XOXNO RWA markets: price from XOXNO's oracle, supply from the
 * contract's total_supply. Contracts from the Soroswap token list (org: Centrifuge).
 */
type SorobanToken = { code: string; contract: string; decimals: number; cats: Category[] };
export const SOROBAN: SorobanToken[] = [
  { code: "deJTRSY", contract: "CBI7UCH5KGSVQRO5H4SUCZUTZABCITZLRHQQZTWL2TK4RZ72TAR6IHRV", decimals: 18, cats: ["rwa", "yield"] },
  { code: "deJAAA", contract: "CC64WBDGS6QQP22QTTIACYIXT3WF7BBQEYOQPLTP7GTKYY7PZ74QYGSL", decimals: 18, cats: ["rwa", "yield"] },
];

const idOf = (code: string, issuer: string | null) => (issuer ? `${code}:${issuer}` : "XLM");
const REG = new Map(REGISTRY.map((r) => [idOf(r.code, r.issuer), r]));
const REG_CODES = new Set(REGISTRY.map((r) => r.code.toUpperCase()));

/** "Other" assets: Stellar Expert rating at least this, a home domain, a market price. */
const OTHER_MIN_RATING = 7.2;
const OTHER_MAX = 40;

/** One Stellar Expert asset record (list endpoints use tomlInfo, the single-asset one toml_info). */
export type SeAsset = {
  asset: string;
  code?: string;
  domain?: string;
  price?: number | null;
  supply?: string | number | null;
  volume7d?: number | null;
  price7d?: [number, number][] | null;
  trustlines?: { funded?: number } | null;
  rating?: { average?: number } | null;
  tomlInfo?: { name?: string; image?: string; orgLogo?: string } | null;
  toml_info?: { name?: string; image?: string; orgLogo?: string } | null;
};

export type MarketAsset = {
  id: string;
  code: string;
  issuer: string | null;
  /** Soroban-only tokens: their contract (no issuer). */
  contract: string | null;
  name: string;
  domain: string | null;
  icon: string | null;
  cats: Category[];
  price: number | null;
  /** "market": last DEX price; "nav": fixed net asset value (no market price). */
  priceSource: "market" | "nav" | null;
  change24h: number | null;
  change7d: number | null;
  /** Daily USD prices, oldest first (7 days). */
  spark: number[];
  supply: number;
  marketCap: number | null;
  volume7d: number | null;
  /** Accounts holding a balance (null: not published for Soroban-only tokens). */
  holders: number | null;
};

/** Parse "CODE-ISSUER-type" / "XLM" into code and issuer. */
function parseSe(asset: string): { code: string; issuer: string | null } {
  if (asset === "XLM") return { code: "XLM", issuer: null };
  const [code, issuer] = asset.split("-");
  return { code, issuer: issuer ?? null };
}

const pct = (a: number | undefined, b: number | undefined) => (a && b ? ((b - a) / a) * 100 : null);

/** Daily prices with bad points dropped (Stellar Expert has the odd stray print, e.g. -99% in a day). */
function cleanSeries(points: [number, number][] | null | undefined): number[] {
  const vals = (points ?? []).map((p) => p[1]).filter((v) => v > 0);
  if (vals.length < 3) return vals;
  const mid = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  return vals.filter((v) => v > mid / 3 && v < mid * 3);
}

/** Normalise Stellar Expert records into Home's asset rows (pure; tested with a fixture). */
export function buildAssets(records: SeAsset[], opts: { xlmMarketCap?: number | null } = {}): MarketAsset[] {
  const seen = new Set<string>();
  const out: MarketAsset[] = [];
  const others: MarketAsset[] = [];
  for (const a of records) {
    const { code, issuer } = parseSe(a.asset);
    const id = idOf(code, issuer);
    if (seen.has(id)) continue;
    seen.add(id);
    const reg = REG.get(id);
    const rating = a.rating?.average ?? 0;
    const marketPrice = a.price && a.price > 0 ? a.price : null;
    if (!reg) {
      // Look-alikes of registered codes and unrated / anonymous / unpriced assets stay out.
      if (REG_CODES.has(code.toUpperCase()) || rating < OTHER_MIN_RATING || !a.domain || !marketPrice) continue;
    }
    const price = marketPrice ?? reg?.navUsd ?? null;
    const series = cleanSeries(a.price7d);
    const supply = Number(a.supply ?? 0) / 1e7;
    const toml = a.tomlInfo ?? a.toml_info ?? null;
    const row: MarketAsset = {
      id,
      code,
      issuer,
      contract: null,
      name: code === "XLM" && !issuer ? "Stellar Lumens" : toml?.name?.trim() || code,
      domain: a.domain ?? null,
      // The token's own image only: orgLogo is the issuer's company logo, not the token's.
      icon: toml?.image || null,
      cats: reg?.cats ?? ["other"],
      price,
      priceSource: marketPrice ? "market" : price ? "nav" : null,
      change24h: series.length >= 2 ? pct(series[series.length - 2], series[series.length - 1]) : reg?.navUsd ? 0 : null,
      change7d: series.length >= 2 ? pct(series[0], series[series.length - 1]) : reg?.navUsd ? 0 : null,
      spark: series,
      supply,
      marketCap: id === "XLM" ? (opts.xlmMarketCap ?? null) : price ? supply * price : null,
      volume7d: a.volume7d != null ? a.volume7d / 1e7 : null,
      holders: a.trustlines?.funded ?? 0,
    };
    (reg ? out : others).push(row);
  }
  others.sort((x, y) => (y.volume7d ?? 0) - (x.volume7d ?? 0));
  return [...out, ...others.slice(0, OTHER_MAX)].sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0));
}

const SE = "https://api.stellar.expert/explorer/public";

async function getJson<T>(url: string, ms = 20_000): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return (await r.json()) as T;
}

type SeList = { _embedded?: { records?: SeAsset[] } };

async function xlmMarketCap(): Promise<number | null> {
  const j = await getJson<{ stellar?: { usd_market_cap?: number } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_market_cap=true",
    12_000,
  ).catch(() => null);
  return j?.stellar?.usd_market_cap ?? null;
}

/** The Soroban-only tokens above, priced by XOXNO's oracle (skipped while XOXNO has no valid price). */
async function sorobanAssets(): Promise<MarketAsset[]> {
  const { xoxnoMarkets } = await import("./lending.js");
  const { sorobanView } = await import("./rpc.js");
  const r = await xoxnoMarkets().catch(() => null);
  type X = { sac?: string; name?: string; logoUrl?: string; priceUsd?: number; priceStatus?: { valid?: boolean } };
  const markets = ((r?.body as { assets?: X[] } | undefined)?.assets ?? []) as X[];
  const out: MarketAsset[] = [];
  for (const t of SOROBAN) {
    const m = markets.find((x) => x.sac === t.contract);
    const price = m?.priceStatus?.valid !== false && (m?.priceUsd ?? 0) > 0 ? m!.priceUsd! : null;
    const raw = await sorobanView(t.contract, "total_supply", []).catch(() => null);
    const supply = raw != null ? Number(BigInt(String(raw)) / 10n ** BigInt(t.decimals - 6)) / 1e6 : 0;
    if (!price || !supply) continue;
    out.push({
      id: idOf(t.code, t.contract),
      code: t.code,
      issuer: null,
      contract: t.contract,
      name: m?.name ?? t.code,
      domain: "centrifuge.io",
      icon: m?.logoUrl ?? null,
      cats: t.cats,
      price,
      priceSource: "market",
      change24h: null,
      change7d: null,
      spark: [],
      supply,
      marketCap: supply * price,
      volume7d: null,
      holders: null,
    });
  }
  return out;
}

async function loadAssets(): Promise<{ assets: MarketAsset[]; counts: Record<string, number> }> {
  const [byVolume, byRating, xlmCap] = await Promise.all([
    getJson<SeList>(`${SE}/asset?sort=volume7d&order=desc&limit=200`),
    getJson<SeList>(`${SE}/asset?sort=rating&order=desc&limit=200`),
    xlmMarketCap(),
  ]);
  const records = [...(byVolume._embedded?.records ?? []), ...(byRating._embedded?.records ?? [])];
  const have = new Set(records.map((a) => { const p = parseSe(a.asset); return idOf(p.code, p.issuer); }));
  // Registered assets outside both top lists (e.g. BENJI: large but rarely traded): fetched one by one.
  const missing = REGISTRY.filter((r) => !have.has(idOf(r.code, r.issuer)));
  for (let i = 0; i < missing.length; i += 4) {
    const batch = await Promise.all(
      missing.slice(i, i + 4).map((r) =>
        getJson<SeAsset>(`${SE}/asset/${r.issuer ? `${r.code}-${r.issuer}` : "XLM"}`, 12_000).catch(() => null),
      ),
    );
    for (const a of batch) if (a?.asset) records.push(a);
  }
  if (!records.length) throw new Error("no asset data");
  const soroban = await sorobanAssets().catch(() => [] as MarketAsset[]);
  const assets = [...buildAssets(records, { xlmMarketCap: xlmCap }), ...soroban].sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0));
  const counts: Record<string, number> = { all: assets.length };
  for (const c of CATEGORIES) counts[c] = assets.filter((a) => a.cats.includes(c)).length;
  return { assets, counts };
}

export async function getMarketAssets() {
  const out = await withCache("market:assets:v4", 10 * 60_000, loadAssets, { swr: true });
  if (!out.value) return { status: 502, body: { ok: false, error: "Market data is unavailable right now." } };
  return { status: 200, body: { ok: true, ...out.value, source: "Stellar Expert" } };
}

// ---- Overview: TVL, protocols, stablecoins, network activity ----------------------------------

type LlamaProtocol = {
  name: string;
  slug?: string;
  logo?: string;
  url?: string;
  category?: string;
  chains?: string[];
  chainTvls?: Record<string, number>;
  change_7d?: number | null;
};

/** Where each protocol lives in Seidar (by DefiLlama name, lower case prefix). */
const SEIDAR_PATH: [RegExp, string][] = [
  [/^blend/, "/earn/lending&borrow"],
  [/^xoxno/, "/earn/lending&borrow"],
  [/^(aquarius|soroswap|phoenix|sushi)/, "/earn/pools"],
  [/^(stellar dex|stellar amm)/, "/trade-swap/dex"],
  [/^(defindex|upshift|gami|stellar defi hub|sentora)/, "/earn/vaults"],
];

export type Protocol = {
  name: string;
  category: string;
  tvl: number;
  /** Only for Stellar-only protocols (DefiLlama's change is across all chains). */
  change7d: number | null;
  logo: string | null;
  url: string | null;
  seidar: string | null;
};

type Day = { ts: number; transactions: number; payments: number; trades: number; active_accounts: number; operations: number };

export type ActivityPoint = { t: number; transactions: number; payments: number; trades: number; activeAccounts: number };

async function loadOverview() {
  const [tvlHist, protocols, stables, stats] = await Promise.all([
    getJson<{ date: number; tvl: number }[]>("https://api.llama.fi/v2/historicalChainTvl/Stellar").catch(() => null),
    getJson<LlamaProtocol[]>("https://api.llama.fi/protocols", 30_000).catch(() => null),
    getJson<{ name: string; totalCirculatingUSD?: Record<string, number> }[]>("https://stablecoins.llama.fi/stablecoinchains").catch(
      () => null,
    ),
    getJson<Day[]>(`${SE}/ledger/ledger-stats`, 30_000).catch(() => null),
  ]);
  if (!tvlHist && !protocols && !stats) throw new Error("no overview data");

  const tvlSeries = (tvlHist ?? []).map((p) => ({ t: p.date * 1000, v: p.tvl }));
  const last = tvlSeries[tvlSeries.length - 1]?.v ?? null;
  const ago = (days: number) => tvlSeries[tvlSeries.length - 1 - days]?.v;

  const stellarProtocols: Protocol[] = (protocols ?? [])
    .filter((p) => p.chains?.includes("Stellar") && p.category !== "CEX" && (p.chainTvls?.Stellar ?? 0) > 50_000)
    .map((p) => ({
      name: p.name,
      category: p.category ?? "",
      tvl: p.chainTvls?.Stellar ?? 0,
      change7d: p.chains?.length === 1 && typeof p.change_7d === "number" ? p.change_7d : null,
      logo: p.logo ?? null,
      url: p.url ?? null,
      seidar: SEIDAR_PATH.find(([re]) => re.test(p.name.toLowerCase()))?.[1] ?? null,
    }))
    .sort((a, b) => b.tvl - a.tvl);

  const pegged = stables?.find((c) => c.name === "Stellar")?.totalCirculatingUSD ?? null;
  // Pegged EUR/JPY/… are already USD-valued by DefiLlama.
  const stablecoinsUsd = pegged ? Object.values(pegged).reduce((s, v) => s + (Number(v) || 0), 0) : null;

  // Daily network stats: the last row is today so far; KPIs use the last complete day.
  const days = (stats ?? []).slice(-366);
  const activity: ActivityPoint[] = days.map((d) => ({
    t: d.ts * 1000,
    transactions: d.transactions,
    payments: d.payments,
    trades: d.trades,
    activeAccounts: d.active_accounts,
  }));
  const full = activity.slice(0, -1);
  const day = full[full.length - 1] ?? null;
  const prev = full[full.length - 2] ?? null;

  return {
    tvl: last == null ? null : { current: last, change1d: pct(ago(1), last), change7d: pct(ago(7), last), series: tvlSeries },
    stablecoinsUsd,
    protocols: stellarProtocols,
    activity: full,
    day: day && {
      t: day.t,
      payments: day.payments,
      paymentsPrev: prev?.payments ?? null,
      activeAccounts: day.activeAccounts,
      activeAccountsPrev: prev?.activeAccounts ?? null,
      transactions: day.transactions,
      transactionsPrev: prev?.transactions ?? null,
    },
  };
}

export async function getMarketOverview() {
  const out = await withCache("market:overview:v1", 15 * 60_000, loadOverview, { swr: true });
  if (!out.value) return { status: 502, body: { ok: false, error: "Market data is unavailable right now." } };
  return { status: 200, body: { ok: true, ...out.value, source: "DefiLlama, Stellar Expert" } };
}

/** Cron: keep both caches warm so Home never waits on a cold build. */
export async function warmMarket(): Promise<void> {
  await Promise.allSettled([getMarketAssets(), getMarketOverview()]);
}
