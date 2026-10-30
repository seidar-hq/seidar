// Unified lending action builder: one request shape for Blend and XOXNO, one unsigned + simulated transaction back (user signs in wallet).
//
//   POST /lending/build {
//     protocol: "blend" | "xoxno",
//     from: G..., actions: [{ action, asset, amount }]   // amount: base units or "max"
//     pool?: C...                // Blend pool
//     xoxno?: { accountId?: string, spokeId: number, hubId: number }
//   }
//
// Blend `submit` is natively atomic across requests, so every action lands in
// ONE transaction. XOXNO takes one action kind per call; the
// response then carries `next` (the remaining actions) and the client builds
// again after the previous step confirms (fresh sequence each time).
//
// "max": Blend caps withdraw/repay to the live position inside the contract,
// so a large sentinel settles exactly. XOXNO withdraw takes 0 = all; repay
// reads live debt + 0.2% (excess refunds).

import { PoolContract, RequestType } from "@blend-capital/blend-sdk";
import { isTestnet, networkPassphrase } from "./net.js";
import { sorobanView } from "./rpc.js";
import { invokeFor, retargetOp } from "./invoke.js";

/** Build for the position owner (wallet, or smart account via `signer`). */
const invokeAs = (from: string, signer: string | undefined, op: unknown) => invokeFor({ from, signer, op });

/** XOXNO's SDK only knows G callers: build as the owner, then re-point to the account. */
async function xoxnoOp(from: string, signer: string | undefined, opXdr: string): Promise<string> {
  return isContract(from) ? retargetOp(opXdr, signer!, from) : opXdr;
}

export type LendingProtocol = "blend" | "xoxno";
/** lend / unlend: plain supply that is never collateral (Blend Supply /
 *  Withdraw; XOXNO supply / withdraw in a spoke where it isn't collateral). */
export type LendingActionKind = "supply" | "withdraw" | "borrow" | "repay" | "lend" | "unlend";

export interface LendingAction {
  action: LendingActionKind;
  asset: string;
  amount: string;
}

export interface LendingBuildBody {
  protocol?: string;
  from?: string;
  /** Owner wallet that signs when `from` is a Seidar smart account. */
  signer?: string;
  actions?: LendingAction[];
  pool?: string;
  xoxno?: { accountId?: string; spokeId?: number; hubId?: number };
}

const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const isAccount = (v: string) => /^G[A-Z2-7]{55}$/.test(v);
const KINDS = new Set(["supply", "withdraw", "borrow", "repay", "lend", "unlend"]);
const MAX_SENTINEL = (BigInt(1) << BigInt(62)).toString();

export const XOXNO_CONTROLLER = "CAUCMIN5KSXEVZ7NMXR3LZATGD5EFIEUI5XWTFLYRO2R5OTXI22WE5JX";

type Built = {
  ok: true;
  xdr: string;
  label: string;
  /** Remaining actions; client re-posts with these after this step confirms. */
  next: LendingBuildBody | null;
};
type Fail = { ok: false; error: string };

function fail(error: string): { status: number; body: Fail } {
  return { status: 200, body: { ok: false, error } };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 220) : String(e).slice(0, 220);
}

/** Blend v2 PoolError codes (blend-contracts-v2 pool/src/errors.rs). */
const BLEND_ERRORS: Record<string, string> = {
  "1204": "The pool's status does not allow this action right now.",
  "1205": "This would put your health factor below the pool minimum — lower the amount.",
  "1206": "The pool is on ice or frozen — this action is paused by the pool.",
  "1207": "Not enough liquidity: the pool's utilization limit would be exceeded.",
  "1208": "Blend allows a limited number of positions per account — close one first.",
  "1210": "The oracle price for this asset is unavailable or stale.",
  "1220": "The reserve's supply cap is full.",
  "1223": "This reserve is disabled.",
  "1224": "Collateral is below the pool's minimum for borrowing.",
};

