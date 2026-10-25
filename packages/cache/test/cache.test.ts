import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cacheGet,
  cacheSet,
  withCache,
  rateLimit,
  KEYS,
} from "../src/index.js";

describe("cache", () => {
  it("round-trips memory entries without redis", async () => {
    await cacheSet("t:key", { a: 1 }, 60_000);
    assert.deepEqual(await cacheGet("t:key"), { a: 1 });
  });

  it("single-flights concurrent misses", async () => {
    let calls = 0;
    const key = `t:flight:${Date.now()}`;
    const loader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { n: 1 };
    };
    const [a, b] = await Promise.all([
      withCache(key, 60_000, loader),
      withCache(key, 60_000, loader),
    ]);
    assert.deepEqual(a.value, { n: 1 });
    assert.deepEqual(b.value, { n: 1 });
    assert.equal(calls, 1);
  });

  it("keeps last-good on loader failure", async () => {
    const key = `t:klg:${Date.now()}`;
    await cacheSet(key, "good", 60_000);
    const out = await withCache<string>(key, 0, async () => {
      throw new Error("upstream down");
    });
    assert.equal(out.value, "good");
    assert.equal(out.stale, true);
  });

  it("rate-limits over the window", () => {
    const key = `t:rl:${Date.now()}`;
    assert.equal(rateLimit(key, 2, 60_000).ok, true);
    assert.equal(rateLimit(key, 2, 60_000).ok, true);
    assert.equal(rateLimit(key, 2, 60_000).ok, false);
  });

  it("builds scoped keys", () => {
    assert.equal(KEYS.pool("Blend"), "pools:blend");
    assert.equal(KEYS.priceSpot("xlm"), "prices:spot:XLM");
  });
});
