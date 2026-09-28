import test from "node:test";
import assert from "node:assert/strict";
import { toolNames, callTool } from "../src/tools.js";

test("registry lists all tools", () => {
  assert.deepEqual(toolNames().sort(), [
    "get_assets",
    "get_automation_rules",
    "get_markets",
    "get_portfolio",
    "get_position",
    "quote_boost",
    "quote_repay",
  ]);
});

test("quote_boost returns unsigned intent within rails", () => {
  const r = callTool("quote_boost", {
    user: "GABC",
    debtAsset: "USDC",
    collateralAsset: "XLM",
    collateralValue: 3000,
    debtValue: 900,
    leverage: 2,
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.quote.steps, 4);
  assert.equal(r.result.intent.user, "GABC");
  assert.ok(r.result.warnings.length > 0);
});

test("rails refuse over-leverage and thin health", () => {
  const over = callTool("quote_boost", {
    user: "G", debtAsset: "USDC", collateralAsset: "XLM",
    collateralValue: 3000, debtValue: 900, leverage: 5,
  });
  assert.equal(over.ok, false);
  assert.match(over.error, /leverage/);

  const thin = callTool("quote_boost", {
    user: "G", debtAsset: "USDC", collateralAsset: "XLM",
    collateralValue: 1000, debtValue: 900, leverage: 2,
  });
  assert.equal(thin.ok, false);
  assert.match(thin.error, /health/);
});

test("unknown tool errors cleanly", () => {
  const r = callTool("nope", {});
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown tool/);
});

test("automation + portfolio + assets tools", () => {
  const auto = callTool("get_automation_rules", {
    rules: [{ subId: 1, active: true, lastFired: 0, cooldownLedgers: 100, trigger: { type: "HealthBelow", value: 15000 } }],
    obs: { healthBps: 13500, price: 0 },
    currentLedger: 10000,
  });
  assert.deepEqual(auto.result, [{ subId: 1, fire: true, reason: "fire" }]);

  const pf = callTool("get_portfolio", {
    positions: [{ collateralValue: 10, debtValue: 5, automation: "Auto-repay" }],
  });
  assert.equal(pf.result.loans, 1);

  const pos = callTool("get_position", { collateralValue: 2000, debtValue: 1000 });
  assert.equal(pos.result.healthBps, 20000);

  const mk = callTool("get_markets", {});
  assert.equal(mk.result.markets.blend.maxLtvBps, 7500);
});
