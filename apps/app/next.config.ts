import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export for production. `next dev` runs without it so the rewrite below can apply.
  ...(dev ? {} : { output: "export" as const }),
  // NEXT_DIST_DIR lets a production build run beside `next dev` without sharing its .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: false,
  images: { unoptimized: true },
  // /api/news is a Cloudflare Pages Function (functions/api/news.ts) that `next dev` can't run, so
  // locally the News card showed "No news found". In dev only, borrow the live one.
  ...(dev && {
    async rewrites() {
      return [{ source: "/api/news", destination: "https://app.seidar.xyz/api/news" }];
    },
  }),
};

export default nextConfig;
