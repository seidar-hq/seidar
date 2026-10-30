# Seidar — handoff (updated 2026-10-30, second session)

Read this whole file before touching code. It explains what Seidar is, where it came from, how
the repo and production are laid out, what was built and verified, the rules the owner holds
you to, and exactly where work stopped.

---

## 1. What Seidar is

**Seidar is a non-custodial DeFi workspace for Stellar mainnet only.** One app to see and act on
everything a user holds across Stellar protocols:

- **Dashboard**: total value, balance timeline, allocation, best/worst performers, and tables of
  Assets / Supplied / Borrowed / Vaults / Perps across every wallet in a *portfolio*.
- **Trade**: Swap (Soroswap aggregator over Soroswap, Aquarius, Phoenix, Sushi, Stellar DEX), Send /
  Receive, and **Perps** on **Zenex** (the only perps venue on Stellar).
- **Earn**: Lend & Borrow (**Blend**, **XOXNO**), Pools (Soroswap, Aquarius, Phoenix, Sushi incl.
  concentrated ranges), Vaults (**DeFindex**, **Upshift**, **Sentora**).
- **Bridge**: into Stellar only, via **Allbridge Core over NEAR Intents** (10 source chains →
  USDC or XLM on Stellar).
- **History**: decoded transactions across the portfolio's wallets, CSV export.
- **Settings**: named portfolios and linked wallets.

The wallet signs every transaction; Seidar builds and simulates them. No automation, no smart
accounts, no keeper — those were deliberately removed (see §2).

Live:
- `https://seidar.xyz` — marketing site (apps/web)
- `https://app.seidar.xyz` — the app (apps/app)
- `https://docs.seidar.xyz` — docs (apps/docs)
- `https://api.seidar.xyz` — API (services/api, a Cloudflare Worker)

---

## 2. The three codebases you must know about

| Path | What it is | Rule |
|---|---|---|
| `C:\Users\Admin\Code\seidar` | **This repo.** GitHub `seidar-hq/seidar`, branch `main`. The product. | Work here. |
| `C:\Users\Admin\Code\real_seidar` | **The old Seidar** ("DeFi Saver for Stellar"): aggregation **plus** automation (OpenZeppelin smart accounts, on-chain guard policy, keeper), Soroban contracts, MCP. ~240 commits. | **Read-only. Never modify.** It is the logic reference. |
| `C:\Users\Admin\Code\pitchsite\cropr-mirror` | A static mirror of **Cropr** (a multichain EVM portfolio app). Compiled bundles in `assets/`, per-route HTML + PNG snapshots in `snapshots/` (dashboard, trade-swap, perps, earn_*, bridge, transactions, settings, wallets, asset…), text dump in `snapshots/_text-summary.txt`. Serve with `node serve.mjs` → `http://localhost:8099`. | **Design reference only.** Never ship the word "Cropr". |

**The project in one sentence:** the new Seidar is Cropr's UI/UX, rebuilt for Stellar only,
powered by the protocol machinery ported from real_seidar, minus real_seidar's automation.

The owner's original brief (kept locally in `apps/app/work.md`, git-ignored) said:
strip automations and smart accounts; keep aggregation and protocol interaction; Stellar Wallets
Kit for wallets; portfolios; swap via Soroswap aggregator with multi-select DEXs; Zenex perps;
Earn = Lend & Borrow / Pools / Vaults (add Sentora, and Templar — see §9); a Stellar bridge;
history; backend separated from the frontend like real_seidar.

### What to take from real_seidar
- API modules were ported nearly verbatim: `rpc.ts` (RPC fallback, 429 rotation, `buildInvoke`,
  `submitAndWait`), `pools.ts`, `lend-markets.ts`, `lending.ts` (Blend + XOXNO builders),
  `dex-liquidity.ts`, `defindex-catalog.ts`, `positions.ts`, `xoxno-position.ts`, prices, swap.
- Its `HANDOFF.md`, `AGENTS.md`, and `contracts/SECURITY.md` explain protocol semantics
  (XOXNO "account" = position NFT with an id; Blend isolated pools; etc.).
- Do **not** bring back: `automation*.ts`, `keeper*.ts`, `smart-account-tx.ts`, contracts, guard,
  the automation SDK, MCP, `/automate` pages.

### What to take from the Cropr mirror
- Layout, spacing, card styles, tables, modals, empty/locked states, charts, header, docs look.
- Snapshots are the spec. When the owner says "make it like Cropr", open the matching
  `snapshots/<route>.png` and the compiled CSS/JS in `assets/`.
- Replace every EVM concept with Stellar: chains → none (Stellar only), EVM wallets → Stellar
  wallets, Uniswap/Aave/etc. → Soroswap/Blend/etc.

---

## 3. Owner rules (non-negotiable)

1. **Commit and push to `main`** when a unit of work is done and verified. End commit messages with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Message style: `area: summary`.
2. **No "Cropr" text anywhere.** Everything is Seidar.
3. **Stellar mainnet only. Dark theme only.** No chain pickers, no theme toggle, no testnet UI.
4. **Give straight answers** when something isn't done or doesn't work. Report gaps as
   prominently as successes.
5. **Never commit secrets.** Ignored: `.env*.local`, `services/api/.dev.vars`,
   `services/api/.cache/`, `apps/app/work.md`, `.wrangler/`.
