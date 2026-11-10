"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import type { MarketAsset } from "@/components/home/marketData";

// Shared look of the Explore page: flat charcoal surfaces, tight display type, green/red returns,
// and glossy "spheres" for logos. Colours are kept here so every block reads the same.

export const C = {
  page: "#1f1f1f",
  pill: "#272727",
  surface: "#2c2c2c",
  card: "linear-gradient(180deg,#101010 0%,#171717 52%,#707070 100%)",
  up: "#05c600",
  down: "#ef4444",
  muted: "#909090",
  text: "#f3f3f3",
};

export const changeColor = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? C.muted : v > 0 ? C.up : C.down);
export const changeText = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);

/** Market-cap weighted 7-day change of a group of assets (null when none has both numbers). */
export function weightedChange(list: MarketAsset[]): number | null {
  let w = 0;
  let s = 0;
  for (const a of list) {
    if (a.change7d == null || !a.marketCap) continue;
    w += a.marketCap;
    s += a.marketCap * a.change7d;
  }
  return w > 0 ? s / w : null;
}

/** Section heading, same size and rhythm as the reference layout (24/30 px, normal weight). */
export function Heading({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      component="h2"
      sx={[
        {
          fontWeight: 400,
          fontSize: { xs: "1.5rem", md: "1.875rem" },
          lineHeight: { xs: "2rem", md: "2.5rem" },
          letterSpacing: "-0.02em",
          color: C.text,
          textAlign: { xs: "center", md: "left" },
          pt: "1.5rem",
          pb: "1.25rem",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

/** Stacked display title ("THE / MAG / SEVEN" style): one word per line, very tight leading. */
export function StackTitle({ words, size, upper, sx }: { words: string[]; size: string; upper?: boolean; sx?: SxProps<Theme> }) {
  return (
    <Box
      component="span"
      sx={[
        {
          display: "block",
          fontSize: size,
          lineHeight: 0.79,
          letterSpacing: upper ? "-0.01em" : "-0.06em",
          textTransform: upper ? "uppercase" : "none",
          fontWeight: upper ? 500 : 400,
          color: C.text,
          opacity: 0.95,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {words.map((w, i) => (
        <Box key={i} component="span" sx={{ display: "block", whiteSpace: "pre" }}>
          {w}
        </Box>
      ))}
    </Box>
  );
}

/**
 * A glossy ball with a logo on it: base colour, a soft white highlight top-left, a dark rim at the
 * bottom-right and a faint reflection, all in CSS so no artwork has to ship.
 */
export function Sphere({ src, color = "#2a2a2a", size, sx }: { src?: string | null; color?: string; size: string; sx?: SxProps<Theme> }) {
  return (
    <Box
      aria-hidden
      sx={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 12%, rgba(255,255,255,0) 32%),
             radial-gradient(circle at 70% 80%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 78%),
             ${color}`,
          boxShadow: "inset -0.6rem -0.9rem 1.6rem rgba(0,0,0,0.45), inset 0.4rem 0.5rem 1rem rgba(255,255,255,0.18), 0 1.2rem 2.4rem rgba(0,0,0,0.45)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {src && (
        <Box
          component="img"
          src={src}
          alt=""
          sx={{ width: "52%", height: "52%", objectFit: "contain", borderRadius: "50%", filter: "drop-shadow(0 0.25rem 0.5rem rgba(0,0,0,0.45))", opacity: 0.95 }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 22%)",
          mixBlendMode: "screen",
        }}
      />
    </Box>
  );
}

/** Return figure + caption pinned to the bottom-left of a card. */
export function ReturnLines({ value, caption, big }: { value: number | null; caption: string; big?: boolean }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: big ? "0.75rem" : "0.6rem" }}>
      <Box component="span" sx={{ fontSize: big ? "1.375rem" : "1.07rem", lineHeight: 0.79, color: changeColor(value), opacity: 0.95 }}>
        {changeText(value)}
      </Box>
      <Box component="span" sx={{ fontSize: big ? "1rem" : "0.86rem", lineHeight: 0.79, color: "#fff", opacity: 0.8 }}>
        {caption}
      </Box>
    </Box>
  );
}
