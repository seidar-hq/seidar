---
id: overview
title: Earn Overview
sidebar_label: Overview
description: "The three ways to earn yield on Stellar through Seidar: lending, liquidity pools and vaults."
---

<p className="lead">Earn puts Stellar's yield sources side by side: lending markets, DEX liquidity pools and managed vaults.</p>

| | [Lending & Borrowing](/features/earn/lending-borrowing) | [Liquidity Pools](/features/earn/liquidity) | [Vaults](/features/earn/vaults) |
| --- | --- | --- | --- |
| **You earn from** | Borrowers' interest, plus BLND emissions on Blend | Trading fees, plus incentives on some pools | Whatever the vault's strategy earns |
| **Protocols** | Blend, XOXNO | Soroswap, Aquarius, Phoenix, Sushi | DeFindex, Upshift, Sentora |
| **You manage** | Supply, borrow, health factor | Pair, amounts, price range | Just the deposit |
| **Main risk** | Liquidation if you borrow | Impermanent loss, out-of-range positions | Strategy and curator risk |
| **Withdrawals** | Any time, if the market has free liquidity | Any time | Instant or queued, depending on the vault |

## Reading APY

- **Supply APY** and **Borrow APY** on lending markets are the current rates. They move with utilisation.
- **Pool APY** is estimated from recent trading fees relative to the pool's liquidity. Past volume doesn't guarantee future fees.
- **Vault APY** is what the vault's strategies have been earning, or the rate its curator advertises.

All rates are variable. None of them is guaranteed.

## Your positions

Everything you deposit through Earn appears on the [Portfolio](/features/portfolio) under **Supplied**, **Borrowed** and **Vaults**, and each Earn page shows your own positions above its market list.

:::caution Smart contract risk
Each protocol is a separate set of smart contracts with its own audits, admins and failure modes. Seidar builds transactions for them but doesn't control or insure them. Spreading deposits across protocols limits the damage if one fails.
:::
