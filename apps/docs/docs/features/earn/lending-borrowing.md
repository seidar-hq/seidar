---
id: lending-borrowing
title: Lending & Borrowing
sidebar_label: Lending & Borrowing
description: "Supply assets to earn interest and borrow against them on Blend and XOXNO, with health factors and BLND reward claims."
---

<p className="lead">Supply assets to earn interest, borrow against them, and watch your health factor, across every Blend pool and XOXNO hub in one table.</p>

Open it from **Earn → Lending & Borrowing**.

## Markets

| Protocol | Markets |
| --- | --- |
| **Blend** | Isolated pools, each with its own assets and risk settings: Fixed, YieldBlox, Orbit, Etherfuse, Solv and others |
| **XOXNO** | Hubs of markets sharing one account, including tokenised treasuries, gold and LP tokens |

The market table shows each asset's total supplied, supply APY, LTV (how much of its value you can borrow against), available liquidity, total borrowed, borrow APY and utilisation. Click a row to open the market page.

Some Blend pools carry a status pill:

| Status | Meaning |
| --- | --- |
| **On ice** | New borrowing is paused. Supply, withdraw and repay still work. |
| **Frozen** | No new supply or borrowing. You can still withdraw and repay. |
| **In setup** | The pool isn't open yet. |

## Actions

Each market page has four tabs:

| Action | What it does |
| --- | --- |
| **Supply** | Deposit an asset. It earns supply APY and counts as collateral. |
| **Withdraw** | Take supplied assets back, as long as your remaining collateral still covers your debt. |
| **Borrow** | Borrow an asset against your collateral. You pay borrow APY. |
| **Repay** | Pay back debt to lower your borrowing and raise your health factor. |

Before you sign, the panel shows the APYs, collateral factor, your health factor after the action, your remaining borrow capacity and your wallet balance.

### XOXNO accounts

XOXNO keeps positions in a numbered account. Your first **Supply** to a hub opens one; borrowing, withdrawing and repaying need it to exist. The market panel shows your account number.

## Health factor

The health factor compares your borrowing limit with your debt:

- **Above 1**: safe. Higher means more room before liquidation.
- **At or below 1**: liquidators can repay part of your debt and take collateral at a discount.

On Blend the health factor is per pool; on XOXNO it's per account. It falls when your collateral's price drops, your debt's price rises, or interest accrues. To raise it, repay debt or supply more collateral.

:::caution
Keep a buffer. A health factor of 1.05 can drop below 1 on an ordinary price move. Many users aim for 1.5 or higher.
:::

## BLND rewards

Blend pays BLND emissions to suppliers and borrowers in many pools. Each pool where you have unclaimed BLND shows the amount with a claim button above your positions; claiming sends that pool's rewards to your wallet.

A pool can only pay out what its backstop holds. If a pool's backstop is empty, its claim fails until it's refilled; other pools are unaffected.

## Withdrawals and liquidity

You can only withdraw or borrow what the market has free (supplied minus borrowed). When utilisation is very high, withdrawals may need to wait for borrowers to repay. High utilisation also pushes rates up, which usually brings liquidity back.
