// Account activity for the History page: every operation the account made or received, classified
// as a swap, a transfer or a protocol position action, with the assets that moved.
//   GET /activity?address=G...&kind=all|swaps|transfers|positions&cursor=
// Amounts come from Horizon itself (payment fields, and `asset_balance_changes` for Soroban calls),
// so no per-protocol decoding is needed to show what went in and out.

import { horizonUrl } from "./net.js";

export type ActivityKind = "swap" | "transfer" | "position" | "other";

export type ActivityLeg = { code: string; issuer: string | null; amount: number; dir: "in" | "out" };

export type ActivityItem = {
  id: string;
  at: string;
  hash: string;
  ok: boolean;
  kind: ActivityKind;
  action: string;
  protocol: string | null;
  counterparty: string | null;
  legs: ActivityLeg[];
  feeXlm: number | null;
};

type BalanceChange = {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  type: string;
  from?: string;
  to?: string;
  amount: string;
};

type Op = {
  id: string;
  paging_token: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful: boolean;
  source_account: string;
  // payments / path payments / create_account
  from?: string;
  to?: string;
  account?: string;
  funder?: string;
  starting_balance?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  source_amount?: string;
  source_asset_type?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  // change_trust
  limit?: string;
  // invoke_host_function
  function?: string;
  parameters?: { value: string; type: string }[];
  asset_balance_changes?: BalanceChange[];
  transaction?: { fee_charged?: string; source_account?: string };
};

const asset = (type?: string, code?: string, issuer?: string) =>
  type === "native" ? { code: "XLM", issuer: null } : { code: code ?? "?", issuer: issuer ?? null };

// Soroban function names -> what the user did.
const SWAP_FNS = new Set([
  "swap",
  "swap_exact_in",
  "swap_exact_out",
  "swap_exact_tokens_for_tokens",
  "swap_tokens_for_exact_tokens",
  "swap_chained",
  "swap_strict_receive",
  "swap_strict_send",
]);
const POSITION_LABEL: Record<string, string> = {
  submit: "Lending update",
  flash_loan: "Flash loan",
  supply: "Supply",
  borrow: "Borrow",
  repay: "Repay",
  withdraw: "Withdraw",
  deposit: "Deposit",
  withdraw_shares: "Withdraw",
  add_liquidity: "Add liquidity",
  remove_liquidity: "Remove liquidity",
  provide_liquidity: "Add liquidity",
  withdraw_liquidity: "Remove liquidity",
  claim: "Claim rewards",
  claim_rewards: "Claim rewards",
  enter_market: "Enable collateral",
};
const BLEND_REQ: Record<number, string> = {
  0: "Supply",
  1: "Withdraw",
  2: "Supply collateral",
  3: "Withdraw collateral",
  4: "Borrow",
  5: "Repay",
};

/** Contract -> protocol name for the venues Seidar knows (loaded once, refreshed hourly). */
let known: { at: number; map: Map<string, string> } | null = null;
async function protocolNames(): Promise<Map<string, string>> {
  if (known && Date.now() - known.at < 3_600_000) return known.map;
  const map = new Map<string, string>();
  try {
    const { XOXNO_CONTROLLER } = await import("./lending.js");
    map.set(XOXNO_CONTROLLER, "XOXNO");
    const { SOROSWAP_ROUTER } = await import("./dex-onchain.js");
    map.set(SOROSWAP_ROUTER, "Soroswap");
    const { UPSHIFT_VAULTS } = await import("./vaults.js");
    for (const v of UPSHIFT_VAULTS) map.set(v.address, "Upshift");
    const { getPoolData } = await import("./pools.js");
    const d = await getPoolData("blend");
    for (const r of d.rows as { pool: string }[]) if (/^C/.test(r.pool)) map.set(r.pool, "Blend");
  } catch {
    /* names are optional */
  }
  known = { at: Date.now(), map };
  return map;
}

