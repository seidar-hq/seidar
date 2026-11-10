import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeStrategyPayloadToRouteXdr } from "@xoxno/sdk-js/stellar-lending";
import { DEFAULT_XOXNO_REFERRAL_ID, quoteSwap, xoxnoQuote } from "../src/swap.js";
import { withNetwork } from "../src/net.js";

const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const POOL = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";

function route(venue: "Sushi" | "Curve", referralId = DEFAULT_XOXNO_REFERRAL_ID, totalMinOut = "990000") {
  return encodeStrategyPayloadToRouteXdr({
    tokenIn: XLM,
    tokenOut: USDC,
    totalMinOut,
    referralId,
    paths: [{ splitPpm: 1_000_000, hops: [{ pool: POOL, tokenIn: XLM, tokenOut: USDC, venue }] }],
  });
}

function response(
  routeXdr: string,
  amountOutMin = "990000",
  amountIn = "1000000",
  amountOut = "1000000",
) {
  return {
    platform: "aggregator",
    amountIn,
    amountOut,
    amountOutMin,
    priceImpact: 0.0012, // a fraction: 0.12%
    routeXdr,
    feeBps: 0,
    paths: [
      {
        splitPpm: 1_000_000,
        swaps: [{ dex: "Sushi", address: POOL, from: XLM, to: USDC, amountIn, amountOut }],
      },
    ],
  };
}

async function withFetch(payload: unknown, fn: () => Promise<void>, onRequest?: (url: URL) => void) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    onRequest?.(new URL(String(input)));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
}

async function withBothFetch(soroOut: string, xoxno: ReturnType<typeof response>, fn: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const payload =
      url.hostname === "api.soroswap.finance"
        ? {
            assetIn: XLM,
            assetOut: USDC,
            tradeType: "EXACT_IN",
            amountIn: xoxno.amountIn,
            amountOut: soroOut,
            otherAmountThreshold: "1",
            priceImpactPct: "0.10",
            platform: "aggregator",
          }
        : xoxno;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
}

describe("XOXNO quote normalization", () => {
  it("uses referral id 2 in the quote request and verifies the encoded route", async () => {
    let requestedReferralId = "";
    await withFetch(
      response(route("Sushi")),
      async () => {
        const q = await xoxnoQuote({ assetIn: XLM, assetOut: USDC, amount: "1000000", referralId: 2 });
        assert.equal(q.provider, "xoxno");
        assert.equal(q.amountOut, "1000000");
        assert.equal(q.otherAmountThreshold, "990000");
        assert.equal(q.priceImpactPct, "0.12"); // fraction 0.0012 -> percent
        assert.deepEqual(q.routePlan, [
          { swapInfo: { protocol: "sushi", path: [XLM, USDC] }, percent: "100.00" },
        ]);
        assert.equal((q.xoxno as { referralId: number }).referralId, 2);
      },
      (url) => {
        requestedReferralId = url.searchParams.get("referralId") ?? "";
      },
    );
    assert.equal(requestedReferralId, "2");
  });

  it("rejects Curve routes", async () => {
    await withFetch(response(route("Curve")), async () => {
      await assert.rejects(
        xoxnoQuote({ assetIn: XLM, assetOut: USDC, amount: "1000000", referralId: 2 }),
        /Curve/,
      );
    });
  });

  it("rejects a route whose encoded minimum is below the displayed one", async () => {
    await withFetch(response(route("Sushi", 2, "900000"), "990000"), async () => {
      await assert.rejects(
        xoxnoQuote({ assetIn: XLM, assetOut: USDC, amount: "1000000", referralId: 2 }),
        /MIN_OUT_TOO_LOW|minimum/i,
      );
    });
  });

  it("rejects an unexpected referral id", async () => {
    await withFetch(response(route("Sushi", 7)), async () => {
      await assert.rejects(
        xoxnoQuote({ assetIn: XLM, assetOut: USDC, amount: "1000000", referralId: 2 }),
        /referral id/,
      );
    });
  });

  it("serves XOXNO when Soroswap has no API key", async () => {
    const prevKey = process.env.SOROSWAP_API_KEY;
    delete process.env.SOROSWAP_API_KEY;
    try {
      await withNetwork("mainnet", () =>
        withFetch(response(route("Sushi")), async () => {
          const r = await quoteSwap({ assetIn: XLM, assetOut: USDC, amount: "1000000", slippageBps: "50" });
          assert.equal(r.body.ok, true);
          assert.equal((r.body.quote as { provider?: string } | undefined)?.provider, "xoxno");
        }),
      );
    } finally {
      if (prevKey === undefined) delete process.env.SOROSWAP_API_KEY;
      else process.env.SOROSWAP_API_KEY = prevKey;
    }
  });

  it("picks XOXNO when its net output is higher", async () => {
    const prevKey = process.env.SOROSWAP_API_KEY;
    process.env.SOROSWAP_API_KEY = "test-key";
    try {
      const amount = "1000002";
      await withNetwork("mainnet", () =>
        withBothFetch("900000", response(route("Sushi"), "990000", amount), async () => {
          const r = await quoteSwap({ assetIn: XLM, assetOut: USDC, amount, slippageBps: "50" });
          const q = r.body.quote as { provider?: string; amountOut?: string } | undefined;
          assert.equal(r.body.ok, true);
          assert.equal(q?.provider, "xoxno");
          assert.equal(q?.amountOut, "1000000");
        }),
      );
    } finally {
      if (prevKey === undefined) delete process.env.SOROSWAP_API_KEY;
      else process.env.SOROSWAP_API_KEY = prevKey;
    }
  });

  it("picks Soroswap when its net output is higher", async () => {
    const prevKey = process.env.SOROSWAP_API_KEY;
    process.env.SOROSWAP_API_KEY = "test-key";
    try {
      const amount = "1000003";
      await withNetwork("mainnet", () =>
        withBothFetch("1100000", response(route("Sushi"), "990000", amount), async () => {
          const r = await quoteSwap({ assetIn: XLM, assetOut: USDC, amount, slippageBps: "50" });
          const q = r.body.quote as { provider?: string; amountOut?: string } | undefined;
          assert.equal(r.body.ok, true);
          assert.equal(q?.provider, "soroswap");
          assert.equal(q?.amountOut, "1100000");
        }),
      );
    } finally {
      if (prevKey === undefined) delete process.env.SOROSWAP_API_KEY;
      else process.env.SOROSWAP_API_KEY = prevKey;
    }
  });
});
