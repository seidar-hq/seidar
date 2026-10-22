---
id: vaults
title: Vaults
sidebar_label: Vaults
description: Deposit into automated yield strategies from DeFindex and Upshift on Stellar.
---

Vaults are automated yield strategies that manage a deposit across a set of underlying positions. Seidar integrates Stellar vault protocols so you can browse strategies, deposit, and withdraw from one place.

## Supported vault protocols

| Protocol | Description |
| --- | --- |
| **DeFindex** | Automated yield strategies on Stellar |
| **Upshift** | Curated vault strategies on Stellar |

Each vault has its own strategy, principal asset, fees, and risk profile. Read the vault details before depositing.

## How vaults work

A vault accepts a **principal asset** and deploys it according to its strategy. The vault may:

- Allocate capital across multiple protocols
- Rebalance positions as market conditions change
- Compound yield
- Manage the operational transactions on your behalf

You receive a **vault share** position that represents your ownership of the vault's assets. The share price changes as the vault earns or loses value.

## Depositing into a vault

1. Go to **Earn → Vaults**.
2. Browse available vaults and their APYs.
3. Select a vault to view:
   - Vault name and strategy description
   - Principal asset
   - Current APY
   - TVL
   - Vault address and network
4. Enter the amount to deposit.
5. Review the share price, fees, and estimated position.
6. Sign the transaction.

If the principal asset is issued and you do not have a trustline for it, add the trustline first.

## Vault details

Each vault displays:

| Field | Description |
| --- | --- |
| **Vault name** | Name of the vault strategy |
| **Principal asset** | The asset accepted for deposits |
| **Vault address** | On-chain address of the vault contract |
| **Network** | Stellar Mainnet or Testnet |
| **Share asset** | The asset or contract position representing your share |
| **APY** | Current annualised yield estimate |
| **TVL** | Total value locked in the vault |

## Withdrawing from a vault

1. Open the vault you deposited into.
2. Enter the withdrawal percentage (0–100%).
3. Review the estimated amount and slippage.
4. Sign the transaction.

Some vaults have withdrawal limits, cooldowns, or liquidity conditions. Check the vault details before depositing.

:::tip
You can withdraw any percentage of your vault position. Use the percentage slider for convenience.
:::

## Slippage

Vault withdrawals can involve swaps or liquidity changes. Seidar lets you set a slippage tolerance so the withdrawal respects your minimum acceptable amount.

## Risks

- **Strategy risk** — a vault's strategy can lose value.
- **Smart contract risk** — vault and strategy contracts can contain bugs.
- **Liquidity risk** — withdrawals can be limited by the vault's available liquidity.
- **Yield variability** — APY is an estimate and can change or fall to zero.
- **Protocol risk** — vaults may depend on other protocols, each with its own risks.
- **Asset risk** — issued assets depend on their issuers.

Vault shares can lose value. Never deposit more than you can afford to lose.