// Zenex (Stellar perps): public mainnet contracts from docs.zenex.trade/deployments.
const ZENEX = new Set([
  "CAOZCITWHWAXH5FRU4EULQ5EN2HMTCHICRNC4R5ZAOVD7XHCCQSJ42IB", // XLM-USD market
  "CB2MX4WXJHOHCTDTN5DCFC7G3TLFLOYLCRCINPK7G2A3EUVW2AYVA56N", // XLM-USD vault
  "CDOF5KRURJ7RRBPORHYSSKT727X3IBNF3LGOFHZND4HBTS5FRUZRJEZT", // market router
]);
const ZENEX_LABEL: Record<string, string> = {
  create_order: "Perps order",
  create_and_fill: "Perps order",
  multicall: "Perps order",
  execute_order: "Perps fill",
  cancel_order: "Cancel perps order",
  create_vault_order: "Zenex vault order",
  execute_vault_order: "Zenex vault fill",
  claim: "Claim perps credit",
};

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

/** Contract id and function name of an invoke_host_function op, when Horizon included them. */
async function decodeCall(op: Op) {
  if (!op.parameters || op.parameters.length < 2) return { contract: null, fn: op.function ?? "", args: [] as unknown[] };
  const sdk = await import("@stellar/stellar-sdk");
  const val = (p: { value: string }) => {
    try {
      return sdk.scValToNative(sdk.xdr.ScVal.fromXDR(p.value, "base64")) as unknown;
    } catch {
      return null;
    }
  };
  return {
    contract: String(val(op.parameters[0]) ?? ""),
    fn: String(val(op.parameters[1]) ?? ""),
    args: op.parameters.slice(2).map(val),
  };
}