/** XOXNO controller codes users can hit (rs-lending-xlm catalog, as shipped in @xoxno/sdk-js). */
const XOXNO_ERRORS: Record<string, string> = {
  "100": "Not enough collateral: this would leave your XOXNO account under-collateralised. Repay some debt or withdraw less.",
  "102": "This would push your health factor too low. Lower the amount.",
  "104": "This spoke doesn't accept the asset as collateral.",
  "107": "This asset can't be borrowed on your spoke.",
  "109": "Your XOXNO account has reached its position limit.",
  "112": "Not enough liquidity in the market for this amount right now.",
  "120": "You have no debt in this asset on XOXNO.",
  "121": "You have nothing supplied in this asset on XOXNO.",
  "122": "Repay your debt before closing this position.",
  "126": "With debt open, your collateral would fall below XOXNO's minimum. Keep more collateral.",
  "127": "The market's utilization limit would be exceeded. Try a smaller amount.",
  "205": "XOXNO's price sources disagree right now, so the action is paused. Try again shortly.",
  "206": "XOXNO's price feed is stale right now. Try again shortly.",
  "301": "This spoke is deprecated.",
  "307": "This asset isn't listed on your spoke.",
  "311": "The spoke's supply cap is full.",
  "312": "The spoke's borrow cap is full.",
  "315": "This asset is paused on XOXNO.",
  "316": "This asset is frozen on XOXNO.",
};

function friendly(protocol: string, msg: string): string {
  const code = msg.match(/error #(\d+)/)?.[1];
  if (protocol === "blend" && code && BLEND_ERRORS[code]) return BLEND_ERRORS[code];
  if (protocol === "xoxno" && code && XOXNO_ERRORS[code]) return XOXNO_ERRORS[code];
  return msg;
}

function validAmount(a: string): boolean {
  return a === "max" || (/^\d+$/.test(a) && BigInt(a) > BigInt(0));
}

const LABEL: Record<LendingActionKind, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  lend: "Lend",
  unlend: "Withdraw lent",
};

// ---------- Blend ----------

const BLEND_REQ: Record<LendingActionKind, number> = {
  supply: RequestType.SupplyCollateral,
  withdraw: RequestType.WithdrawCollateral,
  borrow: RequestType.Borrow,
  repay: RequestType.Repay,
  lend: RequestType.Supply,
  unlend: RequestType.Withdraw,
};

async function buildBlend(from: string, pool: string, actions: LendingAction[], signer?: string): Promise<Built> {
  if (!isContract(pool)) throw new Error("Blend pool contract required");
  const requests = actions.map((a) => {
    if (a.amount === "max" && (a.action === "supply" || a.action === "borrow" || a.action === "lend"))
      throw new Error(`"max" is only valid for withdraw/repay`);
    return {
      request_type: BLEND_REQ[a.action],
      address: a.asset,
      amount: BigInt(a.amount === "max" ? MAX_SENTINEL : a.amount),
    };
  });
  const Ctor = PoolContract as unknown as new (id: string) => { submit(a: unknown): string };
  const op = new Ctor(pool).submit({ from, spender: from, to: from, requests });
  const { xdr } = await invokeAs(from, signer, op);
  return { ok: true, xdr, label: actions.map((a) => LABEL[a.action]).join(" + "), next: null };
}

// ---------- XOXNO ----------

async function buildXoxno(
  from: string,
  actions: LendingAction[],
  x: { accountId?: string; spokeId?: number; hubId?: number },
  signer?: string,
): Promise<Built> {
  const sdk = await import("@stellar/stellar-sdk");
  const lend = await import("@xoxno/sdk-js/stellar-lending");
  const hubId = Number(x.hubId);
  if (!Number.isInteger(hubId) || hubId <= 0) throw new Error("XOXNO hubId required");
  const accountId = x.accountId && /^\d+$/.test(x.accountId) ? x.accountId : "0";
  const [first0, ...rest] = actions;
  // XOXNO lends through a spoke where the asset isn't collateral: same
  // supply / withdraw calls, the caller picks that spoke + account.
  const first: LendingAction = {
    ...first0,
    action: first0.action === "lend" ? "supply" : first0.action === "unlend" ? "withdraw" : first0.action,
  };
  if (isContract(from) && !(signer && isAccount(signer))) throw new Error("signer (owner wallet) required for a smart account");
  const opts = {
    network: "mainnet" as const,
    caller: isContract(from) ? signer! : from,
    sourceSequence: "0",
    controllerAddress: XOXNO_CONTROLLER,
  };
  const base = { hubId, asset: first.asset };
  let built: { xdr: string };
  if (first.action === "supply") {
    const spokeId = Number(x.spokeId);
    if (!Number.isInteger(spokeId) || spokeId <= 0) throw new Error("XOXNO spokeId required to supply");
    if (first.amount === "max") throw new Error(`"max" is only valid for withdraw/repay`);
    built = lend.buildStellarSupplyTx(opts as never, { ...base, amount: first.amount, accountNonce: accountId, spokeId });
  } else {
    if (accountId === "0") throw new Error("No XOXNO account yet — supply first");
    if (first.action === "borrow") {
      if (first.amount === "max") throw new Error(`"max" is only valid for withdraw/repay`);
      built = lend.buildStellarBorrowTx(opts as never, { ...base, amount: first.amount, accountNonce: accountId });
    } else if (first.action === "withdraw") {
      built = lend.buildStellarWithdrawTx(opts as never, {
        ...base,
        amount: first.amount === "max" ? "0" : first.amount,
        accountNonce: accountId,
      });
    } else {
      let amount = first.amount;
      if (amount === "max") {
        const key = sdk.xdr.ScVal.scvMap([
          new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("asset"), val: sdk.Address.fromString(first.asset).toScVal() }),
          new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("hub_id"), val: sdk.nativeToScVal(hubId, { type: "u32" }) }),
        ]);
        const debt = BigInt(
          String(
            await sorobanView(XOXNO_CONTROLLER, "get_borrow_amount", [
              sdk.nativeToScVal(BigInt(accountId), { type: "u64" }),
              key,
            ]),
          ),
        );
        if (debt <= BigInt(0)) throw new Error("No debt to repay on this market");
        amount = (debt + debt / BigInt(500) + BigInt(1)).toString();
      }
      built = lend.buildStellarRepayTx(opts as never, { ...base, amount, accountNonce: accountId });
    }
  }
  // Re-assemble from the SDK's op with a fresh sequence + simulation.
  const env = sdk.TransactionBuilder.fromXDR(built.xdr, networkPassphrase()) as InstanceType<typeof sdk.Transaction>;
  const opXdr = await xoxnoOp(from, signer, env.toEnvelope().v1().tx().operations()[0].toXDR("base64"));
  const { xdr } = await invokeAs(from, signer, opXdr);
  const next: LendingBuildBody | null =
    rest.length > 0 ? { protocol: "xoxno", from, signer, actions: rest, xoxno: x } : null;
  return { ok: true, xdr, label: LABEL[first.action], next };
}

