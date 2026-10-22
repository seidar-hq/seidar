---
id: send-receive
title: Send & Receive
sidebar_label: Send & Receive
description: Send XLM and Stellar assets, and receive funds with your address, QR code, and memos.
---

Seidar lets you send and receive Stellar assets directly from your connected wallet.

## Sending assets

1. Click **Send**.
2. Select the asset you want to send.
3. Enter the recipient's Stellar address.
4. Enter the amount.
5. Optionally add a memo.
6. Review the recipient, amount, memo, and network fee.
7. Sign the transaction in your wallet.

The transaction is submitted to Stellar and appears in [Transaction History](/features/transactions). Incoming transfers are detected from the network shortly after they confirm.

### Stellar addresses

Stellar has two address formats:

| Format | Starts with | Notes |
| --- | --- | --- |
| **Account address** | `G` | The standard public key for a Stellar account |
| **Muxed address** | `M` | Encodes an account plus a 64-bit memo ID, often used by custodians and exchanges |

If a recipient gives you an `M` address, send to it as-is. Do not add a separate memo unless they ask for one — the memo ID is already encoded in the address.

:::caution
Stellar transactions are irreversible. Check the address and network before signing. Sending to the wrong address or network can result in permanent loss.
:::

### Memos

Some recipients — particularly exchanges and custodial services — require a **memo** so they can credit your deposit to the right account.

| Memo type | Use |
| --- | --- |
| **Text** | Short text, up to 28 bytes |
| **ID** | A 64-bit unsigned integer |
| **Hash** | A 32-byte hash |
| **Return** | A 32-byte hash used to return a payment |

Always include the exact memo a recipient requires. An incorrect or missing memo can cause a deposit to be lost or miscredited.

### Trustlines and reserves

- You can only send an asset your wallet holds.
- The recipient must have a **trustline** for issued assets, or the payment will fail.
- The sender must keep enough XLM to satisfy Stellar's **minimum reserve** after the payment.
- You can send your entire balance of an asset, but not your entire XLM balance: the reserve and the network fee must remain.

## Receiving assets

1. Click **Receive**.
2. Select the asset.
3. Share your address or QR code.

Your QR code encodes your Stellar address. The receive view also shows:

- Your full address, with a copy button
- The selected asset and network
- A memo field where relevant
- A warning if the asset requires a trustline

### Before someone sends to you

- Confirm they are sending on the **same network** — Mainnet or Testnet.
- For issued assets, make sure your wallet has a **trustline** for the asset.
- If the sender is a custodial service, provide the **memo** it requires.
- Give the exact address shown in Seidar; do not edit it by hand.

## Network fees

Every Stellar payment pays a small fee in **XLM**. Fees are separate from the amount sent and are shown before you sign. Surge pricing on the network can raise the fee.

## Common issues

| Issue | Cause |
| --- | --- |
| Payment fails | Recipient lacks a trustline, or sender lacks XLM for the fee or reserve |
| Asset not visible | No trustline in your wallet, or the asset is on another network |
| Deposit not credited by a custodian | Missing or incorrect memo |
| Wrong balance | The network may still be confirming, or the asset's issuer differs |
