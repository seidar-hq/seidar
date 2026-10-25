// Blend pool submit builder (unsigned XDR; user signs in Freighter).
// Mirrors buildVaultTx/buildInvoke: assemble + simulate server-side so the
// browser never needs an RPC URL, then refuse signed envelopes on return.
// Amounts are base-unit integer strings (i128); assets are SAC contracts.

import { PoolContract, RequestType } from "@blend-capital/blend-sdk";
import { buildInvoke } from "./rpc.js";


const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const isAccount = (v: string) => /^G[A-Z2-7]{55}$/.test(v);

const REQ_TYPES: Record<string, number> = {
  supply: RequestType.SupplyCollateral,
  borrow: RequestType.Borrow,
  repay: RequestType.Repay,
  withdraw: RequestType.WithdrawCollateral,
};

function err(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
}

export async function buildBlendTx(body: {
  pool?: string;
  from?: string;
  requests?: { type?: string; asset?: string; amount?: string }[];
} | null) {
  try {
    const pool = String(body?.pool ?? "");
    const from = String(body?.from ?? "");
    const requests = Array.isArray(body?.requests) ? body.requests : [];
    if (!isContract(pool) || !isAccount(from)) {
      return { status: 200, body: { ok: false, error: "pool contract + from G address required" } };
    }
    if (requests.length === 0 || requests.length > 8) {
      return { status: 200, body: { ok: false, error: "1..8 requests required" } };
    }
    const mapped: { request_type: number; address: string; amount: bigint }[] = [];
    for (const r of requests) {
      const type = String(r?.type ?? "").toLowerCase();
      const asset = String(r?.asset ?? "");
      const amount = String(r?.amount ?? "");
      if (!(type in REQ_TYPES) || !isContract(asset) || !/^\d+$/.test(amount) || BigInt(amount) <= BigInt(0)) {
        return {
          status: 200,
          body: { ok: false, error: "each request needs type=supply|borrow|repay|withdraw, SAC asset, positive base-unit amount" },
        };
      }
      mapped.push({ request_type: REQ_TYPES[type], address: asset, amount: BigInt(amount) });
    }
    const Ctor = PoolContract as unknown as new (id: string) => {
      submit(a: unknown): string;
    };
    const opB64 = new Ctor(pool).submit({ from, spender: from, to: from, requests: mapped });
    const { xdr: built } = await buildInvoke({ from, op: opB64 });
    return { status: 200, body: { ok: true, xdr: built } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}
