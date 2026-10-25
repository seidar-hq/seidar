// LP positions across DEX venues for one address (G wallet or C smart
// account): every Soroswap, Aqua and Phoenix pool in the boards, checked in a
// few batched ledger reads instead of one simulation per pool.
//
// A pool's LP shares are a standard token: Soroswap's pair contract itself,
// Aqua's `TokenShare` (pool instance storage), Phoenix's `asset_lp_share`
// (query_pool_info). Share-token addresses never change, so they are cached;
// balances are read as `Balance(holder)` entries in one getLedgerEntries per
// 100 tokens. Only held pools are then simulated (lpPosition) for underlying
// amounts, plus Aqua's pending AQUA rewards. Sushi V3 positions are NFTs and
// stay on Sushi's app.

import { cacheGet, cacheSet } from "@seidar/cache";
import { getDexPools, type DexPoolRow } from "./dex.js";
import { lpPosition } from "./dex-liquidity.js";
import { livePrices } from "./prices.js";
import { mapLimit, sorobanView, withRpc } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";

type Venue = "soroswap" | "aqua" | "phoenix" | "sushi";
const VENUES: Venue[] = ["soroswap", "aqua", "phoenix"];
// Sushi V3 positions are NFTs (no share token): read separately through sushi-cl.ts.
const AQUA_TOKEN = "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK";
const isAddr = (v: string) => /^[GC][A-Z2-7]{55}$/.test(v);
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

type ClBody = {
  tokens: string[];
  codes: string[];
  decimals: number[];
  rewards: string | null;
  positions: { amounts: string[]; liquidity: string; priceLower: number; priceUpper: number; inRange: boolean }[];
};

export interface LpPosition {
  protocol: Venue;
  pool: string;
  pair: string;
  poolType: string | null;
  feeBps: number | null;
  shareToken: string;
  shares: string;
  totalShares: string;
  /** Pool-order legs: what the shares redeem for right now. */
  underlying: { contract: string; code: string; amount: number }[];
  valueUsd: number | null;
  /** Share of the pool, percent. */
  sharePct: number | null;
  /** Aqua only: unclaimed AQUA rewards. */
  rewards?: { code: "AQUA"; amount: number; usd: number | null } | null;
  /** Aqua concentrated pools: the price ranges (shares fields carry liquidity). */
  ranges?: { priceLower: number; priceUpper: number; inRange: boolean }[];
}

/** Share-token contract per pool, cached (immutable once deployed). */
async function shareTokens(venue: Venue, rows: DexPoolRow[]): Promise<Map<string, string>> {
  const key = `lp-share-tokens:${venue}`;
  const cached = (await cacheGet<Record<string, string>>(key)) ?? {};
  const out = new Map(Object.entries(cached));
  const todo = rows.map((r) => r.address).filter((a) => !out.has(a));
  if (venue === "soroswap") {
    for (const a of todo) out.set(a, a);
  } else if (todo.length && venue === "aqua") {
    const sdk = await import("@stellar/stellar-sdk");
    const keyOf = (c: string) =>
      sdk.xdr.LedgerKey.contractData(
        new sdk.xdr.LedgerKeyContractData({
          contract: sdk.Address.fromString(c).toScAddress(),
          key: sdk.xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: sdk.xdr.ContractDataDurability.persistent(),
        }),
      );
    for (let i = 0; i < todo.length; i += 100) {
      const res = await withRpc((s) => s.getLedgerEntries(...todo.slice(i, i + 100).map(keyOf)));
      for (const e of res.entries) {
        const d = e.val.contractData();
        const pool = sdk.Address.fromScAddress(d.contract()).toString();
        for (const st of d.val().instance().storage() ?? []) {
          const k = sdk.scValToNative(st.key()) as unknown;
          if (Array.isArray(k) && k[0] === "TokenShare") out.set(pool, String(sdk.scValToNative(st.val())));
        }
      }
    }
  } else if (todo.length && venue === "phoenix") {
    const infos = await mapLimit(todo, 4, async (a) => {
      try {
        const info = (await sorobanView(a, "query_pool_info")) as { asset_lp_share: { address: string } };
        return String(info.asset_lp_share.address);
      } catch {
        return null;
      }
    });
    todo.forEach((a, i) => infos[i] && out.set(a, infos[i]!));
  }
  if (todo.length) await cacheSet(key, Object.fromEntries(out), 7 * 24 * 3600_000);
  return out;
}

