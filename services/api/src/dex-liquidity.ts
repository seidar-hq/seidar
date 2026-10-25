// DEX liquidity: build deposit / withdraw transactions and read LP positions
// for Soroswap (router add/remove_liquidity), Aqua (pool deposit/withdraw)
// and Phoenix (pool provide/withdraw_liquidity). Sushi V3 positions are
// concentrated ranges (position NFTs) and stay on Sushi's own app.
//
// Amounts are base units in POOL TOKEN ORDER. Every min-amount guard is
// derived from live reserves with the caller's slippage (default 1%).

import { sorobanView } from "./rpc.js";
import { invokeFor } from "./invoke.js";
import { SOROSWAP_ROUTER } from "./dex-onchain.js";

export type LpProtocol = "soroswap" | "aqua" | "phoenix";
const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const isAccount = (v: string) => /^G[A-Z2-7]{55}$/.test(v);
const big = (v: unknown) => BigInt(String(v ?? "0"));
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

async function sdkMod() {
  return import("@stellar/stellar-sdk");
}

/** Pool tokens, reserves, total shares and the user's shares. */
async function poolState(protocol: LpProtocol, pool: string, user?: string) {
  const sdk = await sdkMod();
  const who = user ? sdk.Address.fromString(user).toScVal() : null;
  if (protocol === "soroswap") {
    const [t0, t1, r, total, mine] = await Promise.all([
      sorobanView(pool, "token_0"),
      sorobanView(pool, "token_1"),
      sorobanView(pool, "get_reserves") as Promise<unknown[]>,
      sorobanView(pool, "total_supply"),
      who ? sorobanView(pool, "balance", [who]) : Promise.resolve(0),
    ]);
    return { tokens: [String(t0), String(t1)], reserves: [big(r[0]), big(r[1])], total: big(total), shares: big(mine), shareToken: pool };
  }
  if (protocol === "aqua") {
    const [tokens, reserves, total, mine] = await Promise.all([
      sorobanView(pool, "get_tokens") as Promise<string[]>,
      sorobanView(pool, "get_reserves") as Promise<unknown[]>,
      sorobanView(pool, "get_total_shares"),
      who ? sorobanView(pool, "get_user_shares", [who]) : Promise.resolve(0),
    ]);
    return { tokens: tokens.map(String), reserves: reserves.map(big), total: big(total), shares: big(mine), shareToken: null };
  }
  const info = (await sorobanView(pool, "query_pool_info")) as {
    asset_a: { address: string; amount: unknown };
    asset_b: { address: string; amount: unknown };
    asset_lp_share: { address: string; amount: unknown };
  };
  const shareToken = String(info.asset_lp_share.address);
  const mine = who ? await sorobanView(shareToken, "balance", [who]) : 0;
  return {
    tokens: [String(info.asset_a.address), String(info.asset_b.address)],
    reserves: [big(info.asset_a.amount), big(info.asset_b.amount)],
    total: big(info.asset_lp_share.amount),
    shares: big(mine),
    shareToken,
  };
}

