import test from "node:test";
import assert from "node:assert/strict";
import { rpcCall, getLatestLedger, getContractEvents, buildSnapshot } from "../src/rpc.js";

function mockFetch(routes) {
  return async (_url, { body }) => {
    const { method } = JSON.parse(body);
    const handler = routes[method];
    if (!handler) return { ok: true, json: async () => ({ error: { code: -1, message: "no mock" } }) };
    return { ok: true, json: async () => ({ result: handler() }) };
  };
}

test("rpcCall surfaces transport + protocol errors", async () => {
  await assert.rejects(
    rpcCall("http://x", "getLatestLedger", {}, async () => ({ ok: false, status: 500 })),
    /http 500/
  );
  await assert.rejects(
    rpcCall("http://x", "getLatestLedger", {}, mockFetch({})),
    /no mock/
  );
});

test("latest ledger + paged events", async () => {
  const fetchImpl = mockFetch({
    getLatestLedger: () => ({ sequence: 1000 }),
    getEvents: () => ({
      events: [{ contractId: "C1", topic: ["fired", "GA"], ledger: 999 }],
      latestLedger: 1000,
    }),
  });
  assert.equal(await getLatestLedger("http://x", fetchImpl), 1000);
  const rows = await getContractEvents("http://x", ["C1"], 990, 2, fetchImpl);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].topic, "fired");
});

test("empty pages stop pagination", async () => {
  const fetchImpl = mockFetch({
    getLatestLedger: () => ({ sequence: 50 }),
    getEvents: () => ({ events: [], latestLedger: 50 }),
  });
  const snap = await buildSnapshot("http://x", { contracts: ["C1"] }, fetchImpl);
  assert.equal(snap.ledger, 50);
  assert.deepEqual(snap.activity, []);
});
