---
id: index
slug: /
title: Introduction to Seidar
sidebar_label: Introduction
description: Seidar is a unified DeFi workspace for Stellar. Track your portfolio, swap, trade perps, lend, provide liquidity, use vaults, and get AI-powered insights.
hide_title: true
hide_table_of_contents: true
---

<div className="docs-hero">
  <p className="docs-hero__eyebrow">Seidar Documentation</p>
  <h1>Stellar DeFi, all in one place</h1>
  <p>
    Discover protocols, manage portfolios, and turn on-chain data into intelligence. Seidar brings
    Stellar&apos;s lending, liquidity, trading, and vaults into one non-custodial workspace.
  </p>
  <div className="docs-hero__actions">
    <a className="button button--primary" href="https://app.seidar.xyz">Launch Seidar</a>
    <a className="button button--secondary" href="/getting-started">Get Started</a>
  </div>
</div>

**Seidar** is an all-in-one DeFi workspace built exclusively for Stellar. It gives you a single place to track your portfolio, swap assets, trade perpetual futures, lend and borrow, provide liquidity, and deposit into yield vaults — without handing over custody of your funds.

Instead of jumping between separate Stellar applications, you connect your wallet once and see your positions across supported protocols together.

## What is Seidar?

Seidar is a **unified gateway to Stellar DeFi**. It aggregates the protocols that matter on Stellar into one interface and turns the resulting on-chain data into a portfolio view you can actually act on.

- **One portfolio view** across your connected wallets and supported protocols.
- **One trading interface** for spot swaps and perpetual futures.
- **One earn interface** for lending, liquidity, and vaults.
- **AI analysis** grounded in Stellar market and protocol data.
- **Non-custodial execution** — every transaction is signed by your wallet.

## Key capabilities

| Feature | Description |
| --- | --- |
| **Portfolio Dashboard** | Track balances, DeFi positions, performance, and allocation across wallets and protocols |
| **Swap** | Swap Stellar assets through aggregated routes across supported DEXs |
| **Perps** | Trade long or short perpetual futures with leverage through Zenex |
| **Lending & Borrowing** | Supply assets, borrow against collateral, and manage health through Blend and XOXNO |
| **Liquidity Provisioning** | Provide liquidity to Soroswap, Aqua, Phoenix, and Sushi pools |
| **Vaults** | Deposit into automated strategies from DeFindex and Upshift |
| **AI Insights** | Generate token analysis and portfolio reports with selectable risk profiles |
| **Send & Receive** | Transfer XLM and Stellar assets, with QR codes and memos |
| **Transaction History** | Review swaps, transfers, lending activity, liquidity actions, vault deposits, and perps |

## Supported protocols

Seidar integrates Stellar-native protocols across four categories:

| Category | Protocols |
| --- | --- |
| **Trading** | Soroswap, Aqua, Phoenix, Sushi (swap); Zenex (perps) |
| **Lending** | Blend, XOXNO |
| **Liquidity** | Soroswap, Aqua, Phoenix, Sushi |
| **Vaults** | DeFindex, Upshift |

Asset pricing is supported by **Reflector**, a Stellar price oracle network.

## Supported networks

Seidar runs on Stellar:

- **Stellar Mainnet** — the public network for real assets and live protocol positions.
- **Stellar Testnet** — a sandbox for trying flows with test funds when the underlying protocol is deployed there.

There are no EVM chains or rollups in Seidar. Stellar is the product, not one chain among many.

## Non-custodial by design

Seidar never holds your keys or your funds.

1. You connect a Stellar wallet.
2. Seidar prepares the transaction and shows you the details.
3. Your wallet asks you to review and sign.
4. The signed transaction is submitted to Stellar.
5. Seidar reads the result from the network and updates your portfolio.

Sign-in uses an off-chain message signature. It is free, creates no transaction, and does not give Seidar permission to move your assets.

## Built for Stellar

Seidar is designed around Stellar's primitives:

- **Horizon** for balances, payments, trades, and account activity.
- **Soroban RPC** for smart contract state, simulations, and events.
- **Reflector** for asset pricing.
- **Stellar assets** identified by asset code and issuer, or by their Soroban contract.
- **XLM** for network fees and account reserves.

The application is built with a Next.js and TypeScript frontend, Stellar wallet integrations, and a TypeScript indexing and API layer backed by PostgreSQL and Redis.

## Next steps

- [Getting Started](/getting-started) — connect a wallet and find your way around.
- [Portfolio Dashboard](/features/dashboard) — understand the main view.
- [Swap](/features/trading/swap) — make your first Stellar swap.
- [Earn Overview](/features/earn/overview) — explore lending, liquidity, and vaults.
