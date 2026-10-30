import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cacheGet,
  cacheSet,
  withCache,
  rateLimit,
  KEYS,
  setFlightMaxMs,
  runInBackground,
  backgroundMark,
  drainBackground,
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

  // A Worker cancels the I/O of a finished request, so a loader it started may never settle.
  // Later callers must not wait on it forever (2026-10-30: the app sat on 0.00 for minutes).
  it("replaces a shared loader that never settles", async () => {
    setFlightMaxMs(50);
    try {
      const key = `t:dead:${Date.now()}`;
      void withCache(key, 60_000, () => new Promise<never>(() => {}));
      const t0 = Date.now();
      const out = await withCache(key, 60_000, async () => "fresh");
      assert.equal(out.value, "fresh");
      assert.ok(Date.now() - t0 < 1_000);
    } finally {
      setFlightMaxMs(5 * 60_000);
    }
  });

  it("drains only background work started after the mark", async () => {
    runInBackground(new Promise<never>(() => {}));
    const mark = backgroundMark();
    let ran = false;
    runInBackground(new Promise<void>((r) => setTimeout(() => ((ran = true), r()), 10)));
    await drainBackground(mark);
    assert.equal(ran, true);
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
