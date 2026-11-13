import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cacheSet } from "@seidar/cache";
import { MIN_SPAN_MS, poolIndexApys, recordPoolIndexes, recordSushiGrowth, sushiGrowthApys } from "../src/pool-apy.js";

const H = 3600_000;
const D = 24 * H;
const POOL = "CC7CDFY2VGDODJ7WPO3JIK2MXLOAXL4LRQCC43UJDBAIJ4SVFO3HNPOC";

describe("realised LP fee APY (pool-apy)", () => {
  it("annualises the growth of sqrt(r0*r1)/shares with compounding", async () => {
    const now = Date.now();
    // +0.1% over exactly one day -> (1.001)^365 - 1 = 44.03%
    await cacheSet("poolapy:v1:soroswap", { at: now, pools: { [POOL]: [[now - D, 1], [now, 1.001]] } }, 9 * D);
    const apy = (await poolIndexApys("soroswap")).get(POOL);
    assert.ok(apy);
    assert.ok(Math.abs(apy.apyPct - 44.03) < 0.05, `got ${apy.apyPct}`);
    assert.ok(Math.abs(apy.spanDays - 1) < 1e-9);
  });

  it("uses the oldest snapshot inside 7 days, ignores older ones", async () => {
    const now = Date.now();
    await cacheSet(
      "poolapy:v1:phoenix",
      { at: now, pools: { [POOL]: [[now - 10 * D, 0.5], [now - 7 * D + H, 1], [now, 1.007]] } },
      9 * D,
    );
    const apy = (await poolIndexApys("phoenix")).get(POOL);
    assert.ok(apy);
    // ~0.7% over ~6.96 days -> ~44.4% (the 10-day-old point would have given a huge number)
    assert.ok(apy.apyPct > 40 && apy.apyPct < 50, `got ${apy.apyPct}`);
  });

  it("shows nothing until a pool has enough history, and never a negative yield", async () => {
    const now = Date.now();
    await cacheSet(
      "poolapy:v1:soroswap",
      { at: now, pools: { young: [[now - MIN_SPAN_MS + H, 1], [now, 1.01]], down: [[now - 2 * D, 1], [now, 0.999]] } },
      9 * D,
    );
    const m = await poolIndexApys("soroswap");
    assert.equal(m.get("young"), undefined);
    assert.equal(m.get("down")?.apyPct, 0);
  });

  it("reads reserves and shares at one moment, skips dust pools, and waits an hour between snapshots", async () => {
    await cacheSet("poolapy:v1:soroswap", { at: 0, pools: {} }, 9 * D);
    const calls: string[] = [];
    const view = async (c: string, m: string) => {
      calls.push(`${c}:${m}`);
      if (m === "get_reserves") return ["2739894164331", "2498468367924"];
      if (m === "total_supply") return "2525197836478";
      throw new Error("unexpected " + m);
    };
    await recordPoolIndexes("soroswap", [{ address: POOL, tvlUsd: 500_000 }, { address: "dust", tvlUsd: 3 }], view);
    assert.deepEqual(calls.sort(), [`${POOL}:get_reserves`, `${POOL}:total_supply`]);
    const again: string[] = [];
    await recordPoolIndexes("soroswap", [{ address: POOL, tvlUsd: 500_000 }], async (c, m) => {
      again.push(m);
      return null;
    });
    assert.equal(again.length, 0, "a second snapshot within the hour reads nothing");
    // The stored index is sqrt(r0*r1)/supply.
    const { cacheGetEntry } = await import("@seidar/cache");
    const st = (await cacheGetEntry<{ pools: Record<string, [number, number][]> }>("poolapy:v1:soroswap"))?.value;
    const idx = st?.pools[POOL]?.[0]?.[1] ?? 0;
    assert.ok(Math.abs(idx - Math.sqrt(2739894164331 * 2498468367924) / 2525197836478) < 1e-12);
  });

  it("reads Phoenix pools in one call (query_pool_info)", async () => {
    await cacheSet("poolapy:v1:phoenix", { at: 0, pools: {} }, 9 * D);
    const calls: string[] = [];
    await recordPoolIndexes("phoenix", [{ address: POOL, tvlUsd: 10_000 }], async (_c, m) => {
      calls.push(m);
      return { asset_a: { amount: "212361014937" }, asset_b: { amount: "5425834039972" }, asset_lp_share: { amount: "1025197055025" } };
    });
    assert.deepEqual(calls, ["query_pool_info"]);
  });

  it("Sushi: realised fees from fee growth x active liquidity, over TVL", async () => {
    const now = Date.now();
    const Q128 = 2n ** 128n;
    const L = 1_000_000_000_000n;
    // 274 USDC (7 decimals) of fees in token0 over one day on a $1M pool -> (1 + 0.000274)^365 - 1 = 10.52%
    const dg = (2_740_000_000n * Q128) / L;
    await cacheSet("poolapy:v1:sushi", { at: now, pools: { P: [[now - D, "1000", "5", L.toString()], [now, (1000n + dg).toString(), "5", L.toString()]] } }, 9 * D);
    const m = await sushiGrowthApys((a) => (a === "P" ? { tvlUsd: 1_000_000, tokens: [{ decimals: 7, priceUsd: 1 }, { decimals: 7, priceUsd: 0.15 }] } : null));
    const apy = m.get("P");
    assert.ok(apy, "has an APY");
    assert.ok(Math.abs(apy.apyPct - 10.52) < 0.05, `got ${apy.apyPct}`);
    // An unpriced token means no figure rather than a wrong one.
    const none = await sushiGrowthApys(() => ({ tvlUsd: 1_000_000, tokens: [{ decimals: 7, priceUsd: null }, { decimals: 7, priceUsd: 1 }] }));
    assert.equal(none.get("P"), undefined);
  });

  it("Sushi: snapshots read fee growth for both tokens and the active liquidity", async () => {
    await cacheSet("poolapy:v1:sushi", { at: 0, pools: {} }, 9 * D);
    const calls: string[] = [];
    await recordSushiGrowth([{ address: "P", tvlUsd: 600_000 }, { address: "dust", tvlUsd: 9 }], async (c, m) => {
      calls.push(`${c}:${m}`);
      return m === "liquidity" ? "38286314908910" : ["3977313853071382405468496300517764"];
    });
    assert.deepEqual(calls.sort(), ["P:fee_growth_global_0_x128", "P:fee_growth_global_1_x128", "P:liquidity"]);
  });
});
