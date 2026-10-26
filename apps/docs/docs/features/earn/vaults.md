---
id: vaults
title: Vaults
sidebar_label: Vaults
description: "Deposit one asset into DeFindex, Upshift or Sentora vaults and let the strategy or curator earn yield on it."
---

<p className="lead">A vault takes one asset and does the work: it allocates deposits across strategies and compounds the yield. You deposit, and withdraw when you want out.</p>

Open it from **Earn → Vaults**.

## Vault providers

| Provider | How it works | Withdrawals |
| --- | --- | --- |
| **DeFindex** | Strategy vaults that spread deposits across Stellar protocols such as Blend. You hold vault shares that grow in value as the strategies earn. | Instant, from the vault's idle funds and strategies |
| **Upshift** | Institutionally curated vaults: a curator allocates deposits across Stellar lending markets. Share-based. | Can go through a queue of a few days; the vault page shows the period |
| **Sentora** | Incentivised deposit vaults for XLM, USDC and PYUSD, where your principal stays in the contract and the curator pays the quoted APY as rewards; plus **Evergreen USDC**, a share vault whose sentUSDC shares grow in value. | Instant |

The vault list shows each vault's asset, TVL, APY and provider. DeFindex lists every vault deployed through its factory that holds a meaningful amount.

## Depositing

1. Open a vault and choose **Deposit**.
2. Enter an amount of the vault's asset. The panel shows the APY and an estimate of yearly earnings.
3. Review and sign.

For share vaults you receive shares priced at the vault's current share price. Your deposit's value is your shares times the share price.

## Withdrawing

1. Choose **Withdraw** and enter an amount, or use the maximum to withdraw everything.
2. Review and sign.

Withdrawing everything redeems all your shares, so nothing is left behind as dust.

## APY

Vault APYs are variable. For DeFindex vaults it reflects what the strategies have been earning; for Upshift and Sentora it's the rate advertised by the curator or incentive programme, which can change at their discretion. Your actual return is the change in value of your position.

## Risks

- **Strategy risk**: the vault inherits the risks of every protocol it deploys into.
- **Curator risk**: on curated vaults, a manager decides where funds go.
- **Withdrawal delays**: queued vaults can't always return funds immediately.
- **Paused vaults**: an admin can pause deposits. Seidar blocks deposits into a paused vault.
