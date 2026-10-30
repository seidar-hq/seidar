---
id: getting-started
title: Getting Started
description: "Connect a Stellar wallet to Seidar, set up a portfolio and make your first transaction."
---

<p className="lead">Everything in Seidar starts with a Stellar wallet. This page takes you from opening the app to your first signed transaction.</p>

## 1. Open the app

Go to [app.seidar.xyz](https://app.seidar.xyz). You can browse markets, pools and vaults without connecting anything; balances and actions need a wallet.

## 2. Connect a wallet

Click **Connect Wallet** in the top-right corner and pick your wallet. Seidar supports:

| Wallet | Type |
| --- | --- |
| **Freighter** | Browser extension |
| **xBull** | Browser extension and web |
| **LOBSTR** | Browser extension |
| **Albedo** | Web signer, no install |
| **Rabet** | Browser extension |
| **HANA** | Browser extension |

Approve the connection in your wallet. Seidar receives your public address only, never a private key or seed phrase.

## 3. Fund the account

A Stellar account needs a small XLM balance to exist and to pay network fees:

- **Base reserve:** every account holds at least 1 XLM, plus 0.5 XLM for each trustline, offer or other ledger entry it owns.
- **Fees:** a typical Soroban transaction costs well under 0.01 XLM.

Keep a couple of XLM free. In Swap, **MAX** on XLM leaves 2 XLM behind for this reason.

If your funds are on another chain, use the [Bridge](/features/bridge) to bring USDC, USDT or native tokens into Stellar.

## 4. Find your way around

| Menu | Where it goes |
| --- | --- |
| **Portfolio** | Your portfolio: total value, charts and every position. |
| **Trade** | Swap and Perps. |
| **Earn** | Lending & Borrowing, Pools and Vaults. |
| **Bridge** | Deposit from other chains into Stellar. |
| **History** | Your transactions and closed positions. |
| **Settings** | Portfolios and wallets. |

The header also has page search, a link to these docs, notifications, the active portfolio and your wallet.

## 5. Make your first transaction

Every action follows the same pattern:

1. Fill in the form: amount, asset, slippage or leverage.
2. Review the details Seidar shows: expected output, fees, health factor or price impact.
3. Click the action button. Seidar builds and simulates the transaction; if the simulation fails, you'll see why before anything is signed.
4. Approve the transaction in your wallet.
5. Wait for confirmation. Stellar ledgers close every ~5 seconds, and the result appears in your portfolio and [History](/features/transactions).

:::caution Trustlines
To hold a classic Stellar asset (USDC, EURC, AQUA and so on) your account needs a trustline for it, which reserves 0.5 XLM. If a transaction would deliver an asset you don't trust yet, the simulation fails with *"Missing trustline for this asset"*: add the trustline in your wallet and try again. The Bridge checks this up front and offers an **Add USDC trustline** button.
:::

## Next steps

- Group wallets into a portfolio: [Portfolios & Wallets](/features/wallets)
- Put idle assets to work: [Earn overview](/features/earn/overview)
- Understand what you're signing: [Security & Custody](/security)
