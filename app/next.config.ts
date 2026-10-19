import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating indicator sits on top of the footer's brand in dev.
  devIndicators: false,
  // Vaults + RWA only: lending and pool pages are retired — every old URL
  // 308s onto the vaults hub (vault detail links keep their own targets).
  async redirects() {
    return [
      { source: "/protocols", destination: "/vaults", permanent: true },
      { source: "/protocols/:path*", destination: "/vaults", permanent: true },
      { source: "/savings", destination: "/earn", permanent: true },
      { source: "/mover", destination: "/refinance", permanent: true },
      { source: "/markets/lend-borrow", destination: "/vaults", permanent: true },
      { source: "/markets/pools", destination: "/vaults", permanent: true },
      { source: "/markets/blend", destination: "/vaults", permanent: true },
      { source: "/markets/xoxno", destination: "/vaults", permanent: true },
      { source: "/markets/soroswap", destination: "/vaults", permanent: true },
      { source: "/markets/phoenix", destination: "/vaults", permanent: true },
      { source: "/markets/aqua", destination: "/vaults", permanent: true },
      { source: "/markets/sushi", destination: "/vaults", permanent: true },
      { source: "/markets/:market/vault/:address", destination: "/vaults/:market/:address", permanent: true },
      { source: "/markets/:market/vault/:address/:section", destination: "/vaults/:market/:address", permanent: true },
      { source: "/vaults/:market/:address/history", destination: "/vaults/:market/:address", permanent: true },
      // Any other /markets sub-path (lend, create, manage, automate, pool, …)
      // belonged to the retired lending/pool pages. `+` keeps
      // /markets/defindex and /markets/upshift (the vault browsers) alive.
      { source: "/markets/:market/:rest+", destination: "/vaults", permanent: true },
    ];
  },
};

export default nextConfig;
