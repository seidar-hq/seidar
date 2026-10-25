// On-chain DEX catalogues for AMMs without a listing API.
//
// Soroswap (Uniswap-V2 style): factory CA4HEQ…7AW2 enumerates every pair
// (all_pairs_length / all_pairs(i)); each pair reports token_0/token_1 and
// get_reserves. Pair -> tokens is immutable and cached for a week.
//
// Sushi V3 (concentrated liquidity; addresses from sushi-labs/sushiswap
// apps/web stellar contracts): the factory has no enumeration, so — exactly
// like Sushi's own router — we probe token pairs x fee tiers through the
// pool lens (get_pools_by_pairs), then read reserves with
// get_pools_data_with_bal. Candidate tokens: the Soroswap token list.
//
// TVL = reserves (true decimals) x contract-level USD price; a pool with an
// unpriced funded leg reports tvlUsd null rather than a partial number.

import { cacheGet, cacheSet } from "@seidar/cache";
import { mapLimit, sorobanView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";
import { pricesByContract } from "./contract-price.js";
import { poolTvl, type DexPoolRow } from "./dex.js";

export const SOROSWAP_FACTORY = "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";
export const SOROSWAP_ROUTER = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";
export const SUSHI = {
  factory: "CD3KRKGDRVWPXVB3VXLUMQKMX6XZ6Q2H334IVZD4XXNAMKSRVQL5GLYF",
  router: "CDMIM23WOUL5CZBKX3GOA3V5R5AMVIMTCP52KCDQORWELAPLJ27WZCHL",
  lens: "CASKWJSINHFW7BF7RUOA4E2FP6B2TYRKFX2UOPWLCPOOPUR6UU3G2RWC",
  positionManager: "CARTUL5AWDZYBSN7HUUJZSKCAKCIAKM7M54Z76G6KRYCK4XPR3OHUQZ4",
} as const;
const SUSHI_FEES = [500, 3000, 10000];

const WEEK = 7 * 24 * 3600_000;

const big = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return BigInt(0);
  }
};

async function rowsFrom(
  protocol: "soroswap" | "sushi",
  pools: { address: string; tokens: [string, string]; reserves: [bigint, bigint]; feeBps: number; poolType: string }[],
): Promise<DexPoolRow[]> {
  const live = pools.filter((p) => p.reserves[0] > BigInt(0) || p.reserves[1] > BigInt(0));
  const contracts = [...new Set(live.flatMap((p) => p.tokens))];
  const metas = await tokenMetas(contracts);
  const { prices } = await pricesByContract(contracts.filter((c) => metas[c]));
  const now = Date.now();
  return live.map((p) => {
    const reserves = p.tokens.map((c, i) => ({
      code: metas[c]?.code ?? c.slice(0, 4),
      amount: Number(p.reserves[i]),
      decimals: metas[c]?.decimals ?? 7,
    }));
    const tvl = poolTvl(
      p.tokens.map((c, i) => ({ amount: reserves[i].amount, decimals: reserves[i].decimals, priceUsd: prices[c] ?? null })),
      p.poolType,
    );
    const assets = p.tokens.map((c) => ({ contract: c, code: metas[c]?.code ?? c.slice(0, 4) }));
    return {
      protocol,
      address: p.address,
      pair: assets.map((a) => a.code).join("/"),
      assets,
      poolType: p.poolType,
      feeBps: p.feeBps,
      trades: null,
      volumeRaw: null,
      tvlUsd: tvl,
      reserves,
      updatedAt: now,
    };
  });
}

// ---------- Soroswap ----------

type PairInfo = { pair: string; t0: string; t1: string };

export async function fetchSoroswap(): Promise<{ rows: DexPoolRow[]; totals: null }> {
  const sdk = await import("@stellar/stellar-sdk");
  const n = Number(await sorobanView(SOROSWAP_FACTORY, "all_pairs_length"));
  if (!Number.isInteger(n) || n < 0) throw new Error("soroswap all_pairs_length unreadable");
  const key = "dex:soroswap:pairs:v1";
  const known = (await cacheGet<PairInfo[]>(key).catch(() => null)) ?? [];
  const pairs: (PairInfo | null)[] = Array.from({ length: n }, (_, i) => known[i] ?? null);
  const missing = pairs.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  await mapLimit(missing, 4, async (i) => {
    try {
      const pair = String(await sorobanView(SOROSWAP_FACTORY, "all_pairs", [sdk.nativeToScVal(i, { type: "u32" })]));
      const [t0, t1] = await Promise.all([sorobanView(pair, "token_0"), sorobanView(pair, "token_1")]);
      pairs[i] = { pair, t0: String(t0), t1: String(t1) };
    } catch {
      /* retried next refresh */
    }
  });
  if (missing.length > 0) await cacheSet(key, pairs.map((p) => p ?? null), WEEK).catch(() => {});
  const have = pairs.filter((p): p is PairInfo => p != null);
  const reserves = await mapLimit(have, 6, async (p) => {
    try {
      const r = (await sorobanView(p.pair, "get_reserves")) as unknown[];
      return [big(r?.[0]), big(r?.[1])] as [bigint, bigint];
    } catch {
      return null;
    }
  });
  const pools = have
    .map((p, i) => ({ p, r: reserves[i] }))
    .filter((x): x is { p: PairInfo; r: [bigint, bigint] } => x.r != null)
    .map(({ p, r }) => ({
      address: p.pair,
      tokens: [p.t0, p.t1] as [string, string],
      reserves: r,
      feeBps: 30,
      poolType: "xyk",
    }));
  return { rows: await rowsFrom("soroswap", pools), totals: null };
}

