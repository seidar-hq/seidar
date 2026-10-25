import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeRoutes, type RawTrade } from "../src/swap-route.js";

// Real mainnet quotes paired with the routes argument Soroswap's own
// /quote/build produced for them (captured 2026-10-15). Seidar's encoder
// must reproduce it byte for byte, or smart-account swaps would route wrong.
const fixtures = JSON.parse(
  readFileSync(new URL("../../test/fixtures/swap-routes.json", import.meta.url), "utf8"),
) as { note: string; rawTrade: RawTrade; routesXdr: string }[];

describe("smart-account swap routes", () => {
  for (const f of fixtures) {
    it(`matches the aggregator encoding: ${f.note}`, async () => {
      assert.equal((await encodeRoutes(f.rawTrade)).toXDR("base64"), f.routesXdr);
    });
  }

  it("refuses hops it cannot encode", async () => {
    await assert.rejects(
      encodeRoutes({
        distribution: [
          { share: "1", hops: [{ protocol: "sdex", poolId: "", tokenIn: "", tokenOut: "" }] },
        ],
      }),
    );
  });
});
