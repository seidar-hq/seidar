import { test } from "node:test";
import assert from "node:assert/strict";
import { replayPrincipal, replayShares } from "../src/stellar-index.js";

const deposit = (owner: string, shares: number) => ({ topic_0: "deposit", topics: [owner, owner, owner], data: `{assets: 1, shares: ${shares}}` });
const withdraw = (owner: string, shares: number) => ({ topic_0: "withdraw", topics: [owner, owner, owner], data: `{assets: 1, shares: ${shares}}` });
const transfer = (from: string, to: string, amount: number) => ({ topic_0: "transfer", topics: [from, to], data: `{amount: ${amount}, to_muxed_id: void}` });

test("replayShares: a wallet that fully withdrew is not a depositor", () => {
  assert.deepEqual(replayShares([deposit("A", 10), deposit("B", 5), withdraw("A", 10)]), { holders: 1, total: 5n });
});

test("replayShares: a transfer moves shares, including to a wallet that never deposited", () => {
  assert.deepEqual(replayShares([deposit("A", 10), transfer("A", "B", 4)]), { holders: 2, total: 10n });
  assert.deepEqual(replayShares([deposit("A", 10), transfer("A", "B", 10)]), { holders: 1, total: 10n });
});

test("replayShares: order doesn't matter (the API lists newest first)", () => {
  assert.deepEqual(replayShares([withdraw("B", 3), transfer("A", "B", 3), deposit("A", 3)]), { holders: 0, total: 0n });
});

test("replayShares: other events are ignored, and amounts beyond 2^53 stay exact", () => {
  const big = { topic_0: "deposit", topics: ["A"], data: "{assets: 1, shares: 498005408666477632154}" };
  assert.deepEqual(replayShares([big, { topic_0: "operator_set", topics: ["X"], data: "{}" }]), { holders: 1, total: 498005408666477632154n });
});

test("replayShares: a malformed event fails rather than giving a wrong count", () => {
  assert.throws(() => replayShares([{ topic_0: "deposit", topics: ["A"], data: "{}" }]));
  assert.throws(() => replayShares([{ topic_0: "deposit", topics: [], data: "{shares: 1}" }]));
});

const create = (owner: string, amount: number) => ({ topic_0: "DEPOSIT", topics: ["create"], data: `{amount: ${amount}, deposit_id: 1, owner: ${owner}, referral_id: , st…}` });
const out = (owner: string, amount: number) => ({ topic_0: "WITHDRAW", topics: ["total"], data: `{amount: ${amount}, owner: ${owner}}` });
const G1 = "GCKEHPAZCAIERF775J6O4U3HUWIT2FVFODQECWIXEZQJ2QQX63AHTZ2Q";
const G2 = "GCAIBLIFVVHTNWFIYF6FPMOSPNAIHB7BZPFA6HI5F56WT57XAGA7OBDA";

test("replayPrincipal: Sentora deposits less withdrawals, per owner", () => {
  assert.deepEqual(replayPrincipal([create(G1, 100), create(G2, 50), out(G1, 100), create(G1, 7)]), { holders: 2, total: 57n });
  assert.deepEqual(replayPrincipal([create(G1, 100), out(G1, 100)]), { holders: 0, total: 0n });
});

test("replayPrincipal: an event without an owner fails rather than giving a wrong count", () => {
  assert.throws(() => replayPrincipal([{ topic_0: "DEPOSIT", topics: ["create"], data: "{amount: 5}" }]));
});
