---
id: transactions
title: Transaction History
sidebar_label: Transaction History
description: Review swaps, transfers, lending activity, liquidity actions, vault deposits, and perps trades in one history.
---

Seidar keeps a record of the activity it submits for your connected wallets, so you can review what happened and follow it on-chain.

## What is tracked

| Activity | Examples |
| --- | --- |
| **Swaps** | Spot swaps across Soroswap, Aqua, Phoenix, and Sushi |
| **Transfers** | Sends and receives of XLM and Stellar assets |
| **Lending** | Supply, withdraw, borrow, repay, and collateral changes |
| **Liquidity** | Add liquidity, remove liquidity, and collect fees |
| **Vaults** | Deposits and withdrawals |
| **Perps** | Position opens, increases, decreases, closes, and order activity |
| **Wallet operations** | Wallet linking and other account actions |

## Viewing history

Open **History** from the sidebar. Transactions are listed newest first, with:

- Transaction type and status
- Assets and amounts
- Protocol or venue
- Timestamp
- Transaction hash

## Filters

Narrow the list by:

- **Wallet**
- **Portfolio**
- **Transaction type**
- **Asset**
- **Protocol**
- **Date range**
- **Status** — pending, completed, or failed

## Transaction details

Click a transaction to see:

- **Status** — pending, completed, or failed
- **Timestamp**
- **Transaction hash**
- **Ledger**
- **Network fee** in XLM
- **Operation details** — assets, amounts, route, or position changes
- **Memo**, where one was used

For a completed transaction, use the hash to look it up in a Stellar block explorer such as [Stellar Expert](https://stellar.expert).

## Pending and failed transactions

- **Pending** — submitted to Stellar but not yet confirmed. Most transactions confirm within seconds.
- **Failed** — the transaction was rejected by the network or a contract. A failed transaction can still consume the network fee.
- **Dropped** — the transaction was not included before it expired.

If a transaction is stuck, wait for it to expire, then retry. Check that your wallet has enough XLM for fees and reserves before retrying.

## Position history

Seidar also keeps position-level history for DeFi activity:

- **Lending** — supply and borrow events, interest accrued, and repayments
- **Liquidity** — deposits, withdrawals, fees collected, and position value over time
- **Vaults** — deposits, withdrawals, and share price changes
- **Perps** — fills, funding, borrowing interest, and realised PnL

## Exporting

Where available, use the download option to export your transaction history as a CSV file for accounting or record-keeping.

:::note
Seidar's history covers transactions submitted through Seidar and activity it can observe on-chain. Activity performed directly in another app may not appear with the same detail.
:::
