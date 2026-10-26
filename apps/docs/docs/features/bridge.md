---
id: bridge
title: Bridge
sidebar_label: Bridge
description: "Bring USDC, USDT and native tokens from Ethereum, Solana, Tron and seven other chains into Stellar as USDC or XLM."
---

<p className="lead">Bridge moves funds from other chains into Stellar. You send tokens to a one-time deposit address on the source chain, and USDC or XLM arrives in your Stellar wallet.</p>

Open it from **Bridge** in the header.

## Supported routes

Bridging runs on **Allbridge Core** over **NEAR Intents**: solvers take your deposit on the source chain and deliver on Stellar.

| From | Tokens |
| --- | --- |
| Ethereum | USDC, USDT, ETH |
| Arbitrum | USDC, USDT0, ETH |
| Base | USDC, ETH |
| OP Mainnet | USDC, USDT, ETH |
| Polygon | USDC, USDT0, POL |
| Avalanche | USDC, USDT, AVAX |
| BNB Chain | USDC, USDT, BNB |
| Solana | USDC, USDT, SOL |
| Tron | USDT, TRX |
| Sui | USDC, SUI |

You receive **USDC** or **XLM** on Stellar. Bridging is one-way, into Stellar.

## How to bridge

1. Pick the source network and token, and enter the amount.
2. Pick what to receive on Stellar (USDC or XLM). The destination defaults to your active wallet; you can paste another Stellar address.
3. Review the quote: what you send, what you receive, the minimum you're guaranteed, the estimated time and the route. Click **CONFIRM**.
4. Seidar creates a **one-time deposit address** on the source chain and shows it with a QR code, the exact amount, and a countdown (**Send within**).
5. Send exactly that amount to the deposit address, from any wallet or exchange on the source chain. On EVM chains you can click **Send with browser wallet** to send it from MetaMask or another injected wallet.
6. Solvers detect the deposit and deliver on Stellar, usually within a few minutes. The page links to the NEAR Intents explorer so you can follow it.

:::caution Get the details right
- Send **exactly** the quoted amount, on the **network shown**, before the timer runs out. An expired deposit address shouldn't be used; create a new one.
- If a **Memo (required)** is shown, include it. Without it the deposit can't be matched to you.
- Only send the token you selected. Other tokens sent to the deposit address may not be recoverable.
:::

## Receiving USDC

To receive USDC your Stellar account needs a USDC trustline. If it doesn't have one, the button reads **ADD USDC TRUSTLINE FIRST**: add it in one click (it reserves 0.5 XLM), then continue. XLM needs no trustline.

## Fees

The quote already accounts for bridge and solver fees, and for gas on the source chain if the solver pays it. What you see under **Receive** is the expected amount and **Minimum** is the guaranteed floor. Sending from your own wallet also costs that chain's normal gas.
