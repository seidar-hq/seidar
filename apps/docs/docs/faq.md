---
id: faq
title: FAQ
description: "Answers to common questions about fees, failed transactions, missing positions and supported networks."
---

## General

### Does Seidar cost anything?

Using Seidar is free. You pay Stellar network fees (usually a fraction of a cent in XLM) and each protocol's own fees, such as pool swap fees or perps trading fees. Seidar adds no fee to swaps.

### Which networks does Seidar support?

Stellar mainnet only. To bring funds from Ethereum, Solana, Tron or another chain, use the [Bridge](/features/bridge).

### Which wallets can I use?

Freighter, xBull, LOBSTR, Albedo, Rabet and HANA. See [Getting Started](/getting-started#2-connect-a-wallet).

### Is Seidar custodial?

No. Your wallet signs every transaction, and Seidar never sees your keys. See [Security & Custody](/security).

## Transactions

### My transaction failed. Did I lose money?

If it failed during simulation, before your wallet asked you to sign, nothing was sent and no fee was paid. If it failed on-chain, only the network fee was spent; the action itself was reverted. Check the error, adjust, and try again.

### What does "Missing trustline" mean?

Your account needs a trustline before it can hold a classic Stellar asset such as USDC. Add it in your wallet (it reserves 0.5 XLM), then retry.

### Why can't I spend all my XLM?

Every Stellar account keeps a minimum XLM balance: 1 XLM plus 0.5 XLM for each trustline, offer or other entry it owns. That reserve is locked while the entries exist. Swap's **MAX** keeps 2 XLM back for the reserve and fees.

### Why did my swap revert?

The price moved more than your slippage tolerance before the transaction landed. Try again, try a smaller size, or raise slippage slightly.

## Positions

### A position is missing from my dashboard.

Check that:

1. The wallet holding it is in the **active portfolio** ([Portfolios & Wallets](/features/wallets)).
2. The protocol is one Seidar integrates ([Supported Protocols](/protocols)).
3. It's had a few minutes to refresh, then reload the page.

### Why is my dashboard value different from the protocol's own app?

Prices may come from different sources, and some protocols value positions differently (for example including unclaimed rewards). Small differences are normal.

### My perps market order hasn't filled yet.

Zenex orders are filled by keepers after your transaction creates them, usually within seconds. If the price moved beyond your slippage before a keeper could fill it, the order stays open until it fills or expires; you can cancel it from **Open Orders**. See [Perps](/features/trading/perps#how-zenex-works).

### Why does the perps order book look so regular?

Zenex has no order book: trades fill against a liquidity vault at the oracle price plus a size-based impact charge. The book panel shows that fill schedule rather than other traders' orders.

## Bridge

### My bridge deposit hasn't arrived.

Deposits usually arrive within a few minutes. Follow it with the NEAR Intents explorer link on the deposit screen. Make sure you sent the exact amount, on the right network, with the memo if one was shown, before the timer ran out.
