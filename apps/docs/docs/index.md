---
id: index
slug: /
title: Introduction to Seidar
sidebar_label: Introduction
description: "Seidar is a non-custodial DeFi workspace for Stellar. Track every position, swap, trade perps, lend, provide liquidity, deposit into vaults and bridge in, from one place."
---

<p className="lead">Seidar is a non-custodial DeFi workspace built only for Stellar. Connect a wallet once and see, manage and act on everything you hold across Stellar's protocols.</p>

Stellar has lending markets, DEXs, perpetuals and yield vaults, but each lives in its own app with its own view of your money. Seidar reads all of them from the chain, puts your positions side by side, and builds the transactions you need, which your wallet then signs.

## What you can do

| Area | What it does |
| --- | --- |
| **[Dashboard](/features/dashboard)** | Total value, balance timeline, allocation and best/worst performers across every wallet in a portfolio, plus tables for assets, supplied, borrowed, vault and perps positions. |
| **[Portfolios & Wallets](/features/wallets)** | Group wallets into portfolios and switch the active portfolio and signing wallet. |
| **[Swap](/features/trading/swap)** | Best-price swaps routed across Soroswap, Aquarius, Phoenix, Sushi and the Stellar DEX, or pinned to the venues you choose. |
| **[Perps](/features/trading/perps)** | Long or short XLM with leverage on Zenex: market, limit and stop orders with take-profit and stop-loss. |
| **[Lending & Borrowing](/features/earn/lending-borrowing)** | Supply, borrow, repay and withdraw on Blend and XOXNO, with health tracking and BLND claims. |
| **[Liquidity Pools](/features/earn/liquidity)** | Add and remove liquidity on Soroswap, Aquarius, Phoenix and Sushi, including concentrated ranges. |
| **[Vaults](/features/earn/vaults)** | Deposit into DeFindex, Upshift and Sentora vaults. |
| **[Send & Receive](/features/send-receive)** | Pay any Stellar address with an optional memo, or share your address and QR code. |
| **[Bridge](/features/bridge)** | Bring USDC, USDT and native tokens from ten chains into Stellar. |
| **[History](/features/transactions)** | Every transaction across your wallets, filterable by type and exportable to CSV. |

## How it works

1. **Read.** Seidar's API reads balances, positions, pool reserves, vault shares and prices directly from Stellar (Soroban RPC and Horizon) and from each protocol's contracts.
2. **Build.** When you act, Seidar builds and simulates the Soroban transaction so you can see what will happen before anything is signed.
3. **Sign.** Your wallet shows the transaction and you approve it. Seidar never sees your keys and never holds funds.
4. **Track.** The result appears in your dashboard and history as soon as the ledger closes.

:::info Stellar mainnet only
Seidar runs on Stellar mainnet. There are no other chains to switch to; the Bridge exists to bring funds *into* Stellar.
:::

## Start here

<div className="card-grid">
  <a href="/getting-started"><strong>Getting Started</strong><span>Connect a wallet, set up a portfolio and make your first move.</span></a>
  <a href="/protocols"><strong>Supported Protocols</strong><span>Every Stellar protocol Seidar reads from and writes to.</span></a>
  <a href="/security"><strong>Security & Custody</strong><span>What Seidar can and cannot do with your funds.</span></a>
  <a href="/faq"><strong>FAQ</strong><span>Fees, failed transactions, missing positions and more.</span></a>
</div>
