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

function friendly(protocol: string, msg: string): string {
  const code = msg.match(/error #(\d+)/)?.[1];
  if (protocol === "blend" && code && BLEND_ERRORS[code]) return BLEND_ERRORS[code];
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
