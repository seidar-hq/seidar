---
id: transactions
title: Transaction History
sidebar_label: Transaction History
description: "Every transaction across the wallets in your portfolio, decoded by protocol, filterable by type and exportable to CSV."
---

<p className="lead">History lists every transaction from every wallet in the active portfolio, decoded into plain actions: a swap on Soroswap, a supply to Blend, a vault deposit, a perps order.</p>

Open it from **History** in the header.

## Tabs

| Tab | Shows |
| --- | --- |
| **Transaction** | All activity: payments, swaps, DeFi actions, trustline changes and more |
| **Positions** | Only actions on DeFi positions: lending, liquidity, vaults and perps |

## Columns

| Column | Meaning |
| --- | --- |
| **Type** | Date and the decoded action, such as *Swap*, *Supply*, *Add liquidity* or *Send* |
| **Assets** | Tokens and amounts in and out |
| **Protocol** | The protocol the action ran on |
| **Counterparty** | The other address in a payment |
| **Wallet** | Which of your wallets made it (when the portfolio has several) |
| **Fee** | Network fee paid, in XLM |
| **Transaction** | Link to the transaction on stellar.expert |

## Filtering

On the **Transaction** tab, use the filter to show one category:

- **Earn**: Lend & Borrow, Liquidity, Vaults
- **Trade**: Swap, Perps
- **Bridge**
- **Others**: Send, Receive, Other

**Show dust** reveals tiny incoming payments, which are usually spam airdrops. They're hidden by default.

## Loading more

History loads recent activity first. Click **Load older activity** to page further back.

## Exporting

**Download CSV** saves the rows currently shown, with your filter applied, as a spreadsheet-friendly file, for example for accounting or tax records.
