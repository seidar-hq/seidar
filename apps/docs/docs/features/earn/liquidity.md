---
id: liquidity
title: Liquidity Pools
sidebar_label: Liquidity Pools
description: "Provide liquidity to Soroswap, Aquarius, Phoenix and Sushi pools, including concentrated-liquidity ranges."
---

<p className="lead">Deposit two tokens into a DEX pool and earn a share of the trading fees every swap through it pays.</p>

Open it from **Earn → Pools**.

## Pools

| Protocol | Pool types |
| --- | --- |
| **Soroswap** | Constant product |
| **Aquarius** | Constant product, stable and concentrated |
| **Phoenix** | Constant product and stable |
| **Sushi** | Concentrated |

The pool table shows each pool's TVL, estimated APY, fee tier and protocol. Your own positions are listed above it with their current value. Click a pool to open its page: price and volume charts, recent transactions, and the **Supply** and **Withdraw** panel.

## Constant-product and stable pools

These pools spread your liquidity across every price.

1. Open the pool and go to **Supply**.
2. Enter an amount for either token. The other fills in at the pool's current ratio.
3. Review and sign. You receive pool shares (LP tokens) representing your part of the pool.

**Withdraw** burns shares and returns both tokens in the pool's ratio at that moment.

Stable pools use a curve designed for assets that should trade near 1:1 (for example two dollar stablecoins), giving lower slippage around that price.

## Concentrated liquidity

Concentrated pools let you choose the **price range** your liquidity covers. Inside the range it earns far more fees per dollar than a full-range position; outside it, it earns nothing.

1. Choose **Full Range** or **Custom Range**.
2. For a custom range, set the minimum and maximum price. The chart shows the current price against your range.
3. Enter an amount. The second token is calculated from the current price and your range: a range entirely above or below the current price needs only one of the two tokens.
4. Review and sign. Each deposit is a separate position with its own range.

When the price leaves your range, the position becomes 100% one token and stops earning until the price comes back. You can withdraw it and open a new one around the current price.

## Fees and APY

Each pool charges a fee on every swap through it (the **fee tier**), shared among liquidity providers by their share of liquidity. APY is estimated from recent volume and doesn't include price changes in the tokens themselves.

## Impermanent loss

When the two tokens' prices diverge, the pool rebalances you into more of the token that fell. Compared with simply holding both, you end up with less value: that gap is impermanent loss. Fees offset it, and it reverses if prices return, but it's realised when you withdraw. Concentrated positions earn more fees and also take more impermanent loss within their range.