// ---------- entry ----------

export async function buildLending(body: LendingBuildBody | null): Promise<{ status: number; body: Built | Fail }> {
  try {
    const protocol = String(body?.protocol ?? "") as LendingProtocol;
    const from = String(body?.from ?? "");
    const actions = Array.isArray(body?.actions) ? body.actions : [];
    if (!["blend", "xoxno"].includes(protocol)) return fail("protocol must be blend | xoxno");
    if (protocol === "xoxno" && isTestnet()) return fail("XOXNO is mainnet only — turn Testnet mode off to use it.");
    if (!isAccount(from) && !isContract(from)) return fail("from must be a G... account or Seidar smart account");
    if (actions.length === 0 || actions.length > 6) return fail("1..6 actions required");
    for (const a of actions) {
      if (!KINDS.has(String(a?.action)) || !isContract(String(a?.asset)) || !validAmount(String(a?.amount)))
        return fail("each action needs action=supply|withdraw|borrow|repay|lend|unlend, token contract, base-unit amount or \"max\"");
    }
    const clean = actions.map((a) => ({ action: a.action, asset: a.asset, amount: String(a.amount) }));
    const signer = body?.signer ? String(body.signer) : undefined;
    const built =
      protocol === "blend"
        ? await buildBlend(from, String(body?.pool ?? ""), clean, signer)
        : await buildXoxno(from, clean, body?.xoxno ?? {}, signer);
    return { status: 200, body: built };
  } catch (e) {
    return fail(friendly(String(body?.protocol ?? ""), errMsg(e)));
  }
}

/**
 * Blend -> XOXNO atomic migration (XOXNO controller migrate_from_blend):
 * collateral, plain supply and debt move in ONE transaction, no flash fee.
 * Only Blend pools approved by the controller qualify (is_blend_pool_approved).
 * Debt caps carry +0.2% headroom; Blend refunds the excess on-chain.
 */
