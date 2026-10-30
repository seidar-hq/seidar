---
id: home
title: Home
sidebar_label: Home
# Home is still in development: visible in `npm start`, left out of production builds until it ships
# (then remove `draft`, and add it back to sidebars.ts, the footer, index.md and getting-started.md).
draft: true
description: "The Stellar market at a glance: DeFi TVL, assets by category, top assets, protocols and network activity."
---

<p className="lead">Home is the market overview of Stellar. It works without a wallet: DeFi TVL and its history, a market chart you can compare assets on, the main assets by category, protocols by TVL and daily network activity. The right-hand column shows your portfolio once you connect, plus protocols and news.</p>

## Charts: zoom and compare

Every chart on Home and on the asset pages can be stretched and compressed:

- **Drag the price axis** (right or left edge) up or down to stretch or compress prices
- **Drag the time axis** (bottom) or scroll over the chart to zoom in and out of time; drag the chart to move along it
- **Double-click an axis**, or press the reset button in the chart's corner, to fit everything again

## Stellar at a glance

| Card | What it shows |
| --- | --- |
| **Stellar DeFi** | Total value locked in Stellar DeFi, its 24h and 7d change, the stablecoin supply on Stellar, and a TVL chart over 30d, 90d, 1y or all time |
| **Your portfolio** | Once a wallet is connected: the active portfolio's total, its 24h change, wallet assets, supplied, borrowed and unclaimed rewards, with a link to [Portfolio](/features/portfolio) |
| **XLM Price** | Last XLM price on the Stellar DEX, 24h change and market cap |
| **Stablecoins** | Market cap of every stablecoin issued on Stellar |
| **Daily Payments** | Payments over the last full UTC day against the day before, plus transactions |
| **Active Accounts** | Accounts that sent a transaction over the last full UTC day against the day before |

## Markets

A watchlist and a chart side by side. Sort the list (market cap, 7-day volume, 24h gainers or losers, holders) or search it; select an asset to chart it, double-click to open its page.

Above the chart, **+ Add** compares up to three more assets with the selected one:

- **Price**: each asset in its own currency, the selected one on the right axis and the compared ones on the left
- **% change**: every asset as percent change over the period, on one axis

Periods: 1D, 1W, 1M, 3M, 1Y. Assets with no Stellar DEX price history (fund tokens priced at NAV, Soroban-only tokens) can be listed but not charted.

## Top assets

Three top-5 lists: **Most Traded** (7-day volume on the Stellar DEX), **Top Market Cap** and **Most Held** (accounts holding a balance). Select an asset to open its page.

## Assets

Every listed asset, filtered by category with the chips above the table:

| Category | What's in it |
| --- | --- |
| **Stablecoins** | Tokens pegged to a fiat currency: USDC, EURC, PYUSD, USDT0, USDGLO, and local-currency coins such as ARST, NGNC and ZARZ |
| **RWA** | Tokenised real-world assets: Franklin Templeton's BENJI money-market fund, Ondo's USDY, Etherfuse's CETES, USTRY and TESOURO government bonds, and Centrifuge's deJTRSY and deJAAA (Janus Henderson Anemoy funds) |
| **Yield-bearing** | Tokens whose value grows with the yield they earn: the RWA tokens above and Ultra Capital's yUSDC, yXLM, yBTC and yETH |
| **DeFi tokens** | Protocol tokens: AQUA, BLND, PHO, XRF |
| **XLM & wrapped** | XLM and wrapped BTC, ETH and XRP |
| **Other** | Other well-rated Stellar assets with a verified home domain |

An asset can be in more than one category (USDY is both RWA and yield-bearing). Search by code, name or issuer domain, and sort by any figure.

Asset codes aren't unique on Stellar: anyone can issue a token called "USDC". Seidar lists each category asset by its **verified issuer** and leaves out look-alikes that reuse a listed code.

| Column | Meaning |
| --- | --- |
| **Price** | Last price on the Stellar DEX. Fund tokens without a market (BENJI) show their net asset value, marked **NAV** |
| **24h / 7d** | Price change, and a 7-day line |
| **Market cap** | Supply on Stellar × price; for XLM, its circulating market cap. Issued supply can include tokens the issuer still holds |
| **7d DEX volume** | Traded on the Stellar DEX over the last 7 days, in USD |
| **Holders** | Accounts holding a non-zero balance. Not published for Soroban-only tokens (deJTRSY, deJAAA) |

**Swap** opens [Swap](/features/trading/swap) with the asset selected as the token to buy. It's disabled for assets the swap aggregator doesn't route yet.

## Asset page

Selecting an asset opens its page: price and a zoomable chart (1D to 1Y) with the same compare tools, market cap, supply, holders, 7-day volume, 24h, 7d and 30d change. On the right:

- **Your holding**: how much of it your portfolio holds in wallets, supplies and borrows
- **Earn with it**: lending markets, pools and vaults on Seidar that take the asset, best APY first

## Protocols and network activity

**Protocols on Stellar** lists DeFi protocols by TVL on Stellar (centralised exchanges excluded). Protocols Seidar integrates open their Seidar page; the others open their own site.

**Network activity** charts daily transactions, payments, DEX trades or active accounts over 30d, 90d or 1y, with the period's daily average against the period before.

## Data sources

| Data | Source |
| --- | --- |
| Asset prices, supply, holders, DEX volume | [Stellar Expert](https://stellar.expert) |
| XLM market cap | CoinGecko |
| deJTRSY, deJAAA price and supply | XOXNO's price oracle; supply from the token contracts |
| DeFi TVL, protocols, stablecoin supply | [DefiLlama](https://defillama.com/chain/Stellar) |
| Network activity | Stellar Expert daily network statistics |
| Asset page chart | Seidar's price feed |

Market data refreshes every few minutes.
