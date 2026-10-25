// External destinations used across the app. Configure them in .env.local (see .env.example).
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://seidar.xyz";
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.seidar.xyz";
export const X_URL = process.env.NEXT_PUBLIC_X_URL ?? "https://x.com";

// News card source ({ items: [{ title, link, pubDate }] }); served by functions/api/news.ts on Cloudflare.
export const NEWS_FEED_URL = process.env.NEXT_PUBLIC_NEWS_FEED_URL ?? "/api/news";

export const LEGAL_LINKS = [
  { label: "Privacy Policy", href: `${SITE_URL}/privacy-policy` },
  { label: "Terms of Use", href: `${SITE_URL}/terms-of-use` },
];
