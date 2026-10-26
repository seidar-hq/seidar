// @seidar/api — standalone backend (Hono). Local dev: `npm run dev`
// (tsx --watch, port 3002, no compose restart). Infra only (db+redis) runs
// in compose (`docker compose up -d db redis`); API never runs in compose.
// Cloudflare serves this app via services/api/wrangler.toml (Containers).
//
// All routes are NATIVE (no Next.js hop): /prices, /pools?protocol=,
// /positions, /balances, /balance, /vaults*, /swap/*, /tx/send,
// /blend/build, /lending/*, /dex/*, /portfolio/history, /history, /icon,
// /feedback, /balances/stream. The app reads through src/lib/api.ts.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { cacheGet, rateLimit } from "@seidar/cache";
import { livePrices } from "./prices.js";
import { getPoolData, getPoolsAll } from "./pools.js";
import { getDexPools, type DexProtocol } from "./dex.js";
import { getPositions } from "./positions.js";
import { getBalance, getBalances } from "./balances.js";
import { getVaults } from "./vaults-list.js";
import {
  buildVaultTx,
  deleteWatch,
  getSnapshots,
  getVaultDetail,
  getVaultPositions,
  listWatches,
  touchWatch,
  upsertWatch,
} from "./vaults.js";
import { buildSwap, getIcon, getSwapTokens, quoteSwap, sendSwap, sendTx } from "./swap.js";
import { buildBlendClaim, buildBlendTx } from "./blend.js";
import { buildBlendToXoxno, buildLending, xoxnoAccounts, xoxnoMarkets } from "./lending.js";
import { feeInfo } from "./fees.js";
import { horizonUrl, isTestnet, netKey, parseNet, withNetwork } from "./net.js";
import { setKeyScope } from "@seidar/cache";
// Testnet cache entries live under "testnet:" (mainnet keys unchanged).
setKeyScope(() => netKey(""));
import { aquaPoolInfo, buildLiquidity, lpPosition } from "./dex-liquidity.js";
import { getHistory } from "./history.js";
import { submitFeedback } from "./feedback.js";
import { createNote, listNotes, markNotes } from "./notifications.js";
import { getPortfolioHistory, sampleWallet } from "./portfolio.js";

const ORIGINS = (process.env.CORS_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = new Hono();

// CORS: open for local dev (*); lock to Pages domains in prod via CORS_ORIGINS.
app.use(
  "*",
  cors({
    origin: ORIGINS.includes("*") ? "*" : ORIGINS,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-API-Key"],
  }),
);

// Per-client rate limiting: 120 req/min/IP/route default (tune via env).
// Shared-Redis limits land later; per-instance gate already stops stampedes.
const RL_LIMIT = Number(process.env.API_RL_LIMIT) || 120;
const RL_WINDOW = Number(process.env.API_RL_WINDOW_MS) || 60_000;
app.use("*", async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    "local";
  const key = `${ip}:${c.req.path}`;
  const r = rateLimit(key, RL_LIMIT, RL_WINDOW);
  if (!r.ok)
    return c.json({ ok: false, error: "rate-limited, retry shortly" }, 429);
  await next();
});

// Network per request: the app's Testnet mode adds ?network=testnet to every
// call; everything below runs inside that network's context (net.ts).
app.use("*", (c, next) => withNetwork(parseNet(c.req.query("network")), () => next()));

// Testnet mode covers Blend, Soroswap swaps, smart accounts and automation.
// Mainnet-only features answer plainly instead of failing somewhere deeper.
const MAINNET_ONLY = new RegExp("^/(vaults|dex|lending/xoxno|lending/migrate|portfolio/history)(/|$)");
app.use("*", async (c, next) => {
  if (!isTestnet() || !MAINNET_ONLY.test(c.req.path)) return next();
  const note = "Mainnet only — turn Testnet mode off to use vaults, DEX pools and XOXNO.";
  if (c.req.method === "GET")
    return c.json({ ok: true, mainnetOnly: true, note, rows: [], vaults: [], pools: [], positions: [], points: [] });
  return c.json({ ok: false, error: note });
});