/** Balance(holder) of many tokens in batched ledger reads. */
export async function balancesOf(holder: string, tokens: string[]): Promise<Map<string, bigint>> {
  const sdk = await import("@stellar/stellar-sdk");
  const who = sdk.Address.fromString(holder);
  const keyOf = (t: string) =>
    sdk.xdr.LedgerKey.contractData(
      new sdk.xdr.LedgerKeyContractData({
        contract: sdk.Address.fromString(t).toScAddress(),
        key: sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol("Balance"), who.toScVal()]),
        durability: sdk.xdr.ContractDataDurability.persistent(),
      }),
    );
  const out = new Map<string, bigint>();
  const uniq = [...new Set(tokens)];
  for (let i = 0; i < uniq.length; i += 100) {
    const res = await withRpc((s) => s.getLedgerEntries(...uniq.slice(i, i + 100).map(keyOf)));
    for (const e of res.entries) {
      const d = e.val.contractData();
      const token = sdk.Address.fromScAddress(d.contract()).toString();
      const v = sdk.scValToNative(d.val()) as unknown;
      const amt = typeof v === "bigint" ? v : (v as { amount?: unknown })?.amount;
      if (typeof amt === "bigint" && amt > 0n) out.set(token, amt);
    }
  }
  return out;
}

