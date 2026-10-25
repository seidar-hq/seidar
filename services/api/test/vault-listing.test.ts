import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defindexRow, MIN_VAULT_TVL_USD } from "../src/vaults-list.js";
import type { DfVault } from "../src/defindex-catalog.js";

const ADDR = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

function vault(name: string, tvlUsd: number | null, totalBase = "1000000000"): DfVault {
  return {
    index: 0,
    address: ADDR,
    name,
    symbol: "X",
    legs: [
      {
        asset: ADDR,
        code: "USDC",
        decimals: 7,
        totalBase,
        idleBase: "0",
        investedBase: totalBase,
        priceUsd: tvlUsd == null ? null : 1,
        tvlUsd,
        strategies: [],
      },
    ],
    totalSupply: totalBase,
    tvlUsd,
    idleUsd: 0,
    feesBps: null,
    apyPct: 5,
    sharePrice: 1,
    updatedAt: 0,
  };
}

describe("vault listing", () => {
  it("lists funded vaults whatever their name looks like", () => {
    // Regression: a name heuristic once hid these real mainnet vaults.
    for (const name of ["BeansUsdcVault", "CashAbroadUSDC", "Demo vault", "TurboTestVault"]) {
      assert.ok(defindexRow(vault(name, 355_000)), name);
    }
  });

  it("drops dust, empty and unpriced vaults", () => {
    assert.equal(defindexRow(vault("Neko", MIN_VAULT_TVL_USD - 0.01)), null);
    assert.equal(defindexRow(vault("Neko", 0, "0")), null);
    assert.equal(defindexRow(vault("Neko", null)), null);
    assert.ok(defindexRow(vault("Neko", MIN_VAULT_TVL_USD)));
  });
});
