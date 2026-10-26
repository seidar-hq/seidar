---
id: security
title: Security & Custody
description: "What Seidar can and cannot do with your wallet and funds, and how to check what you sign."
---

<p className="lead">Seidar is non-custodial. It never holds your keys or your funds, and it can't move anything without a signature from your wallet.</p>

## What Seidar has access to

| Seidar can | Seidar can't |
| --- | --- |
| See your public address and read your on-chain balances and positions (anyone can) | See your secret key or seed phrase |
| Build and simulate transactions for you to review | Sign a transaction for you |
| Submit a transaction after your wallet has signed it | Move funds without your approval |
| Remember your portfolios and wallet names in your browser | Recover a wallet you've lost access to |

Every action ends in your wallet's own approval screen. If you reject it, nothing happens.

## Reviewing what you sign

Before signing:

1. Check the details Seidar shows: amounts, minimum received, health factor, fees.
2. Check your wallet's screen: the contract being called and the operation. Seidar talks to each protocol's own contracts (see [Supported Protocols](/protocols)), never to an intermediary that holds your funds.
3. Reject anything you didn't expect.

Seidar simulates every transaction before you sign it. A transaction that would fail is stopped with an explanation instead of costing you a fee.

## Protocol risk

Seidar builds transactions for third-party protocols. It doesn't control, audit or insure them. Lending markets can be exploited, liquidity pools can lose value, vault curators can make bad allocations, and oracles can misprice. Read each protocol's own documentation and spread risk accordingly.

## Staying safe

- **Check the address.** The app lives at `app.seidar.xyz` and these docs at `docs.seidar.xyz`. Bookmark them.
- **Seidar will never ask for your seed phrase**, in the app, by email, or in a DM. Anyone who does is a scammer.
- **Use a hardware wallet or a dedicated browser profile** for large balances.
- **Ignore unknown tokens.** Spam airdrops (hidden as dust in History) often link to phishing sites.

## Data

Seidar's servers read public blockchain data and fetch prices. Portfolio names and wallet lists stay in your browser's local storage. Notifications about your confirmed transactions are stored against your public address so the bell can show them.