export async function buildBlendToXoxno(body: {
  from?: string;
  signer?: string;
  blendPool?: string;
  collateral?: string[];
  supply?: string[];
  debt?: { token?: string; amount?: string }[];
  spokeId?: number;
  hubId?: number;
  accountId?: string;
} | null): Promise<{ status: number; body: Built | Fail }> {
  try {
    const sdk = await import("@stellar/stellar-sdk");
    const lend = await import("@xoxno/sdk-js/stellar-lending");
    const from = String(body?.from ?? "");
    const blendPool = String(body?.blendPool ?? "");
    const signer = body?.signer ? String(body.signer) : undefined;
    if (!(isAccount(from) || (isContract(from) && signer && isAccount(signer))) || !isContract(blendPool))
      return fail("from (wallet or smart account + signer) and blendPool (C...) required");
    const collateral = (body?.collateral ?? []).filter(isContract);
    const supply = (body?.supply ?? []).filter(isContract);
    const debt = (body?.debt ?? []).filter((d) => isContract(String(d?.token)) && /^\d+$/.test(String(d?.amount)));
    if (collateral.length + supply.length === 0) return fail("nothing to migrate");
    const spokeId = Number(body?.spokeId);
    const hubId = Number(body?.hubId);
    if (!(spokeId > 0) || !(hubId > 0)) return fail("destination spokeId and hubId required");
    const approved = await sorobanView(XOXNO_CONTROLLER, "is_blend_pool_approved", [
      sdk.Address.fromString(blendPool).toScVal(),
    ]).catch(() => false);
    if (approved !== true) return fail("XOXNO does not accept migrations from this Blend pool.");
    const built = lend.buildStellarMigrateFromBlendTx(
      { network: "mainnet", caller: isContract(from) ? signer : from, sourceSequence: "0", controllerAddress: XOXNO_CONTROLLER } as never,
      {
        accountId: body?.accountId && /^\d+$/.test(body.accountId) ? body.accountId : "0",
        spokeId,
        hubId,
        blendPool,
        collateralTokens: collateral,
        supplyTokens: supply,
        debtCaps: debt.map((d) => {
          const a = BigInt(String(d.amount));
          return { token: String(d.token), cap: (a + a / BigInt(500) + BigInt(1)).toString() };
        }),
      },
    );
    const env = sdk.TransactionBuilder.fromXDR(built.xdr, networkPassphrase()) as InstanceType<typeof sdk.Transaction>;
    const opXdr = await xoxnoOp(from, signer, env.toEnvelope().v1().tx().operations()[0].toXDR("base64"));
    const { xdr } = await invokeAs(from, signer, opXdr);
    return { status: 200, body: { ok: true, xdr, label: "Move Blend position to XOXNO", next: null } };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/** XOXNO lending accounts (id, spoke, positions, health) for a wallet. */
export async function xoxnoAccounts(owner: string) {
  if (!isAccount(owner) && !isContract(owner)) return { status: 400, body: { ok: false, error: "invalid owner" } };
  try {
    const { createStellarLendingReadClient } = await import("@xoxno/sdk-js/stellar-lending/read");
    const client = createStellarLendingReadClient({ baseUrl: "https://api.xoxno.com" });
    const accounts = await client.positions(owner);
    return { status: 200, body: { ok: true, accounts } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: errMsg(e) } };
  }
}

/** XOXNO markets with hub + per-spoke capability (canSupply/canBorrow...). */
export async function xoxnoMarkets() {
  try {
    const { createStellarLendingReadClient } = await import("@xoxno/sdk-js/stellar-lending/read");
    const client = createStellarLendingReadClient({ baseUrl: "https://api.xoxno.com" });
    const assets = await client.assets();
    return { status: 200, body: { ok: true, assets } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: errMsg(e) } };
  }
}

// ---------- XOXNO leverage (multiply) ----------

const XOXNO_SWAP_URL = "https://stellar-swap.xoxno.com";
/** Same floor as the leverage figures on the pools page (pools.ts): health = ltv x collateral / debt. */
export const LEVERAGE_MIN_HEALTH = 1.3;

/**
 * One-transaction leverage on XOXNO (controller `multiply`): flash-borrow `debtAmount` of the debt
 * asset, swap it into the collateral asset through XOXNO's aggregator route, and supply that plus
 * the wallet's own `deposit` as collateral, in a new account on `spokeId`. Nothing executes unless
 * every step succeeds; the route's minimum out (slippage) is enforced on-chain.
 *
 *   POST /lending/xoxno/multiply { from, signer?, spokeId, collateral, debt, deposit, debtAmount, slippageBps }
 */