// ---------- Sushi V3 ----------

async function candidateTokens(): Promise<string[]> {
  try {
    const list = (await fetch("https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json").then((r) =>
      r.json(),
    )) as { assets?: { contract?: string }[] };
    return [
      ...new Set((list.assets ?? []).map((a) => a.contract ?? "").filter((c) => /^C[A-Z2-7]{55}$/.test(c))),
    ];
  } catch {
    return [];
  }
}

async function discoverSushiPools(): Promise<string[]> {
  const key = "dex:sushi:pools:v1";
  const hit = await cacheGet<string[]>(key).catch(() => null);
  if (hit && hit.length > 0) return hit;
  const sdk = await import("@stellar/stellar-sdk");
  const toks = await candidateTokens();
  const pairs: { a: string; b: string; fee: number }[] = [];
  for (let i = 0; i < toks.length; i++)
    for (let j = i + 1; j < toks.length; j++) for (const fee of SUSHI_FEES) pairs.push({ a: toks[i], b: toks[j], fee });
  const sc = (p: (typeof pairs)[0]) =>
    sdk.xdr.ScVal.scvMap([
      new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("fee"), val: sdk.nativeToScVal(p.fee, { type: "u32" }) }),
      new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("token_a"), val: sdk.Address.fromString(p.a).toScVal() }),
      new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("token_b"), val: sdk.Address.fromString(p.b).toScVal() }),
    ]);
  const batches: (typeof pairs)[] = [];
  for (let i = 0; i < pairs.length; i += 25) batches.push(pairs.slice(i, i + 25));
  const found = new Set<string>();
  await mapLimit(batches, 4, async (b) => {
    try {
      const res = (await sorobanView(SUSHI.lens, "get_pools_by_pairs", [sdk.xdr.ScVal.scvVec(b.map(sc))])) as {
        pool?: unknown;
        result?: unknown[];
      }[];
      for (const r of Array.isArray(res) ? res : [])
        if (Array.isArray(r?.result) && r.result[0] === "Found" && typeof r.pool === "string") found.add(r.pool);
    } catch {
      /* one batch lost; next discovery run retries */
    }
  });
  const out = [...found];
  // Pool set changes rarely: rediscover every 6h.
  if (out.length > 0) await cacheSet(key, out, 6 * 3600_000).catch(() => {});
  return out;
}

export async function fetchSushi(): Promise<{ rows: DexPoolRow[]; totals: null }> {
  const sdk = await import("@stellar/stellar-sdk");
  const pools = await discoverSushiPools();
  const chunks: string[][] = [];
  for (let i = 0; i < pools.length; i += 15) chunks.push(pools.slice(i, i + 15));
  const data = (
    await mapLimit(chunks, 3, async (c) => {
      try {
        return (await sorobanView(SUSHI.lens, "get_pools_data_with_bal", [
          sdk.xdr.ScVal.scvVec(c.map((p) => sdk.Address.fromString(p).toScVal())),
        ])) as { pool?: unknown; result?: unknown[] }[];
      } catch {
        return [];
      }
    })
  ).flat();
  const parsed = data
    .map((d) => {
      const r = Array.isArray(d?.result) && d.result[0] === "Found" ? (d.result[1] as Record<string, unknown>) : null;
      const st = (r?.state ?? null) as Record<string, unknown> | null;
      if (!r || !st || typeof d.pool !== "string") return null;
      return {
        address: d.pool,
        tokens: [String(st.token0), String(st.token1)] as [string, string],
        reserves: [big(r.reserve0), big(r.reserve1)] as [bigint, bigint],
        feeBps: Number(st.fee) / 100,
        poolType: "concentrated",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  return { rows: await rowsFrom("sushi", parsed), totals: null };
}
