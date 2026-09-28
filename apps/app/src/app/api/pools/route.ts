import { NextResponse } from "next/server";
import { PoolV2 } from "@blend-capital/blend-sdk";

export const dynamic = "force-dynamic";
// Pool loads are slow: allow the route time on cold cache.
export const maxDuration = 120;

const NETWORK = {
  rpc: "https://mainnet.sorobanrpc.com",
  passphrase: "Public Global Stellar Network ; September 2015",
};
const FACTORY_V2 = "CDSYOAVXFY7SM5S64IZPPPYB4GVGGLMQVFREPSQQEZVIWXX5R23G4QSU";

// Fallback pool set, enumerated live from the V2 factory on 2026-09-28.
// The route refreshes this from on-chain deploy events when reachable.
const PINNED_POOLS = [
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
];

export type PoolRow = {
  collateral: string;
  debt: string | null;
  supplyApy: number;
  borrowApy: number | null;
  maxLev: string;
  ltv: number | null;
  protocol: "blend" | "xoxno" | "peridot";
  protocolLabel: string;
  cats: ("leverage" | "yield" | "passive")[];
  source: "blend-sdk" | "xoxno-api";
  available: boolean;
};

type Cache = { at: number; rows: PoolRow[]; pools: string[] };
let cache: Cache | null = null;
const TTL_MS = 10 * 60 * 1000;
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

/** All V2 pool IDs: on-chain deploy events first, pinned fallback second. */
async function listPools(): Promise<string[]> {
  try {
    const body = (await fetchJson(
      `https://api.stellar.expert/explorer/public/contract/${FACTORY_V2}/events?order=asc&limit=200`
    )) as { _embedded?: { records?: { topics?: string[]; bodyXdr?: string }[] } };
    const recs = body?._embedded?.records ?? [];
    const { xdr, StrKey } = await import("@stellar/stellar-sdk");
    const out = new Set<string>();
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
    if (out.size > 0) return [...out];
  } catch { /* fall through to pinned */ }
  return [...PINNED_POOLS];
}

function maxLev(ltv: number): string {
  if (!(ltv > 0) || ltv >= 1) return "—";
  return `${(Math.floor((1 / (1 - ltv)) * 10) / 10).toFixed(1)}x`;
}

/** Blend V2 rows: full pairs (live supply + borrow APY) + supply singles. */
async function blendRows(poolIds: string[]): Promise<PoolRow[]> {
  const rows: PoolRow[] = [];
  const queue = [...poolIds];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length > 0) {
      const pid = queue.shift();
      if (!pid) return;
      try {
        const pool = await PoolV2.load(NETWORK, pid);
        const reserves = [...pool.reserves.entries()]
          .map(([asset, r]) => {
            const res = r as {
              supplyApr?: number;
              borrowApr?: number;
              config?: { decimals?: number; c_factor?: number | bigint; l_factor?: number | bigint; enabled?: boolean };
            };
            return {
              asset,
              supplyApy: (res.supplyApr ?? 0) * 100,
              borrowApy: (res.borrowApr ?? 0) * 100,
              ltv: Number(res.config?.l_factor ?? 0) / 10_000_000,
              enabled: res.config?.enabled !== false,
            };
          })
          .filter((r) => r.enabled);
        if (reserves.length === 0) return;
        const codes = await resolveCodes(reserves.map((r) => r.asset));
        const withCode = reserves
          .map((r, i) => ({ ...r, code: codes[i] }))
          .filter((r) => r.code !== null) as (typeof reserves[number] & { code: string })[];
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
            protocol: "blend",
            protocolLabel: "Blend",
            cats,
            source: "blend-sdk",
            available: true,
          });
        }
        // Ordered borrow pairs inside the same pool.
        for (const s of withCode) {
          for (const d of withCode) {
            if (s.asset === d.asset) continue;
            rows.push({
              collateral: s.code,
              debt: d.code,
              supplyApy: s.supplyApy,
              borrowApy: d.borrowApy,
              maxLev: maxLev(s.ltv),
              ltv: s.ltv,
              protocol: "blend",
              protocolLabel: "Blend",
              cats: ["leverage"],
              source: "blend-sdk",
              available: true,
            });
          }
        }
      } catch {
        /* skip unreachable pool; others still load */
      }
      await sleep(150);
    }
  });
  await Promise.all(workers);
  return rows;
}

/** Contract address -> ticker via Soroswap list + DeFiLlama Stellar pools. */
let codeMap: Record<string, string> | null = null;
async function resolveCodes(assets: string[]): Promise<(string | null)[]> {
  try {
    if (!codeMap) {
      const map: Record<string, string> = {
        // XLM liquidity token shared by Blend/XOXNO pools (per DeFiLlama).
        CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA: "XLM",
      };
      try {
        const list = (await fetchJson(
          "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json",
          30000
        )) as { assets?: { code?: string; contract?: string }[] };
        for (const a of list.assets ?? []) {
          if (a.contract && a.code && !map[a.contract]) map[a.contract] = a.code.toUpperCase();
        }
      } catch { /* llama fallback below */ }
      try {
        const body = (await fetchJson("https://yields.llama.fi/pools", 45000)) as {
          data?: { chain?: string; symbol?: string; underlyingTokens?: string[] }[];
        };
        for (const p of body.data ?? []) {
          if (p.chain !== "Stellar" || !p.symbol || !p.underlyingTokens) continue;
          for (const u of p.underlyingTokens) {
            if (typeof u === "string" && u.startsWith("C") && !map[u]) map[u] = p.symbol;
          }
        }
      } catch { /* pinned + soroswap only */ }
      codeMap = map;
    }
    return assets.map((a) => codeMap?.[a] ?? null);
  } catch {
    return assets.map(() => null);
  }
}

