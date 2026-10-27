import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { jsonSafe } from "../src/rpc.js";

// /tx/send returned HTTP 500 after successful swaps and vault deposits: their return values are
// i128 amounts, scValToNative turns those into BigInt, and the JSON reply could not be serialized.
describe("tx/send return values", () => {
  it("serializes 128-bit amounts (swap / vault deposit results)", () => {
    const rv = scValToNative(xdr.ScVal.scvVec([nativeToScVal(123456789012345678901234n, { type: "i128" }), nativeToScVal(5n, { type: "i128" })]));
    assert.throws(() => JSON.stringify(rv));
    assert.equal(JSON.stringify({ ok: true, returnValue: jsonSafe(rv) }), '{"ok":true,"returnValue":["123456789012345678901234","5"]}');
  });

  it("converts maps and nested values, leaves plain values alone", () => {
    const rv = scValToNative(
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: nativeToScVal("shares", { type: "symbol" }), val: nativeToScVal(42n, { type: "u128" }) }),
        new xdr.ScMapEntry({ key: nativeToScVal("ok", { type: "symbol" }), val: nativeToScVal(true) }),
      ]),
    );
    assert.deepEqual(jsonSafe(rv), { shares: "42", ok: true });
    assert.equal(jsonSafe(null), null);
    assert.equal(jsonSafe(7), 7);
  });
});