app.get("/health", async (c) => {
  const redis = await cacheGet<string>("__ping").then(
    () => true,
    () => false,
  );
  return c.json({
    ok: true,
    uptime: process.uptime(),
    redis,
    now: Date.now(),
  });
});



// Native price stack — no upstream needed.
app.get("/prices", async (c) => {
  const raw = c.req.query("codes") ?? "";
  const codes = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (codes.length === 0)
    return c.json({ ok: false, error: "codes required" }, 400);
  try {
    const out = await livePrices(codes);
    return c.json({ ok: true, ...out });
  } catch (e) {
    return c.json(
      { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) },
      200,
    );
  }
});

// Horizon-backed charts: ?asset=native|CODE:ISSUER&range=1d|7d|...&counter= (default USD).
app.get("/prices/chart", async (c) => {
  const { parseAsset, priceChart, isChartRange } = await import("./price-chart.js");
  const base = parseAsset(c.req.query("asset") ?? "");
  const range = c.req.query("range") ?? "7d";
  const counterRaw = c.req.query("counter");
  const counter = counterRaw ? parseAsset(counterRaw) : undefined;
  if (!base || !isChartRange(range) || counter === null)
    return c.json({ ok: false, error: "asset and range required" }, 400);
  return c.json(await priceChart(base, range, counter), 200);
});

// % change over a range for many assets: ?assets=native,CODE:ISSUER,...&range=7d
app.get("/prices/changes", async (c) => {
  const { parseAsset, priceChanges, isChartRange } = await import("./price-chart.js");
  const range = c.req.query("range") ?? "1d";
  const assets = (c.req.query("assets") ?? "")
    .split(",")
    .map(parseAsset)
    .filter((a): a is NonNullable<typeof a> => !!a)
    .slice(0, 40);
  if (!isChartRange(range) || assets.length === 0)
    return c.json({ ok: false, error: "assets and range required" }, 400);
  return c.json({ ok: true, range, changes: await priceChanges(assets, range) }, 200);
});

app.get("/prices/history", async (c) => {
  const code = c.req.query("code") ?? "";
  const points = Number(c.req.query("points") ?? 48);
  if (!code.trim()) return c.json({ ok: false, error: "code required" }, 400);
  const { priceHistory } = await import("./prices.js");
  return c.json(await priceHistory(code, points), 200);
});

const POOL_PROTOCOLS = new Set(["blend", "xoxno"]);
const VAULT_PROTOCOLS = new Set(["defindex", "upshift", "untangled", "sentora"]);
const DEX_PROTOCOLS = new Set(["aqua", "phoenix", "soroswap", "sushi"]);

// Native pools catalogue (Blend SDK + XOXNO REST).
// ?protocol=blend|xoxno loads ONLY that leg — a Blend-only view
// never waits on (or pays for) XOXNO. No ?protocol= merges the
// per-protocol shared-cache entries for Discover/canvas.
app.get("/pools", async (c) => {
  const protocol = (c.req.query("protocol") ?? "").toLowerCase();
  const debug = c.req.query("debug") === "excluded";
  if (protocol && !POOL_PROTOCOLS.has(protocol))
    return c.json({ ok: false, error: "unknown protocol" }, 400);
  try {
    if (protocol) {
      const data = await getPoolData(protocol as "blend" | "xoxno");
      return c.json({ ok: true, protocol, ...data });
    }
    const data = await getPoolsAll(debug);
    return c.json({ ok: true, ...data });
  } catch (e) {
    return c.json(
      { ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) },
      200,
    );
  }
});

// DEX pool boards (Soroban AMMs). ?protocol= loads ONLY that leg — an
// Aqua-only view never waits on (or pays for) Phoenix factory RPC.
// Soroswap/Sushi have no pool catalogue source: they answer ok:true with
// zero rows and a sources reason (never mocked rows).
app.get("/dex/pools", async (c) => {
  const protocol = (c.req.query("protocol") ?? "").toLowerCase();
  if (!protocol || !DEX_PROTOCOLS.has(protocol))
    return c.json({ ok: false, error: "unknown protocol" }, 400);
  try {
    const data = await getDexPools(protocol as DexProtocol);
    return c.json({ ok: true, protocol, ...data });
  } catch (e) {
    return c.json(
      { ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) },
      200,
    );
  }
});