export async function buildXoxnoMultiply(body: {
  from?: string;
  signer?: string;
  spokeId?: number;
  collateral?: string;
  debt?: string;
  deposit?: string;
  debtAmount?: string;
  slippageBps?: number;
} | null): Promise<{ status: number; body: (Built & { quote: { amountOut: string; amountOutMin: string; priceImpact: number | null }; health: number }) | Fail }> {
  try {
    const from = String(body?.from ?? "");
    const signer = body?.signer ? String(body.signer) : undefined;
    if (!(isAccount(from) || (isContract(from) && signer && isAccount(signer)))) return fail("from (wallet or smart account + signer) required");
    const collateral = String(body?.collateral ?? "");
    const debt = String(body?.debt ?? "");
    const deposit = String(body?.deposit ?? "");
    const debtAmount = String(body?.debtAmount ?? "");
    const spokeId = Number(body?.spokeId);
    const slippageBps = Number(body?.slippageBps ?? 50);
    if (!isContract(collateral) || !isContract(debt) || collateral === debt) return fail("collateral and debt must be two different token contracts");
    if (!validAmount(deposit) || deposit === "max" || !validAmount(debtAmount) || debtAmount === "max") return fail("deposit and debtAmount must be base-unit amounts");
    if (!(Number.isInteger(spokeId) && spokeId > 0)) return fail("spokeId required");
    if (!(slippageBps >= 1 && slippageBps <= 500)) return fail("slippage must be between 0.01% and 5%");

    // Check the pair against XOXNO's live market list: collateral on this spoke, debt borrowable on it.
    const { createStellarLendingReadClient } = await import("@xoxno/sdk-js/stellar-lending/read");
    const assets = (await createStellarLendingReadClient({ baseUrl: "https://api.xoxno.com" }).assets()) as unknown as {
      sac: string;
      symbol: string;
      decimals: number;
      hubId: number;
      priceUsd?: number;
      spokes: { spokeId: number; ltvBps: number; canBorrow: boolean; canBeCollateral?: boolean; canOpenAccount?: boolean }[];
    }[];
    const c = assets.find((a) => a.sac === collateral && a.spokes.some((s) => s.spokeId === spokeId));
    const d = assets.find((a) => a.sac === debt && a.spokes.some((s) => s.spokeId === spokeId));
    const cs = c?.spokes.find((s) => s.spokeId === spokeId);
    const ds = d?.spokes.find((s) => s.spokeId === spokeId);
    if (!c || !cs || cs.canBeCollateral === false || !(cs.ltvBps > 0)) return fail("This asset can't be collateral on that XOXNO spoke.");
    if (cs.canOpenAccount === false) return fail("That XOXNO spoke isn't opening new accounts right now.");
    if (!d || !ds?.canBorrow) return fail(`${d?.symbol ?? "That asset"} can't be borrowed on this XOXNO spoke.`);
    if (!(c.priceUsd! > 0) || !(d.priceUsd! > 0)) return fail("XOXNO has no price for one of these assets right now. Try again shortly.");

    const lend = await import("@xoxno/sdk-js/stellar-lending");
    const quote = await lend.getStellarAggregatorQuote(
      { from: debt, to: collateral, amountIn: debtAmount, slippage: slippageBps / 10_000, platform: "aggregator" } as never,
      { baseUrl: XOXNO_SWAP_URL },
    );
    const q = quote as unknown as { amountOut?: string; amountOutMin?: string; priceImpact?: number; routeXdr?: string };
    if (!q.routeXdr || !q.amountOutMin) return fail("No swap route between these assets right now. Try a smaller amount.");
    const steps = lend.mapQuoteResponseToStrategySwap(quote as never);

    // Health right after opening, at the route's minimum output (the worst case the chain accepts).
    const units = (v: string, dec: number) => Number(v) / 10 ** dec;
    const collUsd = (units(deposit, c.decimals) + units(q.amountOutMin, c.decimals)) * c.priceUsd!;
    const debtUsd = units(debtAmount, d.decimals) * d.priceUsd!;
    const health = ((cs.ltvBps / 10_000) * collUsd) / debtUsd;
    if (!(health >= LEVERAGE_MIN_HEALTH))
      return fail(`That leverage would open at health ${health.toFixed(2)}; Seidar keeps leveraged positions at ${LEVERAGE_MIN_HEALTH} or above. Lower the leverage.`);

    const sdk = await import("@stellar/stellar-sdk");
    const opts = { network: "mainnet" as const, caller: isContract(from) ? signer! : from, sourceSequence: "0", controllerAddress: XOXNO_CONTROLLER };
    const built = lend.buildStellarMultiplyTx(opts as never, {
      accountNonce: "0",
      spokeId,
      collateral: { hubId: c.hubId, asset: collateral },
      debtToFlashLoan: debtAmount,
      debt: { hubId: d.hubId, asset: debt },
      mode: 1,
      steps,
      initialPayment: { hubId: c.hubId, asset: collateral, amount: deposit },
    });
    const env = sdk.TransactionBuilder.fromXDR(built.xdr, networkPassphrase()) as InstanceType<typeof sdk.Transaction>;
    const opXdr = await xoxnoOp(from, signer, env.toEnvelope().v1().tx().operations()[0].toXDR("base64"));
    const { xdr } = await invokeAs(from, signer, opXdr);
    return {
      status: 200,
      body: {
        ok: true,
        xdr,
        label: `Leverage ${c.symbol} with ${d.symbol}`,
        next: null,
        quote: { amountOut: q.amountOut ?? q.amountOutMin, amountOutMin: q.amountOutMin, priceImpact: q.priceImpact ?? null },
        health,
      },
    };
  } catch (e) {
    return fail(friendly("xoxno", errMsg(e)));
  }
}

