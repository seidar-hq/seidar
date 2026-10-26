---
id: swap
title: Swap
sidebar_label: Swap
description: "Swap Stellar assets at the best price across Soroswap, Aquarius, Phoenix, Sushi and the Stellar DEX."
---

<p className="lead">Swap finds the best price for a trade across Stellar's DEXs and can split one swap over several of them.</p>

Open it from **Trade → Swap**, or use the widget on the Dashboard. The same widget has [Send & Receive](/features/send-receive) tabs.

## How routing works

Quotes come from the Soroswap aggregator, which searches these venues:

| Venue | Type |
| --- | --- |
| **Soroswap** | Soroban AMM |
| **Aquarius** | Soroban AMM (constant-product and stable pools) |
| **Phoenix** | Soroban AMM |
| **Sushi** | Soroban AMM (concentrated liquidity) |
| **Stellar DEX** | Stellar's built-in order book and liquidity pools |

On **Auto** (the default), the aggregator picks the route with the best output and may split your amount across several venues and hops. To restrict a swap, open the DEX selector and pick one or more venues; the quote then only uses those.

## Making a swap

1. Choose the token to sell under **From** and enter an amount. **MAX** fills your full balance; for XLM it keeps 2 XLM back for the account reserve and fees.
2. Choose the token to buy under **To**. Your balance of each token shows under its amount.
3. Set **Max Slippage** (0.1%, 0.5% or 1%, or type your own). Default: 0.5%.
4. Check the quote details, then click **EXCHANGE** and approve in your wallet.

Quotes refresh every 20 seconds while the form is open.

## Quote details

| Field | Meaning |
| --- | --- |
| **Rate** | The quoted exchange rate for your amount |
| **Minimum received** | The least you get after slippage; below this the swap reverts and nothing is traded |
| **Price impact** | How far your trade moves the pool price |
| **Route** | The venues the swap is split across |
| **Max slippage** | Your tolerance setting |
| **Network fee** | The Stellar fee, paid in XLM by your wallet (usually well under 0.01 XLM) |

Seidar warns you when price impact is **3%** or more and shows the warning in red from **10%**. High impact usually means the pools are shallow for your size; try a smaller amount or a different pair.

## Fees

Seidar adds no fee to swaps. You pay each venue's own pool fee (included in the quote) and the Stellar network fee.

## Troubleshooting

| Message | What to do |
| --- | --- |
| **NO ROUTE** | No venue has liquidity for this pair, or none of the venues you selected does. Switch back to **Auto** or route through XLM or USDC. |
| **INSUFFICIENT &lt;token&gt;** | The amount exceeds your balance. Remember the XLM reserve. |
| **Missing trustline** | Your account can't hold the token you're buying yet. Add the trustline in your wallet first. |
| **Swap reverted** | The price moved beyond your slippage before the transaction landed. Try again or raise slippage slightly. |
