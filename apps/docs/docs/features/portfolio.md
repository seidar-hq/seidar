---
id: portfolio
title: Portfolio
sidebar_label: Portfolio
description: "See the total value, history, allocation and every position across the wallets in a Seidar portfolio."
---

<p className="lead">Portfolio is your whole Stellar footprint on one screen: wallet balances plus every lending, liquidity, vault and perps position, priced in USD.</p>

## What it covers

Portfolio shows the **active portfolio**: every wallet in it, added together. Use the portfolio dropdown next to the page title to switch portfolios. To manage what's in each one, see [Portfolios & Wallets](/features/wallets).

Seidar reads positions directly from each protocol's contracts:

| Source | What's counted |
| --- | --- |
| Wallet balances | XLM, classic assets and Soroban tokens held by each wallet |
| Blend, XOXNO | Supplied collateral and borrowed debt |
| Soroswap, Aquarius, Phoenix, Sushi | Your share of each liquidity pool, split into its two tokens |
| DeFindex, Upshift, Sentora | Vault shares converted to their underlying asset |
| Zenex | Open perpetual positions, margin and unrealised PnL |

Prices come from on-chain DEX liquidity and market feeds. An asset with no reliable price shows its amount without a USD value and isn't counted in the total.

## Portfolio balance

The top card shows the portfolio's **total value** and a performance pill with its change over the selected period. The view selector chooses what's counted:

- **All Assets + Positions**: wallet balances plus DeFi positions (net of debt)
- **Assets**: wallet balances only
- **Positions**: DeFi positions only

The card has three tabs.

### Timeline

A chart of portfolio value over **1d, 7d, 30d, 90d or 1y**, with separate lines for assets and positions. Hover anywhere on the chart to see the value at that time, split by line, with the combined total.

The timeline values your *current* holdings at historical prices. It shows how today's portfolio would have moved, not a record of past balances.

### Allocation

How the portfolio splits across assets and positions, as a share of the total.

### Performer

Your best and worst movers over **1h, 1d, 7d, 14d, 30d or 1y**, ranked by USD change.

## Position tables

Below the balance card, tabs break the portfolio down:

| Tab | Columns |
| --- | --- |
| **Assets** | Token, balance, USD value, 24h change, allocation |
| **Supplied** | Asset, protocol (lending market or pool), amount, USD value |
| **Borrowed** | Asset, protocol, debt, USD value |
| **Vaults** | Vault, underlying amount, USD value |
| **Perps** | Market, side, size, position value, entry and liquidation price, margin and leverage, net PnL |

When the portfolio has more than one wallet, each table adds a **Wallet** column so you can see where a position lives. Click a column header to sort.

## Refreshing

Balances update live as ledgers close. Protocol positions refresh every few minutes and whenever you complete a transaction in Seidar. If something looks out of date, reload the page.

:::tip Missing a position?
Seidar only reads protocols it integrates; see [Supported Protocols](/protocols). A position opened on a protocol outside that list won't appear, though the tokens it pays out to your wallet will.
:::