6. **Don't modify `real_seidar`.**
7. If a corepack `packageManager` line appears in the root `package.json`, revert it before committing.
8. **Don't work around the permission checker.** It has blocked: killing processes Claude didn't
   start; installing the Zenex SDK (git dependency — contract calls were hand-written instead);
   changing the `app.seidar.xyz` domain until the owner explicitly granted it.
9. Live data only — no mocks. No dead-end buttons: an action either executes or says why it can't.

---

## 4. Repo layout

```
apps/
  app/    Next.js 15 static export (MUI 7, Recharts, lightweight-charts, Stellar Wallets Kit). Port 3001.
  web/    Next.js 15 static export marketing site (MUI 7, framer-motion). Port 3003 (3000 is taken by WSL).
  analytics/ Next.js static export for analytics.seidar.xyz (public aggregate stats + admin adjustments;
          reads `/analytics/summary`, `/analytics/admin/adjustments` on the API; dev port 3014).
  docs/   Docusaurus 3.10.2. Content in docs/, sidebars.ts, src/css/custom.css.
packages/
  cache/          @seidar/cache — read-through cache, single-flight, SWR; Redis / in-memory / pluggable driver.
  positions-sdk/  read lens over lending positions.
  tokens/         asset registry (well-known Stellar contract addresses).
  vaults/         vault row math (normalisation, APY from share price, sorting).
services/
  api/    Hono API. Node (src/server.ts, tsx watch, port 3002) or Cloudflare Worker (src/worker.ts).
docker-compose.yml  local Postgres :5434 and Redis :6380
```

### apps/app (the product UI)
- Routes (`src/app`): `/` **Home** (market overview, `components/home/*`), `/portfolio` (the former
  Dashboard, `components/portfolio/*`; `/dashboard` redirects there), `/asset?asset=CODE:ISSUER|XLM`
  (asset page, linked from Home), `/trade-swap/dex` (`?buy=CODE:ISSUER` preselects the token to buy),
  `/trade-swap/perps`, `/earn/lending&borrow[/view]`, `/earn/pools[/view]`, `/earn/vaults[/view]`, `/bridge`,
  `/transactions`, `/settings`, `/wallets`.
  Detail pages read their target from the URL (`?address=…`) and are wrapped in `<Suspense>`
  (required for static export with `useSearchParams`).
- **API access only through `src/lib/api.ts`** (`apiFetch` / `apiJson`): `/api/x` → `${NEXT_PUBLIC_API_URL}/x`
  (default `http://localhost:3002`). The app has no server code except `functions/api/news.ts`
  (a Cloudflare Pages Function for the dashboard news feed).
