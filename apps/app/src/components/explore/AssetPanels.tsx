"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "next/link";
import TokenLogo from "@/components/common/TokenLogo";
import { Measured } from "@/components/common/Skeleton";
import { SAMPLE_ASSETS, assetHref, compactUsd, useMarketAssets, type MarketAsset } from "@/components/home/marketData";
import { C, changeColor, changeText } from "./parts";
import { THEMES, ThemeDialog, themeAssets } from "./ThemeTiles";

// Fiat each local-currency stablecoin tracks (non-USD only), for the Currencies panel.
const FIAT: Record<string, string> = {
  EURC: "Euro",
  EURMTL: "Euro",
  GYEN: "Japanese Yen",
  ZARZ: "South African Rand",
  NGNC: "Nigerian Naira",
  ARST: "Argentine Peso",
  ARS: "Argentine Peso",
  XCHF: "Swiss Franc",
  CLPX: "Chilean Peso",
  PEN: "Peruvian Sol",
  IDRT: "Indonesian Rupiah",
};

const cardSx = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minHeight: "8.75rem",
  width: "100%",
  borderRadius: "1.25rem",
  bgcolor: C.surface,
  p: "1rem",
  textDecoration: "none",
  color: "#fff",
  textAlign: "left",
  transition: "transform .2s, opacity .2s",
  "&:hover": { transform: "translateY(-2px)", opacity: 0.95 },
} as const;

function AssetCard({ a, sub }: { a: MarketAsset; sub: string }) {
  return (
    <Box component={Link} href={assetHref(a)} aria-label={`Open ${a.code}, ${changeText(a.change7d)} 7 day return`} sx={cardSx}>
      <Box sx={{ mb: "1rem", height: "2rem", display: "flex", alignItems: "center" }}>
        <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="2rem" />
      </Box>
      <Box sx={{ position: "absolute", top: "1rem", right: "1rem", textAlign: "right" }}>
        <Box sx={{ fontSize: "1.5rem", lineHeight: "2rem", color: changeColor(a.change7d) }}>{changeText(a.change7d)}</Box>
        <Box sx={{ fontSize: "1rem", lineHeight: "1.5rem", color: C.muted }}>7D return</Box>
      </Box>
      <Box sx={{ fontSize: "1.5rem", lineHeight: "2.25rem" }}>{a.code}</Box>
      <Box sx={{ fontSize: "1rem", lineHeight: "1.5rem", color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</Box>
    </Box>
  );
}

function Panel({ title, tint, children }: { title: string; tint: string; children: React.ReactNode }) {
  return (
    <Box sx={{ position: "relative", width: "100%", borderRadius: "1rem", bgcolor: "#272727", p: "1.25rem", mb: "2.5rem" }}>
      <Box aria-hidden sx={{ position: "absolute", inset: 0, borderRadius: "1rem", background: `linear-gradient(${tint} 0%, rgba(0,0,0,0) 50%)` }} />
      <Box sx={{ position: "relative", display: "grid", gap: "1.25rem" }}>
        <Box component="h3" sx={{ m: 0, fontWeight: 400, fontSize: "1.5rem", letterSpacing: "-0.025em", color: "#fff" }}>
          {title}
        </Box>
        {children}
      </Box>
    </Box>
  );
}

/** Tokenized government bonds: the basket as a whole, then its largest members. */
export function BondsPanel() {
  const { assets, loading } = useMarketAssets();
  const [open, setOpen] = useState(false);
  const theme = THEMES.find((t) => t.id === "treasuries")!;
  const members = loading ? SAMPLE_ASSETS.slice(0, 4) : themeAssets(theme, assets).sort((a, b) => Number(b.change7d != null) - Number(a.change7d != null) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
  if (!loading && members.length === 0) return null;
  const total = members.reduce((s, a) => s + (a.marketCap ?? 0), 0);
  return (
    <Panel title="Tokenized Bonds" tint="rgba(153,69,255,0.18)">
      <Measured loading={loading} id="explore-bonds">
        <Box sx={{ display: "grid", gap: "0.75rem", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <ButtonBase onClick={() => setOpen(true)} sx={{ ...cardSx, gridColumn: { sm: "span 2" }, alignItems: "stretch" }}>
            <Box sx={{ mb: "1rem", height: "2rem", display: "flex", alignItems: "center" }}>
              {members.slice(0, 5).map((a, i) => (
                <Box key={a.id} sx={{ ml: i ? "-0.5rem" : 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${C.surface}` }}>
                  <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="2rem" />
                </Box>
              ))}
            </Box>
            <Box sx={{ fontSize: "1.5rem", lineHeight: "2.25rem" }}>Tokenized government bonds</Box>
            <Box sx={{ fontSize: "1rem", lineHeight: "1.5rem", color: C.muted }}>
              US treasuries, Mexican CETES and Brazilian Tesouro on Stellar{total ? `, ${compactUsd(total)} in total` : ""}.
            </Box>
          </ButtonBase>
          {members.slice(0, 4).map((a) => (
            <AssetCard key={a.id} a={a} sub={a.name} />
          ))}
        </Box>
      </Measured>
      <ThemeDialog t={open ? theme : null} assets={assets} onClose={() => setOpen(false)} />
    </Panel>
  );
}

/** Stablecoins for currencies other than the US dollar, largest first. */
export function CurrenciesPanel() {
  const { assets, loading } = useMarketAssets();
  const list = loading
    ? SAMPLE_ASSETS.slice(0, 4)
    : assets
        .filter((a) => FIAT[a.code] && a.price != null)
        .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
        .slice(0, 8);
  if (!loading && list.length === 0) return null;
  return (
    <Panel title="Currencies" tint="rgba(24,184,158,0.16)">
      <Measured loading={loading} id="explore-currencies">
        <Box sx={{ display: "grid", gap: "0.75rem", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
          {list.map((a) => (
            <AssetCard key={a.id} a={a} sub={FIAT[a.code] ?? a.name} />
          ))}
        </Box>
      </Measured>
    </Panel>
  );
}