export async function lpPosition(q: { protocol?: string; pool?: string; address?: string }) {
  const protocol = String(q.protocol ?? "") as LpProtocol;
  const pool = String(q.pool ?? "");
  const address = String(q.address ?? "");
  if (!["soroswap", "aqua", "phoenix"].includes(protocol) || !isContract(pool) || !(isAccount(address) || isContract(address)))
    return { status: 400, body: { ok: false, error: "protocol, pool and address required" } };
  try {
    const s = await poolState(protocol, pool, address);
    const underlying = s.reserves.map((r) => (s.total > 0n ? (r * s.shares) / s.total : 0n));
    // Aqua: pending AQUA rewards (base units, 7 decimals).
    let rewards: string | null = null;
    if (protocol === "aqua") {
      try {
        const sdk = await sdkMod();
        rewards = String(big(await sorobanView(pool, "get_user_reward", [sdk.Address.fromString(address).toScVal()])));
      } catch {
        rewards = null;
      }
    }
    return {
      status: 200,
      body: {
        ok: true,
        tokens: s.tokens,
        shares: s.shares.toString(),
        totalShares: s.total.toString(),
        underlying: underlying.map(String),
        rewards,
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

export async function buildLiquidity(b: {
  protocol?: string;
  pool?: string;
  from?: string;
  /** Owner wallet when `from` is a smart account. */
  signer?: string;
  action?: string;
  amounts?: string[];
  shares?: string;
  slippageBps?: number;
} | null) {
  const protocol = String(b?.protocol ?? "") as LpProtocol;
  const pool = String(b?.pool ?? "");
  const from = String(b?.from ?? "");
  const action = b?.action === "withdraw" ? "withdraw" : b?.action === "claim" ? "claim" : "deposit";
  const slip = BigInt(Math.min(500, Math.max(10, Math.round(Number(b?.slippageBps ?? 100)))));
  if (!["soroswap", "aqua", "phoenix"].includes(protocol))
    return { status: 200, body: { ok: false, error: "Deposits for this venue happen on its own app." } };
  const signer = b?.signer ? String(b.signer) : undefined;
  if (!isContract(pool) || !(isAccount(from) || isContract(from)))
    return { status: 400, body: { ok: false, error: "pool + from required" } };
  try {
    const sdk = await sdkMod();
    // Aqua: claim the pool's AQUA rewards to the account.
    if (action === "claim") {
      if (protocol !== "aqua") return { status: 200, body: { ok: false, error: "Only Aqua pools pay claimable rewards." } };
      const op = new sdk.Contract(pool).call("claim", sdk.Address.fromString(from).toScVal());
      const { xdr } = await invokeFor({ from, signer, op });
      return { status: 200, body: { ok: true, xdr } };
    }
    if (protocol === "aqua") {
      const { isAquaCl } = await import("./aqua-cl.js");
      if (await isAquaCl(pool))
        return { status: 200, body: { ok: false, error: "This is a concentrated pool: liquidity goes in as a price range (use the range form)." } };
    }
    const s = await poolState(protocol, pool, from);
    const a = (x: string) => sdk.Address.fromString(x).toScVal();
    const i128 = (x: bigint) => sdk.nativeToScVal(x, { type: "i128" });
    const u128 = (x: bigint) => sdk.nativeToScVal(x, { type: "u128" });
    const less = (x: bigint) => (x * (10_000n - slip)) / 10_000n;
    const deadline = sdk.nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 600), { type: "u64" });
    let op: unknown;
    if (action === "deposit") {
      let amts = (b?.amounts ?? []).map((x) => (/^\d+$/.test(String(x)) ? BigInt(x) : 0n));
      if (amts.length !== s.tokens.length || amts.every((x) => x <= 0n))
        return { status: 200, body: { ok: false, error: "Enter amounts for the pool's tokens." } };
      // Two-token pools: deposit at the live reserve ratio (the binding side
      // wins), so minimums are met and nothing is left unmatched.
      if (amts.length === 2 && s.reserves[0] > 0n && s.reserves[1] > 0n) {
        const [a0, a1] = amts;
        const b1 = (a0 * s.reserves[1]) / s.reserves[0];
        amts = a0 > 0n && (a1 <= 0n || b1 <= a1) ? [a0, b1] : [(a1 * s.reserves[0]) / s.reserves[1], a1];
      }
      if (protocol === "soroswap") {
        op = new sdk.Contract(SOROSWAP_ROUTER).call(
          "add_liquidity", a(s.tokens[0]), a(s.tokens[1]), i128(amts[0]), i128(amts[1]),
          i128(less(amts[0])), i128(less(amts[1])), a(from), deadline,
        );
      } else if (protocol === "aqua") {
        const est = big(await sorobanView(pool, "estimate_deposit", [sdk.xdr.ScVal.scvVec(amts.map(u128))]));
        op = new sdk.Contract(pool).call("deposit", a(from), sdk.xdr.ScVal.scvVec(amts.map(u128)), u128(less(est)));
      } else {
        op = new sdk.Contract(pool).call(
          "provide_liquidity", a(from), i128(amts[0]), i128(less(amts[0])), i128(amts[1]), i128(less(amts[1])),
          sdk.xdr.ScVal.scvVoid(), sdk.xdr.ScVal.scvVoid(), sdk.xdr.ScVal.scvBool(false),
        );
      }
    } else {
      let shares = /^\d+$/.test(String(b?.shares ?? "")) ? BigInt(String(b?.shares)) : 0n;
      if (shares > s.shares) shares = s.shares;
      if (shares <= 0n) return { status: 200, body: { ok: false, error: "No liquidity to withdraw in this pool." } };
      const mins = s.reserves.map((r) => (s.total > 0n ? less((r * shares) / s.total) : 0n));
      if (protocol === "soroswap") {
        op = new sdk.Contract(SOROSWAP_ROUTER).call(
          "remove_liquidity", a(s.tokens[0]), a(s.tokens[1]), i128(shares), i128(mins[0]), i128(mins[1]), a(from), deadline,
        );
      } else if (protocol === "aqua") {
        op = new sdk.Contract(pool).call("withdraw", a(from), u128(shares), sdk.xdr.ScVal.scvVec(mins.map(u128)));
      } else {
        op = new sdk.Contract(pool).call(
          "withdraw_liquidity", a(from), i128(shares), i128(mins[0]), i128(mins[1]), sdk.xdr.ScVal.scvVoid(), sdk.xdr.ScVal.scvVoid(),
        );
      }
    }
    const { xdr } = await invokeFor({ from, signer, op });
    return { status: 200, body: { ok: true, xdr } };
  } catch (e) {
    const { humanizeSimError } = await import("./rpc.js");
    const m = err(e);
    return { status: 200, body: { ok: false, error: m.startsWith("Simulation failed") ? humanizeSimError(m) : m } };
  }
}

/**
 * One Aqua pool for a deposit form: tokens in pool order (on-chain) plus the
 * live APY / TVL Aqua's own app shows (amm-api /pools/<address>/; amounts
 * there are 7-decimal fixed point). Mainnet only.
 */
export async function aquaPoolInfo(pool: string) {
  const { isTestnet } = await import("./net.js");
  if (isTestnet()) return { status: 200, body: { ok: false, error: "Aqua pools are mainnet only." } };
  if (!isContract(pool)) return { status: 400, body: { ok: false, error: "pool required" } };
  try {
    const [s, info, shareToken] = await Promise.all([
      poolState("aqua", pool),
      fetch(`https://amm-api.aqua.network/pools/${pool}/`, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`aqua api http ${r.status}`);
        return r.json() as Promise<Record<string, unknown>>;
      }),
      sorobanView(pool, "share_id").then(String),
    ]);
    const pctOf = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) * 100 : null);
    return {
      status: 200,
      body: {
        ok: true,
        tokens: s.tokens,
        shareToken,
        reserves: s.reserves.map(String),
        totalApyPct: pctOf(info.total_apy),
        feeApyPct: pctOf(info.apy),
        rewardsApyPct: pctOf(info.rewards_apy),
        tvlUsd: Number.isFinite(Number(info.liquidity_usd)) ? Number(info.liquidity_usd) / 1e7 : null,
        feePct: pctOf(info.fee),
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}
