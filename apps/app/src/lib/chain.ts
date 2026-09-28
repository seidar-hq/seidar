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

/** Decode a base64 XDR topic to its symbol string (e.g. rule_added). */
function decodeTopic(t: unknown): string {
  if (typeof t !== "string") return "unknown";
  // Soroban RPC encodes topics as base64 XDR; the symbol reads as ASCII inside.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length % 4 === 0 && t.length >= 16) {
    try {
      const bin =
        typeof Buffer !== "undefined"
          ? Buffer.from(t, "base64").toString("binary")
          : atob(t);
      const m = bin.match(/[a-z][a-z0-9_]{2,}/);
      if (m) return m[0];
    } catch {
      /* fall through to raw */
    }
  }
  return t;
}

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
  windowsBack = 8,
  windowSize = 5000
): Promise<{ ledger: number; events: ChainEvent[] }> {
  const latest: number = (await rpc("getLatestLedger", {})).sequence;
  const ids = [CONTRACTS.guardian, CONTRACTS.recipeExecutor];
  const seen = new Set<string>();
  const events: ChainEvent[] = [];
  // Step backward in fixed windows: one getEvents call cannot scan the
  // whole retention range, but each windowed call scans forward from its
  // own start, so union the windows and dedupe.
  for (let w = 0; w < windowsBack && events.length < 25; w++) {
    const start = Math.max(2, latest - windowSize * (w + 1));
    const r = await rpc("getEvents", {
      startLedger: start,
      filters: [{ type: "contract", contractIds: ids, topics: [] }],
      pagination: { limit: 100 },
    });
    for (const ev of r.events ?? []) {
      const key = `${ev.txHash}:${JSON.stringify(ev.topic?.[0] ?? "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        contract: ev.contractId,
        topic: decodeTopic(ev.topic?.[0]),
        ledger: ev.ledger,
        txHash: ev.txHash,
      });
    }
    if (start <= 2) break;
  }
  events.sort((a, b) => b.ledger - a.ledger || (a.txHash < b.txHash ? -1 : 1));
  return { ledger: latest, events: events.slice(0, 12) };
}

export function shortAddress(addr: string) {
  return addr.length > 9 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}
