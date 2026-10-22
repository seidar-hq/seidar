---
id: wallets
title: Wallet Management
sidebar_label: Wallet Management
description: Connect, link, name, and organise Stellar wallets and portfolios in Seidar.
---

Seidar supports multiple Stellar wallets under one account, so you can see your whole portfolio in one place and keep different activities organised.

## Connecting a wallet

Seidar connects to Stellar wallets through supported wallet adapters:

| Wallet | Type |
| --- | --- |
| **Freighter** | Browser extension |
| **xBull** | Browser extension and mobile |
| **LOBSTR** | Mobile and web |
| **Albedo** | Web |
| **Rabet** | Browser extension |
| **Hana** | Browser extension |

Additional wallets may work through a supported Stellar wallet adapter.

## Signing in

Connecting a wallet signs you in: Seidar asks your wallet to sign a short **Stellar message**. The signature is off-chain and free. It never triggers a transaction and does not give Seidar permission to move your funds. The first sign-in from a new wallet creates your Seidar account.

## Adding additional wallets

You can link up to **10 wallets** to one Seidar account:

1. Go to **Settings → Wallets**.
2. Click **Add Wallet**.
3. Connect the wallet you want to add.
4. **Sign the link message** with that wallet — this proves you control it.
5. Optionally give the wallet a name.

Linked wallets are tracked for portfolio viewing. To execute a transaction, the wallet that holds the assets must be connected and available to sign.

:::caution
If the wallet you link already has its own Seidar account, that account and its history are merged into the account you are signed in to. This cannot be undone. The link message is worded differently from the sign-in message for this reason.
:::

## Portfolios

Portfolios let you group linked wallets — for example **Trading** and **Long term** — and view each group on its own. Manage them under **Settings → Portfolios**.

- Every account has a **default portfolio** that cannot be deleted. New wallets land in the active portfolio.
- You can create up to **5 portfolios**. Each wallet belongs to exactly one portfolio.
- Deleting a portfolio moves its wallets back to the default portfolio; no wallet is unlinked.
- Each portfolio card shows the portfolio's total worth: wallet balances plus DeFi positions.

The Dashboard, asset table, charts, and position lists always show the **active portfolio's** wallets only.

## Portfolio controls

Each portfolio can control which activities it is used for:

| Category | Covers |
| --- | --- |
| **Lending** | Supplying assets and withdrawing collateral |
| **Borrowing** | Borrowing and repaying debt |
| **Liquidity** | DEX liquidity positions |
| **Perps** | Zenex perpetual futures positions |

All categories are enabled by default. Swaps are never restricted by portfolio controls.

You can narrow a portfolio further:

- **Protocols** — switching off an individual protocol hides its positions and blocks new actions on it.
- **Wallets** — a portfolio only includes the wallets assigned to it.

An action is allowed only when its category and protocol are enabled for the portfolio that holds the wallet. Hidden protocols are excluded from every total, so the headline figures always match the positions shown underneath.

## Wallet features

### Breakdown per wallet

Each wallet shows its own:

- Asset balances
- DeFi positions (lending, liquidity, vaults, perps)
- Transaction history

### Wallet naming

Give each wallet a memorable name — for example "Main", "Trading", or "Long term" — to identify it easily.

### Removing a wallet

To remove a tracked wallet:

1. Go to **Settings → Wallets**.
2. Select the wallet.
3. Choose the remove option.
4. Confirm the removal.

Removing a wallet from Seidar does not affect the wallet itself or its on-chain assets.

## Stellar specifics

- Stellar accounts use a public key beginning with **G**. Seidar never needs your secret key.
- Issued assets require a **trustline** before your wallet can hold them.
- Every account must maintain Stellar's **minimum reserve** in XLM, plus the reserve for any trustlines or other subentries.
- Seidar supports **Mainnet** and **Testnet**; switch networks from the app's network selector.
