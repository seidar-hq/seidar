// Vaults: watches, snapshots, positions, build, detail.
// Ported verbatim from apps/app/src/app/api/vaults/{watches,snapshots,
// positions,build,detail}/route.ts + lib/defindex.ts (client) + lib/db.ts.
// DEFINDEX_API_KEY stays server-side. DeFindex detail reads need the key;
// Upshift reads are on-chain. Each op returns {status, body}.

import { apyFromSeries, shortVaultName, type PpsPoint } from "@seidar/vaults";
import { ensureSchema, getPool } from "./db.js";
import { sorobanView as sharedView } from "./rpc.js";
import { invokeFor } from "./invoke.js";

// ---------- DeFindex client (key stays server-side) ----------

const DEFINDEX_BASE = "https://api.defindex.io";

function defindexKey(): string | null {
  const k = process.env.DEFINDEX_API_KEY?.trim();
  return k ? k : null;
}

export { defindexKey };

async function defindexGet(path: string, ms = 30000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const key = defindexKey();
    const r = await fetch(`${DEFINDEX_BASE}${path}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg =
        (data as { message?: string; error?: string } | null)?.message ??
        (data as { error?: string } | null)?.error ??
        `http ${r.status}`;
      const err = new Error(String(msg).slice(0, 200)) as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export { defindexGet };
export const DEFINDEX_FACTORY =
  "CDKFHFJIET3A73A2YN4KV7NSV32S6YGQMUFH3DNJXLBWL4SKEGVRNFKI";

async function defindexPost(path: string, body: unknown, ms = 60000): Promise<unknown> {
  const key = defindexKey();
  if (!key) throw new Error("no-api-key");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${DEFINDEX_BASE}${path}`, {
      method: "POST",
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg =
        (data as { message?: string; error?: string } | null)?.message ??
        (data as { error?: string } | null)?.error ??
        `http ${r.status}`;
      const err = new Error(String(msg).slice(0, 200)) as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const isWallet = (v: string) => /^G[A-Z2-7]{55}$/.test(v);
/** Wallet (G) or Seidar smart account (C): Earn deposits land on the latter. */
const isAccount = (v: string) => /^[GC][A-Z2-7]{55}$/.test(v);
const isProto = (v: string) => v === "defindex" || v === "upshift" || v === "untangled";

export interface CuratedVault {
  protocol: "upshift" | "untangled";
  address: string;
  name: string;
  symbol: string;
  asset: string;
  assetCode: string;
  assetDecimals: number;
  curator?: string;
  withdrawalDays?: number | null;
  appUrl: string;
  auditUrl?: string;
  platformFeeBps?: number;
  performanceFeeBps?: number;
  pending?: boolean;
}

/** Verified live on Stellar mainnet (app.upshift.finance/vaults/stellar). */
export const UPSHIFT_VAULTS: CuratedVault[] = [
  {
    protocol: "upshift",
    address: "CCL3WITWFFXIHV2I52ECV5DPIEOFSTU3PBPR53ILPLF2IP5KHECXRUTY",
    name: "Gami earnUSDC",
    symbol: "earnUSDC",
    asset: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    assetCode: "USDC",
    assetDecimals: 7,
    curator: "Gami Labs",
    withdrawalDays: 2,
    appUrl: "https://app.upshift.finance/vaults/stellar/gami-earnusdc",
    platformFeeBps: 0,
    performanceFeeBps: 1000,
  },
  {
    protocol: "upshift",
    address: "CC6TRAPQD3NK7THUKWPV5SL2JHKQGNXZVB6S6MVYFSLRWAKEFUWZKZ7J",
    name: "Gami earnXLM",
    symbol: "earnXLM",
    asset: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    assetCode: "XLM",
    assetDecimals: 7,
    curator: "Gami Labs",
    withdrawalDays: 2,
    appUrl: "https://app.upshift.finance/vaults/stellar/gami-earnxlm",
    platformFeeBps: 0,
    performanceFeeBps: 1000,
  },
];

async function sorobanView(contractId: string, method: string, args: unknown[] = []): Promise<unknown> {
  return sharedView(contractId, method, args);
}

function toNum(v: unknown): number | null {
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function recordSnapshot(
  protocol: string,
  vault: string,
  pps: number | null,
  tvl: number,
  apy: number | null,
): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO vault_snapshots (protocol, vault_address, share_price, tvl_usd, apy_pct)
       VALUES ($1, $2, $3, $4, $5)`,
      [protocol, vault, pps, tvl, apy],
    );
  } catch {
    /* advisory only */
  }
}

/** XLM/USD via the Reflector cascade (replaces the CoinGecko leg). */
async function xlmPrice(): Promise<number | null> {
  try {
    const { livePrices } = await import("./prices.js");
    const n = (await livePrices(["XLM"])).prices.XLM;
    return typeof n === "number" && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// ---------- watches ----------

export async function listWatches(wallet: string) {
  if (!isWallet(wallet)) return { status: 400, body: { error: "invalid wallet" } };
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{
      protocol: string;
      vault_address: string;
      threshold_pp: number;
      last_notified_at: string | null;
    }>(
      "SELECT protocol, vault_address, threshold_pp, last_notified_at FROM vault_watches WHERE wallet = $1 ORDER BY id DESC LIMIT 100",
      [wallet],
    );
    return {
      status: 200,
      body: {
        ok: true,
        watches: rows.map((r) => ({
          protocol: r.protocol,
          vault: r.vault_address,
          thresholdPp: Number(r.threshold_pp),
          lastNotifiedAt: r.last_notified_at,
        })),
      },
    };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

export async function upsertWatch(body: Record<string, unknown>) {
  const wallet = String(body.wallet ?? "");
  const protocol = String(body.protocol ?? "").toLowerCase();
  const vault = String(body.vault ?? "");
  const thresholdPp = Number(body.thresholdPp);
  if (!isWallet(wallet) || !isProto(protocol) || !isContract(vault)) {
    return { status: 400, body: { error: "invalid wallet/protocol/vault" } };
  }
  const thr = thresholdPp > 0 && thresholdPp <= 50 ? thresholdPp : 2;
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO vault_watches (wallet, protocol, vault_address, threshold_pp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet, protocol, vault_address)
       DO UPDATE SET threshold_pp = $4`,
      [wallet, protocol, vault, thr],
    );
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

export async function touchWatch(body: Record<string, unknown>) {
  const wallet = String(body.wallet ?? "");
  const protocol = String(body.protocol ?? "").toLowerCase();
  const vault = String(body.vault ?? "");
  if (!isWallet(wallet) || !isProto(protocol) || !isContract(vault)) {
    return { status: 400, body: { error: "invalid wallet/protocol/vault" } };
  }
  try {
    await ensureSchema();
    await getPool().query(
      "UPDATE vault_watches SET last_notified_at = NOW() WHERE wallet = $1 AND protocol = $2 AND vault_address = $3",
      [wallet, protocol, vault],
    );
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

export async function deleteWatch(body: Record<string, unknown>) {
  const wallet = String(body.wallet ?? "");
  const protocol = String(body.protocol ?? "").toLowerCase();
  const vault = String(body.vault ?? "");
  if (!isWallet(wallet) || !isProto(protocol) || !isContract(vault)) {
    return { status: 400, body: { error: "invalid wallet/protocol/vault" } };
  }
  try {
    await ensureSchema();
    await getPool().query(
      "DELETE FROM vault_watches WHERE wallet = $1 AND protocol = $2 AND vault_address = $3",
      [wallet, protocol, vault],
    );
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

// ---------- snapshots ----------

export async function getSnapshots(protocol: string, address: string, daysRaw: unknown) {
  const days = Math.min(365, Math.max(1, Number(daysRaw) || 30));
  if (!isProto(protocol) || !isContract(address)) {
    return { status: 400, body: { error: "protocol + vault address required" } };
  }
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{
      share_price: number | null;
      tvl_usd: number | null;
      apy_pct: number | null;
      created_at: string;
    }>(
      `SELECT share_price, tvl_usd, apy_pct, created_at FROM vault_snapshots
       WHERE protocol = $1 AND vault_address = $2 AND created_at > NOW() - ($3 || ' days')::INTERVAL
       ORDER BY id ASC LIMIT 2000`,
      [protocol, address, String(days)],
    );
    const points = rows
      .map((r) => ({
        t: Date.parse(r.created_at),
        pps: typeof r.share_price === "number" ? r.share_price : NaN,
      }))
      .filter((p) => Number.isFinite(p.t) && p.pps > 0);
    return {
      status: 200,
      body: {
        ok: true,
        points,
        apy: rows
          .map((r) => ({
            t: Date.parse(r.created_at),
            v: typeof r.apy_pct === "number" ? r.apy_pct : NaN,
          }))
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)),
        tvl: rows.map((r) => ({
          t: Date.parse(r.created_at),
          v: typeof r.tvl_usd === "number" ? r.tvl_usd : 0,
        })),
        ownApy7d: apyFromSeries(points, 7),
        ownApy30d: apyFromSeries(points, 30),
      },
    };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

// ---------- positions ----------

export interface EarnPosition {
  protocol: string;
  vault: string;
  name: string;
  shares: string;
  /** code: the asset's symbol (for its logo in the UI). */
  underlying: { asset: string; code?: string; amount: string }[];
  /** USD value (null when an asset has no live price). */
  valueUsd: number | null;
}

export async function getVaultPositions(address: string) {
  if (!isAccount(address)) return { status: 400, body: { error: "invalid address" } };
  const positions: EarnPosition[] = [];
  const notes: string[] = [];

  // DeFindex: share balance on every funded vault of the on-chain catalogue
  // (not only the API's curated list); underlying is pro-rata per asset leg.
  try {
    const { defindexCatalog } = await import("./defindex-catalog.js");
    const { mapLimit } = await import("./rpc.js");
    const sdk = await import("@stellar/stellar-sdk");
    const cat = await defindexCatalog();
    const funded = cat.vaults.filter((v) => v.totalSupply !== "0");
    // Vault shares are standard tokens: one batched ledger read per 100
    // vaults (a balance() simulation per vault took ~55s for the catalogue).
    const { balancesOf } = await import("./lp-positions.js");
    const held = await balancesOf(address, funded.map((v) => v.address));
    const bals = funded.map((v) => held.get(v.address) ?? BigInt(0));
    funded.forEach((v, i) => {
      const shares = bals[i];
      if (shares <= BigInt(0)) return;
      const supply = BigInt(v.totalSupply);
      positions.push({
        protocol: "defindex",
        vault: v.address,
        name: v.name,
        shares: shares.toString(),
        underlying: v.legs.map((l) => ({
          asset: l.asset,
          code: l.code,
          amount: supply > BigInt(0) ? ((BigInt(l.totalBase) * shares) / supply).toString() : "0",
        })),
        valueUsd: v.legs.some((l) => l.priceUsd == null && BigInt(l.totalBase) > BigInt(0))
          ? null
          : v.legs.reduce((s, l) => {
              const amt = supply > BigInt(0) ? (BigInt(l.totalBase) * shares) / supply : BigInt(0);
              return s + (Number(amt) / 10 ** l.decimals) * (l.priceUsd ?? 0);
            }, 0),
      });
    });
  } catch {
    notes.push("defindex balances unreachable");
  }

  try {
    const sdk = await import("@stellar/stellar-sdk");
    for (const v of UPSHIFT_VAULTS) {
      try {
        const bal = (await sorobanView(v.address, "balance", [
          sdk.Address.fromString(address).toScVal(),
        ])) as unknown;
        const n =
          typeof bal === "bigint"
            ? bal
            : typeof bal === "number"
              ? BigInt(Math.floor(bal))
              : typeof bal === "string" && /^\d+$/.test(bal)
                ? BigInt(bal)
                : BigInt(0);
        if (n > BigInt(0)) {
          // Underlying = shares x total_assets / total_supply (ERC-4626 style).
          let underlying: { asset: string; code?: string; amount: string }[] = [];
          let valueUsd: number | null = null;
          try {
            const [ta, ts] = await Promise.all([sorobanView(v.address, "total_assets"), sorobanView(v.address, "total_supply")]);
            const supplyN = BigInt(String(ts));
            const amt = supplyN > BigInt(0) ? (BigInt(String(ta)) * n) / supplyN : BigInt(0);
            underlying = [{ asset: v.asset, code: v.assetCode, amount: amt.toString() }];
            const { livePrices } = await import("./prices.js");
            const px = (await livePrices([v.assetCode])).prices[v.assetCode] ?? (v.assetCode === "USDC" ? 1 : null);
            valueUsd = px != null ? (Number(amt) / 10 ** v.assetDecimals) * px : null;
          } catch {
            /* shares still shown */
          }
          positions.push({ protocol: "upshift", vault: v.address, name: v.name, shares: n.toString(), underlying, valueUsd });
        }
      } catch {
        /* skip one vault */
      }
    }
  } catch {
    notes.push("upshift balances unreachable");
  }

  try {
    const { sentoraPositions } = await import("./sentora.js");
    const { livePrices } = await import("./prices.js");
    const { prices } = await livePrices(["XLM", "USDC", "PYUSD"]);
    positions.push(...(await sentoraPositions(address, prices)));
  } catch {
    notes.push("sentora balances unreachable");
  }

  return { status: 200, body: { ok: true, positions, notes } };
}

// ---------- build (unsigned vault TX; user signs in Freighter) ----------

function err(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
}

async function buildInvoke(
  contractId: string,
  method: string,
  args: unknown[],
  sourceId: string,
  signer?: string,
): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk");
  const op = (new sdk.Contract(contractId).call as (...a: unknown[]) => unknown)(method, ...args);
  return (await invokeFor({ from: sourceId, signer, op })).xdr;
}

/**
 * DeFindex deposit/withdraw built straight against the vault contract (the
 * DeFindex API simulates from the caller, so it can't build for a smart
 * account whose owner wallet doesn't hold the funds). Minimums come from
 * the vault's live totals less slippage.
 *   deposit(amounts_desired, amounts_min, from, invest)
 *   withdraw(withdraw_shares, min_amounts_out, from)
 */
async function defindexDirect(o: {
  vault: string;
  action: string;
  caller: string;
  signer?: string;
  amounts: number[];
  shares: number;
  slipBps: number;
}): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk");
  const { defindexCatalog } = await import("./defindex-catalog.js");
  const v = (await defindexCatalog()).vaults.find((x) => x.address === o.vault);
  if (!v) throw new Error("Unknown DeFindex vault");
  const vec = (xs: bigint[]) => sdk.xdr.ScVal.scvVec(xs.map((x) => sdk.nativeToScVal(x, { type: "i128" })));
  const less = (x: bigint) => (x * BigInt(10_000 - o.slipBps)) / BigInt(10_000);
  const who = sdk.Address.fromString(o.caller).toScVal();
  const totals = v.legs.map((l) => BigInt(l.totalBase));
  const supply = BigInt(v.totalSupply);
  if (o.action === "deposit") {
    if (o.amounts.length !== v.legs.length) throw new Error(`This vault takes ${v.legs.length} asset amount(s).`);
    const desired = o.amounts.map((a) => BigInt(a));
    return buildInvoke(o.vault, "deposit", [vec(desired), vec(desired.map(less)), who, sdk.xdr.ScVal.scvBool(true)], o.caller, o.signer);
  }
  let shares: bigint;
  if (o.action === "withdraw-shares") shares = BigInt(o.shares);
  else {
    // Underlying amount (first asset) -> shares, rounded up, capped at balance.
    const want = BigInt(o.amounts[0] ?? 0);
    if (!(totals[0] > BigInt(0))) throw new Error("Vault holds none of this asset");
    shares = (want * supply + totals[0] - BigInt(1)) / totals[0];
    const held = BigInt(String(await sharedView(o.vault, "balance", [who])));
    if (shares > held) shares = held;
  }
  if (shares <= BigInt(0)) throw new Error("Nothing to withdraw");
  const mins = totals.map((t) => (supply > BigInt(0) ? less((t * shares) / supply) : BigInt(0)));
  return buildInvoke(o.vault, "withdraw", [sdk.nativeToScVal(shares, { type: "i128" }), vec(mins), who], o.caller, o.signer);
}

function scAddr(sdk: typeof import("@stellar/stellar-sdk"), v: string) {
  return sdk.Address.fromString(v).toScVal();
}

function scI128(sdk: typeof import("@stellar/stellar-sdk"), v: string) {
  return sdk.nativeToScVal(BigInt(v), { type: "i128" });
}

export async function buildVaultTx(body: {
  protocol?: string;
  vault?: string;
  action?: string;
  caller?: string;
  /** Owner wallet when `caller` is a smart account. */
  signer?: string;
  amounts?: unknown;
  shares?: unknown;
  slippageBps?: unknown;
} | null) {
  try {
    if (!body) {
      return { status: 200, body: { ok: false, error: "protocol + vault contract + caller G address required" } };
    }
    const protocol = String(body.protocol ?? "").toLowerCase();
    const vault = String(body?.vault ?? "");
    const action = String(body?.action ?? "").toLowerCase();
    const caller = String(body?.caller ?? "");
    const signer = body?.signer ? String(body.signer) : undefined;
    const smart = isContract(caller);
    if (protocol === "sentora") {
      if (!isWallet(caller)) return { status: 200, body: { ok: false, error: "caller must be a G wallet" } };
      const { buildSentora } = await import("./sentora.js");
      const amounts = Array.isArray(body?.amounts) ? (body.amounts as unknown[]) : [];
      const amount = action === "withdraw" && String(body?.shares ?? "") === "max" ? "max" : String(amounts[0] ?? body?.shares ?? "");
      return { status: 200, body: await buildSentora({ vault, action, caller, amount }) };
    }
    if (
      (protocol !== "defindex" && protocol !== "upshift" && protocol !== "untangled") ||
      !isContract(vault) ||
      !(isWallet(caller) || (smart && signer && isWallet(signer)))
    ) {
      return { status: 200, body: { ok: false, error: "protocol + vault contract + caller G address required" } };
    }
    const slip =
      Number(body?.slippageBps) >= 0 && Number(body?.slippageBps) <= 10000
        ? Math.floor(Number(body.slippageBps))
        : 50;

    if (protocol === "defindex" && smart) {
      if (!["deposit", "withdraw", "withdraw-shares"].includes(action)) {
        return { status: 200, body: { ok: false, error: "action must be deposit|withdraw|withdraw-shares" } };
      }
      const amounts = Array.isArray(body?.amounts) ? (body.amounts as unknown[]).map((a) => Math.floor(Number(a) || 0)) : [];
      if (action !== "withdraw-shares" && (amounts.length === 0 || amounts.some((a) => !(a > 0)))) {
        return { status: 200, body: { ok: false, error: "amounts must be positive base-unit integers" } };
      }
      const xdr = await defindexDirect({
        vault, action, caller, signer, amounts, shares: Math.floor(Number(body?.shares) || 0), slipBps: slip,
      });
      return { status: 200, body: { ok: true, xdr } };
    }

    if (protocol === "defindex") {
      if (!defindexKey()) {
        return { status: 409, body: { ok: false, reason: "no-api-key" } };
      }
      if (action === "deposit") {
        const amounts = Array.isArray(body?.amounts)
          ? (body.amounts as unknown[]).map((a) => Math.floor(Number(a) || 0))
          : [];
        if (amounts.length === 0 || amounts.some((a) => !(a > 0))) {
          return { status: 200, body: { ok: false, error: "amounts must be positive base-unit integers" } };
        }
        const built = (await defindexPost(`/vault/${vault}/deposit?network=mainnet`, {
          amounts, caller, invest: true, slippageBps: slip,
        })) as { xdr?: unknown };
        if (typeof built?.xdr !== "string" || !built.xdr) {
          return { status: 200, body: { ok: false, error: "defindex returned no XDR" } };
        }
        return { status: 200, body: { ok: true, xdr: built.xdr } };
      }
      if (action === "withdraw" || action === "withdraw-shares") {
        const path = action === "withdraw" ? "withdraw" : "withdraw-shares";
        const payload =
          action === "withdraw"
            ? (() => {
                const amounts = Array.isArray(body?.amounts)
                  ? (body.amounts as unknown[]).map((a) => Math.floor(Number(a) || 0))
                  : [];
                if (amounts.length === 0 || amounts.some((a) => !(a > 0))) return null;
                return { amounts, caller, slippageBps: slip };
              })()
            : (() => {
                const shares = Math.floor(Number(body?.shares) || 0);
                if (!(shares > 0)) return null;
                return { shares, caller, slippageBps: slip };
              })();
        if (!payload) {
          return { status: 200, body: { ok: false, error: "amounts/shares must be positive base-unit integers" } };
        }
        const built = (await defindexPost(`/vault/${vault}/${path}?network=mainnet`, payload)) as { xdr?: unknown };
        if (typeof built?.xdr !== "string" || !built.xdr) {
          return { status: 200, body: { ok: false, error: "defindex returned no XDR" } };
        }
        return { status: 200, body: { ok: true, xdr: built.xdr } };
      }
      return { status: 200, body: { ok: false, error: "action must be deposit|withdraw|withdraw-shares" } };
    }

    if (protocol === "upshift") {
      const meta = UPSHIFT_VAULTS.find((v) => v.address === vault);
      if (!meta) {
        return { status: 200, body: { ok: false, error: "unknown upshift vault" } };
      }
      const sdk = await import("@stellar/stellar-sdk");
      const amt = (v: unknown) => {
        const s = String(v ?? "");
        return /^\d+$/.test(s) && BigInt(s) > BigInt(0) ? s : null;
      };
      if (action === "deposit") {
        const a = amt(Array.isArray(body?.amounts) ? (body.amounts as unknown[])[0] : body?.amounts);
        if (!a) {
          return { status: 200, body: { ok: false, error: "amounts must be positive base-unit integers" } };
        }
        const xdr = await buildInvoke(
          vault, "deposit",
          [scI128(sdk, a), scAddr(sdk, caller), scAddr(sdk, caller), scAddr(sdk, caller)],
          caller,
          signer,
        );
        return { status: 200, body: { ok: true, xdr } };
      }
      if (action === "withdraw" || action === "withdraw-shares") {
        const raw =
          action === "withdraw"
            ? ((Array.isArray(body?.amounts) ? body.amounts : []) as unknown[])[0] ?? body?.amounts
            : body?.shares;
        const a = amt(raw);
        if (!a) {
          return { status: 200, body: { ok: false, error: "amounts/shares must be positive base-unit integers" } };
        }
        const method = action === "withdraw" ? "withdraw" : "redeem";
        const xdr = await buildInvoke(
          vault, method,
          [scI128(sdk, a), scAddr(sdk, caller), scAddr(sdk, caller), scAddr(sdk, caller)],
          caller,
          signer,
        );
        return { status: 200, body: { ok: true, xdr } };
      }
      return { status: 200, body: { ok: false, error: "action must be deposit|withdraw|withdraw-shares" } };
    }

    return { status: 200, body: { ok: false, error: "untangled registry pending (address unpublished)" } };
  } catch (e) {
    const raw = err(e);
    return {
      status: 200,
      body: {
        ok: false,
        error: /not.?found|account not found/i.test(raw)
          ? "Active account not found on mainnet - fund it with the asset first."
          : raw,
      },
    };
  }
}

// ---------- detail ----------

export async function getVaultDetail(protocolRaw: string, address: string) {
  const protocol = protocolRaw.toLowerCase();
  if (!isProto(protocol) || !isContract(address)) {
    return { status: 400, body: { error: "protocol + vault address required" } };
  }

  if (protocol === "defindex") {
    if (!defindexKey()) {
      return { status: 200, body: { ok: false, error: "vault details need a DeFindex API key (server-side)" } };
    }
    try {
      const [detail, apyRes, hist] = await Promise.all([
        defindexGet(`/vault/${address}?network=mainnet`),
        defindexGet(`/vault/${address}/apy?network=mainnet`).catch(() => null),
        defindexGet(`/vault/${address}/history?network=mainnet&period=30d&interval=daily`).catch(() => null),
      ]);
      const d = detail as {
        name?: unknown;
        symbol?: unknown;
        displayName?: unknown;
        assets?: { address?: unknown; symbol?: unknown; strategies?: { address?: unknown; name?: unknown; paused?: unknown }[] }[];
        feesBps?: { vaultFee?: unknown; defindexFee?: unknown };
        totalManagedFunds?: { asset?: unknown; idle_amount?: unknown; invested_amount?: unknown; total_amount?: unknown }[];
        apy?: unknown;
        roles?: { manager?: unknown };
      };
      const h = hist as {
        currentState?: { vaultPPS?: unknown; totalSupply?: unknown };
        metrics?: { uniqueDepositors?: unknown; period7d?: { apy?: unknown }; period30d?: { apy?: unknown } };
        data?: { timestamp?: unknown; vaultPPS?: unknown; totalManagedFunds?: unknown }[];
      } | null;
      const points: PpsPoint[] = Array.isArray(h?.data)
        ? (h.data as { timestamp?: unknown; vaultPPS?: unknown }[])
            .map((p) => ({ t: Date.parse(String(p.timestamp ?? "")), pps: Number(p.vaultPPS) }))
            .filter((p) => Number.isFinite(p.t) && p.pps > 0)
        : [];
      const ownApy7d = apyFromSeries(points, 7);
      const ownApy30d = apyFromSeries(points, 30);
      const pps = h?.currentState?.vaultPPS != null ? Number(h.currentState.vaultPPS) : null;
      // Per-asset USD: raw units mean nothing until divided by decimals
      // and priced. Unpriced legs contribute 0 (never fake TVL).
      const fundList = Array.isArray(d.totalManagedFunds) ? d.totalManagedFunds : [];
      const listedAssets = Array.isArray(d.assets) ? d.assets : [];
      const codeFor = (addr: string): string => {
        const hit = (listedAssets as { address?: unknown; symbol?: unknown }[]).find(
          (a) => String(a?.address ?? "") === addr,
        );
        return typeof hit?.symbol === "string" ? hit.symbol.toUpperCase() : "";
      };
      const { livePrices: livePx } = await import("./prices.js");
      const pxRes = await livePx([
        ...new Set(
          fundList
            .map((f) => codeFor(String((f as { asset?: unknown })?.asset ?? "")))
            .filter(Boolean),
        ),
      ]).catch(() => ({ prices: {} as Record<string, number | null> }));
      const DEC: Record<string, number> = { XLM: 7, USDC: 7, EURC: 7 };
      const tvl = fundList.reduce((a, f) => {
        const ff = f as { asset?: unknown; total_amount?: unknown };
        const code = codeFor(String(ff?.asset ?? ""));
        const raw = toNum(ff?.total_amount) ?? 0;
        const dec = DEC[code] ?? 7;
        const px =
          typeof pxRes.prices[code] === "number" && (pxRes.prices[code] as number) > 0
            ? (pxRes.prices[code] as number)
            : null;
        return a + (px == null ? 0 : (raw / 10 ** dec) * px);
      }, 0);
      const apy =
        typeof (apyRes as { apy?: unknown } | null)?.apy === "number"
          ? ((apyRes as { apy?: number }).apy as number)
          : typeof d.apy === "number"
            ? d.apy
            : null;
      await recordSnapshot(protocol, address, Number.isFinite(pps) ? (pps as number) : null, tvl, apy);
      return {
        status: 200,
        body: {
          ok: true,
          detail: {
            protocol,
            address,
            name: shortVaultName(
              typeof d.displayName === "string" && d.displayName
                ? d.displayName
                : typeof d.name === "string"
                  ? d.name
                  : address.slice(0, 4) + "..." + address.slice(-4),
            ),
            symbol: typeof d.symbol === "string" ? d.symbol : "",
            assets: (Array.isArray(d.assets) ? d.assets : []).map((a) => ({
              address: String(a?.address ?? ""),
              code: typeof a?.symbol === "string" ? a.symbol : "",
              strategies: (Array.isArray(a?.strategies) ? a.strategies : []).map((s) => ({
                address: String(s?.address ?? ""),
                name: typeof s?.name === "string" ? s.name : "",
                paused: s?.paused === true,
              })),
            })),
            feesBps: { vaultFee: toNum(d.feesBps?.vaultFee) ?? 0 },
            sharePrice: Number.isFinite(pps) ? pps : null,
            tvlUsd: tvl,
            apyPct: apy,
            apySource: "advertised" as const,
            ownApy7d,
            ownApy30d,
            depositors: h?.metrics?.uniqueDepositors != null ? Number(h.metrics.uniqueDepositors) : null,
            manager:
              typeof (d.roles as { manager?: unknown } | undefined)?.manager === "string"
                ? (d.roles as { manager?: string }).manager
                : null,
            history: points.slice(-60),
            appUrl: "https://defindex.io",
          },
        },
      };
    } catch (e) {
      return {
        status: 200,
        body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
      };
    }
  }

  if (protocol === "upshift") {
    const meta = UPSHIFT_VAULTS.find((v) => v.address === address);
    if (!meta) {
      return { status: 404, body: { error: "unknown upshift vault" } };
    }
    try {
      const [supplyRaw, assetsRaw] = await Promise.all([
        sorobanView(address, "total_supply"),
        sorobanView(address, "total_assets"),
      ]);
      const supply = toNum(supplyRaw);
      const assets = toNum(assetsRaw);
      const sharePrice =
        supply != null && assets != null && supply > 0 ? (assets / supply) * 10 ** 6 : null;
      const px = meta.assetCode === "USDC" ? 1 : meta.assetCode === "XLM" ? await xlmPrice() : null;
      const tvl = assets != null && px != null ? (assets / 10 ** meta.assetDecimals) * px : 0;
      let opp: { apr?: unknown; totalApr?: unknown; tvl?: unknown } | null = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        try {
          const list = (await fetch("https://api.merkl.xyz/v4/opportunities/?chainId=4&status=LIVE", {
            signal: ctrl.signal,
            cache: "no-store",
          }).then((r) => r.json())) as unknown[];
          opp = (Array.isArray(list) ? list : []).find((o) => (o as { identifier?: unknown })?.identifier === address) as typeof opp ?? null;
        } finally {
          clearTimeout(t);
        }
      } catch {
        /* APR stays null */
      }
      const apy = opp && Number((opp as { totalApr?: unknown }).totalApr) > 0 ? Number((opp as { totalApr?: unknown }).totalApr) : null;
      await recordSnapshot(protocol, address, sharePrice, tvl, apy);
      return {
        status: 200,
        body: {
          ok: true,
          detail: {
            protocol,
            address,
            name: meta.name,
            symbol: meta.symbol,
            assets: [{ address: meta.asset, code: meta.assetCode, strategies: [] }],
            feesBps: { vaultFee: meta.platformFeeBps ?? 0, performanceFee: meta.performanceFeeBps ?? 0 },
            sharePrice,
            tvlUsd: tvl,
            apyPct: apy,
            apySource: "advertised" as const,
            ownApy7d: null,
            ownApy30d: null,
            curator: meta.curator,
            withdrawalDays: meta.withdrawalDays,
            rewardApr: opp && Number((opp as { apr?: unknown }).apr) > 0 ? Number((opp as { apr?: unknown }).apr) : null,
            appUrl: meta.appUrl,
          },
        },
      };
    } catch (e) {
      return {
        status: 200,
        body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
      };
    }
  }

  return { status: 200, body: { ok: false, error: "untangled registry pending (address unpublished)" } };
}
