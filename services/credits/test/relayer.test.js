import test from "node:test";
import assert from "node:assert/strict";
import { RelayerClient } from "../src/relayer.js";
import { newBucket } from "../src/index.js";

function mockTransport(routes) {
  return async (url, { body }) => {
    const parsed = JSON.parse(body);
    const key = url.endsWith("/submit") ? "submit" : url.endsWith("/fee-usage") ? "fee" : "other";
    if (!routes[key]) return { ok: false, status: 500 };
    return { ok: true, json: async () => routes[key](parsed) };
  };
}

test("sponsors and submits while bucket lasts", async () => {
  const c = new RelayerClient({
    baseUrl: "http://relayer",
    apiKey: "k",
    transport: mockTransport({ submit: ({ xdr }) => ({ hash: "H", xdr }) }),
  });
  const r = await c.sponsorOrFallback(newBucket({ txs: 1, budgetStroops: 1000 }), 400, "XDR");
  assert.equal(r.mode, "sponsored");
  assert.equal(r.submit.hash, "H");
  assert.deepEqual(r.bucket, { txsLeft: 0, budgetLeft: 600 });
});

test("falls back to user-pays when exhausted (no submit)", async () => {
  let calls = 0;
  const c = new RelayerClient({
    baseUrl: "http://relayer",
    apiKey: "k",
    transport: mockTransport({ submit: () => { calls += 1; return {}; } }),
  });
  const r = await c.sponsorOrFallback(newBucket({ txs: 0, budgetStroops: 0 }), 400, "XDR");
  assert.equal(r.mode, "user-pays");
  assert.equal(r.submit, null);
  assert.equal(calls, 0);
});

test("relayer http errors propagate", async () => {
  const c = new RelayerClient({ baseUrl: "http://r", apiKey: "k", transport: mockTransport({}) });
  await assert.rejects(c.getFeeUsage(), /http 500/);
});