- Key modules:
  - `wallet/WalletContext.tsx` — wallets, portfolios (`createPortfolio`, `setActivePortfolio`),
    active wallet; everything persisted in localStorage. Re-linking a wallet never moves it between
    portfolios. Watch-only wallets exist for testing only (`?watch=G…` or `window.seidar.watch`),
    disabled in production builds unless `NEXT_PUBLIC_ENABLE_WATCH=1`.
  - `lib/wallets.ts` — Stellar Wallets Kit modules: Freighter, Albedo, xBull, LOBSTR, Rabet, HANA, plus the kit's
    **WalletConnect** module (phone wallets: Freighter / LOBSTR / Scopuly mobile; auto-connect inside Freighter
    mobile's in-app browser). WalletConnect loads lazily and only when `NEXT_PUBLIC_WC_PROJECT_ID` is set; the kit
    is warmed 1.5 s after load and waits for WalletConnect's client, otherwise the modal lists it as "Install".
    On phones, extension wallets are listed only inside their own in-app browser (no dead-end install links).
  - `lib/useShared.ts` — shared fetch/cache hooks with localStorage mirrors (`PERSIST`) for instant revisits.
  - `lib/tx.ts`, `components/tx/useTxRunner.ts`, `TxDialog.tsx` — build → sign → submit flow.
  - `lib/tokens.ts`, `components/common/TokenLogo.tsx` — token icon resolution.
  - `portfolio/usePortfolio.ts`, `useSeries.ts` — portfolio aggregation and chart series.
  - `components/home/*` — **Home** (market overview, public): NetworkHero (DefiLlama Stellar TVL + chart),
    PortfolioCard, MarketKpis, Leaderboards (reuses Earn `TopList`), AssetsTable (category chips, search, sparklines,
    Swap → `?buy=`), ActivityChart (Stellar Expert daily ledger stats), Protocols (DefiLlama, links to our Earn
    pages or out); hooks in `marketData.tsx`. Data from `services/api/src/market.ts`: **categories come from
    `REGISTRY` (verified issuers, home domains checked 2026-10-30)** — codes are not unique and look-alikes
    abound (USDC, BTC, SOL, SHX…), so add new RWA/stable/yield tokens there by issuer; unregistered assets
    only show as "Other" with Stellar Expert rating ≥ 7.2, a home domain and a price. BENJI has no DEX price:
    priced at its $1 NAV. XLM market cap comes from CoinGecko (Stellar Expert supply = total). Market cap of
    other assets = issued supply × price (can overstate, e.g. SHX). Stellar Expert `volume7d` is USD × 1e7.
  - Home layout = Portfolio's two-column grid (`minmax(12.5rem,1fr) 27.375rem`): market on the left; Your
    portfolio, Protocols, News on the right. **Markets** card (`Markets.tsx`): watchlist + `CompareChart`
    (up to 3 compared assets, Price = dual axis / % change = shared axis). All Home/asset charts use
    `components/common/ZoomChart.tsx` (Lightweight Charts: drag either axis to stretch/compress, wheel/drag
    to zoom/pan, double-click or reset button to fit; `fitKey` refits on period change, otherwise the user's
    zoom survives data refreshes). Soroban-only tokens (`SOROBAN` in `market.ts`: Centrifuge deJTRSY/deJAAA)
    are priced from XOXNO's oracle with supply from `total_supply`; holders/volume not published.
    BENJI's logo (`public/tokens/benji.png`) is Franklin Templeton's portrait mark cropped from the official
    logo; Franklin publishes no token image. Canvas charts don't show in interceptor screenshots of a
    background tab: verify with headless Chrome over CDP (`--remote-debugging-port`, Page.captureScreenshot).
  - `components/asset/Asset.tsx` — asset page (Cropr layout, live): price chart, stats, Your holding,
    Earn with it (lend markets / pools / vaults that take the asset).
  - `components/portfolio/*` (was `components/dashboard/`) — Portfolio: PortfolioBalance (Timeline/Allocation/Performer), AssetTables,
    PerpsPositions (incl. TP/SL), News, locked states.
  - `components/swap/SwapWidget.tsx` — Swap / Send / Receive tabs; DEX multi-select with logos;
    MAX keeps 2 XLM; slippage 0.1/0.5/1/custom; button label "EXCHANGE".
  - `components/trade/perps/*` — `usePerps.ts` (data hooks, `positionExits()` for TP/SL),
    `PerpsChart.tsx` (header stats + **TradingView Lightweight Charts fed with Zenex's own
    oracle candles**), `OrderEntry.tsx` (Market/Limit/Stop, margin/size/leverage linked, TP/SL,
    expiry), `PerpsAccount.tsx` (account card, claimable credit, Positions/Open Orders/Order
    History/Trades/Closed, position dialog).
  - `components/earn/*` — `EarnUI.tsx`, `ActionCard.tsx`, `LendBorrow.tsx`/`LendMarket.tsx`
    (+`lendData.ts`), `Pools.tsx`/`PoolPage.tsx`/`PoolRange.tsx` (+`poolData.ts`),
    `Vaults.tsx`/`VaultDetail.tsx` (+`vaultData.ts`).
  - `components/bridge/*`, `components/transactions/*`, `components/settings/*`,
    `components/layout/*` (Header with page search, Docs button, notifications bell, portfolio
    pill, wallet).
- Theme: `src/theme/*` (palette tokens like `surfaceBg.*`, `overlay.white08`, `sidebar.*`, `green.main`).
- Locked-state illustrations in `public/assets/*Locked.*` were EVM-themed from Cropr and have been
  redrawn with Stellar logos (see §7). Protocol logos in `public/protocols`, tokens in `public/tokens`,
  wallets in `public/assets/wallets`.

### services/api (the backend)
- `src/index.ts` — the Hono app: CORS (`CORS_ORIGINS`), per-IP rate limit, network scoping, all
  routes. Exported `startWarmers()` (Node setInterval loops) and `runWarmersOnce(at)` (Worker cron).
- Routes (all JSON): `/health`, `/prices[/chart|/changes|/history]`, `/balances`, `/balance`,
  `/positions`, `/portfolio/history`, `/pools`, `/lend/markets`, `/lending/build|claim|borrow-capacity|xoxno/*`,
  `/blend/build`, `/dex/pools|positions|position|pool/history|pool/trades|cl/*|aqua/pool|liquidity/build`,
  `/vaults[/detail|/positions|/build|/snapshots|/watches]`, `/swap/quote|build|send|tokens`, `/tx/send`,
  `/bridge/routes|quote|deposit|submit`, `/zenex/market|candles|trades|account|build`,
  `/activity`, `/history`, `/notifications`, `/tokens/icons`, `/token/logo`, `/icon`, `/fees`, `/feedback`,
  `/analytics/summary|ping|admin/adjustments`, `/agent/chat`, `/market/assets|overview` (Home; `market.ts`).
- Notable modules: `rpc.ts`, `prices.ts` (SWR spot prices, 6h retain), `price-chart.ts`,
  `positions.ts`, `pools.ts`, `lend-markets.ts`, `lending.ts` (`XOXNO_ERRORS` map), `blend.ts`
  (`buildBlendClaim`), `dex*.ts`, `sushi-cl.ts`, `aqua-cl.ts`, `pool-activity.ts`, `vaults.ts`
  (Upshift registry + builders), `vaults-list.ts` (aggregated rows; Merkl APRs), `defindex-catalog.ts`,
  `sentora.ts`, `zenex.ts`, `bridge.ts`, `swap.ts`/`swap-route.ts`, `activity.ts`/`history.ts`,
  `notifications.ts`, `db.ts`.
- **Database (`db.ts`)**: one `query()` interface over Postgres (`pg`, local Node via
  `DATABASE_URL`) **or** Cloudflare D1 (`useD1(binding)` in the Worker). SQL is written once in a
  portable subset: `$n` placeholders (rewritten to `?n` for D1), timestamps as ISO strings computed
  in JS (`isoAgo(ms)`), `IN (…)` lists via `inList()` instead of `ANY()`, no casts/`DISTINCT ON`/
  `INTERVAL`. D1 schema = `SQLITE_SCHEMA` in `db.ts`; Postgres schema = `runSchema()`. Keep both in sync.
- **Cache (`@seidar/cache`)**: `withCache(key, ttl, loader, {swr})`, `cacheGet/Set`, single-flight.
  Drivers: Redis (`REDIS_URL`), in-memory (+ `CACHE_FILE` persistence in dev), or a pluggable driver
  via `setCacheDriver()`. Background SWR refreshes are tracked; Workers drain them with
  `drainBackground()` inside `ctx.waitUntil`.
- **Worker entry (`src/worker.ts`)**: imports `worker-compat.ts` first (strips `fetch`/`Request`
  `cache` modes workerd rejects — axios sends `cache: "default"`, which broke Allbridge and Aquarius),
  binds the cache driver (Cache API first tier → KV second tier; KV written only when a value
  changes or every 10 min; fast-changing keys `prices:spot:`, `zenex:*` ticks, `dextrades:` never
  go to KV), binds D1, and runs `runWarmersOnce` on the minute cron (prices; charts every 2 min;
  DEX pools incl. Aquarius every 5 min; vaults / Blend / XOXNO / lend markets every 5 min).
- Tests: `npm test --workspace @seidar/api` → **35/35 pass**; `npm test --workspace @seidar/cache` → **7/7** (as of this handoff).

### ⚠️ Workers runtime rule: never share a pending promise across requests without an expiry
On Workers a promise belongs to the request that started it. When that request ends (client gone, or
its `waitUntil` cut off **30 s** after the response) the runtime cancels its I/O and the promise
**never settles**. Any other request awaiting it hangs until its own client gives up, and a module-level
flag/slot/memo set by it is never reset. This caused the 2026-10-30 incident (§7). Every shared
promise or "in progress" marker therefore carries a timestamp and expires:
- `@seidar/cache` single-flight (`withCache`, exported `singleFlight`): flights expire after
  `setFlightMaxMs` (Worker: 25 s; Node default 5 min); joiners stop waiting then and load themselves.
- `drainBackground(mark)`: each request/cron drains only background work started after its
  `backgroundMark()`, never another request's (possibly dead) work.
- `rpc.ts` gate: slots expire after 45 s, nobody waits more than 4 s for a slot, each RPC attempt
  has a 20 s deadline (then the next endpoint).
- `boundedScan` (positions / vault positions): the scan runs on `runInBackground`; a scan older than
  50 s is replaced. `db.ts` `ensureSchema` retries an attempt still pending after 15 s.
  `prices.ts` refresh marks and `token-icons.ts` `fill` expire too.
- Background work after a response must go through `runInBackground` (a bare `void p` is cancelled).
New code with a module-level `Map<string, Promise>`, a boolean "busy" flag or a memoised promise must follow this.

### Reading production logs
Wrangler's OAuth token has no observability scope (only live `wrangler tail`). Stored Worker logs
(Observability, `[observability] enabled`) are read through the dashboard: open
`dash.cloudflare.com/<account>/workers/services/view/seidar-api/production/observability/events` in the
interceptor browser and POST `/api/v4/accounts/<account>/workers/observability/telemetry/query` from the
page with `eval --main` (the dashboard's own fetch adds the auth headers; adding `x-atok` /
`x-cross-site-security` yourself gets a WAF 403). Filter keys: `$metadata.service`, `$metadata.level`,
`$workers.event.response.status`, `$workers.eventType`. Note `wallTimeMs` includes `waitUntil` time.
Background noise: bots probe `/.env`, `/phpinfo.php` etc. (all 404, harmless).

---

## 5. Production (Cloudflare account `7e98bc4bfd2c05a039ac47395702d2db`)

| Host | Cloudflare resource | Deploy |
|---|---|---|
| `seidar.xyz`, `www.seidar.xyz` | Pages `seidar-web` | `cd apps/web && npm run build`, then `npx wrangler pages deploy apps/web/out --project-name seidar-web --branch main` |
| `docs.seidar.xyz` | Pages `seidar-docs` | `cd apps/docs && npm run build`, then `npx wrangler pages deploy apps/docs/build --project-name seidar-docs --branch main` |
| `app.seidar.xyz` | Pages `seidar-app` (+ `functions/`) | `cd apps/app && npm run build && npx wrangler pages deploy out --project-name seidar-app --branch main` (run from `apps/app` so `functions/` is included) |
| `analytics.seidar.xyz` | Pages `seidar-analytics` (static; reads `api.seidar.xyz/analytics/summary` directly, CORS-allowed) | `cd apps/analytics && npm run build && npx wrangler pages deploy out --project-name seidar-analytics --branch main` |
| `api.seidar.xyz` | Worker `seidar-api`, D1 `seidar-db`, KV `seidar-cache`, cron `* * * * *` | `cd services/api && npx wrangler deploy` |

- Worker secrets (set via `wrangler secret bulk`, values live only in `services/api/.env.local` /
  `.dev.vars`): `SOROSWAP_API_KEY`, `DEFINDEX_API_KEY`, `RPC_URL`.
- Worker vars: `CORS_ORIGINS` = app.seidar.xyz, seidar-app.pages.dev, analytics.seidar.xyz,
  seidar-analytics.pages.dev, http://localhost:3014; rate limits (`API_RL_LIMIT` 120/min/IP, quotes 600).
- Feedback (`POST /feedback`, header Feedback button): emailed through the `FEEDBACK_EMAIL` send_email
  binding to `FEEDBACK_TO = feedback@seidar.xyz` (wrangler.toml `[vars]`; the binding only allows that
  address). Email Routing rule `feedback@seidar.xyz` -> owner's Gmail was created 2026-10-29, next to the
  existing `hello@seidar.xyz` rule (**leave hello@ alone, it works**). Sending to a routed (non-verified)
  address needs Email Sending (beta) for seidar.xyz: **onboarded 2026-10-29** (it added `cf-bounce`
  MX/SPF/DKIM + `_dmarc` "v=DMARC1; p=reject;"; root MX/SPF untouched). A live `POST /feedback` returned
  `{"ok":true}`; **the owner confirmed delivery (2026-10-30).** Up to 4 images, 2 MB in total.
- Leverage (`POST /lending/xoxno/multiply`, Lend & Borrow → Leverage tab on XOXNO markets): XOXNO controller
  `multiply` with an aggregator route from `stellar-swap.xoxno.com`; new account per position, health floor 1.3.
- Blend leverage, one transaction: `contracts/` (seidar-leverage + its receiver; see contracts/README.md).
  `open` = approve + Blend `flash_loan` whose `exec_op` swaps the borrow into collateral on the Soroswap
  aggregator; health checked on-chain. Mainnet-fork tested. When `BLEND_LEVERAGE_CONTRACT` is set on the
  API, `/lending/blend/leverage` builds that single tx (quote with `smart: true`, `borrowCapacity` at 1.3
  incl. the existing position, min_hf 1.29); `GET /lending/blend/leverage` tells the app. Not yet on
  mainnet (owner deploys: `DEPLOYER_SECRET=S... node contracts/scripts/deploy.mjs mainnet`, ~26.2 XLM
  uploads + ~0.1 XLM create). Testnet deploy 2026-10-29: CBDH4LNLZ5NPV26Y4GEBCJYSMFXQIHGK2DH5JSWTMTHWYD76A46RHKD6.
- Blend leverage fallback (no contract configured): a loop of transactions, ported
  from real_seidar's leverage modal. open = supply deposit + borrow (sized by `borrowCapacity` at interim
  health 1.1) -> swap (Soroswap aggregator, debt -> collateral) -> supply what the swap returned (wallet
  balance delta) + borrow again, until debt = deposit value x (L - 1) by the pool oracle; at most 8 rounds.
  Each step returns `next` for `runBuilt`. Max L is quoted on cf x lf so the finished health is >= 1.3.
  Only built + simulated on mainnet so far (no signed run). `/pools` Blend assets now carry `lFactor`, `priceUsd`.
