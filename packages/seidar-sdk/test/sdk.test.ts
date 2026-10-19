import test from "node:test";
import assert from "node:assert/strict";
import { Recipe, ActionKind, quoteFee, feeTierBps, boostRecipe, repayRecipe } from "../src/index.js";

test("validates flash-first single-flash rules", () => {
  const ok = new Recipe().flashLoan("USDC", 100).supply("XLM", 100);
  assert.equal(ok.validate(), true);
  assert.throws(() => new Recipe().validate(), /empty/);
  assert.throws(() => new Recipe().supply("XLM", 1).flashLoan("USDC", 1).validate(), /first/);
  assert.throws(
    () => new Recipe().flashLoan("USDC", 1).flashLoan("USDC", 1).validate(),
    /only one/
  );
});

test("rejects bad amounts and param refs", () => {
  assert.throws(() => new Recipe().supply("XLM", -1), /non-negative/);
  assert.throws(() => new Recipe().add("Nope", "XLM", 1), /unknown action/);
  assert.throws(() => new Recipe().add("Supply", "XLM", 1, 0), /earlier action/);
  const r = new Recipe().supply("XLM", 5).borrow("USDC", 3, 0);
  assert.equal(r.actions[1].paramSrcIndex, 0);
});

test("buildIntent is ordered and unsigned", () => {
  const intent = new Recipe().supply("XLM", 5).buildIntent("GABC");
  assert.equal(intent.user, "GABC");
  assert.deepEqual(intent.actions.map((a) => a.kind), [ActionKind.Supply]);
  assert.ok(intent.createdAt);
});

test("fee tiers + quote math", () => {
  assert.equal(feeTierBps({ stable: true }), 1);
  assert.equal(feeTierBps({ correlated: true }), 10);
  assert.equal(feeTierBps({}), 25);
  assert.equal(quoteFee(10_000_000, 25), 25_000);
  assert.equal(quoteFee(0, 25), 0);
});

test("boost/repay helpers compose", () => {
  const b = boostRecipe({ debtAsset: "USDC", collateralAsset: "XLM", flashAmount: 200, supplyAmount: 300, borrowAmount: 200 });
  assert.deepEqual(b.actions.map((a) => a.kind), ["FlashLoan", "Swap", "Supply", "Borrow"]);
  const r = repayRecipe({ collateralAsset: "XLM", debtAsset: "USDC", withdrawAmount: 100, repayAmount: 90 });
  assert.deepEqual(r.actions.map((a) => a.kind), ["Withdraw", "Swap", "Repay"]);
});
