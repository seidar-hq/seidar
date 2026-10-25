// Protocol history for an account: the account's Soroban calls into a
// protocol's contracts, read from Horizon operations (mainnet) and decoded.
//   GET /history?address=G...|C...&owner=G...&protocol=blend|xoxno
//   GET /history?...&protocol=defindex|upshift|aqua|phoenix|soroswap&contract=C...
//     (one vault or pool; Soroswap also matches router calls on its pair)
// A smart account (C...) has no Horizon operations of its own: its owner
// wallet submits every transaction, so its history is the owner's calls
// that carry the smart account's address.

import { getPoolData } from "./pools.js";
import { horizonUrl } from "./net.js";
import { XOXNO_CONTROLLER } from "./lending.js";


const LABEL: Record<string, string> = {
  submit: "Position update",
  flash_loan: "Flash loan",
  supply: "Supply",
  borrow: "Borrow",
  withdraw: "Withdraw",
  repay: "Repay",
  repay_max: "Repay all",
  deposit: "Supply",
  enter_market: "Enable collateral",
  multiply: "Multiply",
  migrate_from_blend: "Migrate from Blend",
  claim: "Claim rewards",
};
const REQ: Record<number, string> = {
  0: "Supply",
  1: "Withdraw",
  2: "Supply collateral",
  3: "Withdraw collateral",
  4: "Borrow",
  5: "Repay",
};

type Op = {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful: boolean;
  function?: string;
  parameters?: { value: string; type: string }[];
};

/** Retry transient network failures (Node reports them as "fetch failed"). */
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

async function contractsFor(protocol: string): Promise<Set<string>> {
  if (protocol === "xoxno") return new Set([XOXNO_CONTROLLER]);
  const d = await getPoolData("blend");
  return new Set(d.rows.map((r: { pool: string }) => r.pool).filter((p: string) => /^C/.test(p)));
}

/** Vault / pool action labels (the lending map reads "deposit" as Supply). */
const VENUE_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  withdraw_shares: "Withdraw",
  claim: "Claim rewards",
  add_liquidity: "Add liquidity",
  remove_liquidity: "Remove liquidity",
  provide_liquidity: "Add liquidity",
  withdraw_liquidity: "Remove liquidity",
  swap: "Swap",
};
const VENUES = ["defindex", "upshift", "aqua", "phoenix", "soroswap"];

export async function getHistory(address: string, protocol: string, owner = "", contract = "") {
  const smart = /^C[A-Z2-7]{55}$/.test(address);
  if (!/^G[A-Z2-7]{55}$/.test(address) && !(smart && /^G[A-Z2-7]{55}$/.test(owner)))
    return { status: 400, body: { ok: false, error: "invalid address" } };
  const venue = VENUES.includes(protocol);
  if (!["blend", "xoxno"].includes(protocol) && !venue) return { status: 400, body: { ok: false, error: "unknown protocol" } };
  if (venue && !/^C[A-Z2-7]{55}$/.test(contract)) return { status: 400, body: { ok: false, error: "contract required" } };
  try {
    const sdk = await import("@stellar/stellar-sdk");
    const targets = venue ? new Set([contract]) : await retry(() => contractsFor(protocol));
    // Soroswap liquidity goes through the router with the pair's tokens.
    let router: string | null = null;
    let pairTokens: string[] = [];
    if (protocol === "soroswap") {
      const { SOROSWAP_ROUTER } = await import("./dex-onchain.js");
      const { sorobanView } = await import("./rpc.js");
      router = SOROSWAP_ROUTER;
      pairTokens = [String(await sorobanView(contract, "token_0")), String(await sorobanView(contract, "token_1"))];
      targets.add(router);
    }
    const source = smart ? owner : address;
    const r = await retry(() =>
      fetch(`${horizonUrl()}/accounts/${source}/operations?order=desc&limit=200&include_failed=true`),
    );
    if (r.status === 404) return { status: 200, body: { ok: true, items: [] } };
    if (!r.ok) throw new Error(`horizon ${r.status}`);
    const ops = ((await r.json()) as { _embedded?: { records?: Op[] } })._embedded?.records ?? [];
    /** Whether an op's arguments name the smart account (it acted for it). */
    const forAccount = (op: Op) =>
      (op.parameters ?? []).some((p) => {
        try {
          return JSON.stringify(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(p.value, "base64")), (_k, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ).includes(address);
        } catch {
          return false;
        }
      });
    const items: { at: string; action: string; detail: string; hash: string; ok: boolean }[] = [];
    for (const op of ops) {
      if (op.type !== "invoke_host_function" || !op.parameters || op.parameters.length < 2) continue;
      let contract = "";
      let fn = "";
      try {
        contract = String(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(op.parameters[0].value, "base64")));
        fn = String(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(op.parameters[1].value, "base64")));
      } catch {
        continue;
      }
      if (!targets.has(contract)) continue;
      if (smart && !forAccount(op)) continue;
      if (router && contract === router) {
        const args = JSON.stringify(op.parameters.map((p) => p.value));
        let named = 0;
        for (const t of pairTokens) {
          try {
            if (args.includes(sdk.Address.fromString(t).toScVal().toXDR("base64"))) named++;
          } catch {
            /* ignore */
          }
        }
        if (named < 2) continue;
      }
      let detail = "";
      // Blend submit/flash_loan: describe the request types.
      if ((fn === "submit" || fn === "flash_loan") && op.parameters.length >= 3) {
        try {
          const last = op.parameters[op.parameters.length - 1].value;
          const reqs = sdk.scValToNative(sdk.xdr.ScVal.fromXDR(last, "base64")) as { request_type?: number }[];
          if (Array.isArray(reqs)) detail = [...new Set(reqs.map((q) => REQ[Number(q.request_type)] ?? "Action"))].join(" + ");
        } catch {
          /* generic label */
        }
      }
      items.push({
        at: op.created_at,
        action: detail || (venue ? VENUE_LABEL[fn] : LABEL[fn]) || fn,
        detail: fn,
        hash: op.transaction_hash,
        ok: op.transaction_successful,
      });
    }
    return { status: 200, body: { ok: true, items } };
  } catch (e) {
    const raw = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    return {
      status: 200,
      body: {
        ok: false,
        error: /fetch failed|ECONN|ETIMEDOUT|horizon 5/i.test(raw)
          ? "Stellar's history service didn't respond — retrying shortly."
          : raw,
      },
    };
  }
}
