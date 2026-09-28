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

## Local services

Notifications are DB-backed (Postgres) with a localStorage fallback:

```
docker compose up -d db            # start Postgres (needs Docker Desktop running)
cp apps/app/.env.example apps/app/.env.local
npm run dev:app
```

Without `DATABASE_URL`, the app serves from the local mirror automatically.
