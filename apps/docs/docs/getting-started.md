---
id: getting-started
title: Getting Started with Seidar
sidebar_label: Getting Started
description: Connect a Stellar wallet, sign in, and navigate the Seidar app.
---

This guide walks you through connecting a Stellar wallet and navigating Seidar for the first time.

## Prerequisites

Before using Seidar, make sure you have:

1. **A Stellar wallet** — Freighter, xBull, LOBSTR, Albedo, Rabet, Hana, or another supported Stellar wallet.
2. **XLM for network fees and reserves** — every Stellar transaction pays a small fee in XLM. Accounts also need to meet Stellar's minimum reserve requirement.
3. **The assets you want to use** — for example XLM for swaps and fees, or USDC for lending, liquidity, vaults, and perps. Issued assets must be held through a trustline in your wallet.
4. **A modern browser** — Chrome, Brave, Firefox, or Edge.

## Connecting your wallet

1. Open the Seidar app.
2. Click **Connect Wallet** in the top-right corner.
3. Choose your wallet provider.
4. Approve the connection request in your wallet.
5. **Sign the sign-in message** when prompted. This is an off-chain signature: it is free, creates no transaction, and does not give Seidar permission to move your funds.
6. You land on the **Dashboard** with your portfolio loading.

Your first sign-in creates your Seidar account.

:::tip
Seidar works with wallets that support Stellar message signing. If your wallet is not listed, check whether it can connect through a supported Stellar wallet adapter.
:::

## Linking additional wallets

You can track more than one Stellar wallet under the same Seidar account:

1. Open **Settings → Wallets** (or the **Wallets** page).
2. Click **Add Wallet**.
3. Connect the wallet you want to add.
4. **Sign the link message** with that wallet to prove you control it.
5. Give the wallet a name so you can recognise it later.

Linked wallets are aggregated into your active portfolio. To execute a transaction, the wallet that holds the assets must be connected and available to sign.

## Navigating the platform

The sidebar gives you access to every part of Seidar:

| Menu item | Description |
| --- | --- |
| **Dashboard** | Portfolio overview, charts, allocations, positions, and quick actions |
| **Trade** | **Swap** Stellar assets or trade **Perps** through Zenex |
| **Earn** | Lending & Borrowing, Liquidity, and Vaults |
| **History** | Transactions and active or closed positions |
| **Settings** | Manage wallets, portfolios, and portfolio controls |

## Choosing a network

Seidar supports **Stellar Mainnet** and **Stellar Testnet**.

- Use **Mainnet** for real assets, live protocol positions, and production trading.
- Use **Testnet** to try flows with test funds. Feature availability on Testnet depends on whether the underlying protocol is deployed there.

Switch networks from the network selector in the app. Your wallet may ask you to confirm the network change.

## Supported wallet providers

| Wallet | Type |
| --- | --- |
| **Freighter** | Browser extension |
| **xBull** | Browser extension and mobile |
| **LOBSTR** | Mobile and web |
| **Albedo** | Web |
| **Rabet** | Browser extension |
| **Hana** | Browser extension |

Seidar uses Stellar wallet standards, so additional wallets may work through a supported adapter.

## Your first steps

1. **Check your balances** on the [Portfolio Dashboard](/features/dashboard).
2. **Fund your wallet** with XLM for fees and any asset you want to use.
3. **Make a swap** on the [Swap](/features/trading/swap) page.
4. **Explore yield** in [Earn Overview](/features/earn/overview).
5. **Review activity** in [Transaction History](/features/transactions).

:::caution
Never share your secret key or recovery phrase with anyone. Seidar will never ask for it. Every transaction must be reviewed and signed in your own wallet.
:::