// ---------- Blend leverage ----------

/**
 * Seidar's leverage contract (contracts/leverage): opens the whole position in ONE transaction
 * through a Blend flash loan. Set BLEND_LEVERAGE_CONTRACT once it is deployed; until then
 * buildBlendLeverage falls back to the multi-transaction loop below.
 */
export function blendLeverageContract(): string | null {
  const c = process.env.BLEND_LEVERAGE_CONTRACT ?? "";
  return isContract(c) && !isTestnet() ? c : null;
}

/** The leverage contract's receiver (deployed by its constructor; never changes). */
const receivers = new Map<string, string>();
async function leverageReceiver(contract: string): Promise<string> {
  const hit = receivers.get(contract);
  if (hit) return hit;
  const { sorobanView } = await import("./rpc.js");
  const r = String(await sorobanView(contract, "receiver", []));
  if (!isContract(r)) throw new Error("Leverage contract has no receiver");
  receivers.set(contract, r);
  return r;
}

/** The contract's own floor (7 decimals) sits a hair under the API's so oracle rounding can't flip a sized trade. */
const ONE_STEP_MIN_HF = 12_900_000n;

async function buildOneStep(
  contract: string,
  o: {
    from: string;
    pool: string;
    coll: string;
    debt: string;
    deposit: bigint;
    target: bigint;
    slippageBps: number;
    cCode: string;
    dCode: string;
    rc: { decimals: number };
    rd: { decimals: number };
    fmt: (v: bigint, dec: number) => string;
  },
): Promise<Built> {
  const sdk = await import("@stellar/stellar-sdk");
  const { quoteSwap } = await import("./swap.js");
  const { encodeAggregatorSwapCall } = await import("./swap-route.js");
  const { borrowCapacity } = await import("./blend-position.js");
  const { withRpc } = await import("./rpc.js");
  // A route the contract can execute itself (Soroswap / Aqua legs on the aggregator).
  const q = await quoteSwap({ assetIn: o.debt, assetOut: o.coll, amount: o.target.toString(), tradeType: "EXACT_IN", slippageBps: String(o.slippageBps), smart: true });
  const quote = (q.body as { ok?: boolean; quote?: { amountIn?: string; rawTrade?: { amountOutMin?: string; distribution?: unknown[] } } }).quote;
  const minOut = BigInt(String(quote?.rawTrade?.amountOutMin ?? "0").replace(/\D/g, "") || "0");
  if (!quote?.rawTrade?.distribution?.length || minOut <= 0n) throw new Error(`No swap route from ${o.dCode} to ${o.cCode} right now. Try a smaller amount.`);
  const supply = o.deposit + minOut;
  // Sized on-chain like Blend checks it, existing position included: the target must fit at the floor.
  const cap = await borrowCapacity(o.pool, o.from, o.debt, LEVERAGE_MIN_HEALTH, { asset: o.coll, amount: supply });
  if (o.target > cap)
    throw new Error(`At this swap price the position would open below health ${LEVERAGE_MIN_HEALTH}. Lower the leverage or the amount.`);
  // The receiver makes the swap; the contract takes it as a generic call (no DEX baked in).
  const swap = await encodeAggregatorSwapCall({
    receiver: await leverageReceiver(contract),
    tokenIn: o.debt,
    amount: o.target,
    tokenOut: o.coll,
    minOut,
    raw: quote.rawTrade as never,
  });
  const latest = await withRpc((s) => s.getLatestLedger());
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  const i128 = (v: bigint) => sdk.nativeToScVal(v, { type: "i128" });
  const op = new sdk.Contract(contract).call(
    "open",
    a(o.from),
    a(o.pool),
    a(o.coll),
    i128(o.deposit),
    a(o.debt),
    i128(o.target),
    swap,
    i128(minOut),
    i128(ONE_STEP_MIN_HF),
    sdk.nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 300), { type: "u64" }),
    sdk.nativeToScVal(latest.sequence + 120, { type: "u32" }),
  );
  const { xdr } = await invokeAs(o.from, undefined, op);
  return {
    ok: true,
    xdr,
    label: `Supply ${o.fmt(supply, o.rc.decimals)} ${o.cCode}, borrow ${o.fmt(o.target, o.rd.decimals)} ${o.dCode} (one transaction)`,
    next: null,
  };
}

