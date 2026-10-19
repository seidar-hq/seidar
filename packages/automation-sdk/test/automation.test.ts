import test from "node:test";
import assert from "node:assert/strict";
import { shouldFire, offCooldown, evaluateRule, knownSubs } from "../src/index.js";

test("trigger evaluation", () => {
  assert.equal(shouldFire({ type: "HealthBelow", value: 15000 }, 13500, 999), true);
  assert.equal(shouldFire({ type: "HealthBelow", value: 15000 }, 18200, 999), false);
  assert.equal(shouldFire({ type: "PriceBelow", value: 100 }, 20000, 90), true);
  assert.throws(() => shouldFire({ type: "Nope" }, 1, 1), /unknown trigger/);
});

test("cooldown + full evaluation", () => {
  assert.equal(offCooldown(0, 100, 10000), true);
  assert.equal(offCooldown(9950, 100, 10000), false);
  const rule = { active: true, lastFired: 0, cooldownLedgers: 100, trigger: { type: "HealthBelow", value: 15000 } };
  assert.deepEqual(evaluateRule(rule, { healthBps: 13500, price: 0 }, 10000), { fire: true, reason: "fire" });
  assert.deepEqual(evaluateRule({ ...rule, active: false }, { healthBps: 1, price: 0 }, 10000).reason, "inactive");
  assert.deepEqual(evaluateRule({ ...rule, lastFired: 9950 }, { healthBps: 1, price: 0 }, 10000).reason, "cooldown");
  assert.deepEqual(evaluateRule(rule, { healthBps: 19000, price: 0 }, 10000).reason, "trigger-false");
});

test("known subs decoding", () => {
  assert.deepEqual(knownSubs({ 5: true, 6: false }), [5]);
});
