// Native wallet positions: Blend (SDK + RPC) + XOXNO (SDK read client). Ported from apps/app/src/app/api/positions/route.ts
// with two changes: RPC URL from env, XLM leg from the Reflector price
// cascade (./prices.js) instead of CoinGecko. Returns plain data (no
// NextResponse) so any runtime (Node, Containers, Workers) can serve it.

import { PoolV2, PoolUser, PositionsEstimate } from "@blend-capital/blend-sdk";
import { livePrices } from "./prices.js";
import { PINNED_POOLS } from "./pools.js";
import { isTestnet, networkPassphrase, TESTNET } from "./net.js";
import { retryable, rpcUrl, rpcUrls, sorobanView as sharedView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";

/** Blend SDK network for the request's network (net.ts). */
const NETWORK = () => ({ rpc: rpcUrl(), passphrase: networkPassphrase() });

// The pool list is shared with pools.ts (one source, so they never drift).

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

export type PositionLeg = {
  protocol: "blend" | "xoxno";
  asset: string;
  code: string;
  /** Pool/market contract when the upstream attributes one. */
  pool?: string;
  suppliedUsd: number;
  borrowedUsd: number;
  supplyAmount?: number;
  borrowAmount?: number;
  /** Blend: the plain (non-collateral) part of the supply — "lent". */
  lentAmount?: number;
  lentUsd?: number;
  /** XOXNO: the account the leg lives in (one account per spoke). */
  xoxno?: { accountId: string; spokeId: number; hubId: number };
};

let codeMap: Record<string, string> | null = null;
async function resolveCodes(assets: string[]): Promise<(string | null)[]> {
  if (isTestnet()) {
    const metas = await tokenMetas(assets).catch(() => ({}) as Record<string, { code: string }>);
    return assets.map((a) => metas[a]?.code ?? null);
  }
  try {
    if (!codeMap) {
      const map: Record<string, string> = {
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
      codeMap = map;
    }
    return assets.map((a) => codeMap?.[a] ?? null);
  } catch {
    return assets.map(() => null);
  }
}

async function sorobanView(_rpcUrl: string, contractId: string, method: string, args: unknown[] = []): Promise<unknown> {
  return sharedView(contractId, method, args);
}

function toNum(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") return Number(v);
  return 0;
}

export type PositionProtocol = "blend" | "xoxno";

export async function getPositions(address: string, only?: PositionProtocol) {
  const t0 = Date.now();
  const legs: PositionLeg[] = [];
  let blendSupplied = 0;
  let blendBorrowed = 0;
  let blendNetApy = 0;
  let blendWeight = 0;
  let blendEffColl = 0;
  let blendEffLia = 0;
  /** Unclaimed BLND emissions across pools (claimable via pool.claim). */
  let claimableBlnd = 0;
  /** Per Blend pool (pools are isolated): emissions, health and remaining borrow capacity in USD. */
  const byPool: Record<string, { claimableBlnd: number; healthFactor: number | null; borrowCapacityUsd: number; suppliedUsd: number; borrowedUsd: number; netApy: number | null }> = {};
  let xoxnoSupplied = 0;
  let xoxnoBorrowed = 0;
  let xoxnoEffColl = 0;
  let xoxnoEffLia = 0;
  const errors: string[] = [];
  const priceMap = new Map<string, number>();

  // ---- Blend V2: per-pool user estimates (USD, oracle-denominated) ----
  if (!only || only === "blend") {
    const queue = isTestnet() ? [TESTNET.blendPool] : [...PINNED_POOLS];
    const readBlendPool = async (pid: string, attempt: number): Promise<void> => {
      const urls = rpcUrls();
      const net = { ...NETWORK(), rpc: urls[attempt % urls.length] };
      const pool = await PoolV2.load(net, pid);
      // A broken pool oracle must not hide the user's position: read
      // the position anyway and value it at 0 with a note.
      let oracle: Awaited<ReturnType<typeof pool.loadOracle>> | null = null;
      try {
        oracle = await pool.loadOracle();
      } catch (e) {
        if (retryable(e)) throw e;
      }
      for (const [asset] of pool.reserves.entries()) {
        const px = oracle?.getPriceFloat(asset);
        if (typeof px === "number" && Number.isFinite(px) && px > 0 && !priceMap.has(asset)) {
          priceMap.set(asset, px);
        }
      }
      let user: InstanceType<typeof PoolUser>;
      try {
        user = await PoolUser.load(net, pid, pool, address);
      } catch (e) {
        if (retryable(e)) throw e;
        return; // no position entry in this pool
      }
      if (!oracle) {
        const assets = [...pool.reserves.keys()];
        const codes = await resolveCodes(assets);
        let any = false;
        assets.forEach((asset, i) => {
          const reserve = pool.reserves.get(asset);
          if (!reserve || !codes[i]) return;
          const lent = user.getSupplyFloat(reserve);
          const sup = lent + user.getCollateralFloat(reserve);
          const lia = user.getLiabilitiesFloat(reserve);
          if (sup <= 0 && lia <= 0) return;
          any = true;
          legs.push({ protocol: "blend", asset, code: codes[i], pool: pid, suppliedUsd: 0, borrowedUsd: 0, supplyAmount: sup, borrowAmount: lia, lentAmount: lent, lentUsd: 0 });
        });
        if (any) errors.push(`blend ${pid.slice(0, 6)}: pool oracle unavailable — amounts shown without USD value`);
        return;
      }
      const est = PositionsEstimate.build(pool, oracle, user.positions);
      // Emissions accrue even after a position is closed, so count them first.
      let poolEmissions = 0;
      try {
        const em = user.estimateEmissions([...pool.reserves.values()]);
        if (Number.isFinite(em.emissions) && em.emissions > 0) {
          claimableBlnd += em.emissions;
          poolEmissions = em.emissions;
        }
      } catch {
        /* no emission data for this user */
      }
      if (poolEmissions > 0 || est.totalSupplied > 0.01 || est.totalBorrowed > 0.01) {
        byPool[pid] = {
          claimableBlnd: poolEmissions,
          healthFactor: est.totalEffectiveLiabilities > 0 ? est.totalEffectiveCollateral / est.totalEffectiveLiabilities : null,
          borrowCapacityUsd: Math.max(0, est.totalEffectiveCollateral - est.totalEffectiveLiabilities),
          suppliedUsd: est.totalSupplied,
          borrowedUsd: est.totalBorrowed,
          netApy: Number.isFinite(est.netApy) ? est.netApy : null,
        };
      }
      if (est.totalSupplied > 0.01 || est.totalBorrowed > 0.01) {
        blendSupplied += est.totalSupplied;
        blendBorrowed += est.totalBorrowed;
        blendEffColl += est.totalEffectiveCollateral;
        blendEffLia += est.totalEffectiveLiabilities;
        const w = est.totalSupplied + est.totalBorrowed;
        if (w > 0 && Number.isFinite(est.netApy)) {
          blendNetApy += est.netApy * w;
          blendWeight += w;
        }
        const assets = [...pool.reserves.keys()];
        const codes = await resolveCodes(assets);
        assets.forEach((asset, i) => {
          const code = codes[i];
          if (!code) return;
          const reserve = pool.reserves.get(asset);
          if (!reserve) return;
          const lent = user.getSupplyFloat(reserve);
          const sup = lent + user.getCollateralFloat(reserve);
          const lia = user.getLiabilitiesFloat(reserve);
          if (sup <= 0 && lia <= 0) return;
          const px = oracle.getPriceFloat(asset) ?? 0;
          legs.push({
            protocol: "blend",
            asset,
            code,
            pool: pid,
            suppliedUsd: sup * px,
            borrowedUsd: lia * px,
            supplyAmount: sup,
            borrowAmount: lia,
            lentAmount: lent,
            lentUsd: lent * px,
          });
        });
      }
    };
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length > 0) {
        const pid = queue.shift();
        if (!pid) return;
        // Rate limits / timeouts retry on the next endpoint: a pool that
        // fails to read must not pass for "no position here".
        for (let attempt = 0; ; attempt++) {
          try {
            await readBlendPool(pid, attempt);
            break;
          } catch (e) {
            if (attempt < 3 && retryable(e)) {
              await sleep(600 * 2 ** attempt);
              continue;
            }
            errors.push(`blend ${pid.slice(0, 6)}: ${String(e).slice(0, 80)}`);
            break;
          }
        }
        await sleep(120);
      }
    });
    await Promise.all(workers);
  }

  // ---- XOXNO: render-ready account positions (human amounts + USD) ----
  // XOXNO is mainnet-only. The SDK read client is the same source the
  // XOXNO app uses, so newly supplied assets appear without indexer lag.
  if ((!only || only === "xoxno") && !isTestnet()) {
    try {
      const { createStellarLendingReadClient } = await import("@xoxno/sdk-js/stellar-lending/read");
      const client = createStellarLendingReadClient({ baseUrl: "https://api.xoxno.com" });
      const accounts = await client.positions(address);
      const contracts = new Set<string>();
      for (const account of accounts) {
        for (const p of [...account.supplied, ...account.borrow]) {
          if (p.sac?.startsWith("C")) contracts.add(p.sac);
        }
      }
      const codeByAsset = new Map<string, string>();
      const missingCodes = [...contracts];
      if (missingCodes.length > 0) {
        const codes = await resolveCodes(missingCodes);
        missingCodes.forEach((asset, i) => {
          if (codes[i]) codeByAsset.set(asset, codes[i] as string);
        });
      }
      const human = (p: { amount?: string | null; amountRaw?: string | null; decimals?: number | null }) => {
        if (p.amount != null && Number.isFinite(Number(p.amount))) return Number(p.amount);
        if (p.amountRaw != null && p.decimals != null) {
          const raw = Number(p.amountRaw);
          if (Number.isFinite(raw)) return raw / 10 ** p.decimals;
        }
        return 0;
      };
      const usd = (p: { amount?: string | null; amountRaw?: string | null; decimals?: number | null; valueUsd?: number | null; priceUsd?: number | null }) => {
        if (p.valueUsd != null && Number.isFinite(p.valueUsd)) return p.valueUsd;
        const amount = human(p);
        return p.priceUsd != null && Number.isFinite(p.priceUsd) ? amount * p.priceUsd : 0;
      };
      for (const account of accounts) {
        const byAsset = new Map<string, PositionLeg>();
        const add = (p: (typeof account.supplied)[number], side: "supply" | "borrow") => {
          const asset = p.sac;
          if (!asset?.startsWith("C")) return;
          const code = codeByAsset.get(asset) ?? p.symbol ?? `${asset.slice(0, 4)}...`;
          const key = `${p.hubId}:${asset}`;
          let leg = byAsset.get(key);
          if (!leg) {
            leg = {
              protocol: "xoxno",
              asset,
              code,
              pool: `xoxno-hub-${p.hubId}`,
              suppliedUsd: 0,
              borrowedUsd: 0,
              supplyAmount: 0,
              borrowAmount: 0,
              xoxno: { accountId: account.accountId, spokeId: account.spokeId ?? 0, hubId: p.hubId },
            };
            byAsset.set(key, leg);
          }
          if (side === "supply") {
            leg.suppliedUsd += usd(p);
            leg.supplyAmount = (leg.supplyAmount ?? 0) + human(p);
          } else {
            leg.borrowedUsd += usd(p);
            leg.borrowAmount = (leg.borrowAmount ?? 0) + human(p);
          }
        };
        for (const p of account.supplied) add(p, "supply");
        for (const p of account.borrow) add(p, "borrow");
        for (const leg of byAsset.values()) {
          const hasAmount = (leg.supplyAmount ?? 0) > 0 || (leg.borrowAmount ?? 0) > 0;
          if (!(leg.suppliedUsd > 0) && !(leg.borrowedUsd > 0) && !hasAmount) continue;
          legs.push(leg);
          xoxnoSupplied += leg.suppliedUsd;
          xoxnoBorrowed += leg.borrowedUsd;
        }
        const debt = account.borrow.reduce((sum, p) => sum + usd(p), 0);
        if (debt > 0 && account.healthFactor != null && account.healthFactor > 0) {
          xoxnoEffColl += debt * account.healthFactor;
          xoxnoEffLia += debt;
        }
      }
    } catch (e) {
      errors.push(`xoxno: ${String(e).slice(0, 100)}`);
    }
  }

  const blendHealth = blendEffLia > 0 ? blendEffColl / blendEffLia : null;
  let claimableUsd: number | null = claimableBlnd > 0 ? null : 0;
  if (claimableBlnd > 0) {
    const px = (await livePrices(["BLND"]).catch(() => null))?.prices.BLND ?? null;
    claimableUsd = px != null ? claimableBlnd * px : null;
  }
  const xoxnoHealth = xoxnoEffLia > 0 ? xoxnoEffColl / xoxnoEffLia : null;
  const drop = (effColl: number, effLia: number) =>
    effColl > 0 && effLia > 0 ? Math.max(0, (1 - effLia / effColl) * 100) : null;

  return {
    ok: true,
    address,
    updatedAt: Date.now(),
    tookMs: Date.now() - t0,
    totalSupplied: blendSupplied + xoxnoSupplied,
    totalBorrowed: blendBorrowed + xoxnoBorrowed,
    /** Unclaimed Blend BLND emissions (tokens, USD at the live BLND price). */
    claimable: { blnd: claimableBlnd, usd: claimableUsd },
    /** Blend per pool: claimable BLND, health factor, borrow capacity (USD). */
    blendPools: byPool,
    perProtocol: {
      blend: {
        supplied: blendSupplied,
        borrowed: blendBorrowed,
        netApy: blendWeight > 0 ? blendNetApy / blendWeight : 0,
        legs: legs.filter((l) => l.protocol === "blend").length,
        effectiveCollateral: blendEffColl,
        effectiveLiabilities: blendEffLia,
        healthFactor: blendHealth,
        dropToLiquidationPct: drop(blendEffColl, blendEffLia),
      },
      xoxno: {
        supplied: xoxnoSupplied,
        borrowed: xoxnoBorrowed,
        legs: legs.filter((l) => l.protocol === "xoxno").length,
        effectiveCollateral: xoxnoEffColl,
        effectiveLiabilities: xoxnoEffLia,
        collateralFactorsBps: {},
        liquidationThresholdsBps: {},
        healthFactor: xoxnoHealth,
        dropToLiquidationPct: drop(xoxnoEffColl, xoxnoEffLia),
      },
    },
    legs,
    errors: errors.slice(0, 6),
  };
}
