// Live chain layer for app.seidar.xyz (testnet first).
// Reads Soroban RPC directly; no private keys here — signing happens in
// Freighter via @stellar/freighter-api (see shell wallet button).

export const TESTNET_RPC = "https://soroban-testnet.stellar.org";

export const CONTRACTS = {
  recipeExecutor: "CDFS5PBV7NNK3ABM5BBFW72HZNAAN53PCB6FWVXO2AQOG6Q2KSKAMGCW",
  guardian: "CCS7TLOLDXTKJXUA3TCQE5RHVARTDNJS2QXYKPQTUGSNKU6PE2W5ENJP",
  flashReceiver: "CAJV35YX6RP6R3WZNPK2OKWUAGN7D2K46ZJVXBKMJWZWLQQXKZW6X7CI",
} as const;

export const EXPERT_TX = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

export type ChainEvent = {
  contract: string;
  topic: string;
  ledger: number;
  txHash: string;
};

async function rpc(method: string, params: unknown) {
  const res = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rpc http ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`rpc ${method} failed`);
  return body.result;
}

/** Recent events for our contracts (topic symbol + ledger + tx hash). */
export async function fetchActivity(
  limitLedgers = 5000
): Promise<{ ledger: number; events: ChainEvent[] }> {
  const latest: number = (await rpc("getLatestLedger", {})).sequence;
  const events: ChainEvent[] = [];
  const ids = [CONTRACTS.guardian, CONTRACTS.recipeExecutor];
  const r = await rpc("getEvents", {
    startLedger: Math.max(2, latest - limitLedgers),
    filters: [{ type: "contract", contractIds: ids, topics: [] }],
    pagination: { limit: 25 },
  });
  for (const ev of r.events ?? []) {
    const t0 = ev.topic?.[0];
    const topic =
      typeof t0 === "string" ? t0 : t0 && typeof t0 === "object" && "symbol" in t0 ? String(t0.symbol) : "unknown";
    events.push({ contract: ev.contractId, topic, ledger: ev.ledger, txHash: ev.txHash });
  }
  return { ledger: latest, events: events.slice(-12).reverse() };
}

export function shortAddress(addr: string) {
  return addr.length > 9 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}