// Native positions (address-scoped, never cached per-user). ?protocol=
// skips the other legs' fetchers entirely — an XOXNO-only view does zero
// Blend PoolV2.load calls.
app.get("/positions", async (c) => {
  const address = c.req.query("address") ?? "";
  const protocol = (c.req.query("protocol") ?? "").toLowerCase();
  // C... = a Seidar smart account (positions are read the same way).
  if (!/^[GC][A-Z2-7]{55}$/.test(address))
    return c.json({ ok: false, error: "invalid address" }, 400);
  if (protocol && !POOL_PROTOCOLS.has(protocol))
    return c.json({ ok: false, error: "unknown protocol" }, 400);
  try {
    const scan = await boundedScan(`lend:${address}:${protocol}`, async () => ({
      status: 200,
      body: await getPositions(address, (protocol || undefined) as "blend" | "xoxno" | undefined),
    }));
    if ((scan.body as { warming?: boolean }).warming) return c.json(scan.body as object);
    const data = scan.body;
    // Piggyback equity snapshot: fire-and-forget, never delays the response.
    if (data && typeof data === "object" && "ok" in data && data.ok) {
      const d = data as { totalSupplied?: unknown; totalBorrowed?: unknown };
      void sampleWallet(address, Number(d.totalSupplied ?? 0), Number(d.totalBorrowed ?? 0)).catch(
        () => {},
      );
    }
    return c.json(data);
  } catch (e) {
    return c.json(
      { ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) },
      200,
    );
  }
});

app.get("/portfolio/history", async (c) => {
  const wallet = c.req.query("wallet") ?? "";
  const points = Number(c.req.query("points") ?? 120);
  if (!/^G[A-Z2-7]{55}$/.test(wallet))
    return c.json({ ok: false, error: "invalid wallet" }, 400);
  const r = await getPortfolioHistory(wallet, points);
  return c.json(r, 200);
});

// Native balances (Horizon; USD via Reflector cascade, never CoinGecko).
app.get("/balances", async (c) => {
  const address = c.req.query("address") ?? "";
  if (!/^[GC][A-Z2-7]{55}$/.test(address))
    return c.json({ ok: false, error: "invalid address" }, 400);
  try {
    if (address.startsWith("C")) {
      const { getContractBalances } = await import("./balances.js");
      const extra = (c.req.query("tokens") ?? "").split(",").filter((t) => /^C[A-Z2-7]{55}$/.test(t));
      return c.json(await getContractBalances(address, extra));
    }
    return c.json(await getBalances(address));
  } catch (e) {
    return c.json(
      { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) },
      200,
    );
  }
});

app.get("/balance", async (c) => {
  const address = c.req.query("address") ?? "";
  if (!/^G[A-Z2-7]{55}$/.test(address))
    return c.json({ error: "invalid address" }, 400);
  return c.json(await getBalance(address));
});

app.get("/vaults", async (c) => {
  const protocol = (c.req.query("protocol") ?? "").toLowerCase();
  const fresh = c.req.query("refresh") === "1";
  if (protocol && !VAULT_PROTOCOLS.has(protocol))
    return c.json({ ok: false, error: "unknown protocol" }, 400);
  const data = await getVaults(
    fresh,
    (protocol || undefined) as "defindex" | "upshift" | "untangled" | "sentora" | undefined,
  );
  return c.json({ ok: true, ...data });
});

app.get("/vaults/detail", async (c) => {
  const r = await getVaultDetail(c.req.query("protocol") ?? "", c.req.query("address") ?? "");
  return c.json(r.body, r.status as 200);
});

/* Position scans can take minutes on a cold cache (every pool/vault is read on chain). Answer
   within a deadline with an empty "warming" result instead of holding the browser connection;
   the scan keeps running, so its caches are warm for the next poll. One scan per address. */
