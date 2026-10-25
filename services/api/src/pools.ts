// Native pools catalogue: Blend V2 (SDK + RPC) + XOXNO (REST). Ported verbatim from apps/app/src/app/api/pools/route.ts
// with two changes: RPC URL from env, persistence via @seidar/cache
// (per-protocol keys, SWR + keep-last-good) instead of process memory.
//
// A Blend-only caller never waits on (or pays for) XOXNO:
// getPoolData("blend") loads only listPools + blendRows.

import { PoolV2 } from "@blend-capital/blend-sdk";
import { cacheGet, cacheGetEntry, cacheSet, KEYS, withCache } from "@seidar/cache";
import { isTestnet, networkPassphrase, TESTNET } from "./net.js";
import { rpcUrl, sorobanView as sharedView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";

/** Blend SDK network for the request's network (net.ts). */
const NETWORK = () => ({ rpc: rpcUrl(), passphrase: networkPassphrase() });
const FACTORY_V2 = "CDSYOAVXFY7SM5S64IZPPPYB4GVGGLMQVFREPSQQEZVIWXX5R23G4QSU";
// Blend v2.1 factory (Fixed v2.1 etc. deploy from here, not FACTORY_V2).
const FACTORY_V2_1 = "CACUXRNBUFV7BFPKUDLVJFQI6H7EHHNSJPOFJSCWJCYUUYMORM6C63AL";

// Fallback pool set, enumerated live from the V2 factory on 2026-09-28.
// Refreshed from on-chain deploy events when reachable.
/** Delisted pools: never offered for new positions (existing legs in
    /positions are untouched, so exits keep working). New Fixed never left
    setup; Forex is frozen with a dead oracle. */
const EXCLUDED_POOLS = new Set([
  "CAIYBZSBI6XXI3W7EDXDRWLUBK3RCAPHTK4DNX74DZGWE53KYWBHE236",
  "CBYOBT7ZCCLQCBUYYIABZLSEGDPEUWXCUXQTZYOG3YBDR7U357D5ZIRF",
]);

/** Every known Blend v2 pool (positions.ts reads user legs from the same list). */
export const PINNED_POOLS = [
  "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD",
  "CBNR7PYFY775UG7W37B4OJG2OBBUKLFW6VIBHFDKKLR2HECPRMRZMDK3",
  "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS",
  "CB4OFHAY2TAEYUVPOJS36S657C6NYMSIFUNCCA5AHYT46Y5XUID3O2ED",
  "CAE7QVOMBLZ53CDRGK3UNRRHG5EZ5NQA7HHTFASEMYBWHG6MDFZTYHXC",
  "CBYOBT7ZCCLQCBUYYIABZLSEGDPEUWXCUXQTZYOG3YBDR7U357D5ZIRF",
  "CALRF5I2OCJCU577R6MZBCY5IIXNMAAG6PNMN7GUKEYIXBJCJN2FJRVI",
  "CADR6Q2UOCDJAGXMAB2E6SRT35STLZ2IGLZUCXJQG7TC2LNKCU5RTQVY",
  "CDMAVJPFXPADND3YRL4BSM3AKZWCTFMX27GLLXCML3PD62HEQS5FPVAI",
  "CDZVHCO7LDUJZSME3PJPJXAKT7F6W5IXSOXTJ2QEK3Y2X2CDUREBUMUY",
  "CC4HHXPKR3FIXUQEC53MAK2IVWD6APAEBBXP5XCIW5FISN6PQOAC6UXG",
  "CAIYBZSBI6XXI3W7EDXDRWLUBK3RCAPHTK4DNX74DZGWE53KYWBHE236",
  "CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO",
];

export type PoolRow = {
  collateral: string;
  debt: string | null;
  supplyApy: number;
  borrowApy: number | null;
  maxLev: string;
  ltv: number | null;
  marketSizeUsd: number | null;
  withdrawableUsd: number | null;
  supplyCap?: number | null;
  protocol: "blend" | "xoxno";
  protocolLabel: string;
  pool: string;
  poolName: string;
  poolSupplied: number | null;
  poolBorrowed: number | null;
  /** On-chain pool status (Blend): 0-1 active, 2-3 on-ice (no borrows),
      4-5 frozen (no supply/borrow), 6 setup. Null when unreadable. */
  poolStatus?: number | null;
  cats: ("leverage" | "yield" | "passive")[];
  source: "blend-sdk" | "xoxno-api";
  available: boolean;
  apyUnknown?: boolean;
  borrowPaused?: boolean;
};

export type PoolAsset = {
  pool: string;
  poolName: string;
  protocol: "blend" | "xoxno";
  code: string;
  supplyApy: number | null;
  borrowApy: number | null;
  ltvPct: number | null;
  supFillPct: number | null;
  borFillPct: number | null;
  canCollateral: boolean;
  canBorrow: boolean;
  /** On-chain pool status (Blend), see PoolRow.poolStatus. */
  poolStatus?: number | null;
  /** Token contract + decimals (lend / build calls need them). */
  asset?: string;
  decimals?: number;
  /** This reserve's own totals in USD (oracle-priced), when readable. */
  suppliedUsd?: number | null;
  borrowedUsd?: number | null;
};

async function sorobanView(_rpcUrl: string, contractId: string, method: string, args: unknown[] = []): Promise<unknown> {
  return sharedView(contractId, method, args);
}

function toNum(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") return Number(v);
  return 0;
}

const TTL_MS = 10 * 60 * 1000;
const ALL_KEY = "pools:all";
const STABLES = new Set(["USDC", "EURC", "USDT0"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, ms = 20000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** All V2 pool IDs: pinned set UNION on-chain deploy events (v2 + v2.1
    factories). Events alone are unreliable (retention window drops older
    deploys, which silently delists live pools), so pinned is the floor. */
async function listPools(): Promise<string[]> {
  // Testnet mode serves the Blend testnet pool only.
  if (isTestnet()) return [TESTNET.blendPool];
  const out = new Set<string>([...PINNED_POOLS]);
  try {
    const recs: { topics?: string[]; bodyXdr?: string }[] = [];
    for (const factory of [FACTORY_V2, FACTORY_V2_1]) {
      const body = (await fetchJson(
        `https://api.stellar.expert/explorer/public/contract/${factory}/events?order=asc&limit=200`,
      )) as { _embedded?: { records?: { topics?: string[]; bodyXdr?: string }[] } };
      recs.push(...(body?._embedded?.records ?? []));
    }
    const { xdr, StrKey } = await import("@stellar/stellar-sdk");
    const walk = (v: unknown, depth: number): void => {
      if (v == null || depth > 4) return;
      const sv = v as {
        switch?: () => { name?: string };
        address?: () => { switch?: () => { name?: string }; contractId?: () => Buffer };
        vec?: () => unknown[];
        map?: () => { key?: () => unknown; val?: () => unknown }[];
      };
      try {
        if (sv.switch?.().name === "scvAddress" && sv.address?.().switch?.().name === "scAddressTypeContract") {
          const id = sv.address?.().contractId?.();
          if (id) out.add(StrKey.encodeContract(id));
          return;
        }
      } catch { /* keep walking */ }
      try {
        for (const item of sv.vec?.() ?? []) walk(item, depth + 1);
      } catch { /* not a vec */ }
      try {
        for (const e of sv.map?.() ?? []) {
          walk(e.key?.(), depth + 1);
          walk(e.val?.(), depth + 1);
        }
      } catch { /* not a map */ }
    };
    for (const r of recs) {
      if (r.topics?.[0] !== "deploy" || !r.bodyXdr) continue;
      try {
        walk(xdr.ScVal.fromXDR(r.bodyXdr, "base64"), 0);
      } catch { /* skip record */ }
    }
  } catch { /* events failed; pinned floor stands */ }
  return [...out];
}

/** Health floor the app enforces on every leveraged action (see MIN health
 *  rails in the UI + MCP). Max leverage is quoted AT this floor, not at the
 *  liquidation edge: looping to leverage L leaves health = ltv x L / (L - 1),
 *  so L_max = 1 / (1 - ltv / floor). */
const LEVERAGE_HEALTH_FLOOR = 1.3;
function maxLev(ltv: number): string {
  if (!(ltv > 0) || ltv >= 1) return "—";
  const lev = 1 / (1 - ltv / LEVERAGE_HEALTH_FLOOR);
  if (!(lev > 1)) return "—";
  return `${(Math.floor(lev * 10) / 10).toFixed(1)}x`;
}

/** Blend V2 rows: full pairs (live supply + borrow APY) + supply singles. */
async function blendRows(poolIds: string[]): Promise<{ rows: PoolRow[]; assets: PoolAsset[]; loadedPools: Set<string> }> {
  const rows: PoolRow[] = [];
  const assets: PoolAsset[] = [];
  const queue = [...poolIds];
  // Spread rate-limit luck: a fixed order starves the same tail pools
  // on every cycle when the public RPC throttles.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  const attempts = new Map<string, number>();
  const loadedPools = new Set<string>();
  const outcomes: string[] = [];
  // Sequential loads: the public RPC 429s bursts, and a throttled pool
  // silently drops out of the catalogue. One pool at a time is slower
  // per cycle but deterministic; retries + per-pool carry-forward below
  // cover the rest.
  const workers = Array.from({ length: 1 }, async () => {
    while (queue.length > 0) {
      const pid = queue.shift();
      if (!pid) return;
      try {
        // Delisted: skip this pool but keep draining the queue (return
        // here would abandon every pool behind it with one worker).
        if (EXCLUDED_POOLS.has(pid)) continue;
        const pool = await PoolV2.load(NETWORK(), pid);
        // An empty reserve set is never legitimate for a live pool — it
        // means a partial RPC read. Fail loudly into the retry path
        // instead of silently delisting the pool.
        if (pool.reserves.size === 0) throw new Error("empty reserves");
        const rawStatus = Number(
          (pool.metadata as { status?: unknown })?.status ?? NaN,
        );
        const poolStatus = Number.isFinite(rawStatus) ? rawStatus : null;
        let poolUsd: { supply: number | null; borrow: number | null } = { supply: null, borrow: null };
        // One oracle load shared by the estimate and the fallback below —
        // halves per-pool RPC calls against the throttled endpoint.
        let oracle: Awaited<ReturnType<typeof pool.loadOracle>> | null = null;
        try {
          oracle = await pool.loadOracle();
        } catch {
          /* totals stay null; APYs still served */
        }
        if (oracle) {
          try {
            const { PoolEstimate } = await import("@blend-capital/blend-sdk");
            const est = PoolEstimate.build(pool.reserves, oracle) as {
              totalSupply?: unknown;
              totalBorrowed?: unknown;
            };
            const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
            poolUsd = { supply: num(est.totalSupply), borrow: num(est.totalBorrowed) };
          } catch {
            /* totals stay null; APYs still served */
          }
        }
        if ((poolUsd.supply == null || poolUsd.borrow == null) && oracle) {
          // Whole-pool estimate throws when the oracle misses an exotic
          // reserve: sum the priced reserves so partial coverage still
          // reports TVL instead of zeroing the entire pool.
          try {
            let s = 0;
            let b = 0;
            let okS = false;
            let okB = false;
            for (const [asset, r] of pool.reserves.entries()) {
              try {
                const px = oracle.getPriceFloat(asset);
                if (typeof px !== "number" || !Number.isFinite(px) || px <= 0)
                  continue;
                const live = r as unknown as {
                  totalSupplyFloat?: () => number;
                  totalLiabilitiesFloat?: () => number;
                };
                if (typeof live?.totalSupplyFloat === "function") {
                  const v = live.totalSupplyFloat();
                  if (Number.isFinite(v)) {
                    s += v * px;
                    okS = true;
                  }
                }
                if (typeof live?.totalLiabilitiesFloat === "function") {
                  const v = live.totalLiabilitiesFloat();
                  if (Number.isFinite(v)) {
                    b += v * px;
                    okB = true;
                  }
                }
              } catch {
                /* skip reserve */
              }
            }
            poolUsd = { supply: okS ? s : null, borrow: okB ? b : null };
          } catch {
            /* totals stay null */
          }
        }
        const reserves = [...pool.reserves.entries()]
          .map(([asset, r]) => {
            const res = r as {
              supplyApr?: number;
              borrowApr?: number;
              config?: { decimals?: number; c_factor?: number | bigint; l_factor?: number | bigint; enabled?: boolean; util?: number | bigint; max_util?: number | bigint; supply_cap?: number | bigint };
            };
            const util = Number(res.config?.util ?? 0) / 10_000_000;
            const maxUtil = Number(res.config?.max_util ?? 1) / 10_000_000;
            const decimals = Number(res.config?.decimals ?? 7);
            const capRaw = Number(res.config?.supply_cap ?? 0);
            const capTokens =
              capRaw > 0 && Number.isFinite(capRaw)
                ? capRaw / 10 ** decimals
                : 0;
            const supplyCap = capTokens > 0 && capTokens < 1e12 ? capTokens : null;
            return {
              asset,
              supplyApy: (res.supplyApr ?? 0) * 100,
              borrowApy: (res.borrowApr ?? 0) * 100,
              // c_factor = collateral weight; l_factor discounts liabilities.
              ltv: Number(res.config?.c_factor ?? 0) / 10_000_000,
              lFactor: Number(res.config?.l_factor ?? 0) / 10_000_000,
              enabled: res.config?.enabled !== false,
              decimals,
              supplyCap,
              borrowShut: util >= maxUtil,
            };
          })
          .filter((r) => r.enabled);
        if (reserves.length === 0) return;
        const codes = await resolveCodes(reserves.map((r) => r.asset));
        const withCode = reserves
          .map((r, i) => ({ ...r, code: codes[i] }))
          .filter((r) => r.code !== null) as (typeof reserves[number] & { code: string })[];
        const meta = pool.metadata as { name?: unknown } | null;
        const poolName =
          meta && typeof meta.name === "string" && meta.name
            ? meta.name
            : `Pool ${pid.slice(0, 8)}`;
        const reserveByAsset = new Map(pool.reserves.entries());
        // Oracle read failed (throttled RPC): price the reserves from the
        // live price feed instead, so the pool's totals never read as zero.
        let feedPx: Record<string, number | null> = {};
        if (!oracle) {
          try {
            const { livePrices } = await import("./prices.js");
            feedPx = (await livePrices(withCode.map((r) => r.code))).prices;
          } catch {
            /* totals stay null */
          }
          if (poolUsd.supply == null || poolUsd.borrow == null) {
            let s = 0;
            let b = 0;
            let ok = false;
            for (const r of withCode) {
              const px = feedPx[r.code.toUpperCase()];
              const live = reserveByAsset.get(r.asset) as unknown as {
                totalSupplyFloat?: () => number;
                totalLiabilitiesFloat?: () => number;
              };
              if (!px || typeof live?.totalSupplyFloat !== "function") continue;
              try {
                s += live.totalSupplyFloat() * px;
                b += (live.totalLiabilitiesFloat?.() ?? 0) * px;
                ok = true;
              } catch {
                /* skip reserve */
              }
            }
            if (ok) poolUsd = { supply: s, borrow: b };
          }
        }
        for (const r of withCode) {
          let supplied: number | null = null;
          let borrowed: number | null = null;
          try {
            const live = reserveByAsset.get(r.asset) as unknown as {
              totalSupplyFloat?: () => number;
              totalLiabilitiesFloat?: () => number;
            };
            if (typeof live?.totalSupplyFloat === "function")
              supplied = live.totalSupplyFloat();
            if (typeof live?.totalLiabilitiesFloat === "function")
              borrowed = live.totalLiabilitiesFloat();
          } catch {
            /* fills stay null */
          }
          const cap = r.supplyCap ?? null;
          const supFill =
            cap != null && cap > 0 && supplied != null && Number.isFinite(supplied) && supplied >= 0
              ? (supplied / cap) * 100
              : null;
          const borFill =
            supplied != null && supplied > 0 && borrowed != null && Number.isFinite(borrowed) && borrowed >= 0
              ? (borrowed / supplied) * 100
              : null;
          const ltvPct = (r.ltv ?? 0) * 100;
          let px: number | null = null;
          try {
            const p = oracle?.getPriceFloat(r.asset);
            px = typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
          } catch {
            px = null;
          }
          px ??= feedPx[r.code.toUpperCase()] ?? null;
          assets.push({
            pool: pid,
            poolName,
            protocol: "blend",
            code: r.code,
            asset: r.asset,
            decimals: r.decimals,
            suppliedUsd: px != null && supplied != null ? supplied * px : null,
            borrowedUsd: px != null && borrowed != null ? borrowed * px : null,
            supplyApy: r.supplyApy,
            borrowApy: r.borrowApy,
            ltvPct: ltvPct > 0 ? ltvPct : null,
            supFillPct: supFill,
            borFillPct: borFill,
            canCollateral: ltvPct > 0,
            canBorrow: (r.borrowApy ?? 0) > 0,
            poolStatus,
          });
        }
        for (const r of withCode) {
          const cats: PoolRow["cats"] = ["yield"];
          if (STABLES.has(r.code)) cats.push("passive");
          rows.push({
            collateral: r.code,
            debt: null,
            supplyApy: r.supplyApy,
            borrowApy: null,
            maxLev: "—",
            ltv: null,
            marketSizeUsd: poolUsd.supply,
            withdrawableUsd:
              poolUsd.supply != null && poolUsd.borrow != null
                ? Math.max(0, poolUsd.supply - poolUsd.borrow)
                : null,
            supplyCap: r.supplyCap,
            protocol: "blend",
            protocolLabel: "Blend",
            pool: pid,
            poolName,
            poolSupplied: poolUsd.supply,
            poolBorrowed: poolUsd.borrow,
            poolStatus,
            cats,
            source: "blend-sdk",
            available: true,
          });
        }
        for (const s of withCode) {
          for (const d of withCode) {
            if (s.asset === d.asset) continue;
            const paused = d.borrowShut || s.ltv <= 0;
            // Blend health = Σ coll x c_factor / Σ debt / l_factor, so the
            // pair's effective LTV is c_factor(collateral) x l_factor(debt).
            const pairLtv = s.ltv * (d.lFactor > 0 ? d.lFactor : 1);
            rows.push({
              collateral: s.code,
              debt: d.code,
              supplyApy: s.supplyApy,
              borrowApy: d.borrowApy,
              maxLev: paused ? "—" : maxLev(pairLtv),
              ltv: pairLtv,
              marketSizeUsd: poolUsd.supply,
              withdrawableUsd:
                poolUsd.supply != null && poolUsd.borrow != null
                  ? Math.max(0, poolUsd.supply - poolUsd.borrow)
                  : null,
              protocol: "blend",
              protocolLabel: "Blend",
              pool: pid,
              poolName,
              poolSupplied: poolUsd.supply,
              poolBorrowed: poolUsd.borrow,
              poolStatus,
              cats: ["leverage", "yield"],
              source: "blend-sdk",
              available: true,
              borrowPaused: paused || undefined,
            });
          }
        }
        loadedPools.add(pid);
        outcomes.push(`${pid.slice(0, 8)}:ok`);
      } catch (e) {
        // Public RPC 429s under load; retry with growing sleeps
        // (re-queued at the back, so others load first).
        const n = (attempts.get(pid) ?? 0) + 1;
        attempts.set(pid, n);
        if (n < 4) {
          await sleep(2000 * n);
          queue.push(pid);
        } else {
          outcomes.push(`${pid.slice(0, 8)}:FAIL`);
          console.warn(
            `[pools] skipping unreachable pool ${pid}: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
          );
        }
      }
      await sleep(400);
    }
  });
  await Promise.all(workers);
  console.warn(`[pools] outcomes: ${outcomes.join(" ")}`);
  return { rows, assets, loadedPools };
}

/** Contract address -> ticker via Soroswap list + DeFiLlama Stellar pools. */
let codeMap: Record<string, string> | null = null;
let registryCodes: Set<string> | null = null;
let registryAt = 0;
const REGISTRY_TTL_MS = 60 * 60 * 1000;
const TICKER = /^[A-Z0-9]{1,12}$/;
const PINNED_CODES = new Set(["XLM", "USDC", "EURC", "AQUA", "PYUSD", "CETES", "USTRY", "USDGLO"]);
async function resolveCodes(assets: string[]): Promise<(string | null)[]> {
  if (isTestnet()) {
    // Testnet tokens aren't on the mainnet token list: read their contracts.
    const metas = await tokenMetas(assets).catch(() => ({}) as Record<string, { code: string }>);
    return assets.map((a) => metas[a]?.code ?? null);
  }
  try {
    if (!codeMap || Date.now() - registryAt > REGISTRY_TTL_MS) {
      const map: Record<string, string> = {
        CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA: "XLM",
        ...(codeMap ?? {}),
      };
      const reg = new Set<string>([
        ...PINNED_CODES,
        ...Object.values(codeMap ?? {}).filter((c) => TICKER.test(c)),
      ]);
      let ok = codeMap != null;
      try {
        const list = (await fetchJson(
          "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json",
          30000
        )) as { assets?: { code?: string; contract?: string }[] };
        for (const a of list.assets ?? []) {
          if (a.contract && a.code && !map[a.contract]) map[a.contract] = a.code.toUpperCase();
          if (a.code && TICKER.test(a.code.toUpperCase())) reg.add(a.code.toUpperCase());
        }
        ok = true;
      } catch { /* llama fallback below */ }
      try {
        const body = (await fetchJson("https://yields.llama.fi/pools", 45000)) as {
          data?: { chain?: string; symbol?: string; underlyingTokens?: string[] }[];
        };
        for (const p of body.data ?? []) {
          if (p.chain !== "Stellar" || !p.symbol || !p.underlyingTokens) continue;
          const code = p.symbol.toUpperCase();
          if (!TICKER.test(code)) continue;
          for (const u of p.underlyingTokens) {
            if (typeof u === "string" && u.startsWith("C") && !map[u]) map[u] = code;
          }
          reg.add(code);
        }
        ok = true;
      } catch { /* pinned + soroswap only */ }
      if (ok) {
        codeMap = map;
        registryCodes = reg;
        registryAt = Date.now();
        await cacheSet("pools:registry", { map, reg: [...reg] }, REGISTRY_TTL_MS).catch(() => {});
      } else if (!codeMap) {
        const shared = await cacheGet<{ map: Record<string, string>; reg: string[] }>("pools:registry").catch(() => null);
        if (shared) {
          codeMap = shared.map;
          registryCodes = new Set(shared.reg);
        } else {
          codeMap = map;
          registryCodes = reg;
        }
      }
    }
    return assets.map((a) => codeMap?.[a] ?? null);
  } catch {
    return assets.map(() => null);
  }
}

/** XOXNO rows via their public REST (supply + borrow APY, LTV per spoke/hub). */
async function xoxnoRows(): Promise<{ rows: PoolRow[]; assets: PoolAsset[]; loadedPools: Set<string> }> {
  try {
    const reservesRes = await fetchJson("https://api.xoxno.com/stellar-lending/reserves", 30000);
    const toArr = (d: unknown): Record<string, unknown>[] => {
      const o = d as { reserves?: unknown[]; data?: unknown[] };
      if (Array.isArray(d)) return d as Record<string, unknown>[];
      return (o.reserves ?? o.data ?? []) as Record<string, unknown>[];
    };
    type R = {
      spokeId: number; hubId: number; asset: string;
      supplyApy: number; borrowApy: number;
      collateralFactorBps: number; useAsCollateral: boolean;
      totalDepositsUsd: number | null; totalBorrowsUsd: number | null;
      availableLiquidityUsd: number | null;
      capacityFilledPct: number | null; utilizationRate: number | null;
    };
    const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const reserves = toArr(reservesRes)
      .map((r) => ({
        spokeId: Number(r.spokeId),
        hubId: Number(r.hubId),
        asset: String(r.asset ?? ""),
        supplyApy: Number(r.supplyApy ?? 0) * 100,
        borrowApy: Number(r.borrowApy ?? 0) * 100,
        collateralFactorBps: Number(r.collateralFactorBps ?? 0),
        useAsCollateral: r.useAsCollateral !== false,
        totalDepositsUsd: numOrNull(r.totalDepositsUsd),
        totalBorrowsUsd: numOrNull(r.totalBorrowsUsd),
        availableLiquidityUsd: numOrNull(r.availableLiquidityUsd),
        capacityFilledPct: numOrNull(r.capacityFilledPct),
        utilizationRate: numOrNull(r.utilizationRate),
      }))
      .filter((r) => r.asset.startsWith("C")) as (R & { code: string })[];
    const codes = await resolveCodes(reserves.map((r) => r.asset));
    const coded = reserves
      .map((r, i) => ({ ...r, code: codes[i] }))
      .filter((r) => r.code !== null) as (R & { code: string })[];
    const out: PoolRow[] = [];
    const assets: PoolAsset[] = [];
    const hubTotals = new Map<number, { supplied: number; borrowed: number }>();
    for (const r of coded) {
      const t = hubTotals.get(r.hubId) ?? { supplied: 0, borrowed: 0 };
      t.supplied += r.totalDepositsUsd ?? 0;
      t.borrowed += r.totalBorrowsUsd ?? 0;
      hubTotals.set(r.hubId, t);
    }
    const hubPool = (hubId: number) => `xoxno-hub-${hubId}`;
    const hubName = (hubId: number) => `XOXNO Hub ${hubId}`;
    const hubSupplied = (hubId: number) => {
      const t = hubTotals.get(hubId);
      return t && t.supplied > 0 ? t.supplied : null;
    };
    const hubBorrowed = (hubId: number) => {
      const t = hubTotals.get(hubId);
      return t && t.borrowed > 0 ? t.borrowed : null;
    };
    for (const r of coded) {
      const canColl = r.useAsCollateral && r.collateralFactorBps > 0;
      assets.push({
        pool: hubPool(r.hubId),
        poolName: hubName(r.hubId),
        protocol: "xoxno",
        code: r.code,
        supplyApy: r.supplyApy,
        borrowApy: r.borrowApy,
        ltvPct: canColl ? r.collateralFactorBps / 100 : null,
        supFillPct: r.capacityFilledPct,
        borFillPct:
          r.utilizationRate != null ? r.utilizationRate * 100 : null,
        canCollateral: canColl,
        canBorrow: r.borrowApy > 0,
      });
    }
    const best = new Map<string, (typeof coded)[number]>();
    for (const r of coded) {
      const cur = best.get(r.code);
      if (!cur || r.supplyApy > cur.supplyApy) best.set(r.code, r);
    }
    for (const r of best.values()) {
      const cats: PoolRow["cats"] = ["yield"];
      if (STABLES.has(r.code)) cats.push("passive");
      out.push({
        collateral: r.code, debt: null, supplyApy: r.supplyApy, borrowApy: null,
        maxLev: "—", ltv: null,
        marketSizeUsd: r.totalDepositsUsd, withdrawableUsd: r.availableLiquidityUsd,
        protocol: "xoxno", protocolLabel: "XOXNO",
        pool: hubPool(r.hubId), poolName: hubName(r.hubId),
        poolSupplied: hubSupplied(r.hubId),
        poolBorrowed: hubBorrowed(r.hubId),
        cats, source: "xoxno-api", available: true,
      });
    }
    const groups = new Map<string, typeof coded>();
    for (const r of coded) {
      const k = `${r.spokeId}:${r.hubId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)?.push(r);
    }
    for (const members of groups.values()) {
      const hubId = members[0]?.hubId ?? 0;
      const coll = members.filter((m) => m.useAsCollateral && m.collateralFactorBps > 0);
      const debts = members.filter((m) => m.borrowApy > 0);
      for (const s of coll) {
        for (const d of debts) {
          if (s.asset === d.asset) continue;
          const ltv = s.collateralFactorBps / 10000;
          const liq = d.availableLiquidityUsd;
          const paused = liq != null && liq <= 0;
          out.push({
            collateral: s.code, debt: d.code,
            supplyApy: s.supplyApy, borrowApy: d.borrowApy,
            maxLev: paused ? "—" : maxLev(ltv), ltv,
            marketSizeUsd: s.totalDepositsUsd, withdrawableUsd: liq,
            protocol: "xoxno", protocolLabel: "XOXNO",
            pool: hubPool(hubId), poolName: hubName(hubId),
            poolSupplied: hubSupplied(hubId),
            poolBorrowed: hubBorrowed(hubId),
            cats: ["leverage", "yield"], source: "xoxno-api", available: true,
            borrowPaused: paused || undefined,
          });
        }
      }
    }
    const loadedPools = new Set(
      [...new Set(coded.map((r) => r.hubId))].map((h) => hubPool(h)),
    );
    return { rows: out, assets, loadedPools };
  } catch {
    return { rows: [], assets: [], loadedPools: new Set<string>() };
  }
}

function curate(rows: PoolRow[]): PoolRow[] {
  // Testnet: show the test pool as it is (its rates are synthetic and its
  // tokens are not on the mainnet registry).
  if (isTestnet()) return rows;
  const reg = registryCodes ?? PINNED_CODES;
  return rows.filter(
    (r) =>
      reg.has(r.collateral) &&
      (r.debt === null || reg.has(r.debt)) &&
      r.supplyApy < 100 &&
      (r.borrowApy == null || r.borrowApy < 100)
  );
}

function dedupe(rows: PoolRow[]): PoolRow[] {
  const best = new Map<string, PoolRow>();
  const netAtRef = (r: PoolRow) =>
    r.debt == null || r.borrowApy == null
      ? r.supplyApy
      : (r.supplyApy * 100000 - r.borrowApy * 50000) / 150000;
  for (const r of rows) {
    if (r.debt !== null && r.supplyApy === 0 && !r.apyUnknown) continue;
    const key = `${r.protocol}|${r.pool}|${r.collateral}|${r.debt ?? ""}`;
    const cur = best.get(key);
    if (!cur || netAtRef(r) > netAtRef(cur)) best.set(key, r);
  }
  return [...best.values()];
}

export type PoolProtocol = "blend" | "xoxno";
export interface PoolData {
  rows: PoolRow[];
  assets: PoolAsset[];
  pools: string[];
  sources: Record<string, number>;
  updatedAt: number;
  registry?: string[];
  cached: boolean;
  stale?: boolean;
  partial?: boolean;
}

async function fetchProtocol(p: PoolProtocol): Promise<Omit<PoolData, "cached" | "updatedAt">> {
  // XOXNO is mainnet-only.
  if (p === "xoxno" && isTestnet()) return { rows: [], assets: [], pools: [], sources: { xoxno: 0 } };
  if (p === "blend") {
    const ids = await listPools();
    const { rows, assets } = await blendRows(ids);
    const fresh = curate(dedupe(rows));
    // Per-pool keep-last-good: a pool that yields nothing this cycle keeps
    // its previous rows instead of blinking out on a transient RPC gap.
    // Delisted pools are never carried.
    let merged = fresh;
    let mergedAssets = assets;
    try {
      const prev = await cacheGetEntry<PoolData>(KEYS.pool("blend-v2"));
      if (
        prev?.value &&
        Date.now() - prev.at < 2 * 60 * 60 * 1000 &&
        Array.isArray(prev.value.rows)
      ) {
        const freshPools = new Set(fresh.map((r) => r.pool));
        const carried = (prev.value.rows as PoolRow[]).filter(
          (r) => !freshPools.has(r.pool) && !EXCLUDED_POOLS.has(r.pool),
        );
        if (carried.length > 0) {
          const carriedPools = new Set(carried.map((r) => r.pool));
          const prevAssets = Array.isArray((prev.value as PoolData).assets)
            ? (prev.value as PoolData).assets
            : [];
          mergedAssets = [
            ...assets,
            ...prevAssets.filter(
              (a) =>
                carriedPools.has(a.pool) &&
                !assets.some((x) => x.pool === a.pool && x.code === a.code),
            ),
          ];
          merged = [...fresh, ...carried];
        }
      }
    } catch {
      /* fresh stands */
    }
    // An empty board is an RPC blip, never the truth: throw so the cache
    // keeps serving the last good board instead of storing nothing.
    if (merged.length === 0) throw new Error("blend: no pool rows this cycle");
    return { rows: merged, assets: mergedAssets, pools: ids, sources: { blend: rows.length } };
  }
  const { rows, assets } = await xoxnoRows();
  const curated = curate(dedupe(rows));
  if (curated.length === 0) throw new Error("xoxno: no hub rows this cycle");
  return { rows: curated, assets, pools: [], sources: { xoxno: rows.length } };
}

/** One protocol, shared-cache read-through (SWR + keep-last-good). */
export async function getPoolData(p: PoolProtocol): Promise<PoolData> {
  // v2: asset rows carry contract, decimals and per-reserve USD totals.
  const key = KEYS.pool(`${p}-v2`);
  const out = await withCache(key, TTL_MS, () => fetchProtocol(p), { swr: true });
  const v = out.value as Omit<PoolData, "cached" | "updatedAt"> | null;
  if (!v) {
    return { rows: [], assets: [], pools: [], sources: {}, updatedAt: Date.now(), cached: out.cached, stale: true };
  }
  const entry = await cacheGetEntry<{ updatedAt?: number }>(key).catch(() => null);
  void entry;
  return {
    ...v,
    registry: [...(registryCodes ?? PINNED_CODES)].sort(),
    updatedAt: Date.now(),
    cached: out.cached,
    stale: out.stale || undefined,
  };
}

/** Aggregated catalogue for Discover/canvas (per-protocol entries merged). */
export async function getPoolsAll(debug = false): Promise<PoolData & { excluded?: unknown[] }> {
  const [b, x] = await Promise.all([getPoolData("blend"), getPoolData("xoxno")]);
  const all = dedupe([...b.rows, ...x.rows]);
  const rows = curate(all);
  const prev = await cacheGetEntry<PoolData>(ALL_KEY).catch(() => null);
  const merged = rows;
  // Collapse guard: never let a blip rebuild clobber a healthy snapshot.
  if (
    prev &&
    prev.value.rows.length > 0 &&
    Date.now() - prev.value.updatedAt <= 3_600_000 &&
    (merged.length < Math.max(1, Math.floor(prev.value.rows.length / 2)) ||
      (["blend", "xoxno"] as const).some(
        (p) =>
          prev.value.rows.filter((r) => r.protocol === p).length > 0 &&
          merged.filter((r) => r.protocol === p).length === 0,
      ))
  ) {
    return { ...prev.value, cached: true, stale: true, partial: true };
  }
  const payload: PoolData = {
    rows: merged,
    assets: [...b.assets, ...x.assets],
    pools: b.pools,
    sources: { blend: b.rows.length, xoxno: x.rows.length },
    updatedAt: Date.now(),
    registry: [...(registryCodes ?? PINNED_CODES)].sort(),
    cached: b.cached && x.cached,
  };
  await cacheSet(ALL_KEY, payload, TTL_MS).catch(() => {});
  if (!debug) return payload;
  const kept = new Set(merged.map((r) => `${r.protocol}|${r.pool}|${r.collateral}|${r.debt ?? ""}`));
  return {
    ...payload,
    excluded: all
      .filter((r) => !kept.has(`${r.protocol}|${r.pool}|${r.collateral}|${r.debt ?? ""}`))
      .map((r) => ({
        pair: `${r.collateral}->${r.debt ?? "(supply)"}`,
        protocol: r.protocol,
        supplyApy: +r.supplyApy.toFixed(4),
        borrowApy: r.borrowApy,
        reason: r.supplyApy >= 100 || (r.borrowApy ?? 0) >= 100 ? "absurd-rate" : "unsupported-asset-or-empty",
      })),
  };
}

export type BlendPoolInfo = { address: string; name: string; status: number | null };

/** Blend pools with name + on-chain status (from the cached pool feed). */
export async function blendPoolsInfo(): Promise<BlendPoolInfo[]> {
  const d = await getPoolData("blend");
  const by = new Map<string, BlendPoolInfo>();
  for (const r of d.rows) {
    if (!r.pool || by.has(r.pool)) continue;
    by.set(r.pool, { address: r.pool, name: r.poolName, status: r.poolStatus ?? null });
  }
  return [...by.values()];
}

/** Blend counts a flash loan as a borrow (execute_submit_with_flash_loan
 *  checks Borrow first), and borrowing stops above status 1: on-ice (2-3),
 *  frozen (4-5) and setup (6) pools can't run a flash-loan automation. */
export const flashAllowed = (status: number | null | undefined) => status != null && status <= 1;

/** Plain-words reason a pool's status blocks flash-loan automations. */
export function poolStatusNote(status: number | null | undefined): string | null {
  if (status == null) return "This market's status couldn't be read, so automations stay off until it is.";
  if (status <= 1) return null;
  const what = status <= 3 ? "on ice" : status <= 5 ? "frozen" : "still in setup";
  return `This market is ${what}: Blend blocks borrowing here, and these automations start with a flash loan, which Blend counts as borrowing.`;
}
