import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAssets, type SeAsset } from "../src/market.js";

const USDC = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const BENJI = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";

const rec = (asset: string, extra: Partial<SeAsset> = {}): SeAsset => ({
  asset,
  domain: "example.org",
  price: 1,
  supply: "10000000000",
  volume7d: 50_000_000,
  price7d: [
    [1, 1],
    [2, 1.02],
  ],
  trustlines: { funded: 10 },
  rating: { average: 8 },
  ...extra,
});

describe("market assets", () => {
  it("tags registered issuers and drops look-alikes of their codes", () => {
    const rows = buildAssets([
      rec(`USDC-${USDC}-1`),
      rec("USDC-GDIEKKIQWMIZ4LD3RP3ABPN7X5KEAEWYMR634BRHB7EULIMEVREWLF3G-2", { rating: { average: 9 } }),
      rec("USDCAllow-GDIEKKIQWMIZ4LD3RP3ABPN7X5KEAEWYMR634BRHB7EULIMEVREWLF3G-2", { rating: { average: 6.3 } }),
    ]);
    assert.deepEqual(
      rows.map((r) => [r.code, r.cats]),
      [["USDC", ["stable"]]],
    );
  });

  it("lists unregistered assets as other only when rated, named and priced", () => {
    const rows = buildAssets([
      rec("GOOD-GBX6YI45VU7WNAAKA3RBFDR3I3UKNFHTJPQ5F6KOOKSGYIAM4TRQN54W-1"),
      rec("ANON-GBX6YI45VU7WNAAKA3RBFDR3I3UKNFHTJPQ5F6KOOKSGYIAM4TRQN54W-1", { domain: undefined }),
      rec("LOW-GBX6YI45VU7WNAAKA3RBFDR3I3UKNFHTJPQ5F6KOOKSGYIAM4TRQN54W-1", { rating: { average: 6.8 } }),
      rec("FREE-GBX6YI45VU7WNAAKA3RBFDR3I3UKNFHTJPQ5F6KOOKSGYIAM4TRQN54W-1", { price: 0 }),
    ]);
    assert.deepEqual(
      rows.map((r) => [r.code, r.cats]),
      [["GOOD", ["other"]]],
    );
  });

  it("prices NAV funds without a market price and computes market cap", () => {
    const [benji] = buildAssets([rec(`BENJI-${BENJI}-2`, { price: 0, price7d: null, supply: "5277840383233727" })]);
    assert.equal(benji.price, 1);
    assert.equal(benji.priceSource, "nav");
    assert.deepEqual(benji.cats, ["rwa", "yield"]);
    assert.equal(Math.round(benji.marketCap ?? 0), 527_784_038);
  });

  it("uses the given XLM market cap, not total supply", () => {
    const [xlm] = buildAssets([rec("XLM", { supply: "1054439020873472865", price: 0.16 })], { xlmMarketCap: 5e9 });
    assert.equal(xlm.marketCap, 5e9);
    assert.equal(xlm.name, "Stellar Lumens");
  });
});
