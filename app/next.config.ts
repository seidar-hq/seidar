import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating indicator sits on top of the footer's brand in dev.
  devIndicators: false,
  // Protocol pages moved to /markets; Earn moved to /earn — old links keep
  // working.
  async redirects() {
    return [
      { source: "/protocols", destination: "/markets", permanent: true },
      { source: "/protocols/:path*", destination: "/markets/:path*", permanent: true },
      { source: "/savings", destination: "/earn", permanent: true },
      { source: "/mover", destination: "/refinance", permanent: true },
      { source: "/markets/:market/vault/:address", destination: "/vaults/:market/:address", permanent: true },
      { source: "/markets/:market/vault/:address/:section", destination: "/vaults/:market/:address/:section", permanent: true },
    ];
  },
};

export default nextConfig;
