# Seidar landing

Next.js 15 (App Router) + MUI 7 / Emotion, framer-motion, react-slick and lottie-react.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Copy `.env.example` to `.env.local` and fill in the app, docs, X and contact-form URLs.

- `src/app/page.tsx` lists the home sections in order; each lives in `src/components/home/`.
- `src/components/layout/` holds the navbar, footer and the "Contact Us" modal form.
- `src/theme/theme.ts` holds the palette and typography variants.
- `src/lib/protocols.ts` drives the protocol marquee and the "Integrated Protocols" grid.
