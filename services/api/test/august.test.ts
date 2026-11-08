import { test } from "node:test";
import assert from "node:assert/strict";
import { augustApy, augustPoints } from "../src/august.js";

test("augustApy: the published fraction as a percent, else nothing to show without history", () => {
  assert.equal(augustApy({ "7": 0.05, "30": 0.04 }, 7, []), 5);
  assert.equal(augustApy({ "7": 0.05, "30": 0.04 }, 30, []), 4);
  assert.equal(augustApy(null, 7, []), null);
  assert.equal(augustApy({ "7": null }, 7, []), null);
});

test("augustPoints: oldest first, UTC, without the pre-deposit snapshots", () => {
  const points = augustPoints([
    { snapshot_datetime: "2026-11-02T00:00:00", asset_share_ratio: 1.02, total_shares: 100 },
    { snapshot_datetime: "2026-11-01T00:00:00", asset_share_ratio: 1.01, total_shares: 100 },
    { snapshot_datetime: "2026-05-18T16:01:27", asset_share_ratio: 1, total_shares: 0 },
  ]);
  assert.deepEqual(points, [
    { t: Date.UTC(2026, 10, 1), pps: 1.01 },
    { t: Date.UTC(2026, 10, 2), pps: 1.02 },
  ]);
});

test("augustPoints: anything malformed is dropped, not guessed", () => {
  assert.deepEqual(augustPoints(undefined), []);
  assert.deepEqual(augustPoints([{ snapshot_datetime: "nope", asset_share_ratio: 1.1, total_shares: 5 }, { snapshot_datetime: "2026-11-01T00:00:00", asset_share_ratio: "x", total_shares: 5 }, null]), []);
});
