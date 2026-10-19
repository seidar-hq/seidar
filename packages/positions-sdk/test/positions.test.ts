import test from "node:test";
import assert from "node:assert/strict";
import { healthBps, healthStatus, borrowLimit, netApy, aggregatePortfolio } from "../src/index.js";

test("health math + buckets", () => {
  assert.equal(healthBps(2000, 1000), 20000);
  assert.equal(healthBps(1000, 0), null);
  assert.equal(healthBps(0, 1000), 0);
  assert.equal(healthStatus(18200), "healthy");
  assert.equal(healthStatus(13500), "watch");
  assert.equal(healthStatus(11000), "risk");
  assert.equal(healthStatus(null), "yield");
});

test("borrow limits", () => {
  assert.equal(borrowLimit(10000, 7500), 7500);
  assert.equal(borrowLimit(0, 7500), 0);
});

test("net APY weighting", () => {
  assert.equal(netApy(10000, 500, 5000, 800), 67);
  assert.equal(netApy(0, 0, 0, 0), 0);
});

test("portfolio aggregation", () => {
  const agg = aggregatePortfolio([
    { collateralValue: 12400, debtValue: 3100, automation: "Auto-repay" },
    { collateralValue: 8000, debtValue: 5000, automation: "Off" },
    { collateralValue: 10000, debtValue: 0, automation: "Compound" },
  ]);
  assert.equal(agg.collateral, 30400);
  assert.equal(agg.debt, 8100);
  assert.equal(agg.loans, 2);
  assert.equal(agg.protected, 1);
});
