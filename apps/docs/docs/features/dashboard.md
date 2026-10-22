---
id: dashboard
title: Portfolio Dashboard
sidebar_label: Portfolio Dashboard
description: Track balances, DeFi positions, performance, allocation, and quick actions across your Stellar wallets.
---

The Dashboard is the central view of your Seidar portfolio. It combines token balances and DeFi positions across your linked Stellar wallets and supported protocols into one place.

## Overview

When you open Seidar, the Dashboard shows:

- **Total portfolio value** in USD
- **Performance** over time
- **Total utilised** — the share of your portfolio deployed in DeFi positions
- **24-hour change**
- **Asset allocation**
- **Positions** grouped by protocol and product
- **Quick swap** for fast token swaps
- **Market news** from the Stellar and wider crypto ecosystem

## Portfolio metrics

| Metric | Description |
| --- | --- |
| **Total Value** | Wallet balances across the active portfolio |
| **Total Invested Value** | Value held in lending, liquidity, vault, and perps positions |
| **Total Worth** | Total Value plus Total Invested Value |
| **Utilised** | Share of total worth deployed in DeFi positions |
| **24h Change** | Change in portfolio value over the last 24 hours |
| **Asset Allocation** | Percentage breakdown by asset |

Protocols or wallets that are switched off for the active portfolio are excluded from every metric, so the headline figures match the positions shown below them.

:::note
**Still syncing**

The first time a large wallet is loaded, Seidar may still be reading its balances and positions. While that is in progress, the Dashboard shows the figures found so far with a loading indicator. They are real, but not yet complete, and fill in automatically.
:::

## Portfolio chart

The performance chart shows your portfolio value over time with selectable timeframes:

- **1d** — last 24 hours
- **7d** — last 7 days
- **30d** — last 30 days
- **90d** — last 90 days
- **1y** — last year

## Dashboard tabs

The Dashboard separates your activity into focused views:

| Tab | What it shows |
| --- | --- |
| **Assets** | Token holdings, prices, balances, and allocation |
| **Yields** | Lending, liquidity, and vault positions with current value and yield |
| **Perps** | Open Zenex positions, margin, and unrealised PnL |
| **Borrow** | Outstanding debt, collateral, and health factor |

## Asset table

The asset table lists the assets in your portfolio with:

- Asset name and code
- Balance
- Value in USD
- Price and 24-hour price change
- Protocol positions, where relevant
- **AI Insights** — click the sparkle icon to generate an [AI-powered analysis](/features/ai-insights) of that asset

Click an asset to open its detail view, including:

- Price chart
- Market data such as market capitalisation, volume, and price changes
- Your holding, average entry price, and position value

## Multi-wallet aggregation

If the active portfolio contains more than one wallet, the Dashboard aggregates them automatically. You can:

- View the combined portfolio
- Switch to another portfolio
- Filter by an individual wallet
- See which wallet holds which asset

Linked wallets and portfolios are managed from [Wallet Management](/features/wallets).

## Real-time updates

The Dashboard updates after transactions you make in Seidar, and incoming transfers are picked up from the network shortly after they confirm. Position values refresh as protocol state and asset prices change.

## Quick swap

The embedded swap widget lets you swap assets without opening the full Trade page:

1. Select the asset to swap from.
2. Select the asset to swap to.
3. Enter the amount.
4. Review the quote and sign.

For routing, slippage, and transaction details, see [Swap](/features/trading/swap).

## Market news

The Dashboard includes a market news panel. Headlines are informational only and are not investment advice.
