import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyAdjustments,
  DEFAULT_ADJUSTMENTS,
  isAnalyticsAdmin,
  sanitizeAdjustments,
  type AnalyticsSummary,
  type WindowStats,
} from "../src/analytics.js";

const win = (volumeUsd: number, txs: number, transactingWallets: number, newWallets: number, activeWallets: number): WindowStats => ({
  volumeUsd,
  txs,
  transactingWallets,
  newWallets,
  activeWallets,
  byKind: [{ kind: "swap", txs, volumeUsd }],
  byProtocol: [{ protocol: "soroswap", txs, volumeUsd }],
});

const fixture = (): AnalyticsSummary => ({
  generatedAt: "2026-01-03T00:00:00.000Z",
  since: "2026-01-01",
  totals: { volumeUsd: 30, txs: 3, transactingWallets: 2, wallets: 3, active1d: 1, active7d: 3, active30d: 3 },
  byKind: [{ kind: "swap", txs: 3, volumeUsd: 30 }],
  byProtocol: [{ protocol: "soroswap", txs: 3, volumeUsd: 30 }],
  daily: [
    { day: "2026-01-01", txs: 1, volumeUsd: 10, transactingWallets: 1, newWallets: 1, activeWallets: 1, totalWallets: 1 },
    { day: "2026-01-02", txs: 1, volumeUsd: 10, transactingWallets: 1, newWallets: 1, activeWallets: 1, totalWallets: 2 },
    { day: "2026-01-03", txs: 1, volumeUsd: 10, transactingWallets: 1, newWallets: 1, activeWallets: 1, totalWallets: 3 },
  ],
  recent: [
    { hash: "a".repeat(64), kind: "swap", protocol: "soroswap", volumeUsd: 10, at: "2026-01-03T00:00:00.000Z" },
    { hash: "b".repeat(64), kind: "swap", protocol: "soroswap", volumeUsd: 10, at: "2026-01-02T00:00:00.000Z" },
    { hash: "c".repeat(64), kind: "swap", protocol: "soroswap", volumeUsd: 10, at: "2026-01-01T00:00:00.000Z" },
  ],
  coverage: { lendPools: null, lendMarkets: null, lendTvlUsd: null, dexPools: null, dexTvlUsd: null, vaults: null, vaultTvlUsd: null, perpsMarkets: null },
  windows: {
    all: win(30, 3, 2, 3, 3),
    "30d": win(30, 3, 2, 3, 3),
    "7d": win(30, 3, 2, 3, 3),
    "24h": win(10, 1, 1, 1, 1),
  },
  hourly: Array.from({ length: 24 }, (_, i) => ({ hour: `2026-01-03T${String(i).padStart(2, "0")}`, txs: i === 0 ? 1 : 0, volumeUsd: i === 0 ? 10 : 0, transactingWallets: i === 0 ? 1 : 0 })),
});

const sums = (rows: { txs: number }[]) => rows.reduce((s, r) => s + r.txs, 0);

