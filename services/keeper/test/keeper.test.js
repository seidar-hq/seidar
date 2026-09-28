import test from "node:test";
import assert from "node:assert/strict";
import { tick } from "../src/index.js";

const RULE = {
  subId: 1,
  owner: "GABC",
  active: true,
  lastFired: 0,
  cooldownLedgers: 100,
  priceAsset: "XLM",
  trigger: { type: "HealthBelow", value: 15000 },
};

test("fires intent when health collapses", () => {
  const { intents, decisions } = tick({
    rules: [RULE],
    snapshot: { positions: { 1: { collateralValue: 1240, debtValue: 900 } }, prices: { XLM: 95 } },
    currentLedger: 10000,
  });
  assert.equal(decisions[0].fire, true);
  assert.equal(intents.length, 1);
  assert.equal(intents[0].type, "guardian.execute");
  assert.equal(intents[0].observedHealthBps, 13777);
});

test("silent when healthy, inactive, or cooling", () => {
  const healthy = tick({
    rules: [RULE],
    snapshot: { positions: { 1: { collateralValue: 3000, debtValue: 900 } }, prices: { XLM: 95 } },
    currentLedger: 10000,
  });
  assert.equal(healthy.intents.length, 0);
  assert.equal(healthy.decisions[0].reason, "trigger-false");

  const off = tick({
    rules: [{ ...RULE, active: false }],
    snapshot: { positions: { 1: { collateralValue: 1, debtValue: 900 } }, prices: {} },
    currentLedger: 10000,
  });
  assert.equal(off.decisions[0].reason, "inactive");

  const cooling = tick({
    rules: [{ ...RULE, lastFired: 9950 }],
    snapshot: { positions: { 1: { collateralValue: 1, debtValue: 900 } }, prices: {} },
    currentLedger: 10000,
  });
  assert.equal(cooling.decisions[0].reason, "cooldown");
});
