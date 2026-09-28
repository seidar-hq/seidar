import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEvent, reduceActivity, aggregatePortfolio } from "../src/index.js";

test("normalizes known topics, drops noise", () => {
  assert.deepEqual(
    normalizeEvent({ contract: "C1", topic: "fired", data: { owner: "GA", ref: 7 }, ledger: 100 }),
    { contract: "C1", topic: "fired", data: { owner: "GA", ref: 7 }, ledger: 100 }
  );
  assert.equal(normalizeEvent({ topic: "transfer" }), null);
  assert.equal(normalizeEvent(null), null);
});

test("reduces activity per owner", () => {
  const rows = [
    { topic: "fired", ledger: 100, data: { owner: "GA", ref: 1 } },
    { topic: "recipe", ledger: 101, data: { owner: "GA", ref: 3 } },
    { topic: "fired", ledger: 102, data: { owner: "GB", ref: 2 } },
    { topic: "fired", ledger: 103, data: {} },
  ];
  const m = reduceActivity(rows);
  assert.equal(m.get("GA").length, 2);
  assert.equal(m.get("GB").length, 1);
  assert.equal(m.has(""), false);
});

test("re-exports portfolio aggregation", () => {
  const agg = aggregatePortfolio([{ collateralValue: 10, debtValue: 5, automation: "Auto-repay" }]);
  assert.equal(agg.loans, 1);
  assert.equal(agg.protected, 1);
});