function legsFromChanges(changes: BalanceChange[] | undefined, me: string): ActivityLeg[] {
  const out: ActivityLeg[] = [];
  for (const c of changes ?? []) {
    if (c.type !== "transfer" && c.type !== "mint" && c.type !== "burn") continue;
    const dir = c.to === me ? "in" : c.from === me ? "out" : null;
    if (!dir) continue;
    out.push({ ...asset(c.asset_type, c.asset_code, c.asset_issuer), amount: Number(c.amount), dir });
  }
  // Merge repeated transfers of one asset in the same direction.
  const m = new Map<string, ActivityLeg>();
  for (const l of out) {
    const k = `${l.dir}:${l.code}:${l.issuer}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, amount: prev.amount + l.amount } : l);
  }
  return [...m.values()];
}

async function classify(op: Op, me: string): Promise<ActivityItem | null> {
  const base = {
    id: op.id,
    at: op.created_at,
    hash: op.transaction_hash,
    ok: op.transaction_successful,
    feeXlm: op.transaction?.fee_charged && op.transaction.source_account === me ? Number(op.transaction.fee_charged) / 1e7 : null,
  };
  switch (op.type) {
    case "payment": {
      const a = asset(op.asset_type, op.asset_code, op.asset_issuer);
      const out = op.from === me;
      if (!out && op.to !== me) return null;
      return {
        ...base,
        kind: "transfer",
        action: out ? "Send" : "Receive",
        protocol: null,
        counterparty: (out ? op.to : op.from) ?? null,
        legs: [{ ...a, amount: Number(op.amount), dir: out ? "out" : "in" }],
      };
    }
    case "create_account": {
      const out = op.funder === me;
      return {
        ...base,
        kind: "transfer",
        action: out ? "Send (new account)" : "Account funded",
        protocol: null,
        counterparty: (out ? op.account : op.funder) ?? null,
        legs: [{ code: "XLM", issuer: null, amount: Number(op.starting_balance), dir: out ? "out" : "in" }],
      };
    }
    case "path_payment_strict_send":
    case "path_payment_strict_receive": {
      const src = asset(op.source_asset_type, op.source_asset_code, op.source_asset_issuer);
      const dst = asset(op.asset_type, op.asset_code, op.asset_issuer);
      const selfSwap = op.from === me && op.to === me;
      if (selfSwap)
        return {
          ...base,
          kind: "swap",
          action: "Swap",
          protocol: "Stellar DEX",
          counterparty: null,
          legs: [
            { ...src, amount: Number(op.source_amount), dir: "out" },
            { ...dst, amount: Number(op.amount), dir: "in" },
          ],
        };
      const out = op.from === me;
      return {
        ...base,
        kind: "transfer",
        action: out ? "Send" : "Receive",
        protocol: null,
        counterparty: (out ? op.to : op.from) ?? null,
        legs: out ? [{ ...src, amount: Number(op.source_amount), dir: "out" }] : [{ ...dst, amount: Number(op.amount), dir: "in" }],
      };
    }
    case "change_trust": {
      const a = asset(op.asset_type, op.asset_code, op.asset_issuer);
      return {
        ...base,
        kind: "other",
        action: Number(op.limit) === 0 ? `Remove ${a.code} trustline` : `Add ${a.code} trustline`,
        protocol: null,
        counterparty: null,
        legs: [],
      };
    }
    case "invoke_host_function": {
      const { contract, fn, args } = await decodeCall(op);
      const legs = legsFromChanges(op.asset_balance_changes, me);
      if (contract && ZENEX.has(contract))
        return { ...base, kind: "position", action: ZENEX_LABEL[fn] ?? `Zenex · ${fn}`, protocol: "Zenex", counterparty: contract, legs };
      if (SWAP_FNS.has(fn))
        return { ...base, kind: "swap", action: "Swap", protocol: null, counterparty: contract, legs };
      if (fn === "transfer") {
        const out = legs.some((l) => l.dir === "out");
        return { ...base, kind: "transfer", action: out ? "Send" : "Receive", protocol: null, counterparty: contract, legs };
      }
      if (fn in POSITION_LABEL) {
        let action = POSITION_LABEL[fn];
        if ((fn === "submit" || fn === "flash_loan") && Array.isArray(args[args.length - 1])) {
          const reqs = args[args.length - 1] as { request_type?: number }[];
          const named = [...new Set(reqs.map((q) => BLEND_REQ[Number(q?.request_type)]).filter(Boolean))];
          if (named.length) action = named.join(" + ");
        }
        return { ...base, kind: "position", action, protocol: null, counterparty: contract, legs };
      }
      return { ...base, kind: "other", action: fn ? `Contract call · ${fn}` : "Contract call", protocol: null, counterparty: contract, legs };
    }
    default:
      return null;
  }
}

const KIND_FILTER: Record<string, ActivityKind[]> = {
  all: ["swap", "transfer", "position", "other"],
  swaps: ["swap"],
  transfers: ["transfer"],
  positions: ["position"],
};

export async function getActivity(address: string, kind = "all", cursor = "") {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return { status: 400, body: { ok: false, error: "invalid address" } };
  const want = KIND_FILTER[kind] ?? KIND_FILTER.all;
  try {
    const url =
      `${horizonUrl()}/accounts/${address}/operations?order=desc&limit=100&include_failed=true&join=transactions` +
      (/^\d+$/.test(cursor) ? `&cursor=${cursor}` : "");
    const r = await retry(() => fetch(url, { signal: AbortSignal.timeout(20_000) }));
    if (r.status === 404) return { status: 200, body: { ok: true, items: [], next: null } };
    if (!r.ok) throw new Error(`horizon ${r.status}`);
    const ops = ((await r.json()) as { _embedded?: { records?: Op[] } })._embedded?.records ?? [];
    const names = await protocolNames();
    const items: ActivityItem[] = [];
    for (const op of ops) {
      const it = await classify(op, address).catch(() => null);
      if (!it || !want.includes(it.kind)) continue;
      if (!it.protocol && it.counterparty) it.protocol = names.get(it.counterparty) ?? null;
      if (it.kind === "swap" && !it.protocol) it.protocol = "Soroswap aggregator";
      items.push(it);
    }
    const next = ops.length === 100 ? ops[ops.length - 1].paging_token : null;
    return { status: 200, body: { ok: true, items, next } };
  } catch (e) {
    const raw = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    return {
      status: 200,
      body: {
        ok: false,
        error: /fetch failed|ECONN|ETIMEDOUT|abort|horizon 5/i.test(raw) ? "Stellar's history service didn't respond. Try again shortly." : raw,
      },
    };
  }
}
