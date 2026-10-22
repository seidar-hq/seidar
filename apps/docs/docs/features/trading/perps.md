---
id: perps
title: Perps
sidebar_label: Perps
description: Trade perpetual futures on Stellar through Zenex, with long and short positions, leverage, and real-time market data.
---

Seidar integrates **Zenex**, a fully on-chain perpetual futures exchange built on Stellar's Soroban smart contract platform. You can trade leveraged long or short positions from the same workspace you use for spot swaps and portfolio tracking.

## What you can do

- **View live markets** — mid prices and market parameters for listed Zenex markets
- **Read market depth** — order book and recent trades
- **Chart price history** — candles across multiple intervals
- **Open positions** — go long or short with collateral and leverage
- **Manage orders** — market, limit, and stop orders, plus take-profit and stop-loss exits
- **Track positions** — size, collateral, leverage, entry price, unrealised PnL, and liquidation price
- **Monitor risk** — margin usage, funding, borrowing interest, and liquidation levels

## Before you trade

Perpetual futures are derivatives. You need:

1. A connected Stellar wallet.
2. The market's **settlement asset** — commonly USDC on Stellar.
3. Enough XLM for Stellar network fees, or the fee token required by a relayed action.
4. Enough collateral to cover the position and its fees.

Each Zenex market has its own fees, leverage limit, liquidity capacity, and risk parameters.

## Opening a position

1. **Choose a market and side** — select the asset, then choose **Long** or **Short**.
2. **Enter collateral and leverage** — review the resulting size, fees, and estimated liquidation price.
3. **Choose an order type** — market, limit, or stop. Limit and stop orders require a trigger price. Market orders use a slippage limit.
4. **Add exits if needed** — take-profit and stop-loss orders are separate orders, each with its own execution fee.
5. **Review and sign** — check the market, side, size, collateral, price bound, expiry, and fees before signing.
6. **Follow the result** — a market order may fill in the same transaction; a limit or stop order may rest until its trigger is met.

:::caution
A stop-loss is not guaranteed to execute at the trigger price. A keeper must fill the order, and the fill can happen later or at a worse price, especially in a fast market. Until it fills, your position remains open and can still be liquidated.
:::

## Positions

A position gives you leveraged exposure to a market's price.

- You can hold one long and one short in the same market.
- An order on a side you already hold changes that position.
- You can increase a position, partially close it, or adjust margin.
- Some markets apply a **decrease lock** that prevents reducing a position during a short window.
- Closing a position realises profit or loss and settles accrued funding and borrowing costs.

## Orders

| Order type | Use |
| --- | --- |
| **Market** | Execute at the best available price within your slippage limit |
| **Limit** | Execute at your trigger price or better |
| **Stop** | Trigger an exit when a price level is reached |
| **Take-profit** | Close or reduce a position at a target profit level |
| **Stop-loss** | Close or reduce a position at a loss limit |

Orders can expire. An expired order still holds its escrow until it is cancelled. Cancelling returns the escrow but does not refund transaction fees already spent.

## Margin and leverage

Margin is the collateral backing your position. Leverage multiplies your exposure relative to that collateral.

- Higher leverage increases both potential profit and liquidation risk.
- The maximum leverage depends on the market.
- Your liquidation price depends on your entry price, collateral, size, fees, and accrued costs.
- A position's margin bounds its trading loss, but separate orders, relay fees, and active session permissions can still commit other available funds.

## Fees and ongoing costs

| Charge | When it applies |
| --- | --- |
| **Trade fee** | When a fill moves size, including a close |
| **Impact fee** | When a fill moves size; larger fills pay more |
| **Execution fee** | When an order is created and executed; each order escrows its own fee |
| **Borrowing interest** | While your side pays for reserved liquidity |
| **Funding** | While your side is the paying side of the funding rate |
| **Liquidation fee** | When a keeper liquidates your position |
| **Network fee** | When you submit a Stellar transaction, or a token fee for a relayed action |

Rates vary by market. Check the market's current parameters before trading.

## Funding and borrowing interest

- **Funding** is a periodic payment between longs and shorts that helps keep the perpetual price close to the underlying price.
- **Borrowing interest** accrues while your side uses reserved liquidity.
- Both are settled against the position and can reduce your equity over time.

## Liquidation and auto-deleveraging

If your position's equity falls below the maintenance requirement, a keeper can close the whole position and charge a liquidation fee. You may lose all of the margin behind that position.

In extreme conditions, auto-deleveraging (ADL) can reduce eligible positions without another approval when one side's profit grows too large relative to the vault.

## Market data

Seidar shows live market data from Zenex:

- Mid prices
- Order book depth
- Recent trades
- OHLC candles across multiple intervals

Data updates in real time while the market view is open.

## Risks

Perpetual futures involve significant risk:

- **Leverage** can consume all of the margin behind a position.
- **Liquidation** can close a position at a loss.
- **Funding and borrowing costs** accrue over time.
- **Delayed exits** can leave a stop or limit order unfilled.
- **Oracle or network failure** can delay execution or produce a price that differs from the display.
- **Protocol risk** — Zenex is a third-party protocol. Its markets, contracts, and governance can change. The Zenex documentation states that the current deployed contracts have not had an independent audit; the published report covers an earlier version.
- **Vault risk** — Zenex market vaults take the other side of trades, and vault shares can lose value.

Review the [Zenex documentation](https://docs.zenex.trade) and the market's current parameters before trading. Nothing in Seidar is financial advice.
