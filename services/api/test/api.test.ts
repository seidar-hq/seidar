import { describe, it } from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.js";

describe("api", () => {
  it("health responds", async () => {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("rejects /prices without codes", async () => {
    const res = await app.request("/prices");
    assert.equal(res.status, 400);
  });

  it("rejects unknown pool protocol", async () => {
    const res = await app.request("/pools?protocol=nope");
    assert.equal(res.status, 400);
  });

  it("rejects bad positions address", async () => {
    const res = await app.request("/positions?address=bogus");
    assert.equal(res.status, 400);
  });

  it("rejects bad balances address", async () => {
    const res = await app.request("/balances?address=bogus");
    assert.equal(res.status, 400);
  });

  it("rejects bad balance address", async () => {
    const res = await app.request("/balance?address=bogus");
    assert.equal(res.status, 400);
  });

  it("rejects unknown vault protocol", async () => {
    const res = await app.request("/vaults?protocol=nope");
    assert.equal(res.status, 400);
  });

  it("rejects unknown dex protocol", async () => {
    const res = await app.request("/dex/pools?protocol=nope");
    assert.equal(res.status, 400);
  });

  it("rejects dex pools without a protocol", async () => {
    const res = await app.request("/dex/pools");
    assert.equal(res.status, 400);
  });

  it("documents the SSE route for balances", async () => {
    const res = await app.request(
      "/balances/stream?address=GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; sse: string };
    assert.equal(body.ok, true);
    assert.match(body.sse, /horizon\.stellar\.org/);
  });

  it("rejects blend builds without pool/from", async () => {
    const res = await app.request("/blend/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool: "nope", from: "bogus", requests: [] }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it("rejects blend builds with bad requests", async () => {
    const res = await app.request("/blend/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pool: "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD",
        from: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        requests: [{ type: "mint", asset: "nope", amount: "0" }],
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /type=supply/);
  });

  it("rejects portfolio history for a bad wallet", async () => {
    const res = await app.request("/portfolio/history?wallet=bogus");
    assert.equal(res.status, 400);
  });

  it("serves portfolio history shape without a DB", async () => {
    const res = await app.request(
      "/portfolio/history?wallet=GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, false);
  });

  it("rejects price history without a code", async () => {
    const res = await app.request("/prices/history");
    assert.equal(res.status, 400);
  });

  it("rejects price history for a bad code", async () => {
    const res = await app.request("/prices/history?code=!!!");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, false);
  });
});
