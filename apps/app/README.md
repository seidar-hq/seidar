# Seidar app

The Seidar dashboard (`app.seidar.xyz`): portfolio, trade, earn, bridge, history and settings for Stellar DeFi.

Next.js 15 (App Router, static export) + MUI 7. Wallet connection is not wired up yet, so every page renders its
"connect a wallet" state; `src/wallet/WalletContext.tsx` is the single place to plug a Stellar wallet kit in.

## Commands

```bash
npm install
npm run dev        # http://localhost:3001
npm run build      # static export to out/
npx wrangler pages dev   # serve out/ with the Pages Functions in functions/ (needed for /api/news)
```

## Layout

- `src/app/*` routes: `/` (Home), `/portfolio` (`/dashboard` redirects there), `/asset?asset=CODE:ISSUER`,
  `/trade-swap/{dex,perps}`, `/earn/{lending&borrow,pools,vaults}`, `/bridge`, `/transactions`, `/settings`, `/wallets`
- `src/theme` palette, MUI component overrides and the light/dark mode provider
- `src/components/layout` header, footer, search dialog, tour guide
- `src/components/<page>` per-page widgets; `src/components/common` shared pieces (tabs, locked states, tables)
- `functions/api/news.ts` Cloudflare Pages Function feeding the Portfolio News card
- `public/assets` images and fonts

Outbound links come from `NEXT_PUBLIC_*` variables (see `.env.example`).
