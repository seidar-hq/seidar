# Seidar — DeFi position manager on Stellar

Manage, leverage and automate lending positions on Stellar in one transaction.
Blend V2 · XOXNO · Peridot · Soroswap / Aqua / Phoenix · Reflector oracles.

- `apps/web` → seidar.xyz (landing, Next.js — layout ported from confidential-assets design)
- `apps/app` → app.seidar.xyz (dashboard — topbar + hover sidebar shell, black `#000`)
- `apps/docs` → docs.seidar.xyz (planned)
- `contracts/` → Soroban `recipe_executor`, lending adapters, `guardian` automation (planned)
- `packages/` → `seidar-sdk`, `positions-sdk`, `automation-sdk` (planned)
- `services/` → keeper, gas-credits relayer, indexer (planned)
- `mcp/` → agent server, last (planned)

V1 lock: Blend V2 + XOXNO + Peridot for leverage/shifter, DeFindex + Templar vaults
for savings, `G...` manual + OZ smart-account for automation (multisig optional policy),
keeper + market-swap automation, gas credits via OZ Relayer, no orderbook / perps.
