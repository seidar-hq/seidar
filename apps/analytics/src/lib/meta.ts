// Display metadata for the labels the API records (analytics.ts TX_KINDS / TX_PROTOCOLS).

export const KINDS: Record<string, { label: string; color: string }> = {
  swap: { label: "Swaps", color: "#5C84FF" },
  lending: { label: "Lend & Borrow", color: "#10B981" },
  vault: { label: "Vaults", color: "#8DE8FF" },
  liquidity: { label: "Liquidity", color: "#F59E0B" },
  perps: { label: "Perps", color: "#F46D22" },
  claim: { label: "Reward claims", color: "#AEBFFF" },
  send: { label: "Transfers", color: "#9E9E9E" },
  trustline: { label: "Trustlines", color: "#5B5B5B" },
  other: { label: "Other", color: "#3D3D3D" },
};

export const kindMeta = (k: string) => KINDS[k] ?? { label: k, color: "#5B5B5B" };

export type ProtocolInfo = { id: string; name: string; logo: string; category: string; url: string };

/** Every protocol Seidar integrates (shown in Coverage even before it has recorded activity). */
export const PROTOCOLS: ProtocolInfo[] = [
  { id: "blend", name: "Blend", logo: "/protocols/blend.png", category: "Lending", url: "https://blend.capital" },
  { id: "xoxno", name: "XOXNO", logo: "/protocols/xoxno.png", category: "Lending", url: "https://xoxno.com" },
  { id: "soroswap", name: "Soroswap", logo: "/protocols/soroswap.png", category: "DEX · Aggregator", url: "https://soroswap.finance" },
  { id: "aquarius", name: "Aquarius", logo: "/protocols/aqua.png", category: "DEX", url: "https://aqua.network" },
  { id: "phoenix", name: "Phoenix", logo: "/protocols/phoenix.png", category: "DEX", url: "https://phoenix-hub.io" },
  { id: "sushi", name: "SushiSwap", logo: "/protocols/sushi.png", category: "DEX · Concentrated", url: "https://sushi.com" },
  { id: "defindex", name: "DeFindex", logo: "/protocols/defindex.svg", category: "Vaults", url: "https://defindex.io" },
  { id: "upshift", name: "Upshift", logo: "/protocols/upshift.png", category: "Vaults", url: "https://upshift.finance" },
  { id: "sentora", name: "Sentora", logo: "/protocols/sentora.png", category: "Vaults", url: "https://sentora.com" },
  { id: "zenex", name: "Zenex", logo: "/protocols/zenex.png", category: "Perps", url: "https://zenex.trade" },
  { id: "allbridge", name: "Allbridge Core", logo: "/protocols/allbridge.png", category: "Bridge", url: "https://allbridge.io" },
  { id: "stellar", name: "Stellar (native)", logo: "/protocols/stellar.png", category: "Payments · Trustlines", url: "https://stellar.org" },
];

export const protocolMeta = (id: string): ProtocolInfo =>
  PROTOCOLS.find((p) => p.id === id) ?? { id, name: id === "other" ? "Other" : id, logo: "/assets/favicon.svg", category: "", url: "" };

/** Third-party protocols integrated (Stellar native excluded). */
export const INTEGRATIONS = PROTOCOLS.filter((p) => p.id !== "stellar").length;
