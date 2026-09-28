import test from "node:test";
import assert from "node:assert/strict";
import { adminRule, keeperSessionRule, multisigPolicy, authPayload, attachPolicy } from "../src/index.js";

test("admin + keeper session rules", () => {
  const admin = adminRule("GA");
  assert.equal(admin.signers.length, 1);
  assert.equal(admin.validUntil, null);
  const keeper = keeperSessionRule("GK", "CGUARD", { validUntilLedger: 99999, dailyLimit: 1000 });
  assert.equal(keeper.type, "CallContract");
  assert.throws(() => keeperSessionRule("GK", "C", {}), /validUntilLedger/);
});

test("multisig threshold cannot exceed weight (anti-brick)", () => {
  assert.throws(() => multisigPolicy({ threshold: 5, weights: { A: 2 } }), /brick/);
  assert.throws(() => multisigPolicy({ threshold: 0, weights: { A: 1 } }), /positive/);
  const p = multisigPolicy({ threshold: 2, weights: { A: 1, B: 1, C: 1 } });
  assert.equal(p.threshold, 2);
});

test("auth payload requires rule ids", () => {
  assert.throws(() => authPayload({}), /contextRuleIds/);
  const p = authPayload({ signatures: { GA: "sig" }, contextRuleIds: [3] });
  assert.deepEqual(p.context_rule_ids, [3]);
});

test("multisig never lands on keeper rules", () => {
  const keeper = keeperSessionRule("GK", "CGUARD", { validUntilLedger: 1, dailyLimit: 1 });
  const admin = adminRule("GA");
  const ms = multisigPolicy({ threshold: 2, weights: { A: 1, B: 1 } });
  assert.throws(() => attachPolicy(keeper, ms), /stall automation/);
  assert.equal(attachPolicy(admin, ms).policies.length, 1);
});
