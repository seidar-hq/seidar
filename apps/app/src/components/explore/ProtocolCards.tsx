"use client";

import Box from "@mui/material/Box";
import Link from "next/link";
import { Measured } from "@/components/common/Skeleton";
import { SAMPLE_PROTOCOLS, compactUsd, useMarketOverview, type Protocol } from "@/components/home/marketData";
import { C, ReturnLines, StackTitle } from "./parts";

const SHOWN = 4;

// Our own logo files where we have them (sharper than DefiLlama's small icons).
const LOCAL: Record<string, string> = {
  blend: "/protocols/blend.png",
  aquarius: "/protocols/aqua.png",
  upshift: "/protocols/upshift.png",
  "stellar defi hub": "/protocols/sentora.png",
  defindex: "/protocols/defindex.svg",
  sushi: "/protocols/sushi.png",
  soroswap: "/protocols/soroswap.png",
  phoenix: "/protocols/phoenix.png",
  xoxno: "/protocols/xoxno.png",
};
const logoOf = (p: Protocol) => {
  const n = p.name.toLowerCase();
  const hit = Object.keys(LOCAL).find((k) => n.startsWith(k));
  return hit ? LOCAL[hit] : p.logo;
};

/** "Blend Pools V2" -> ["Blend", "Pools V2"]: two display lines, the first word on its own. */
const lines = (name: string) => {
  const [first, ...rest] = name.split(" ");
  return rest.length ? [first, rest.join(" ")] : [first];
};

function Card({ p }: { p: Protocol }) {
  const logo = logoOf(p);
  const href = p.seidar ?? p.url ?? "#";
  const external = !p.seidar;
  return (
    <Box
      component={Link}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      aria-label={`${p.name}, ${compactUsd(p.tvl)} locked`}
      sx={{
        position: "relative",
        top: 0,
        isolation: "isolate",
        display: "block",
        height: "14.3rem",
        overflow: "hidden",
        borderRadius: "0.625rem",
        // The reference's gradient (C.card). Its #101010 start blends into our darker page, so a faint
        // corner sheen, a hairline edge and a top highlight give the card its outline; the soft shadow
        // seats it on the page.
        background:
          `radial-gradient(120% 60% at 0% 0%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 60%), ${C.card}`,
        boxShadow:
          "inset 0 0 0 0.0625rem rgba(255,255,255,0.08), inset 0 0.0625rem 0 rgba(255,255,255,0.12), 0 0.5rem 1.5rem rgba(0,0,0,0.35)",
        color: "#fff",
        textDecoration: "none",
        transition: "top .2s, box-shadow .2s",
        "&:hover": {
          top: "-2px",
          boxShadow: "inset 0 0 0 0.0625rem rgba(255,255,255,0.14), inset 0 0.0625rem 0 rgba(255,255,255,0.16), 0 0.75rem 1.75rem rgba(0,0,0,0.45)",
        },
      }}
    >
      {logo && (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            right: "-2.5rem",
            top: "2rem",
            width: "13rem",
            height: "13rem",
            opacity: 0.5,
            // Halftone look: the logo in greyscale, seen through a fine dot screen.
            WebkitMaskImage: "radial-gradient(circle, #000 0.9px, transparent 1.3px)",
            WebkitMaskSize: "4px 4px",
            maskImage: "radial-gradient(circle, #000 0.9px, transparent 1.3px)",
            maskSize: "4px 4px",
          }}
        >
          <Box component="img" src={logo} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", filter: "grayscale(1) contrast(1.6) brightness(1.4)" }} />
        </Box>
      )}
      <Box sx={{ position: "relative", zIndex: 1, height: "100%" }}>
        <StackTitle words={lines(p.name)} size="1.875rem" sx={{ position: "absolute", left: "0.95rem", top: "1rem" }} />
        <Box sx={{ position: "absolute", left: "0.95rem", bottom: "1.1rem" }}>
          {p.change7d != null ? (
            <ReturnLines big value={p.change7d} caption={`7-day TVL change · ${compactUsd(p.tvl)}`} />
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Box component="span" sx={{ fontSize: "1.375rem", lineHeight: 0.79, color: C.text }}>
                {compactUsd(p.tvl)}
              </Box>
              <Box component="span" sx={{ fontSize: "1rem", lineHeight: 0.79, opacity: 0.8 }}>
                Total value locked
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** The four largest Stellar protocols by TVL (DefiLlama). Integrated ones open their Seidar page. */
export default function ProtocolCards() {
  const { overview, loading } = useMarketOverview();
  const list = (loading ? SAMPLE_PROTOCOLS : overview?.protocols ?? []).slice(0, SHOWN);
  if (!loading && list.length === 0) return null;
  return (
    <Measured loading={loading} id="explore-protocols">
      <Box
        component="ul"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          display: "grid",
          gap: "0.83rem",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        }}
      >
        {list.map((p) => (
          <li key={p.name}>
            <Card p={p} />
          </li>
        ))}
      </Box>
    </Measured>
  );
}
