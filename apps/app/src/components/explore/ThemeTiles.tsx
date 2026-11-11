"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Link from "next/link";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import TokenLogo from "@/components/common/TokenLogo";
import { Measured } from "@/components/common/Skeleton";
import { assetHref, compactUsd, priceText, swapHref, useMarketAssets, type MarketAsset } from "@/components/home/marketData";
import { C, ReturnLines, changeColor, changeText, weightedChange } from "./parts";
import { ThemeIcon, type IconKind } from "@/components/common/ChromeIcons";

export type Theme = { id: string; words: string[]; about: string; icon: IconKind; codes: string[] };

/** Themes are groups of listed Stellar assets, matched by code within Home's verified asset list. */
export const THEMES: Theme[] = [
  { id: "dollars", words: ["THE", "DOLLARS"], about: "Fully backed US dollar stablecoins issued on Stellar.", icon: "coins", codes: ["USDC", "PYUSD", "USDT0", "USDGLO", "USDZ", "USDx"] },
  { id: "treasuries", words: ["T-BILLS", "& BONDS"], about: "Tokenized government debt: US treasuries, Mexican CETES and Brazilian Tesouro.", icon: "bar", codes: ["USDY", "USTRY", "deJTRSY", "CETES", "TESOURO"] },
  { id: "yield", words: ["YIELD", "DOLLARS"], about: "Dollar tokens whose value grows with the yield they earn.", icon: "growth", codes: ["USDY", "USTRY", "yUSDC", "deJTRSY"] },
  { id: "lumens", words: ["THE", "LUMENS"], about: "Stellar's native XLM and its yield-bearing wrapper.", icon: "star", codes: ["XLM", "yXLM"] },
  { id: "bitcoin", words: ["BITCOIN", "ON STELLAR"], about: "Bitcoin brought to Stellar, plain and yield-bearing.", icon: "btc", codes: ["BTC", "yBTC", "BTCLN"] },
  { id: "ether", words: ["ETHER", "ON STELLAR"], about: "Ether brought to Stellar, plain and yield-bearing.", icon: "eth", codes: ["ETH", "yETH"] },
  { id: "defi", words: ["DEFI", "BLUE", "CHIPS"], about: "Governance and utility tokens of Stellar's DeFi protocols.", icon: "cube", codes: ["AQUA", "BLND", "XRF", "PHO"] },
  { id: "local", words: ["LOCAL", "MONEY"], about: "Stablecoins for local currencies: pesos, naira, rand, yen and more.", icon: "globe", codes: ["ARST", "ARS", "NGNC", "ZARZ", "GYEN", "CLPX", "PEN", "IDRT"] },
  { id: "euro", words: ["THE", "EURO"], about: "Euro stablecoins on Stellar.", icon: "euro", codes: ["EURC", "EURMTL"] },
  { id: "credit", words: ["PRIVATE", "CREDIT"], about: "Tokenized credit funds: AAA-rated CLOs.", icon: "shield", codes: ["deJAAA"] },
];

export const themeAssets = (t: Theme, all: MarketAsset[]) =>
  t.codes.map((c) => all.find((a) => a.code === c)).filter((a): a is MarketAsset => !!a);

const TILE = 223;