describe("analytics adjustments", () => {
  const original = process.env.ANALYTICS_ADMIN_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.ANALYTICS_ADMIN_TOKEN;
    else process.env.ANALYTICS_ADMIN_TOKEN = original;
  });

  it("sanitizes owner input and keeps only known fields", () => {
    const p = sanitizeAdjustments({
      enabled: false,
      volumeX: 1e9,
      txAdd: -5.6,
      recentRows: 99,
      kindMix: { swap: -2, nope: 5 },
      protocolMix: { soroswap: 12, nope: 5 },
    });
    assert.equal(p.enabled, false);
    assert.equal(p.volumeX, 1000);
    assert.equal(p.txAdd, -6);
    assert.equal(p.recentRows, 25);
    assert.equal(p.kindMix.swap, 0);
    assert.equal(p.kindMix.nope, undefined);
    assert.equal(p.protocolMix.soroswap, 12);
    assert.equal(p.protocolMix.nope, undefined);
    assert.deepEqual(sanitizeAdjustments(null), DEFAULT_ADJUSTMENTS);
  });

  it("closes admin routes without a configured long token", () => {
    delete process.env.ANALYTICS_ADMIN_TOKEN;
    assert.equal(isAnalyticsAdmin("Bearer 0123456789abcdef"), false);
    process.env.ANALYTICS_ADMIN_TOKEN = "short";
    assert.equal(isAnalyticsAdmin("Bearer short"), false);
    process.env.ANALYTICS_ADMIN_TOKEN = "0123456789abcdef";
    assert.equal(isAnalyticsAdmin("Bearer 0123456789abcdef"), true);
    assert.equal(isAnalyticsAdmin("Bearer 0123456789abcdee"), false);
    assert.equal(isAnalyticsAdmin(undefined), false);
  });

  it("default adjustments return the measured summary", () => {
    const real = fixture();
    const out = applyAdjustments(real, DEFAULT_ADJUSTMENTS);
    assert.deepEqual(out.totals, real.totals);
    assert.deepEqual(out.windows, real.windows);
    assert.deepEqual(out.daily, real.daily);
    assert.deepEqual(out.hourly, real.hourly);
    assert.equal(out.recent.length, 3);
  });

  it("keeps the UTC-day active total separate from the rolling 24h window", () => {
    const real = fixture();
    real.windows["24h"] = win(10, 1, 1, 1, 2);
    const out = applyAdjustments(real, DEFAULT_ADJUSTMENTS);
    assert.equal(out.totals.active1d, 1);
    assert.equal(out.windows["24h"].activeWallets, 2);
  });

  it("keeps scaled daily transaction counts aligned with the totals", () => {
    const real = fixture();
    const out = applyAdjustments(real, { ...DEFAULT_ADJUSTMENTS, txX: 0.5 });
    const total = out.daily.reduce((s, d) => s + d.txs, 0);
    assert.equal(total, Math.round(real.daily.reduce((s, d) => s + d.txs, 0) * 0.5));
    assert.equal(total, out.totals.txs);
    assert.equal(total, out.windows.all.txs);
  });

  it("keeps breakdown transaction counts aligned when scaling to fractions", () => {
    const real = fixture();
    real.windows.all = {
      volumeUsd: 30,
      txs: 3,
      transactingWallets: 2,
      newWallets: 3,
      activeWallets: 3,
      byKind: [
        { kind: "swap", txs: 1, volumeUsd: 10 },
        { kind: "lending", txs: 1, volumeUsd: 10 },
        { kind: "other", txs: 1, volumeUsd: 10 },
      ],
      byProtocol: [
        { protocol: "soroswap", txs: 1, volumeUsd: 10 },
        { protocol: "blend", txs: 1, volumeUsd: 10 },
        { protocol: "other", txs: 1, volumeUsd: 10 },
      ],
    };
    const out = applyAdjustments(real, { ...DEFAULT_ADJUSTMENTS, txX: 0.5 });
    assert.equal(out.windows.all.txs, 2);
    assert.equal(sums(out.windows.all.byKind), 2);
    assert.equal(sums(out.windows.all.byProtocol), 2);
  });

  it("keeps today's active wallets at least today's new wallets", () => {
    const out = applyAdjustments(fixture(), { ...DEFAULT_ADJUSTMENTS, walletAdd: 100, historyDays: 1 });
    assert.equal(out.daily.at(-1)?.newWallets, 101);
    assert.equal(out.daily.at(-1)?.activeWallets, out.totals.active1d);
    assert.ok(out.totals.active1d >= 101);
  });

  it("returns the measured summary untouched when disabled", () => {
    const real = fixture();
    const disabled = sanitizeAdjustments({ ...DEFAULT_ADJUSTMENTS, enabled: false, volumeAdd: 1e9 });
    assert.equal(applyAdjustments(real, disabled), real);
  });

  it("moves every section when a real transaction is added", () => {
    const before = applyAdjustments(fixture(), DEFAULT_ADJUSTMENTS);
    const real = fixture();
    real.totals = { ...real.totals, volumeUsd: 130, txs: 4, wallets: 4, active1d: 2, active7d: 4, active30d: 4 };
    real.windows.all = win(130, 4, 3, 4, 4);
    real.windows["30d"] = win(130, 4, 3, 4, 4);
    real.windows["7d"] = win(130, 4, 3, 4, 4);
    real.daily[2] = { ...real.daily[2], txs: 2, volumeUsd: 110, newWallets: 2, totalWallets: 4 };
    real.daily.push({ day: "2026-01-04", txs: 0, volumeUsd: 0, transactingWallets: 0, newWallets: 0, activeWallets: 1, totalWallets: 4 });
    const after = applyAdjustments(real, DEFAULT_ADJUSTMENTS);
    assert.equal(after.totals.txs, before.totals.txs + 1);
    assert.equal(after.totals.volumeUsd, before.totals.volumeUsd + 100);
    assert.equal(after.totals.wallets, before.totals.wallets + 1);
    assert.equal(after.windows.all.byKind[0].txs, before.windows.all.byKind[0].txs + 1);
  });

  it("keeps multi-category breakdowns coherent when additions and removals are mixed", () => {
    const real = fixture();
    const rows = () => ({
      byKind: [
        { kind: "swap", txs: 40, volumeUsd: 400 },
        { kind: "lending", txs: 30, volumeUsd: 300 },
        { kind: "other", txs: 30, volumeUsd: 300 },
      ],
      byProtocol: [
        { protocol: "soroswap", txs: 40, volumeUsd: 400 },
        { protocol: "aquarius", txs: 10, volumeUsd: 100 },
        { protocol: "blend", txs: 30, volumeUsd: 300 },
        { protocol: "other", txs: 20, volumeUsd: 200 },
      ],
    });
    real.windows.all = { volumeUsd: 1000, txs: 100, transactingWallets: 50, newWallets: 3, activeWallets: 3, ...rows() };
    real.windows["30d"] = { volumeUsd: 1000, txs: 100, transactingWallets: 50, newWallets: 3, activeWallets: 3, ...rows() };
    real.windows["7d"] = { volumeUsd: 1000, txs: 100, transactingWallets: 50, newWallets: 3, activeWallets: 3, ...rows() };
    real.windows["24h"] = { volumeUsd: 1000, txs: 100, transactingWallets: 50, newWallets: 1, activeWallets: 1, ...rows() };

    for (const p of [
      { volumeAdd: 500, txAdd: -50 },
      { volumeAdd: -500, txAdd: 50 },
      { volumeAdd: -5000, txAdd: -5000 },
      { volumeAdd: 5000, txAdd: 5000 },
    ]) {
      const out = applyAdjustments(real, { ...DEFAULT_ADJUSTMENTS, ...p });
      for (const id of ["all", "30d", "7d", "24h"] as const) {
        const w = out.windows[id];
        assert.equal(sums(w.byKind), w.txs);
        assert.equal(sums(w.byProtocol), w.txs);
        assert.ok(Math.abs(w.byKind.reduce((s, r) => s + r.volumeUsd, 0) - w.volumeUsd) < 1e-6);
        assert.ok(Math.abs(w.byProtocol.reduce((s, r) => s + r.volumeUsd, 0) - w.volumeUsd) < 1e-6);
        assert.ok(w.byKind.every((r) => r.txs >= 0 && r.volumeUsd >= 0));
        assert.ok(w.byProtocol.every((r) => r.txs >= 0 && r.volumeUsd >= 0));
      }
    }
  });

  it("keeps breakdowns, wallet series and filters coherent under negative mixes", () => {
    const real = fixture();
    const out = applyAdjustments(real, {
      ...DEFAULT_ADJUSTMENTS,
      volumeAdd: -1000,
      txAdd: -1000,
      walletX: 0.1,
      walletAdd: -100,
      transactingShare: 0.9,
      active30Share: 0.9,
      active7Share: 0.9,
      active1Share: 0.9,
      recentRows: 1,
      kindMix: { swap: 0, lending: 100 },
      protocolMix: { blend: 100 },
    });
    for (const id of ["all", "30d", "7d", "24h"] as const) {
      const w = out.windows[id];
      assert.equal(sums(w.byKind), w.txs);
      assert.equal(sums(w.byProtocol), w.txs);
      assert.ok(w.transactingWallets <= w.txs);
      assert.ok(w.transactingWallets <= w.activeWallets);
      assert.ok(w.activeWallets <= out.totals.wallets);
    }
    assert.equal(out.daily.at(-1)?.totalWallets, out.totals.wallets);
    assert.equal(out.windows.all.txs, out.totals.txs);
    assert.equal(out.windows.all.volumeUsd, out.totals.volumeUsd);
    assert.equal(out.windows.all.transactingWallets, out.totals.transactingWallets);
    assert.equal(out.windows["30d"].activeWallets, out.totals.active30d);
    assert.equal(out.windows["7d"].activeWallets, out.totals.active7d);
    assert.ok(out.windows["24h"].activeWallets <= out.windows["7d"].activeWallets);
    assert.ok(out.daily.every((d) => d.txs >= 0 && d.volumeUsd >= 0 && d.newWallets >= 0 && d.activeWallets >= 0));
    assert.equal(out.recent.length, 1);
    assert.equal(real.recent.length, 3);
    assert.deepEqual(real.totals, fixture().totals);
  });
});
