import test from "node:test";
import assert from "node:assert/strict";
import { newBucket, trySponsor, topUp } from "../src/index.js";

test("sponsors while bucket lasts, then flips to user-pays", () => {
  let b = newBucket({ txs: 2, budgetStroops: 1000 });
  let r = trySponsor(b, 400);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "sponsored");
  assert.deepEqual(r.bucket, { txsLeft: 1, budgetLeft: 600 });
  r = trySponsor(r.bucket, 700);
  assert.equal(r.ok, false);
  assert.equal(r.mode, "user-pays");
  assert.deepEqual(r.bucket, { txsLeft: 1, budgetLeft: 600 });
});

test("exhausted tx count flips even with budget left", () => {
  const b = { txsLeft: 0, budgetLeft: 999_999 };
  const r = trySponsor(b, 1);
  assert.equal(r.mode, "user-pays");
});

test("top-ups respect caps", () => {
  const b = topUp(newBucket(), { txs: 50, budgetStroops: 1e12 });
  assert.deepEqual(b, { txsLeft: 10, budgetLeft: 100_000_000 });
});
