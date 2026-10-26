import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  // NEXT_DIST_DIR lets a production build run beside `next dev` without sharing its .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: false,
  images: { unoptimized: true },
};

export default nextConfig;