- Agent (`POST /agent/chat`): built but switched off in the UI (header pill says "Coming soon"). Needs the
  `ANTHROPIC_API_KEY` secret before it answers.
- **Home is dev-only (feature flag, owner's call 2026-10-30):** `NEXT_PUBLIC_ENABLE_HOME=1` lives in
  `apps/app/.env.development` only, so `next dev` shows Home at `/` and production builds don't (`/` = Portfolio,
  no Home in the nav or search; `lib/features.ts` `HOME_ENABLED`). Its docs page is `draft: true` and unlinked.
  The API's `/market/*` routes ship but the cron warms them only with `MARKET_WARM=1`. **To release Home:** add
  `NEXT_PUBLIC_ENABLE_HOME=1` to `.env.production`, set `MARKET_WARM = "1"` in wrangler.toml `[vars]`, drop the
  docs `draft`, re-link it (sidebars.ts, footer, index.md, getting-started.md). Everything else (incl. Dashboard →
  Portfolio) ships normally.
- Leverage deployer: `contracts/.env.local` (git-ignored) holds a mainnet keypair generated 2026-10-30 for
  `deploy.mjs` (`DEPLOYER_SECRET`). Public key in the file; fund ~30 XLM, deploy, return the remainder.
- App build env: `apps/app/.env.production` → `NEXT_PUBLIC_API_URL=https://api.seidar.xyz`, docs/site/X links.
- WalletConnect (Reown) project id: `NEXT_PUBLIC_WC_PROJECT_ID` in `apps/app/.env.production.local` (git-ignored,
  on the owner's machine only; recreate it from dashboard.reown.com if lost). It ships in the bundle by design;
  the Reown project's domain allowlist is what restricts it.
- `app.seidar.xyz` was moved (with the owner's explicit permission, 2026-10-26) from the
  `droppo-labs` Pages project to `seidar-app`; its DNS CNAME now points to `seidar-app.pages.dev`.
  `droppo-labs` still serves `droppolabs.space` / `www.droppolabs.space` — **leave it alone.**
- Wrangler's login token can deploy Workers/Pages/D1/KV but **cannot edit DNS** (zone read only).
  DNS changes go through the dashboard (use the interceptor browser; the owner is signed in).
- `compatibility_date` is `2026-08-08` (newest the local workerd supports). Don't raise it past what
  `wrangler dev` accepts.

### Workers plan
The owner upgraded to **Workers Paid** ($5/mo) on 2026-10-29; the Free-plan notes below are historical.

### ⚠️ (Historical) The account was on the Workers **Free** plan
Free = 10 ms CPU and **50 subrequests per invocation**, 1,000 KV writes/day. Verified effects on
`api.seidar.xyz` (2026-10-26):

| Status | What |
|---|---|
| ✅ Works | prices, price charts, balances, notifications, swap tokens, bridge routes, Zenex market/account/candles, XOXNO markets/pools, lend markets list, Phoenix pools, Upshift vaults |
| 🐢 Slow | Blend pools (~70 s cold), Aquarius pools (>55 s cold; now cron-warmed) |
| ⚠️ Partial | `/positions` — some Blend pool reads fail ("Too many subrequests"); test wallet shows $88k of $139k supplied |
| ❌ Broken | Vault list: DeFindex 0/15 readable, Sentora 0/4 (only Upshift's 2 show); Soroswap and Sushi pools empty |

All failures are the subrequest cap. **Workers Paid ($5/mo) fixes them with no redeploy** (do NOT
add `[limits] cpu_ms` while on Free — the deploy is rejected). Estimated paid cost ~$5–8/mo.
The owner chose to stay on Free for now and may upgrade later. Transaction-building routes
(swap/lend/perps/vault builds) were not exercised in production yet.

---

## 6. Local development

```bash
docker compose up -d db redis          # Postgres :5434, Redis :6380 (real_seidar uses 5433/6379)
npx tsc -b tsconfig.json               # build packages (needed after editing packages/*)
cd services/api && npx tsx watch src/server.ts      # API :3002 (loads .env.local itself)
cd apps/app && npx next dev -p 3001                 # app
cd apps/web && npx next dev -p 3003                 # site
cd apps/docs && npm start                           # docs
cd services/api && npx wrangler dev --port 8787 --test-scheduled   # API under workerd with local D1/KV (.dev.vars)
```
- Checks: app `npx tsc --noEmit` + `npx next lint --dir src`; API `npx tsc --noEmit -p .`;
  docs `npm run build` (fails on any broken link/anchor — intentional).
- **Stop the app/web dev server before `next build`** — they share `.next` and the dev server breaks.
  For the app you can instead build beside a running dev server: `NEXT_DIST_DIR=.next-build npm run build`
  (the static export then lands in `.next-build/`, not `out/`; `rm -rf out && mv .next-build out` before deploying).
- Test wallet (read-only, mainnet): `GDL75PXBUUMD43KPEMAIVHJVP2KG3EQCPJ3NYKK444M55FXAD6RKOZCJ`
  (XLM, ~2.9M BLND, Blend supplies, Zenex credit ~0.067 USDC). Open the app with `?watch=G…` in dev.
- Browser checks: the `interceptor` CLI (`--group seidar`, `eval --main`, `screenshot --save`).
  Background tabs pause `requestAnimationFrame`, so canvas charts may look blank in screenshots;
  cross-origin iframes don't render in screenshots.
- On Windows Git Bash, very large heredocs can fail — write scripts with the Write tool and run them.

---

## 7. What has been built (commit trail, newest first)

Session of 2026-10-30 (second): **incident fix — dashboard sat on 0.00 after loading, data appeared
1–2 min later.** Production logs showed cheap routes (`/prices` CPU 1 ms) taking 24–45 s and
`/zenex/account` killed as "code had hung": requests awaited single-flight loaders / RPC slots / scans
owned by earlier requests the runtime had cancelled (see the Workers rule in §4). Fixed in
`@seidar/cache`, `rpc.ts`, `index.ts` (`boundedScan`), `db.ts`, `prices.ts`, `swap.ts`, `token-icons.ts`,
`worker.ts`. App side: a failed first load no longer renders as 0.00 / empty — `useBalances` and
`useShared` keep the shimmer and retry at 2/4/8/15/30 s (after 4 failures they show what they have and
keep retrying); `apiJsonWarm` returns null (not the empty placeholder) if a scan is still warming;
balances whose prices failed count as a failed load. Performance % KPI now shimmers while holdings load
(it used to show +0.00% at once). Local workerd burst after the fix: cheap routes 0.03–1.7 s warm, no hangs.

Session of 2026-10-29/30 (all pushed, app + API deployed):
- `a5e3ec1` / `08f1b0f` / `954329f` `components/layout/SmoothScroll.tsx`: Lenis `syncTouch` glide on touch,
  own fading scroll-indicator thumb on `(pointer: coarse)` (the glide hides the phone's scrollbar), and
  pull-to-refresh handed back to the browser (`virtualScroll` returns false for a downward pull at the top).
  **Owner confirmed on a real phone (2026-10-30): glide and pull-to-refresh work.**
- `8dcd10d` / `3ded734` / `82288e1` **MetaMask** wallet (`MetaMaskModule` from the kit, `@metamask/connect-stellar`
  0.3.0; logo `public/assets/wallets/metamask-logo.svg`). `CheckedMetaMask` in `lib/wallets.ts` first pings the
  extension (`metamaskResponds`, 12 s: MetaMask's MV3 service worker sleeps and its own detection waits 10 s)
  and fails with `MM_NOT_READY` instead of hanging; `kitOpenAuthModal` returns `{error}` shown via `errorAlert`.
  Earlier hangs were MetaMask's own background being asleep/stuck (even `eth_chainId` got no answer).
  **Owner confirmed MetaMask connects (2026-10-30).** MetaMask Mobile over WalletConnect
  waits on MetaMask PR #31635.
- `7fc51c8` **loading shimmer** after a transaction: `refreshAfterTx(address, kind)` in `lib/tx.ts` marks what
  that tx kind changes (`CHANGES` map: lending, claim, vault, liquidity, perps; balances always) as pending in
  `useShared` / `useBalances`; everything settles after `SETTLE_MS` (22 s). `components/common/Shimmer.tsx`,
  `AmountBox balanceLoading`, applied across vault/lend/pool/portfolio/swap views; KPIs shimmer too.
- `6201996` / `502ff72` **no more flashing**: `invalidateSharedMany` marks entries stale (`at` = 0) instead of
  deleting them; a failed refresh keeps the last good data (`useBalances`, `useActivity`, `usePriceChanges`).
- `2db61cf` / `842c287` notifications: on D1 a SELECT's `rowCount` is rows *changed* (always 0) — use
  `rows.length` (this caused duplicate welcome notes). `listNotes` returns unread only; the panel has an
  "N new" pill and "Mark all as read".
- `922771b` contracts/ (Blend one-tx leverage, see §5) and `8ff84b8` Blend leverage loop.

- `ed41853` worker compat: strip unsupported fetch cache modes; Aquarius warmed by cron.
- `66da776` Cache API first tier, KV only on change; Suspense around URL-driven Earn pages.
- `6bc6806` **API runs on Cloudflare Workers** (D1 portable SQL, KV driver, cron warmers, waitUntil).
- `c7faeb6` Perps: Zenex-fed Lightweight chart (no order book / Recent panel / live pill), TP/SL +
  Funding columns, claimable-credit explainer; Stellar logos in all locked illustrations.
- `419efce` Docs rebuilt from scratch against the real app (Introduction, Getting Started, every
  feature, Protocols, Security, FAQ), lean mobile-safe theme, strict link checks.
- `09926cd` Site: Sentora in marquee/grid, full-height About hero, anti-aliased hero art, type scale.
- `a7ee894` App: narrower settings cards, equal-height history buttons, header Docs button.
- `e34892f` Sentora Evergreen USDC share vault (list, positions, deposit/withdraw/redeem, Merkl APY).
- `c764d98` Dashboard timeline/performance pill, portfolio-only dropdowns, DEX picker with logos.
- `f90541a` / `d131118` Zenex perps end to end.
- `2094bc1` localStorage mirrors for instant revisits.
- `7f81f43` flow-simulation fixes (XOXNO legs, RPC fallback, issuer payments, XOXNO errors).
- `97fd687` bridge token picker; `f0dc5c8` Vaults redesign; `28e00eb` Pools redesign;
  `caa2844` Sushi V3 CL; `1e5d756` Lend & Borrow redesign; `c868b33` portfolios, notifications,
  token icons, docker compose; `175f2b3` Earn + Sentora + Allbridge; `4b4e205` dashboard, swap/send/receive,
  history; `41e0f1f` wallets kit; `cd67ab8` backend without automation; `d776250` new app.
- Older `seidar:` commits are from the pre-rewrite frontend (`d18129d` onward) — history only.

---

## 8. Protocol facts worth not re-learning

- **Zenex (perps)**: market `xlm-usd` (trading `CAOZCITW…`, vault `CB2MX4WX…`, collateral USDC).
  **No order book**: orders are created on-chain and filled by keepers at the Chainlink oracle
  price + fee (0.06% dominant side / 0.04%) + impact (`notional² / impactScalar`, capped 10%).
  Max leverage 20x, init margin 5%, maintenance 2%, max position $500, exec fee $0.01, liq fee 0.5%.
  TP = LimitDecrease (kind 4), SL = StopDecrease (kind 5); open+TP/SL go through the router multicall
  (`authMode: record_allow_nonroot`). **Claimable credit** = earned funding credited at settlement
  plus payouts that couldn't be transferred (e.g. no trustline); `claim_credit` pays it, no fee.
  Zenex's public API: `api.zenex.trade/v1/...` incl. `prices/udf/history` (TradingView UDF).
  Zenex's own app uses TradingView's *licensed* Charting Library; TradingView has **no** Zenex
  symbol (only an unrelated `CRYPTO:ZNXUSD`). We use the free Lightweight Charts with Zenex candles.
  Reference: `docs.zenex.trade` (llms.txt), contract interfaces via
  `stellar contract info interface --id <contract> --network mainnet`; the contract calls in
  `services/api/src/zenex.ts` mirror zenex-sdk-js (not installed: it's a git dependency).
- **Blend**: isolated pools (Fixed, Fixed v2.1, YieldBlox, Orbit, Etherfuse, Solv…). Seidar supplies
  as collateral (`SupplyCollateral`). Pool status → On ice / Frozen / In setup pills. BLND claims are
  per pool; **Fixed v2.1's claim fails** (its backstop `CCS4AZ…` holds 0 BLND) — not our bug.
- **XOXNO**: hubs of spokes; positions live in a numbered account (NFT); first Supply opens it.
- **Swap**: Soroswap aggregator (`SOROSWAP_API_KEY`) over soroswap/phoenix/aqua/sdex/sushi.
  Phoenix has no XLM→USDC route. Seidar adds no fee to normal swaps.
- **Vaults**: DeFindex = full factory catalogue read on-chain (listed above a min TVL, ~124 vaults,
  cold build 2.5–5 min); Upshift = Gami earnUSDC/earnXLM (Merkl APR, ~2-day withdrawal queue);
  Sentora = deposit vaults XLM `CA54LVHM…`, USDC `CAHEWHOP…`, PYUSD `CAQRAXBU…` (principal-only,
  curator APY) + share vault **Evergreen USDC / sentUSDC `CALFCZ4T…`** (Upshift-style ERC-4626,
  13-decimal shares, ~$40M TVL, 8% Merkl APR, fully liquid). Other copies of the deposit-vault wasm
  are test deployments — left out. Sources: DefiLlama adapter `projects/stellarDefiHub`, Merkl
  `api.merkl.xyz/v4/opportunities/?chainId=4`.
- **Bridge**: Allbridge Core over NEAR Intents (`Messenger.NEAR_INTENTS`): quote → one-time deposit
  address (+memo) → user sends on source chain (or "Send with browser wallet" on EVM) → solvers
  deliver USDC/XLM. USDC needs a trustline (the UI offers "ADD USDC TRUSTLINE FIRST").
  EVM RPCs: public defaults, override with `BRIDGE_RPC_<CHAIN>`.
- Trustlines are never auto-added by the API; a missing one surfaces as "Missing trustline…".

---

## 9. Where we left off / next steps

1. **Blend leverage contract on mainnet (owner).** The owner runs, in their *own* terminal (not via the
   `!` prefix, keeps the secret out of the chat): `DEPLOYER_SECRET=S... node contracts/scripts/deploy.mjs mainnet`
   (~26.2 XLM). Then add `BLEND_LEVERAGE_CONTRACT = "C..."` to `services/api/wrangler.toml` `[vars]`, deploy
   the API, and simulate `POST /lending/blend/leverage` (expect one tx; the app shows "Transactions: 1").
   Contract is unaudited and has never had a real signed run.
2. **Phone `ERR_CONNECTION_REFUSED` on app.seidar.xyz (owner's ISP, not our config).** Some resolvers (Google
   DNS) sometimes answer `188.114.96.2` / `188.114.97.2`; from the owner's network those two Cloudflare edge
   IPs refuse every site (Discord too), while `104.21.78.103` / `172.67.220.56` and even `188.114.96.3` work,
   and check-host.net reaches `188.114.96.2:443` fine from 6 countries. Advice given: phone Private DNS
   `one.one.one.one` (Android) / 1.1.1.1 app (iPhone), or another network. Non-Enterprise plans can't pin
   edge IPs; other users on that ISP may hit it. Offered to draft an ISP report — owner hasn't named the ISP.
3. **Workers Paid is active (2026-10-29).** Free-plan gap re-test: see the 2026-10-30 results in the
   next bullet (update them when re-run).
4. Owner-confirmed 2026-10-30: phone glide + pull-to-refresh, feedback email delivery, MetaMask connect,
   perps chart drawing, some production transaction flows. Still unconfirmed: the shimmer on a phone,
   the scroll indicator, and that the 0.00-on-open incident fix (§7) holds in daily use.
5. Agent backend needs the `ANTHROPIC_API_KEY` Worker secret. Stellar Wallets Kit stays on 2.7.1 (2.8.0 only
   adds a Varial module; not adopted).
6. Production transaction flows: the owner has run some successfully (2026-10-30); which ones exactly
   wasn't listed. Bridge and perps flows are the least exercised.
7. Perps chart: confirmed drawing by the owner (2026-10-30).
7b. Soroswap / Phoenix indexers answer 429 to `[dex-activity]` reads at times (seen in logs 2026-10-30);
   LP positions still load (activity is best-effort), but watch it.
8. **Asset page** (`/asset`, `components/asset/*`) — parked by the owner ("keep it for later").
9. **Templar vaults** were in the original brief but are **not integrated**: Merkl's Templar
   opportunities use `0x…` addresses, not Stellar contracts — confirm Templar has Stellar vaults first.
   DefiLlama does list **Templar Protocol as Stellar lending (~$11.7M TVL, 2026-10-30)**, so it now exists
   on Stellar; it shows on Home's protocol list linking out to its site.
   Untangled is listed as "pending registry (address unpublished)".
10. Small known leftovers:
   - Dashboard locked illustration (`public/assets/tokenTableLocked.png`) still has an "AI Insights"
     column header (Seidar has no AI Insights). Remove if the owner wants.
   - `auth.ts` is dead code (not imported).
   - Vault snapshots use an in-memory hourly guard, so on Workers several isolates may each write one.
   - D1 starts empty: price history / 24h change from our own snapshots fill in over a day.
11. Docs (`apps/docs`) are accurate as of `c7faeb6`; update them with any product change
   (strict link checks will catch broken references).

---

## 10. Verification checklist before you commit

- App: `cd apps/app && npx tsc --noEmit && npx next lint --dir src`
- API: `cd services/api && npx tsc --noEmit -p .` and `npm test --workspace @seidar/api`
- Packages changed → `npx tsc -b tsconfig.json`
- Docs changed → `cd apps/docs && npm run build`
- UI changed → look at it in the browser (interceptor), not just the typecheck.
- `git status --short` clean of anything secret; root `package.json` has no `packageManager` line.
- Deploys: see the table in §5; after deploying, curl the live host and read the result.
