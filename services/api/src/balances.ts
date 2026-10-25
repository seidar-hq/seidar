// Native balances: Horizon account holdings (mainnet), header XLM balance
// (mainnet) and contract-account balances. Ported from apps/app/src/app/api/balances/route.ts and
// balance/route.ts with one change: USD legs use the Reflector price cascade
// (./prices.js) instead of CoinGecko. Plain data out, no NextResponse.

import { livePrices } from "./prices.js";
import { horizonUrl } from "./net.js";
import { mapLimit, sorobanView, withRpc } from "./rpc.js";
import { getSwapTokens } from "./swap.js";
import { tokenMetas } from "./token-meta.js";

/** Tokens a Seidar smart account (C...) may hold; read from SAC/token contracts. */
const CONTRACT_TOKENS = [
  "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
  "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
];

/**
 * Contract-account balances (Horizon only knows G accounts): every token in
 * the swap registry plus `extra`. Balances are read straight from the token
 * contracts' `Balance(holder)` ledger entries in one batched lookup (SACs and
 * soroban-token-sdk tokens both store them there) — one simulation per token
 * took ~40s for the registry. A requested `extra` token without that entry
 * falls back to its `balance()` view, in case its storage layout differs.
 */
export async function getContractBalances(address: string, extra: string[] = []) {
  const sdk = await import("@stellar/stellar-sdk");
  const reg = await getSwapTokens().catch(() => null);
  const regTokens = (reg?.body.ok ? reg.body.tokens : []) as { code: string; contract: string; decimals: number }[];
  const regMeta = new Map(regTokens.map((t) => [t.contract, { code: t.code, decimals: t.decimals }]));
  const tokens = [...new Set([...CONTRACT_TOKENS, ...regTokens.map((t) => t.contract), ...extra])];
  const unknown = tokens.filter((t) => !regMeta.has(t));
  const metas = unknown.length ? await tokenMetas(unknown) : {};
  const metaOf = (t: string) => regMeta.get(t) ?? metas[t] ?? null;

  const holder = sdk.Address.fromString(address);
  const keyOf = (t: string) =>
    sdk.xdr.LedgerKey.contractData(
      new sdk.xdr.LedgerKeyContractData({
        contract: sdk.Address.fromString(t).toScAddress(),
        key: sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol("Balance"), holder.toScVal()]),
        durability: sdk.xdr.ContractDataDurability.persistent(),
      }),
    );
  const raw = new Map<string, bigint>();
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const res = await withRpc((server) => server.getLedgerEntries(...chunk.map(keyOf)));
    for (const e of res.entries) {
      const d = e.val.contractData();
      const token = sdk.Address.fromScAddress(d.contract()).toString();
      const v = sdk.scValToNative(d.val()) as unknown;
      // SAC: { amount, authorized, clawback }; token-sdk: the i128 itself.
      const amt = typeof v === "bigint" ? v : (v as { amount?: unknown })?.amount;
      if (typeof amt === "bigint") raw.set(token, amt);
    }
  }
  const missing = extra.filter((t) => !raw.has(t));
  if (missing.length) {
    const who = holder.toScVal();
    const views = await mapLimit(missing, 4, async (t) => {
      try {
        return BigInt(String(await sorobanView(t, "balance", [who])));
      } catch {
        return 0n;
      }
    });
    missing.forEach((t, i) => raw.set(t, views[i]));
  }

  /** raw: exact base units (amounts carried between steps need them). */
  const balances: (WalletBalance & { contract: string; raw: string })[] = [];
  for (const t of tokens) {
    const m = metaOf(t);
    const n = raw.get(t) ?? 0n;
    if (!m || n <= 0n) continue;
    balances.push({ code: m.code, issuer: null, balance: Number(n) / 10 ** m.decimals, contract: t, raw: n.toString() });
  }
  return { ok: true as const, balances };
}



export interface WalletBalance {
  code: string;
  issuer: string | null;
  balance: number;
}

export async function getBalances(address: string) {
  const r = await fetch(`${horizonUrl()}/accounts/${address}?_=${Date.now()}`, {
    cache: "no-store",
  });
  if (r.status === 404) return { ok: true as const, balances: [] as WalletBalance[] };
  if (!r.ok) throw new Error(`horizon ${r.status}`);
  const body = (await r.json()) as {
    balances?: { asset_type?: string; asset_code?: string; asset_issuer?: string; balance?: string }[];
  };
  // A code alone proves nothing (anyone can issue "USDC"): `listed` marks
  // assets whose code + issuer match the swap registry, the only ones the
  // app prices.
  const reg = await getSwapTokens().catch(() => null);
  const listedContracts = new Set(((reg?.body.ok ? reg.body.tokens : []) as { contract: string }[]).map((t) => t.contract));
  const sdk = await import("@stellar/stellar-sdk");
  const { networkPassphrase } = await import("./net.js");
  // The asset's own SAC id, derived from code + issuer, must be a listed token.
  const isListed = (code: string, issuer: string | undefined) => {
    try {
      return !!issuer && listedContracts.has(new sdk.Asset(code, issuer).contractId(networkPassphrase()));
    } catch {
      return false;
    }
  };
  const balances: (WalletBalance & { listed: boolean })[] = [];
  for (const b of body.balances ?? []) {
    const n = Number(b?.balance ?? 0);
    if (!(n > 0)) continue;
    if (b.asset_type === "native") {
      balances.push({ code: "XLM", issuer: null, balance: n, listed: true });
    } else if (typeof b.asset_code === "string") {
      const code = b.asset_code.toUpperCase();
      balances.push({
        code,
        issuer: b.asset_issuer ?? null,
        balance: n,
        listed: isListed(b.asset_code, b.asset_issuer),
      });
    }
  }
  return { ok: true as const, balances };
}

/** Header balance (mainnet): native XLM + USD via Reflector cascade.
 * `live` is false when the Horizon read failed — callers must keep their
 * last known value instead of zeroing the display. */
export async function getBalance(address: string) {
  let xlm = 0;
  let live = false;
  try {
    const acct = await fetch(`${horizonUrl()}/accounts/${address}`, { cache: "no-store" });
    // 404 = the account doesn't exist on this network: a real 0, not a
    // failed read (callers keep their last value on live:false, which left
    // another network's balance on screen).
    if (acct.status === 404) {
      live = true;
    } else if (acct.ok) {
      const body = (await acct.json()) as {
        balances?: { asset_type?: string; balance?: string }[];
      };
      const native = (body.balances ?? []).find((b) => b.asset_type === "native");
      xlm = Number(native?.balance ?? 0);
      live = true;
    }
  } catch {
    xlm = 0;
  }
  let priceUsd: number | null = null;
  try {
    priceUsd = (await livePrices(["XLM"])).prices.XLM ?? null;
  } catch {
    priceUsd = null;
  }
  return { xlm, priceUsd, usd: priceUsd === null ? null : xlm * priceUsd, live };
}
