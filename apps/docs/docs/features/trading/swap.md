---
id: swap
title: Swap
sidebar_label: Swap
description: Swap Stellar assets through aggregated routes across Soroswap, Aqua, Phoenix, and Sushi.
---

Seidar aggregates liquidity from supported Stellar DEXs and gives you one swap interface with a single quote, route, and confirmation flow.

## How it works

1. **Select assets** — choose the asset you want to swap from and the asset you want to receive.
2. **Enter an amount** — specify how much you want to swap.
3. **Get a quote** — Seidar compares available routes across supported venues.
4. **Review the details** — check the rate, price impact, minimum received, route, and network fee.
5. **Sign the transaction** — review and approve it in your Stellar wallet.

Seidar submits the signed transaction to Stellar and tracks it until it confirms.

## Supported venues

| Protocol | Type | Used for |
| --- | --- | --- |
| **Soroswap** | AMM and DEX aggregation | Swaps and liquidity |
| **Aqua** | AMM liquidity layer | Swaps and liquidity |
| **Phoenix** | AMM | Swaps and liquidity |
| **Sushi** | AMM | Swaps and liquidity |

Routing is not limited to a single venue. Seidar can compare direct pools and multi-hop routes through liquid intermediate assets such as XLM or USDC, then use the route with the best expected output.

## Stellar asset model

Stellar assets are not all native tokens:

- **XLM** is the native Stellar asset.
- **Issued assets** are identified by an asset code and issuer account (for example `USDC:GA5Z...`).
- **Soroban assets** may also be identified by their contract address.

Before your wallet can hold an issued asset, it needs a **trustline** for that asset. If you do not have one, add it in your wallet first.

Swaps on Stellar do not use ERC-20-style token approvals. You sign one transaction that executes the swap.

## Routing and price impact

Seidar evaluates:

- Direct pools between the two assets
- Multi-hop routes through liquid intermediate assets
- Available liquidity on each supported venue

Price impact is measured across the whole route, not just the first pool. A multi-hop route can produce a better result than a direct pool with thin liquidity.

:::note
A quote is an estimate. The final amount depends on pool state when your transaction executes. **Minimum received** protects you against excessive slippage.
:::

## Slippage tolerance

Slippage is the difference between the quoted price and the executed price. Configure it before you swap:

| Preset | Tolerance |
| --- | --- |
| **Low** | 0.1% |
| **Default** | 0.5% |
| **Medium** | 1.0% |
| **High** | 3.0% |
| **Custom** | 0.1% – 50% |

:::caution
Setting slippage too low can cause the transaction to fail. Setting it too high can result in a worse execution price.
:::

## Swap details

Before you sign, Seidar shows:

- **Exchange rate** — output asset per input asset
- **Price impact** — how the swap affects the pool price
- **Minimum received** — the minimum output after slippage
- **Network fee** — the Stellar fee, paid in XLM
- **Route** — the venue or venues used
- **Protocol fees** — liquidity provider fees embedded in the quote

## Network fees and reserves

Every Stellar transaction pays a small network fee in XLM. Your account must also maintain Stellar's minimum reserve, including the reserve for any trustlines. Keep enough XLM in the wallet to cover both.

## Token search

Find an asset by:

- Asset code (for example `USDC`)
- Asset name
- Issuer account
- Soroban contract address

Always verify the issuer when swapping an issued asset. Multiple assets can share the same code.

## Transaction history

Completed swaps appear in [Transaction History](/features/transactions) with:

- Input and output assets
- Amounts
- Route and venue
- Transaction hash
- Timestamp

## Risks

- **Slippage** — the executed price can differ from the quote.
- **Thin liquidity** — low-depth pools can move significantly.
- **Issuer risk** — an issued asset depends on its issuer.
- **Smart contract risk** — AMM and aggregator contracts can contain bugs.
- **Trustline requirements** — you cannot receive an issued asset without a trustline.
