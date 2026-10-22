---
id: liquidity
title: Liquidity Provisioning
sidebar_label: Liquidity Provisioning
description: Provide liquidity to Soroswap, Aqua, Phoenix, and Sushi pools on Stellar and track your LP positions.
---

Provide liquidity to supported Stellar AMM pools and earn a share of trading fees. Seidar brings pool discovery, position management, and analytics into one interface.

## Supported protocols

| Protocol | Type | Notes |
| --- | --- | --- |
| **Soroswap** | AMM | Stellar-native swaps and liquidity |
| **Aqua** | AMM liquidity layer | Stellar liquidity pools and incentives |
| **Phoenix** | AMM | Stellar-native liquidity pools |
| **Sushi** | AMM | Multi-chain AMM with a Stellar deployment |

Each venue has its own pool model, fee structure, and incentive mechanics. Check the pool details before depositing.

## Exploring pools

### Top pools

Browse pools ranked by:

- **TVL** — total value locked
- **24h volume**
- **24h fees**
- **APR**

### New pools

Discover recently created pools that may offer different risk and yield profiles.

### Pool search

Search for a pool by:

- Asset pair
- Protocol
- Asset code or issuer

### Pool details

Open any pool to see:

- **Price chart** — historical price movement
- **Volume chart** — trading volume over time
- **TVL** — total value locked
- **Fee tier** — the pool's trading fee
- **APR** — current fee-based return estimate
- **Liquidity distribution** — where liquidity sits across the price range, where the venue exposes it

## Adding liquidity

1. Go to **Earn → Liquidity**.
2. Click **Add Liquidity**.
3. Select the protocol and pool.
4. Enter the amount for one or both assets, depending on the pool model.
5. Review the pool share, fees, and price impact.
6. Sign the transaction.

For Stellar classic AMM pools, your position is represented by **pool share tokens**. For Soroban AMMs, the position may be represented by a contract position or LP token. Seidar displays the position in both cases.

:::note
Issued assets require a trustline. If you have not added one for an asset in the pool, add it in your wallet before providing liquidity.
:::

## Managing positions

### Increasing liquidity

1. Open an active position.
2. Click **Increase Liquidity**.
3. Enter the additional amounts.
4. Review and sign.

### Decreasing liquidity

1. Open the position.
2. Click **Remove Liquidity**.
3. Enter the amount or use a percentage.
4. Review and sign.

Removing 100% closes the position in one transaction: liquidity is removed, fees are collected, and the position token is redeemed or burned, depending on the venue.

### Collecting fees

1. Open the position.
2. Click **Collect Fees**.
3. Review the accrued fees in each asset.
4. Sign the transaction.

## Position analytics

Seidar shows detailed analytics for each liquidity position:

| Metric | Description |
| --- | --- |
| **Current value (USD)** | Real-time value of the position |
| **Asset amounts** | Amount of each asset in the position |
| **Fees earned** | Fees accrued or collected in each asset |
| **APR / APY** | Annualised return estimate |
| **Pool share** | Your share of the pool |
| **Profit / loss** | Net result, including impermanent loss |

## Period tracking

Each position can track performance over time:

- Deposit value at the start
- Duration
- Fees earned
- Asset prices at the start and end
- APR/APY for the period
- Profit or loss

## Risks

- **Impermanent loss** — the relative price of the pooled assets can move against you.
- **APR variability** — fees and incentives change with volume and liquidity.
- **Smart contract risk** — AMM and pool contracts can contain bugs.
- **Asset risk** — issued assets depend on their issuers.
- **Withdrawal risk** — some pools can be paused, imbalanced, or illiquid.
