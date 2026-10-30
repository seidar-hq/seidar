---
id: send-receive
title: Send & Receive
sidebar_label: Send & Receive
description: "Send XLM and Stellar assets to any address, with an optional memo, and share your address or QR code to receive."
---

<p className="lead">Send and Receive sit next to Swap in the trading widget on Portfolio and on Trade → Swap.</p>

## Sending

1. Open the **Send** tab.
2. Pick a token. Only tokens with a balance are listed.
3. Enter the amount.
4. Paste the recipient's Stellar address (`G…`).
5. Add a **Memo** if the recipient needs one (see below).
6. Click **SEND** and approve in your wallet.

Seidar checks the recipient before you sign:

| Situation | Result |
| --- | --- |
| Recipient account exists and holds the asset | A normal payment |
| Recipient doesn't exist yet, sending XLM | The account is created with your XLM. At least **1 XLM** is required. |
| Recipient doesn't exist yet, sending another asset | Blocked: a new account can only be funded with XLM |
| Recipient has no trustline for the asset | Blocked: they need to add the trustline before they can receive it |

## Memos

A memo is a short note attached to the transaction. Exchanges and custodial services often share one deposit address between all customers and use the memo to know whose deposit it is.

:::caution
If an exchange gives you a memo with its deposit address, you **must** include it. A deposit without the right memo may be lost or take weeks to recover through support.
:::

Seidar sends memos as text, up to 28 characters.

## Receiving

Open the **Receive** tab to see your active wallet's address and its QR code. Copy the address or let the sender scan the code.

To receive a classic asset such as USDC, your account needs a trustline for it first; add it in your wallet. XLM needs no trustline.

## Fees

Each payment costs the Stellar base fee, a fraction of a cent paid in XLM. Seidar adds nothing.
