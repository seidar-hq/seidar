---
id: wallets
title: Portfolios & Wallets
sidebar_label: Portfolios & Wallets
description: "Connect several Stellar wallets, group them into portfolios and switch the active signer."
---

<p className="lead">A portfolio is a named group of wallets. Seidar adds up everything in the active portfolio, and the active wallet signs your transactions.</p>

## Portfolios

You start with one portfolio. Create more from **Settings → Portfolios & Wallets → Add Portfolio**: for example, one for personal funds and one for a treasury.

Each portfolio card shows:

- the portfolio's total value
- how much of the gross value is currently deployed in positions
- the number of wallets in it and the number of active positions

From the card's **⋮** menu you can **Rename** or **Delete** a portfolio. Deleting one moves its wallets to a portfolio you choose; no wallet is ever disconnected by deleting a portfolio.

### The active portfolio

Only one portfolio is active at a time. Portfolio, History and the header's portfolio pill all follow it. Switch with **Set as Active** on a card, or from the portfolio dropdown in the header or on the Portfolio page.

## Wallets

### Connecting more wallets

Click **Add New Wallet** in Settings, or **Connect Wallet** from the wallet menu, and connect another Stellar wallet. New wallets join the active portfolio.

Connecting a wallet that's already linked doesn't move it: Seidar switches to the portfolio it already belongs to.

### The active wallet

One wallet is **active**. It's shown in the header and signs every transaction you start. Switch with **Switch** on a wallet card, or from the wallet menu in the header.

### Wallet actions

Each wallet card's **⋮** menu has:

| Action | What it does |
| --- | --- |
| **Switch** | Make this the active wallet |
| **Move** | Put the wallet in a different portfolio |
| **Rename** | Change the display name shown in Seidar |
| **Remove** | Disconnect it from Seidar (nothing on-chain changes) |

Use the **Active portfolio / All wallets** toggle above the wallet cards to see either the current portfolio's wallets or every wallet you've linked.

## Where this is stored

Portfolios, names and the list of linked wallets are saved in your browser. Clearing site data, or opening Seidar in another browser, starts with an empty list; reconnect your wallets to restore it. Nothing about your portfolios is stored on-chain.