/** Intermediate rounds may dip to this health; the chosen leverage is capped so the finished position sits at LEVERAGE_MIN_HEALTH. */
const LOOP_MIN_HEALTH = 1.1;
const LOOP_MAX_ROUNDS = 8;

export interface BlendLeverageBody {
  protocol?: "blend";
  from?: string;
  pool?: string;
  collateral?: string;
  debt?: string;
  slippageBps?: number;
  /** open: the wallet's deposit (base units) and the chosen leverage. */
  deposit?: string;
  leverage?: number;
  /** Carried between steps (set by the server in `next`). */
  phase?: "open" | "swap" | "supply";
  target?: string;
  borrowed?: string;
  amount?: string;
  collBefore?: string;
  round?: number;
}

/**
 * Leverage on Blend, as a loop of transactions (Blend has no flash-loan multiply): the first submit
 * supplies the deposit and borrows what keeps health >= LOOP_MIN_HEALTH; the borrowed asset is
 * swapped back into the collateral; the next submit supplies that output and borrows again, until
 * the target debt (deposit value x (leverage - 1)) is reached. Each step comes back with `next`,
 * built after the previous one confirms, so chain state is always read fresh.
 *
 *   POST /lending/blend/leverage { from, pool, collateral, debt, deposit, leverage, slippageBps }
 */
