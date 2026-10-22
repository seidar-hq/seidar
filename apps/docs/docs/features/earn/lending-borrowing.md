---
id: lending-borrowing
title: Lending & Borrowing
sidebar_label: Lending & Borrowing
description: Supply assets, borrow against collateral, and manage health factor with Blend and XOXNO on Stellar.
---

Seidar integrates Stellar lending protocols so you can supply assets to earn interest or borrow against your collateral from one interface.

## Supported protocols

| Protocol | Features |
| --- | --- |
| **Blend** | Supply, borrow, collateral management, health factor |
| **XOXNO** | Supply, borrow, collateral management |

Both protocols are Stellar-native. Their markets, assets, collateral factors, and risk parameters are set by each protocol.

## Supplying assets

Supply your assets to earn interest:

1. Go to **Earn → Lending & Borrow**.
2. Select a lending protocol.
3. Browse available markets and their supply APYs.
4. Click **Supply** on the asset you want to deposit.
5. Enter the amount.
6. Review and sign the transaction.

If the asset is issued and your wallet does not yet have a trustline for it, add the trustline first. Stellar lending does not use ERC-20-style approvals.

### Market information

For each lending market, Seidar shows:

- **Supply APY** — the current annual rate earned by suppliers
- **Total supply** — assets supplied to the market
- **Utilisation** — the share of supplied assets that is borrowed
- **Collateral factor** — the borrowing power granted per unit supplied
- **Your balance** — your current supply position

## Borrowing assets

Borrow against supplied collateral:

1. Supply an asset and enable it as **collateral**.
2. Open the **Borrow** view.
3. Browse borrowable assets and their rates.
4. Click **Borrow**.
5. Enter the amount, up to your maximum borrowable.
6. Review and sign the transaction.

### Collateral management

To enable or disable an asset as collateral:

1. Open your supplied positions.
2. Toggle the **collateral** switch for the asset.
3. Confirm the transaction.

:::caution
- You cannot enable collateral on an asset with a collateral factor of 0.
- You cannot disable collateral on an asset you have borrowed against if doing so would make the position unhealthy.
:::

### Maximum borrow amount

Your maximum borrowable amount depends on:

- The value of your supplied collateral
- Each asset's collateral factor
- Your current borrow positions
- The protocol's health factor requirement
- Market liquidity

## Repaying loans

1. Open your borrowed positions.
2. Click **Repay**.
3. Enter the amount, or use **25%**, **50%**, **75%**, or **Max**.
4. Review and sign the transaction.

## Withdrawing supplied assets

1. Open your supplied positions.
2. Click **Withdraw**.
3. Enter the amount.
4. Review and sign the transaction.

You can only withdraw up to the amount that keeps your position healthy. If you have active borrows, you may need to repay some debt first.

## Position tracking

Seidar tracks detailed metrics for lending positions:

| Metric | Description |
| --- | --- |
| **Total supplied** | Total amount supplied over the life of the position |
| **Total withdrawn** | Total amount withdrawn |
| **Net supplied** | Current active supply |
| **Supply APY** | Current rate being earned |
| **Value (USD)** | Current USD value of the supply |
| **First supply date** | When the position was opened |

For borrowed positions, Seidar also shows:

- **Health factor** — above 1 is healthy; at or below 1 the position can be liquidated
- **Borrow APY** — the current rate accruing on the debt
- **Wallet balance** of the borrowed asset, so you can see how much you can repay directly

## Risks

- **Liquidation** — if your health factor falls to 1 or below, collateral can be liquidated.
- **Variable rates** — supply and borrow APYs change with market utilisation.
- **Liquidity risk** — high utilisation can limit withdrawals.
- **Oracle risk** — collateral values depend on price feeds.
- **Smart contract risk** — lending markets are third-party contracts and can contain bugs.
- **Asset risk** — issued assets depend on their issuer.
