import test from "node:test";
import assert from "node:assert/strict";
import { toStroops, fromStroops, getAsset, isStablePair, isCorrelatedPair, PROTOCOLS } from "../src/index.js";

test("stroops round-trip at 7 decimals", () => {
  assert.equal(toStroops(1.5), 15_000_000n);
  assert.equal(fromStroops(15_000_000n), 1.5);
});

test("unknown asset throws", () => {
  assert.throws(() => getAsset("NOPE"), /unknown asset/);
});

test("fee-tier pair classification", () => {
  assert.equal(isStablePair("USDC", "EURC"), true);
  assert.equal(isStablePair("USDC", "XLM"), false);
  assert.equal(isCorrelatedPair("XLM", "sXLM"), true);
  assert.equal(isCorrelatedPair("XLM", "USDC"), false);
});

test("protocol caps pinned", () => {
  assert.equal(PROTOCOLS.blend.maxLtvBps, 7500);
  assert.equal(PROTOCOLS.xoxno.maxLtvBps, 8000);
  assert.equal(PROTOCOLS.peridot.maxLtvBps, 7000);
});