/** XOXNO rows via their public REST (supply + borrow APY, LTV per spoke/hub). */
async function xoxnoRows(): Promise<PoolRow[]> {
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
    };
    const reserves = toArr(reservesRes)
      .map((r) => ({
        spokeId: Number(r.spokeId),
        hubId: Number(r.hubId),
        asset: String(r.asset ?? ""),
        supplyApy: Number(r.supplyApy ?? 0) * 100,
        borrowApy: Number(r.borrowApy ?? 0) * 100,
        collateralFactorBps: Number(r.collateralFactorBps ?? 0),
        useAsCollateral: r.useAsCollateral !== false,
      }))
      .filter((r) => r.asset.startsWith("C")) as (R & { code: string })[];
    // Attach tickers (Soroswap list + llama + pinned XLM).
    const codes = await resolveCodes(reserves.map((r) => r.asset));
    // Attach codes ( TS: re-map with code )
    const coded = reserves
      .map((r, i) => ({ ...r, code: codes[i] }))
      .filter((r) => r.code !== null) as (R & { code: string })[];
    const out: PoolRow[] = [];
    // Supply singles: best APY per asset.
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
        maxLev: "—", ltv: null, protocol: "xoxno", protocolLabel: "XOXNO",
        cats, source: "xoxno-api", available: true,
      });
    }
    // Borrow pairs share a spoke+hub risk module.
    const groups = new Map<string, typeof coded>();
    for (const r of coded) {
      const k = `${r.spokeId}:${r.hubId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)?.push(r);
    }
    for (const members of groups.values()) {
      const coll = members.filter((m) => m.useAsCollateral && m.collateralFactorBps > 0);
      const debts = members.filter((m) => m.borrowApy > 0);
      for (const s of coll) {
        for (const d of debts) {
          if (s.asset === d.asset) continue;
          const ltv = s.collateralFactorBps / 10000;
          out.push({
            collateral: s.code, debt: d.code,
            supplyApy: s.supplyApy, borrowApy: d.borrowApy,
            maxLev: maxLev(ltv), ltv,
            protocol: "xoxno", protocolLabel: "XOXNO",
            cats: ["leverage"], source: "xoxno-api", available: true,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ ok: true, cached: true, updatedAt: cache.at, pools: cache.pools, rows: cache.rows });
    }
    const pools = await listPools();
    const [blend, xoxno] = await Promise.all([blendRows(pools), xoxnoRows()]);
    const rows = curate(dedupe([...blend, ...xoxno]));
    cache = { at: Date.now(), rows, pools };
    return NextResponse.json({ ok: true, cached: false, updatedAt: cache.at, pools, rows });
  } catch (e) {
    if (cache) {
      return NextResponse.json({ ok: true, cached: true, stale: true, updatedAt: cache.at, pools: cache.pools, rows: cache.rows });
    }
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 200 });
  }
}

/**
 * Curate to markets worth showing: supported assets only (matches the
 * wallet/token registry — no long-tail dust), no absurd manipulated rates,
 * no empty pools.
 */
const SUPPORTED_ASSETS = new Set(["XLM", "USDC", "EURC", "AQUA"]);

function curate(rows: PoolRow[]): PoolRow[] {
  return rows.filter(
    (r) =>
      SUPPORTED_ASSETS.has(r.collateral) &&
      (r.debt === null || SUPPORTED_ASSETS.has(r.debt)) &&
      r.supplyApy < 100 &&
      (r.borrowApy == null || r.borrowApy < 100)
  );
}

/**
 * Keep only real markets: drop borrow pairs on empty pools (supply APY is
 * exactly zero while the borrow rate sits at its r_base default), then
 * dedupe identical pairs across pools keeping the best net at reference
 * amounts ($100k collateral / $50k debt).
 */
function dedupe(rows: PoolRow[]): PoolRow[] {
  const best = new Map<string, PoolRow>();
  const netAtRef = (r: PoolRow) =>
    r.debt == null || r.borrowApy == null
      ? r.supplyApy
      : (r.supplyApy * 100000 - r.borrowApy * 50000) / 150000;
  for (const r of rows) {
    if (r.debt !== null && r.supplyApy === 0) continue;
    const key = `${r.protocol}|${r.collateral}|${r.debt ?? ""}`;
    const cur = best.get(key);
    if (!cur || netAtRef(r) > netAtRef(cur)) best.set(key, r);
  }
  return [...best.values()];
}