export async function getLpPositions(address: string) {
  if (!isAddr(address)) return { status: 400, body: { ok: false, error: "address required" } };
  const { isTestnet } = await import("./net.js");
  if (isTestnet()) return { status: 200, body: { ok: true, positions: [], notes: ["DEX pools are mainnet only."] } };
  try {
    const notes: string[] = [];
    const held: { venue: Venue; row: DexPoolRow; share: string }[] = [];
    for (const venue of VENUES) {
      const { rows } = await getDexPools(venue);
      if (!rows.length) continue;
      const shares = await shareTokens(venue, rows);
      const bals = await balancesOf(address, [...shares.values()]);
      for (const row of rows) {
        const share = shares.get(row.address);
        if (share && bals.has(share)) held.push({ venue, row, share });
      }
    }
    const legs = await mapLimit(held, 4, async (h) => {
      const p = await lpPosition({ protocol: h.venue, pool: h.row.address, address });
      if (!p.body.ok) return null;
      const b = p.body as { tokens: string[]; shares: string; totalShares: string; underlying: string[]; rewards?: string | null };
      const reward = h.venue === "aqua" && b.rewards != null ? BigInt(b.rewards) : null;
      return { ...h, ...b, reward };
    });
    const live = legs.filter((l): l is NonNullable<typeof l> => !!l && BigInt(l.shares) > 0n);
    const contracts = [...new Set(live.flatMap((l) => l.tokens))];
    const metas = contracts.length ? await tokenMetas(contracts) : {};
    const codes = [...new Set([...contracts.map((c) => metas[c]?.code).filter(Boolean), "AQUA"])] as string[];
    const { prices } = await livePrices(codes);
    const positions: LpPosition[] = live.map((l) => {
      const underlying = l.tokens.map((c, i) => {
        const m = metas[c];
        return { contract: c, code: m?.code ?? c.slice(0, 4), amount: Number(BigInt(l.underlying[i] ?? "0")) / 10 ** (m?.decimals ?? 7) };
      });
      const priced = underlying.every((u) => prices[u.code.toUpperCase()] != null || u.amount === 0);
      const total = BigInt(l.totalShares);
      const aquaPx = prices.AQUA ?? null;
      const rewardAmt = l.reward != null ? Number(l.reward) / 1e7 : null;
      return {
        protocol: l.venue,
        pool: l.row.address,
        pair: l.row.pair,
        poolType: l.row.poolType,
        feeBps: l.row.feeBps,
        shareToken: l.share,
        shares: l.shares,
        totalShares: l.totalShares,
        underlying,
        valueUsd: priced ? underlying.reduce((s, u) => s + u.amount * (prices[u.code.toUpperCase()] ?? 0), 0) : null,
        sharePct: total > 0n ? (Number(BigInt(l.shares)) / Number(total)) * 100 : null,
        rewards:
          l.venue === "aqua"
            ? rewardAmt != null
              ? { code: "AQUA" as const, amount: rewardAmt, usd: aquaPx != null ? rewardAmt * aquaPx : null }
              : null
            : undefined,
      };
    });
    // Aqua concentrated pools hold ranges, not share tokens: one snapshot
    // read per funded pool, full range details only where the account has some.
    try {
      const { rows: aquaRows } = await getDexPools("aqua");
      const cl = aquaRows.filter((r) => r.poolType === "concentrated" && (r.tvlUsd ?? 0) >= 100);
      const sdk = await import("@stellar/stellar-sdk");
      const who = sdk.Address.fromString(address).toScVal();
      const { clPositions } = await import("./aqua-cl.js");
      const hits = await mapLimit(cl, 4, async (r) => {
        try {
          const snap = (await sorobanView(r.address, "get_user_position_snapshot", [who])) as { ranges?: unknown[] };
          if (!snap?.ranges?.length) return null;
          const res = await clPositions(r.address, address);
          return res.body.ok ? { row: r, body: res.body as unknown as ClBody } : null;
        } catch {
          return null;
        }
      });
      const clCodes = new Set<string>();
      for (const h of hits) if (h) h.body.codes.forEach((c: string) => clCodes.add(c));
      const { prices: clPx } = clCodes.size ? await livePrices([...clCodes, "AQUA"]) : { prices: prices };
      for (const h of hits) {
        if (!h || !h.body.positions.length) continue;
        const b = h.body;
        const sum = [0, 1].map((k) => b.positions.reduce((t: number, p: { amounts: string[] }) => t + Number(p.amounts[k] ?? 0), 0) / 10 ** b.decimals[k]);
        const underlying = b.tokens.map((c: string, k: number) => ({ contract: c, code: b.codes[k], amount: sum[k] ?? 0 }));
        const priced = underlying.every((u: { code: string; amount: number }) => clPx[u.code.toUpperCase()] != null || u.amount === 0);
        const rewardAmt = b.rewards != null ? Number(b.rewards) / 1e7 : null;
        const liq = b.positions.reduce((t: bigint, p: { liquidity: string }) => t + BigInt(p.liquidity), 0n);
        positions.push({
          protocol: "aqua",
          pool: h.row.address,
          pair: h.row.pair,
          poolType: "concentrated",
          feeBps: h.row.feeBps,
          shareToken: h.row.address,
          shares: liq.toString(),
          totalShares: "0",
          underlying,
          valueUsd: priced ? underlying.reduce((t: number, u: { code: string; amount: number }) => t + u.amount * (clPx[u.code.toUpperCase()] ?? 0), 0) : null,
          sharePct: null,
          rewards: rewardAmt != null ? { code: "AQUA", amount: rewardAmt, usd: clPx.AQUA != null ? rewardAmt * clPx.AQUA : null } : null,
          ranges: b.positions.map((p: { priceLower: number; priceUpper: number; inRange: boolean }) => ({ priceLower: p.priceLower, priceUpper: p.priceUpper, inRange: p.inRange })),
        });
      }
    } catch {
      notes.push("Aqua concentrated ranges couldn't be read right now.");
    }
    // Sushi V3: position NFTs from the position manager, grouped per pool.
    try {
      const { sushiAllPositions } = await import("./sushi-cl.js");
      const sushi = await sushiAllPositions(address);
      const byPool = new Map<string, typeof sushi>();
      for (const p of sushi) byPool.set(p.pool, [...(byPool.get(p.pool) ?? []), p]);
      for (const [pool, ps] of byPool) {
        const legs = ps[0].underlying.map((u, i) => ({ ...u, amount: ps.reduce((s, p) => s + p.underlying[i].amount, 0) }));
        const priced = ps.every((p) => p.valueUsd != null);
        positions.push({
          protocol: "sushi" as Venue,
          pool,
          pair: ps[0].codes.join("/"),
          poolType: "concentrated",
          feeBps: ps[0].feeBps,
          shareToken: pool,
          shares: ps.reduce((s, p) => s + BigInt(p.liquidity), 0n).toString(),
          totalShares: "0",
          underlying: legs,
          valueUsd: priced ? ps.reduce((s, p) => s + (p.valueUsd ?? 0), 0) : null,
          sharePct: null,
          ranges: ps.map((p) => ({ priceLower: p.priceLower, priceUpper: p.priceUpper, inRange: p.inRange })),
        });
      }
    } catch {
      notes.push("Sushi positions couldn't be read right now.");
    }
    positions.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    return { status: 200, body: { ok: true, positions, notes, aquaToken: AQUA_TOKEN } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}
