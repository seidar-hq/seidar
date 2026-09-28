import test from "node:test";
import assert from "node:assert/strict";
import { theme, healthColor } from "../src/index.js";

test("canonical black + shell dims", () => {
  assert.equal(theme.black, "#000000");
  assert.equal(theme.sidebarW, 60);
  assert.equal(theme.sidebarWOpen, 212);
  assert.equal(theme.topbarH, 52);
});

test("health colors follow tiers", () => {
  assert.equal(healthColor(18200), theme.green);
  assert.equal(healthColor(13500), theme.amber);
  assert.equal(healthColor(11000), theme.red);
  assert.equal(healthColor(null), theme.muted);
});