function Tile({ t, change, cap, onOpen }: { t: Theme; change: number | null; cap: number | null; onOpen: () => void }) {
  // No price history yet (new listings such as deJAAA): show the theme's size instead of an empty change.
  const noChange = change == null && cap != null && cap > 0;
  return (
    <ButtonBase
      onClick={onOpen}
      aria-label={noChange ? `${t.words.join(" ")}, ${compactUsd(cap)} market cap` : `${t.words.join(" ")}, ${changeText(change)} 7-day change`}
      sx={{
        position: "relative",
        top: 0,
        display: "block",
        width: "100%",
        height: TILE,
        textAlign: "left",
        transition: "top .2s",
        "&:hover": { top: "-2px" },
        "&:hover .arrow, &:focus-visible .arrow": { opacity: 1, transform: "translateX(0) scale(1)" },
      }}
    >
      {/* Glass shell around the card. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          borderRadius: "33px",
          backdropFilter: "blur(1.1px)",
          background: "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.024) 42%, rgba(255,255,255,0.07) 100%)",
          boxShadow:
            "rgba(255,255,255,0.1) 0 0 0 0.87px, rgba(0,0,0,0.35) 0 10px 22px, rgba(0,0,0,0.28) 0 41px 41px, rgba(255,255,255,0.08) 0 1px 0 inset",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: "11px",
          right: "11px",
          top: "10px",
          bottom: "11px",
          overflow: "hidden",
          borderRadius: "22px",
          background: C.card,
        }}
      >
        <Box aria-hidden sx={{ position: "absolute", left: "-6px", top: "-199px", width: "214px", height: "214px", borderRadius: "50%", bgcolor: "#0060ff", filter: "blur(9.7px)", opacity: 0.1 }} />
        <Box aria-hidden sx={{ position: "absolute", left: "52%", top: "6px", width: "190px", height: "190px" }}>
          <ThemeIcon kind={t.icon} size="100%" />
        </Box>
        <Box
          className="arrow"
          aria-hidden
          sx={{
            position: "absolute",
            right: "1rem",
            bottom: "1rem",
            width: "45px",
            height: "45px",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(255,255,255,0.15)",
            color: "#fff",
            boxShadow: "0 8px 28px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.15)",
            backdropFilter: "blur(2px)",
            opacity: 0,
            transform: "translateX(0.5rem) scale(0.75)",
            transition: "all .2s ease-out",
            zIndex: 2,
          }}
        >
          <ArrowForwardIcon sx={{ fontSize: "1.25rem" }} />
        </Box>
        <Box
          component="span"
          sx={{
            position: "absolute",
            left: "15px",
            top: "25px",
            zIndex: 1,
            fontSize: "23px",
            lineHeight: 0.79,
            fontWeight: 500,
            textTransform: "uppercase",
            color: "#fff",
            opacity: 0.95,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {t.words.map((w) => (
            <Box key={w} component="span" sx={{ display: "block", whiteSpace: "pre" }}>
              {w}
            </Box>
          ))}
        </Box>
        <Box sx={{ position: "absolute", left: "16px", top: "139px", zIndex: 1 }}>
          {noChange ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <Box component="span" sx={{ fontSize: "1.07rem", lineHeight: 0.79, color: "#fff", opacity: 0.95 }}>
                {compactUsd(cap)}
              </Box>
              <Box component="span" sx={{ fontSize: "0.86rem", lineHeight: 0.79, color: "#fff", opacity: 0.8 }}>
                Market cap
              </Box>
            </Box>
          ) : (
            <ReturnLines value={change} caption="7-day change" />
          )}
        </Box>
      </Box>
    </ButtonBase>
  );
}

/** What's inside a theme: each asset with its price and 7-day change, opening its page or the swap. */
export function ThemeDialog({ t, assets, onClose }: { t: Theme | null; assets: MarketAsset[]; onClose: () => void }) {
  const list = t ? themeAssets(t, assets) : [];
  return (
    <Dialog
      open={!!t}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { bgcolor: C.page, backgroundImage: "none", borderRadius: "1.25rem", border: "1px solid rgba(255,255,255,0.12)" } } }}
    >
      {t && (
        <Box sx={{ p: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
            <Box sx={{ width: "4.5rem", height: "4.5rem", flexShrink: 0 }}>
              <ThemeIcon kind={t.icon} size="100%" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ color: "#fff", fontSize: "1.5rem", letterSpacing: "-0.04em", lineHeight: 1.1 }}>{t.words.join(" ")}</Box>
              <Box sx={{ color: C.muted, fontSize: "0.875rem", mt: "0.35rem" }}>{t.about}</Box>
            </Box>
            <IconButton onClick={onClose} aria-label="Close" sx={{ color: C.muted, mt: "-0.25rem" }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {list.map((a) => (
              <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: "0.75rem", bgcolor: C.surface, borderRadius: "1rem", p: "0.75rem 0.9rem" }}>
                <Box component={Link} href={assetHref(a)} sx={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0, textDecoration: "none", color: "#fff" }}>
                  <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="2rem" />
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: "1rem" }}>{a.code}</Box>
                    <Box sx={{ fontSize: "0.75rem", color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.name} · {compactUsd(a.marketCap)}
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Box sx={{ color: "#fff", fontSize: "0.9rem" }}>{priceText(a.price)}</Box>
                  <Box sx={{ color: changeColor(a.change7d), fontSize: "0.75rem" }}>{changeText(a.change7d)} 7D</Box>
                </Box>
                <Box
                  component={Link}
                  href={swapHref(a)}
                  sx={{ ml: "0.25rem", px: "0.8rem", py: "0.4rem", borderRadius: "9999px", bgcolor: "rgba(255,255,255,0.12)", color: "#fff", fontSize: "0.8rem", textDecoration: "none", "&:hover": { bgcolor: "rgba(255,255,255,0.2)" } }}
                >
                  Swap
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ color: C.muted, fontSize: "0.75rem" }}>7-day change is weighted by market cap. Prices from Stellar DEX markets.</Box>
        </Box>
      )}
    </Dialog>
  );
}

/** Grid of themed baskets of Stellar assets; a tile opens what's inside. */
export default function ThemeTiles() {
  const { assets, loading } = useMarketAssets();
  const [open, setOpen] = useState<Theme | null>(null);
  // Every theme with at least one listed asset stays on the grid (a theme hidden after loading left a
  // hole in the last row); one without price history yet shows its market cap.
  const capOf = (t: Theme) => themeAssets(t, assets).reduce((s, a) => s + (a.marketCap ?? 0), 0) || null;
  const shown = loading ? THEMES : THEMES.filter((t) => themeAssets(t, assets).length > 0);
  return (
    <>
      <Measured loading={loading} id="explore-themes">
        <Box
          component="section"
          aria-label="Themes"
          sx={{ display: "grid", gap: "13px", gridTemplateColumns: `repeat(auto-fill, minmax(${TILE}px, 1fr))`, mb: "2.5rem" }}
        >
          {shown.map((t) => (
            <Tile key={t.id} t={t} change={loading ? 1.23 : weightedChange(themeAssets(t, assets))} cap={loading ? null : capOf(t)} onOpen={() => setOpen(t)} />
          ))}
        </Box>
      </Measured>
      <ThemeDialog t={open} assets={assets} onClose={() => setOpen(null)} />
    </>
  );
}