const scans = new Map<string, Promise<{ status: number; body: unknown }>>();
async function boundedScan(key: string, run: () => Promise<{ status: number; body: unknown }>, ms = 25_000) {
  let job = scans.get(key);
  if (!job) {
    job = run().finally(() => setTimeout(() => scans.delete(key), 60_000));
    scans.set(key, job);
  }
  const late = Symbol("late");
  const r = await Promise.race([job, new Promise<typeof late>((res) => setTimeout(() => res(late), ms))]);
  if (r === late) return { status: 200, body: { ok: true, positions: [], warming: true, notes: ["Still scanning: try again shortly."] } };
  return r;
}

app.get("/vaults/positions", async (c) => {
  const address = c.req.query("address") ?? "";
  const r = await boundedScan(`vaults:${address}`, () => getVaultPositions(address));
  return c.json(r.body as object, r.status as 200);
});

app.post("/vaults/build", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Parameters<typeof buildVaultTx>[0];
  const r = await buildVaultTx(body);
  return c.json(r.body, r.status as 200);
});

app.get("/vaults/snapshots", async (c) => {
  const r = await getSnapshots(
    c.req.query("protocol") ?? "",
    c.req.query("address") ?? "",
    c.req.query("days"),
  );
  return c.json(r.body, r.status as 200);
});

