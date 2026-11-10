"use client";

import Box from "@mui/material/Box";
import { BondsPanel, CurrenciesPanel } from "./AssetPanels";
import HeroCarousel from "./HeroCarousel";
import { Heading } from "./parts";
import ProtocolCards from "./ProtocolCards";
import ThemeTiles from "./ThemeTiles";
import Ticker from "./Ticker";
import VaultCurators from "./VaultCurators";

/**
 * Explore: a browsing page for Stellar markets, trialled next to Home before it replaces any of it.
 * Price strip, rotating banners, the largest protocols, vault curators, themed baskets of assets,
 * tokenized bonds and local-currency stablecoins. All figures are live; nothing here needs a wallet.
 */
export default function Explore() {
  return (
    <Box sx={{ maxWidth: "90rem", mx: "auto", pb: "2rem" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Ticker />
        <HeroCarousel />
      </Box>
      <Heading>Stellar&apos;s biggest protocols</Heading>
      <Box sx={{ mb: "2.5rem" }}>
        <ProtocolCards />
      </Box>
      <Heading sx={{ pt: 0 }}>Earn with the curators</Heading>
      <VaultCurators />
      <Heading sx={{ pt: 0, pb: "2rem" }}>Explore</Heading>
      <ThemeTiles />
      <BondsPanel />
      <CurrenciesPanel />
    </Box>
  );
}
