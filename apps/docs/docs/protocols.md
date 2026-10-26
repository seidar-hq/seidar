---
id: protocols
title: Supported Protocols
description: "The Stellar protocols Seidar reads positions from and builds transactions for."
---

<p className="lead">Seidar integrates directly with each protocol's contracts on Stellar mainnet. These are the protocols it reads and writes today.</p>

<div className="protocol-grid">
  <a href="https://www.blend.capital" target="_blank" rel="noopener"><img src="/img/protocols/blend.png" alt="" />Blend</a>
  <a href="https://xoxno.com/lending" target="_blank" rel="noopener"><img src="/img/protocols/xoxno.png" alt="" />XOXNO</a>
  <a href="https://soroswap.finance" target="_blank" rel="noopener"><img src="/img/protocols/soroswap.png" alt="" />Soroswap</a>
  <a href="https://aqua.network" target="_blank" rel="noopener"><img src="/img/protocols/aquarius.png" alt="" />Aquarius</a>
  <a href="https://www.phoenix-hub.io" target="_blank" rel="noopener"><img src="/img/protocols/phoenix.png" alt="" />Phoenix</a>
  <a href="https://www.sushi.com/stellar" target="_blank" rel="noopener"><img src="/img/protocols/sushi.png" alt="" />Sushi</a>
  <a href="https://zenex.trade" target="_blank" rel="noopener"><img src="/img/protocols/zenex.png" alt="" />Zenex</a>
  <a href="https://www.defindex.io" target="_blank" rel="noopener"><img src="/img/protocols/defindex.png" alt="" />DeFindex</a>
  <a href="https://www.upshift.finance" target="_blank" rel="noopener"><img src="/img/protocols/upshift.png" alt="" />Upshift</a>
  <a href="https://sentora.com" target="_blank" rel="noopener"><img src="/img/protocols/sentora.png" alt="" />Sentora</a>
</div>

## By category

| Category | Protocol | In Seidar |
| --- | --- | --- |
| **Lending** | Blend | Supply, borrow, withdraw, repay, BLND claims, across all public pools |
| | XOXNO | Supply, borrow, withdraw, repay across its hubs |
| **Swaps** | Soroswap aggregator | Routes swaps across Soroswap, Aquarius, Phoenix, Sushi and the Stellar DEX |
| **Liquidity** | Soroswap | Constant-product pools |
| | Aquarius | Constant-product, stable and concentrated pools |
| | Phoenix | Constant-product and stable pools |
| | Sushi | Concentrated-liquidity pools |
| **Perpetuals** | Zenex | XLM/USD market: orders, positions, margin, TP/SL, credit claims |
| **Vaults** | DeFindex | Every factory-deployed vault above a minimum TVL |
| | Upshift | Gami earnUSDC and earnXLM |
| | Sentora | XLM, USDC and PYUSD deposit vaults, and Evergreen USDC |
| **Bridge** | Allbridge Core via NEAR Intents | Deposits into Stellar from ten chains |

## How integrations work

Seidar talks to protocols in two ways:

- **Reading**: positions, rates and reserves come from the protocols' contracts through Soroban RPC, and from protocols' public APIs where the data isn't on-chain (for example Zenex candles or DeFindex vault metadata).
- **Writing**: Seidar builds each transaction against the protocol's own contract, simulates it, and hands it to your wallet. It doesn't route your funds through any Seidar contract.

Missing a protocol you use? Its tokens still show in your wallet balances; its positions won't until it's integrated.
