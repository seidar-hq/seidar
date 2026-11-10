import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeStrategyPayloadToRouteXdr } from "@xoxno/sdk-js/stellar-lending";
import { routeUsesCurve } from "../src/xoxno-route.js";

const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const USDT0 = "CBSJZEIO5C7KC2SF3MKSNXXJSW5G3VTNBX4ATMKUI3B2MR4JKM4R26YF";
const POOL = "CAU6D6VOQZ7RS76PIP7JJQR7O66WBIEPDMBVMYPJTVDU6KF67WJ65DXA";

const route = (venue: "Curve" | "Sushi") =>
  encodeStrategyPayloadToRouteXdr({
    tokenIn: USDC,
    tokenOut: USDT0,
    totalMinOut: "1",
    paths: [{ splitPpm: 1_000_000, hops: [{ pool: POOL, tokenIn: USDC, tokenOut: USDT0, venue }] }],
  });

describe("xoxno routes", () => {
  it("detects a Curve hop in the packed program", async () => {
    assert.equal(await routeUsesCurve(route("Curve")), true);
  });

  it("accepts a route with no Curve hop", async () => {
    assert.equal(await routeUsesCurve(route("Sushi")), false);
  });

  it("rejects an unreadable route", async () => {
    await assert.rejects(() => routeUsesCurve("not-a-route"));
  });
});