app.get("/vaults/watches", async (c) => {
  const r = await listWatches(c.req.query("wallet") ?? "");
  return c.json(r.body, r.status as 200);
});
app.post("/vaults/watches", async (c) => {
  const r = await upsertWatch(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});
app.patch("/vaults/watches", async (c) => {
  const r = await touchWatch(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});
app.delete("/vaults/watches", async (c) => {
  const r = await deleteWatch(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});

// ---------- swap / submit / icons / chain ----------

/** Seidar service fee rates actually charged on this network (fees.ts). */
app.get("/fees", async (c) => {
  const r = await feeInfo();
  return c.json(r.body, r.status as 200);
});
app.post("/swap/quote", async (c) => {
  const r = await quoteSwap(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});
app.post("/swap/build", async (c) => {
  const r = await buildSwap(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});
app.post("/swap/send", async (c) => {
  const r = await sendSwap(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});
app.get("/swap/tokens", async (c) => {
  const r = await getSwapTokens();
  return c.json(r.body, r.status as 200);
});

app.post("/tx/send", async (c) => {
  const r = await sendTx(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});

app.post("/blend/build", async (c) => {
  const r = await buildBlendTx(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});

// Unified lending actions (Blend / XOXNO) -> unsigned XDR.
app.post("/lending/build", async (c) => {
  const r = await buildLending(await c.req.json().catch(() => null));
  return c.json(r.body, r.status as 200);
});

// Leverage loops: how much can be borrowed in the next Blend submit while
// health stays >= minHealth (oracle prices, reserve factors).
// Blend: claim pending BLND emissions in one pool.
app.post("/lending/claim", async (c) => {
  const r = await buildBlendClaim(await c.req.json().catch(() => null));
  return c.json(r.body, r.status as 200);
});
app.get("/lending/borrow-capacity", async (c) => {
  const pool = c.req.query("pool") ?? "";
  const account = c.req.query("account") ?? "";
  const asset = c.req.query("asset") ?? "";
  const addAsset = c.req.query("addAsset") ?? "";
  const addAmount = c.req.query("addAmount") ?? "0";
  const minHealth = Number(c.req.query("minHealth") ?? 1.1);
  const C = /^C[A-Z2-7]{55}$/;
  if (!C.test(pool) || !/^[GC][A-Z2-7]{55}$/.test(account) || !C.test(asset))
    return c.json({ ok: false, error: "pool, account and asset required" }, 400);
  if (!(minHealth >= 1.01 && minHealth <= 5) || !/^\d+$/.test(addAmount) || (addAmount !== "0" && !C.test(addAsset)))
    return c.json({ ok: false, error: "bad minHealth / addAsset / addAmount" }, 400);
  try {
    const { borrowCapacity } = await import("./blend-position.js");
    const cap = await borrowCapacity(pool, account, asset, minHealth, addAmount !== "0" ? { asset: addAsset, amount: BigInt(addAmount) } : undefined);
    return c.json({ ok: true, amount: cap.toString() });
  } catch (e) {
    return c.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }, 200);
  }
});

app.post("/lending/migrate/blend-xoxno", async (c) => {
  const r = await buildBlendToXoxno(await c.req.json().catch(() => null));
  return c.json(r.body, r.status as 200);
});

// Account history with one lending protocol (decoded Horizon operations).
// Bridge into Stellar (Allbridge Core over NEAR Intents).
app.get("/bridge/routes", async (c) => {
  const { bridgeRoutes } = await import("./bridge.js");
  return c.json(await bridgeRoutes().catch((e) => ({ ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 160) })));
});
app.post("/bridge/quote", async (c) => {
  const { bridgeQuote } = await import("./bridge.js");
  return c.json(await bridgeQuote(await c.req.json().catch(() => ({}))));
});
app.post("/bridge/deposit", async (c) => {
  const { bridgeDeposit } = await import("./bridge.js");
  return c.json(await bridgeDeposit(await c.req.json().catch(() => ({}))));
});
app.post("/bridge/submit", async (c) => {
  const { bridgeSubmit } = await import("./bridge.js");
  return c.json(await bridgeSubmit(await c.req.json().catch(() => ({}))).catch(() => ({ ok: true })));
});

// Everything an account did, classified: ?address=G...&kind=all|swaps|transfers|positions&cursor=
app.get("/activity", async (c) => {
  const { getActivity } = await import("./activity.js");
  const r = await getActivity(c.req.query("address") ?? "", c.req.query("kind") ?? "all", c.req.query("cursor") ?? "");
  return c.json(r.body, r.status as 200);
});

app.get("/history", async (c) => {
  const r = await getHistory(
    c.req.query("address") ?? "",
    (c.req.query("protocol") ?? "").toLowerCase(),
    c.req.query("owner") ?? "",
    c.req.query("contract") ?? "",
  );
  return c.json(r.body, r.status as 200);
});

// DEX liquidity (Soroswap / Aqua / Phoenix): LP position + deposit/withdraw.
// Lendable assets (plain supply, never collateral): Blend pools, XOXNO hubs.
app.get("/lend/markets", async (c) => {
  const { getLendMarkets } = await import("./lend-markets.js");
  const r = await getLendMarkets();
  return c.json(r.body, r.status as 200);
});
// Every LP position an address holds (Soroswap / Aqua / Phoenix).
app.get("/dex/positions", async (c) => {
  const { getLpPositions } = await import("./lp-positions.js");
  const address = c.req.query("address") ?? "";
  const r = await boundedScan(`lp:${address}`, () => getLpPositions(address));
  return c.json(r.body as object, r.status as 200);
});
app.get("/dex/position", async (c) => {
  const r = await lpPosition({ protocol: c.req.query("protocol"), pool: c.req.query("pool"), address: c.req.query("address") });
  return c.json(r.body, r.status as 200);
});
// Pool page: daily TVL / volume history and the latest trades.
app.get("/dex/pool/history", async (c) => {
  const { poolHistory } = await import("./pool-activity.js");
  const r = await poolHistory(c.req.query("protocol") ?? "", c.req.query("pool") ?? "");
  return c.json(r.body, r.status as 200);
});
app.get("/dex/pool/trades", async (c) => {
  const { poolTrades } = await import("./pool-activity.js");
  const tokens = (c.req.query("tokens") ?? "").split(",").filter(Boolean);
  const r = await poolTrades(c.req.query("protocol") ?? "", c.req.query("pool") ?? "", tokens, Number(c.req.query("limit") ?? 30));
  return c.json(r.body, r.status as 200);
});
// Aqua concentrated pools: range positions.
// Concentrated liquidity (price ranges): Aqua CL pools and Sushi V3 (?protocol=sushi).
app.get("/dex/cl/pool", async (c) => {
  const pool = c.req.query("pool") ?? "";
  const r = c.req.query("protocol") === "sushi" ? await (await import("./sushi-cl.js")).sushiPool(pool) : await (await import("./aqua-cl.js")).clPool(pool);
  return c.json(r.body, r.status as 200);
});
app.get("/dex/cl/positions", async (c) => {
  const pool = c.req.query("pool") ?? "";
  const address = c.req.query("address") ?? "";
  const r =
    c.req.query("protocol") === "sushi"
      ? await (await import("./sushi-cl.js")).sushiPositions(pool, address)
      : await (await import("./aqua-cl.js")).clPositions(pool, address);
  return c.json(r.body, r.status as 200);
});
app.post("/dex/cl/build", async (c) => {
  const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const r = body.protocol === "sushi" ? await (await import("./sushi-cl.js")).buildSushi(body) : await (await import("./aqua-cl.js")).buildCl(body);
  return c.json(r.body, r.status as 200);
});
app.get("/dex/aqua/pool", async (c) => {
  const r = await aquaPoolInfo(c.req.query("pool") ?? "");
  return c.json(r.body, r.status as 200);
});
app.post("/dex/liquidity/build", async (c) => {
  const r = await buildLiquidity(await c.req.json().catch(() => null));
  return c.json(r.body, r.status as 200);
});

// Token icons for every DEX token (per contract; per code where unambiguous).
app.get("/tokens/icons", async (c) => {
  const { dexTokenIcons } = await import("./token-icons.js");
  const r = await dexTokenIcons();
  return c.json(r.body, r.status as 200);
});

app.get("/lending/xoxno/accounts", async (c) => {
  const r = await xoxnoAccounts(c.req.query("owner") ?? "");
  return c.json(r.body, r.status as 200);
});

app.get("/lending/xoxno/markets", async (c) => {
  const r = await xoxnoMarkets();
  return c.json(r.body, r.status as 200);
});

// In-app feedback inbox (text + data-URL attachments, server-stored).
app.post("/feedback", async (c) => {
  const r = await submitFeedback(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});

// Zenex perps: market, candles, trades, account state, and order / vault builders.
app.get("/zenex/market", async (c) => {
  const { zenexMarket } = await import("./zenex.js");
  const r = await zenexMarket(c.req.query("market"));
  return c.json(r.body, r.status as 200);
});
app.get("/zenex/candles", async (c) => {
  const { zenexCandles } = await import("./zenex.js");
  const r = await zenexCandles({ symbol: c.req.query("symbol"), resolution: c.req.query("resolution"), from: c.req.query("from"), to: c.req.query("to") });
  return c.json(r.body, r.status as 200);
});
app.get("/zenex/trades", async (c) => {
  const { zenexTrades } = await import("./zenex.js");
  const r = await zenexTrades(c.req.query("market"), Number(c.req.query("limit") ?? 30));
  return c.json(r.body, r.status as 200);
});
app.get("/zenex/account", async (c) => {
  const { zenexAccount } = await import("./zenex.js");
  const r = await zenexAccount(c.req.query("address") ?? "", c.req.query("market"));
  return c.json(r.body, r.status as 200);
});
app.post("/zenex/build", async (c) => {
  const { zenexBuild } = await import("./zenex.js");
  const r = await zenexBuild(await c.req.json().catch(() => null));
  return c.json(r.body, r.status as 200);
});

// Header bell: per-wallet notifications (Postgres).
app.get("/notifications", async (c) => {
  const r = await listNotes(c.req.query("wallet") ?? "");
  return c.json(r.body, r.status as 200);
});
app.post("/notifications", async (c) => {
  const r = await createNote(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});
app.patch("/notifications", async (c) => {
  const r = await markNotes(await c.req.json().catch(() => ({})));
  return c.json(r.body, r.status as 200);
});

// Classic asset logo: ?asset=CODE:ISSUER -> 302 to the image, 404 when none is published.
app.get("/token/logo", async (c) => {
  const [code, issuer] = (c.req.query("asset") ?? "").split(":");
  if (!/^[A-Za-z0-9]{1,12}$/.test(code ?? "") || !/^G[A-Z2-7]{55}$/.test(issuer ?? ""))
    return c.json({ ok: false, error: "asset required" }, 400);
  const { tokenLogo } = await import("./token-logo.js");
  const url = await tokenLogo(code, issuer);
  if (!url) return c.json({ ok: false, error: "no-logo" }, 404);
  c.header("Cache-Control", "public, max-age=86400");
  return c.redirect(url, 302);
});

app.get("/icon", async (c) => {
  const r = await getIcon(c.req.query("cid") ?? "");
  if ("bytes" in r) {
    return new Response(r.bytes, {
      headers: { "Content-Type": r.type, "Cache-Control": "public, max-age=86400" },
    });
  }
  return c.json(r.body, r.status as 200);
});

// (Removed: /activity + /automation read the retired testnet guardian;
// automation state now lives under /automation/*.)

// Price warmer: 30s refresh of majors so all clients share 2 req/min upstream
// instead of N × polling. Pool/vault warmers move natively in the next step.
// Started explicitly by the Node entrypoint (server.ts) or a platform Cron
// trigger — importing this module (tests, Workers) has zero side effects.
const WARM_CODES = ["XLM", "USDC", "EURC", "BTC", "ETH", "AQUA"];
let lastSnapshotAt = 0;
async function warmPrices() {
  try {
    const out = await livePrices(WARM_CODES);
    // Own history: snapshot spot every 15 min (30-day retention, served
    // hourly for charts; 24h change reads off the same table).
    if (Date.now() - lastSnapshotAt > 15 * 60_000) {
      lastSnapshotAt = Date.now();
      const { snapshotPrices } = await import("./prices.js");
      await snapshotPrices(out.prices);
    }
  } catch {
    // warmer failures must never crash the process
  }
}

/** One warmer pass for a Worker cron tick (every minute); cadences follow the clock. */
export async function runWarmersOnce(at: Date): Promise<void> {
  const m = at.getUTCMinutes();
  const jobs: Promise<unknown>[] = [
    (async () => {
      const out = await livePrices(WARM_CODES).catch(() => null);
      if (out && m % 15 === 0) {
        const { snapshotPrices } = await import("./prices.js");
        await snapshotPrices(out.prices);
      }
    })(),
  ];
  if (m % 2 === 0) jobs.push(import("./price-chart.js").then((x) => x.warmCharts()));
  if (m % 5 === 0)
    jobs.push(
      withNetwork("mainnet", async () => {
        for (const v of ["soroswap", "phoenix", "sushi", "aqua"] as const) await getDexPools(v).catch(() => null);
      }),
    );
  // Heavy lists: a Worker request on a cold key waits for the whole build (the vault catalogue
  // reads ~120 contracts), so the cron keeps them cached. Stale entries refresh in the background
  // (drained by the caller); a missing one is built here instead of in a user's request.
  if (m % 5 === 2)
    jobs.push(
      withNetwork("mainnet", async () => {
        const { getLendMarkets } = await import("./lend-markets.js");
        await Promise.allSettled([getVaults(), getPoolData("blend"), getPoolData("xoxno"), getLendMarkets()]);
      }),
    );
  await Promise.allSettled(jobs);
}

/** Start background refresh loops (Node/Containers only, not Workers). */
export function startWarmers(): void {
  setInterval(warmPrices, 30_000);
  warmPrices();
  // Price charts: keep every recently viewed chart (and the common ones) warm.
  const warmChartsNow = () => import("./price-chart.js").then((m) => m.warmCharts()).catch(() => null);
  setTimeout(warmChartsNow, 15_000);
  setInterval(warmChartsNow, 2 * 60_000);
  // Swap activity (7-day volume, trades, fee APY) for Soroswap / Phoenix /
  // Sushi: scan at boot and keep warm, so pool pages never wait on it.
  const warmActivity = () =>
    withNetwork("mainnet", async () => {
      for (const v of ["soroswap", "phoenix", "sushi"] as const) await getDexPools(v).catch(() => null);
    });
  setInterval(warmActivity, 5 * 60_000);
  setTimeout(warmActivity, 5_000);
}

// Balances stream helper route: clients prefer Horizon SSE
// (EventSource horizon.../accounts/{addr}/effects?cursor=now); this documents it.
app.get("/balances/stream", (c) => {
  const address = c.req.query("address") ?? "";
  if (!/^G[A-Z2-7]{55}$/.test(address))
    return c.json({ ok: false, error: "invalid address" }, 400);
  return c.json({
    ok: true,
    sse: `${horizonUrl()}/accounts/${address}/effects?cursor=now`,
    fallback: `/api/balances?address=${address}`,
    note: "SSE pushes XLM+trustline changes; pool/vault legs stay warmer-fed.",
  });
});

export default app;
