"use client";

import Box from "@mui/material/Box";
import Link from "next/link";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TokenLogo from "@/components/common/TokenLogo";
import { Measured } from "@/components/common/Skeleton";
import { SAMPLE_ASSETS, assetHref, priceText, useMarketAssets, type MarketAsset } from "@/components/home/marketData";
import { C, changeColor, changeText } from "./parts";

const SHOWN = 12;

function Pill({ a }: { a: MarketAsset }) {
  const up = (a.change24h ?? 0) >= 0;
  const Arrow = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <Box
      component={Link}
      href={assetHref(a)}
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        borderRadius: "1.25rem",
        bgcolor: C.pill,
        px: "1.25rem",
        py: "1rem",
        textDecoration: "none",
        color: C.text,
        fontSize: "0.875rem",
        lineHeight: "1.25rem",
        transition: "background-color .2s",
        "&:hover": { bgcolor: "#303030" },
      }}
    >
      <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="1.5rem" />
      <Box component="span" sx={{ fontWeight: 500 }}>
        {a.code}
      </Box>
      <Box component="span">{priceText(a.price)}</Box>
      <Box component="span" sx={{ display: "flex", alignItems: "center", gap: "0.25rem", color: changeColor(a.change24h) }}>
        {changeText(a.change24h)}
        <Arrow sx={{ fontSize: "1rem" }} />
      </Box>
    </Box>
  );
}

/**
 * The price strip at the top: the largest Stellar assets by market cap, scrolling sideways on a loop
 * (the list is drawn twice and slides by half its width). Hovering pauses it; each pill opens the asset.
 */
export default function Ticker() {
  const { assets, loading } = useMarketAssets();
  const list = (loading ? SAMPLE_ASSETS : assets.filter((a) => a.price != null && a.change24h != null)).slice(0, SHOWN);

  return (
    <Measured loading={loading} id="explore-ticker">
      <Box
        sx={{
          overflow: "hidden",
          maskImage: "linear-gradient(90deg, transparent 0, #000 3rem, #000 calc(100% - 3rem), transparent 100%)",
          "&:hover .track": { animationPlayState: "paused" },
        }}
      >
        <Box
          className="track"
          sx={{
            display: "flex",
            gap: "0.75rem",
            width: "max-content",
            animation: loading ? "none" : `explore-marquee ${list.length * 4}s linear infinite`,
            "@keyframes explore-marquee": { from: { transform: "translateX(0)" }, to: { transform: "translateX(calc(-50% - 0.375rem))" } },
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          {[...list, ...(loading ? [] : list)].map((a, i) => (
            <Pill key={a.id + "-" + i} a={a} />
          ))}
        </Box>
      </Box>
    </Measured>
  );
}
