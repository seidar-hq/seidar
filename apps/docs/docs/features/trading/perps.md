---
id: perps
title: Perpetuals
sidebar_label: Perps
description: "Trade XLM perpetual futures with up to 20x leverage on Zenex, with market, limit and stop orders, take-profit and stop-loss."
---

<p className="lead">Perps lets you go long or short XLM with leverage, settled in USDC, through Zenex: a fully on-chain perpetuals exchange on Stellar.</p>

Open it from **Trade → Perps**.

## How Zenex works

Zenex has **no order book**. Every trade is against the market's liquidity vault at the **oracle price**, plus fees and a price-impact charge that grows with size. Orders are created on-chain by your transaction and then **filled by Zenex keepers**, usually within seconds.

That has two consequences:

- A market order isn't filled inside your own transaction. It's placed, then a keeper fills it at the oracle price at that moment, within your slippage limit.
- The **Order Book** panel next to the chart isn't other traders' orders. It's a fill schedule: the price you'd get at each size on either side, after impact.

## The XLM/USD market

| Parameter | Current value |
| --- | --- |
| Settlement and margin | USDC |
| Max leverage | 20x |
| Initial margin | 5% of position size |
| Maintenance margin | 2% of position size |
| Min order | $1 notional, $1 margin |
| Max position | $500 notional |
| Trading fee | 0.06% on the side with more open interest, 0.04% on the other |
| Execution (keeper) fee | $0.01 per order |
| Liquidation fee | 0.5% |

These are set by Zenex and can change; the order panel always uses the live values.

## Placing an order

1. Pick **Long** (profit if XLM rises) or **Short** (profit if it falls).
2. Pick an order type:
   - **Market**: fill now at the oracle price, within **Max slippage**.
   - **Limit**: fill only at your price or better.
   - **Stop**: trigger once the price crosses your level.
3. Enter **Margin** (USDC) and **Leverage**, or enter **Size** directly in XLM or USD; switch the unit with the toggle. Margin, size and leverage stay in sync.
4. For limit and stop orders, set the trigger **Price** and **Expires in** (1 hour, 1 day, 7 days or 30 days).
5. Optionally turn on **Take profit / Stop loss** and set either price. They're created with the order in the same transaction.
6. Review the estimated liquidation price, trading fee and the total **You pay**, then click **Place order** and sign.

## Managing positions

The panel under the chart has five tabs: **Positions**, **Open Orders**, **Order History**, **Trades** and **Closed**.

Each open position shows size, entry and liquidation price, margin, leverage and net PnL (after funding and borrowing). Its actions:

| Action | What it does |
| --- | --- |
| **Close** | Close all or part of the position at market |
| **Add margin** | Post more USDC to lower leverage and move liquidation away |
| **Withdraw** | Take margin out (within the initial-margin limit) |
| **TP / SL** | Add or change take-profit and stop-loss orders |

Open limit, stop, TP and SL orders can be cancelled from **Open Orders**. Cancelling returns the order's escrow.

### Account summary

The account card shows wallet USDC, position equity, margin in use, unrealised net PnL, open orders and **Claimable credit**: funding earned and payouts the market couldn't send directly. Click **Claim** to move it to your wallet.

## Ongoing costs

- **Funding** moves between longs and shorts to keep the market balanced. The more crowded side pays.
- **Borrowing** is charged to positions that use the vault's liquidity.

Both accrue every second and settle against your margin when the position changes or closes.

## Liquidation

If your equity falls below the maintenance margin (2% of size), a keeper liquidates the whole position and charges the 0.5% liquidation fee. You can lose all the margin in that position. Watch the liquidation price, and add margin or reduce size if the market moves against you.

:::caution
Stop-losses and take-profits are executed by keepers once the oracle price crosses the trigger. In a fast market they can fill later, and at a worse price, than the level you set.
:::

## Chart

The price chart is TradingView's XLM/USD chart. Zenex fills at its own oracle price, which tracks major markets closely but can differ slightly from the chart at any moment. The **Recent** tab lists the latest fills on Zenex.