export async function buildBlendLeverage(body: BlendLeverageBody | null): Promise<{ status: number; body: Built | Fail }> {
  try {
    const from = String(body?.from ?? "");
    const pool = String(body?.pool ?? "");
    const coll = String(body?.collateral ?? "");
    const debt = String(body?.debt ?? "");
    const slippageBps = Number(body?.slippageBps ?? 50);
    const phase = body?.phase ?? "open";
    const round = Number(body?.round ?? 0);
    if (!isAccount(from)) return fail("from must be a G... wallet");
    if (!isContract(pool) || !isContract(coll) || !isContract(debt) || coll === debt) return fail("pool, collateral and debt (two different tokens) required");
    if (!(slippageBps >= 1 && slippageBps <= 500)) return fail("slippage must be between 0.01% and 5%");
    if (!["open", "swap", "supply"].includes(phase) || !(Number.isInteger(round) && round >= 0 && round <= LOOP_MAX_ROUNDS)) return fail("bad leverage step");

    const sdk = await import("@stellar/stellar-sdk");
    const { borrowCapacity, oraclePrice, poolOracle, reserveFactors } = await import("./blend-position.js");
    const balance = async (token: string) => BigInt(String(await sorobanView(token, "balance", [sdk.Address.fromString(from).toScVal()])));
    const symbol = async (t: string) => {
      const s = String((await sorobanView(t, "symbol").catch(() => "")) || "token");
      return s === "native" ? "XLM" : s.split(":")[0];
    };
    const [rc, rd, cCode, dCode] = await Promise.all([reserveFactors(pool, coll), reserveFactors(pool, debt), symbol(coll), symbol(debt)]);
    const fmt = (v: bigint, dec: number) => {
      const n = Number(v) / 10 ** dec;
      return n >= 1000 ? n.toFixed(2) : n >= 1 ? String(Number(n.toFixed(4))) : n.toPrecision(4);
    };
    const big = (v: unknown) => (/^\d+$/.test(String(v ?? "")) ? BigInt(String(v)) : -1n);
    const base = { protocol: "blend" as const, from, pool, collateral: coll, debt, slippageBps };

    // One Blend submit: supply `toSupply`, plus the next borrow while the target isn't reached.
    const submitRound = async (toSupply: bigint, target: bigint, borrowed: bigint, r: number): Promise<Built> => {
      const remaining = target - borrowed;
      let b = 0n;
      if (remaining > 0n && r < LOOP_MAX_ROUNDS) {
        const cap = await borrowCapacity(pool, from, debt, LOOP_MIN_HEALTH, { asset: coll, amount: toSupply });
        b = remaining < cap ? remaining : cap;
        // A dust top-up isn't worth another round of signatures.
        if (borrowed > 0n && b < remaining / 50n) b = 0n;
      }
      const actions: LendingAction[] = [{ action: "supply", asset: coll, amount: toSupply.toString() }];
      if (b > 0n) actions.push({ action: "borrow", asset: debt, amount: b.toString() });
      const built = await buildBlend(from, pool, actions, undefined);
      return {
        ok: true,
        xdr: built.xdr,
        label:
          b > 0n
            ? `Supply ${fmt(toSupply, rc.decimals)} ${cCode} + borrow ${fmt(b, rd.decimals)} ${dCode}`
            : `Supply ${fmt(toSupply, rc.decimals)} ${cCode} (last step)`,
        next:
          b > 0n
            ? ({ ...base, phase: "swap", target: target.toString(), borrowed: (borrowed + b).toString(), amount: b.toString(), round: r + 1 } as never)
            : null,
      };
    };

    if (phase === "open") {
      const deposit = big(body?.deposit);
      const L = Number(body?.leverage);
      if (deposit <= 0n) return fail("deposit must be a base-unit amount");
      if (!(L >= 1.1 && L <= 10)) return fail("leverage must be between 1.1x and 10x");
      if (!(rc.cf > 0)) return fail(`${cCode} can't be collateral in this pool.`);
      if (!(rd.lf > 0)) return fail(`${dCode} can't be borrowed in this pool.`);
      const status = Number(((await sorobanView(pool, "get_config")) as { status?: unknown })?.status ?? 0);
      if (status > 1) return fail("This Blend pool isn't allowing new borrowing right now.");
      // Finished-position health: (cf x lf) x L / (L - 1).
      const health = (rc.cf * rd.lf * L) / (L - 1);
      if (!(health >= LEVERAGE_MIN_HEALTH - 1e-9))
        return fail(`That leverage would leave health at ${health.toFixed(2)}; Seidar keeps leveraged positions at ${LEVERAGE_MIN_HEALTH} or above. Lower the leverage.`);
      if ((await balance(coll)) < deposit) return fail(`Not enough ${cCode} in your wallet.`);
      const oracle = await poolOracle(pool);
      const [pc, pd] = await Promise.all([oraclePrice(oracle, coll), oraclePrice(oracle, debt)]);
      if (pc <= 0n || pd <= 0n) return fail("The pool's oracle has no price for one of these assets right now.");
      const lev = BigInt(Math.round((L - 1) * 10_000));
      const target = (deposit * pc * lev * 10n ** BigInt(rd.decimals)) / (pd * 10_000n * 10n ** BigInt(rc.decimals));
      if (target <= 0n) return fail("Amount too small to leverage.");
      const oneStep = blendLeverageContract();
      if (oneStep) return { status: 200, body: await buildOneStep(oneStep, { from, pool, coll, debt, deposit, target, slippageBps, cCode, dCode, rc, rd, fmt }) };
      return { status: 200, body: await submitRound(deposit, target, 0n, 0) };
    }

    const target = big(body?.target);
    const borrowed = big(body?.borrowed);
    if (target <= 0n || borrowed < 0n) return fail("bad leverage step");

    if (phase === "swap") {
      const amount = big(body?.amount);
      if (amount <= 0n) return fail("bad leverage step");
      const { quoteSwap, buildSwap } = await import("./swap.js");
      const q = await quoteSwap({ assetIn: debt, assetOut: coll, amount: amount.toString(), tradeType: "EXACT_IN", slippageBps: String(slippageBps) });
      const qb = q.body as { ok?: boolean; quote?: unknown; error?: string };
      if (!qb.ok || !qb.quote) return fail(`No swap route from ${dCode} to ${cCode} right now. Your Blend position is open; retry to continue.`);
      const sb = (await buildSwap({ quote: qb.quote, from })).body as { ok?: boolean; xdr?: string; error?: string };
      if (!sb.ok || !sb.xdr) return fail(sb.error ?? "Couldn't build the swap.");
      // Read before the swap lands; the next step supplies exactly what it returned.
      const collBefore = await balance(coll);
      return {
        status: 200,
        body: {
          ok: true,
          xdr: sb.xdr,
          label: `Swap ${fmt(amount, rd.decimals)} ${dCode} → ${cCode}`,
          next: { ...base, phase: "supply", target: target.toString(), borrowed: borrowed.toString(), collBefore: collBefore.toString(), round } as never,
        },
      };
    }

    // phase === "supply": what the swap returned (less its network fee when the collateral is XLM).
    const before = big(body?.collBefore);
    if (before < 0n) return fail("bad leverage step");
    const got = (await balance(coll)) - before;
    if (got <= 0n) return fail("The swap output hasn't reached your wallet yet. Try again in a moment.");
    return { status: 200, body: await submitRound(got, target, borrowed, round) };
  } catch (e) {
    return fail(friendly("blend", errMsg(e)));
  }
}
