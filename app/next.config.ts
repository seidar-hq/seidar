import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Protocol pages moved to /markets; Earn moved to /earn — old links keep
  // working.
  async redirects() {
    return [
      { source: "/protocols", destination: "/markets", permanent: true },
      { source: "/protocols/:path*", destination: "/markets/:path*", permanent: true },
      { source: "/savings", destination: "/earn", permanent: true },
      { source: "/mover", destination: "/refinance", permanent: true },
    ];
  },
};

export default nextConfig;
