// Keeper RPC layer — plain JSON-RPC against Soroban RPC (no heavy deps).
// `fetchImpl` is injectable so every path is unit-tested with mocks.

export async function rpcCall(rpcUrl, method, params, fetchImpl = fetch) {
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc http ${res.status} for ${method}`);
  const body = await res.json();
  if (body.error) throw new Error(`rpc ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

/** Latest ledger sequence (for cooldown math + event paging). */
export async function getLatestLedger(rpcUrl, fetchImpl = fetch) {
  const r = await rpcCall(rpcUrl, "getLatestLedger", {}, fetchImpl);
  return r.sequence;
}

/**
 * Contract events for `contractIds` in [startLedger, startLedger+pages).
 * Returns normalized rows compatible with @seidar/indexer reduceActivity.
 */
export async function getContractEvents(rpcUrl, contractIds, startLedger, pages = 5, fetchImpl = fetch) {
  const rows = [];
  let cursor = startLedger;
  for (let i = 0; i < pages; i++) {
    const r = await rpcCall(
      rpcUrl,
      "getEvents",
      {
        startLedger: cursor,
        filters: [{ type: "contract", contractIds, topics: [] }],
        pagination: { limit: 100 },
      },
      fetchImpl
    );
    for (const ev of r.events ?? []) {
      rows.push({
        contract: ev.contractId,
        topic: ev.topic?.[0] ? String(ev.topic[0]) : "unknown",
        data: { owner: ev.topic?.[1] ? String(ev.topic[1]) : "", ref: null },
        ledger: ev.ledger,
      });
    }
    if (!r.latestLedger || r.events?.length === 0) break;
    cursor = r.latestLedger;
  }
  return rows;
}

/** Build a keeper snapshot: ledger + recent guardian/executor activity. */
export async function buildSnapshot(rpcUrl, { contracts, lookback = 20 } = {}, fetchImpl = fetch) {
  const latest = await getLatestLedger(rpcUrl, fetchImpl);
  const activity = await getContractEvents(rpcUrl, contracts ?? [], Math.max(2, latest - lookback), 3, fetchImpl);
  return { ledger: latest, activity, positions: {}, prices: {} };
}
