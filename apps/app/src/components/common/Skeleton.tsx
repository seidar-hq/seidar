"use client";

import type { CSSProperties } from "react";
import Box from "@mui/material/Box";
import { styled, type SxProps, type Theme } from "@mui/material/styles";
import { Skeleton as SkulletSkeleton, SkeletonBox } from "skullet/react";

// Loading states are drawn by skullet (theme in src/theme/SkulletTheme.tsx).
//
// Prefer `Measured`: wrap the real content and set `loading`. While loading, skullet lays that content out
// unseen and draws a bone over every line of text, image and control in it, so the skeleton has exactly the
// content's shape and nothing moves when the data lands. Render the content from sample data while loading
// (or keep the data on screen when refetching), and give it an `id` so the shape it last had is reused on the
// next visit.
//
// The default export draws a plain box, for the few places with nothing real to render yet (the app shell
// before it mounts, the wallet button before the wallet kit is ready).

type Len = string | number;

const Reveal = styled(SkulletSkeleton)({});

export function Measured({
  loading,
  id,
  label,
  inline,
  sx,
  className,
  style,
  children,
}: {
  loading: boolean;
  /** Remembers the content's shape under this key, for the next load. */
  id?: string;
  /** Read to screen readers while loading. */
  label?: string;
  /** Sits in a line of text (a number in a sentence or a label row). */
  inline?: boolean;
  sx?: SxProps<Theme>;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Reveal
      loading={loading}
      id={id}
      label={label}
      className={className}
      style={inline ? { display: "inline-block", verticalAlign: "bottom", maxWidth: "100%", ...style } : style}
      sx={sx}
    >
      {children}
    </Reveal>
  );
}

/** A chart (or other drawing) with nothing to lay out until its data arrives: one block its size while
 *  loading, crossfading into the content. */
export function MeasuredBlock({
  loading,
  height,
  radius = "0.5rem",
  id,
  sx,
  children,
}: {
  loading: boolean;
  height: Len;
  radius?: Len;
  id?: string;
  sx?: SxProps<Theme>;
  children: React.ReactNode;
}) {
  return (
    <Measured loading={loading} id={id} sx={sx}>
      {loading ? <Box skullet-block="" sx={{ height, borderRadius: radius }} /> : children}
    </Measured>
  );
}

const Bone = styled(SkeletonBox)({});

export default function Skeleton({
  variant = "text",
  width,
  height,
  sx,
  className,
  style,
}: {
  variant?: "text" | "rounded" | "rectangular" | "circular";
  width?: Len;
  height?: Len;
  /** Accepted for the old MUI prop; skullet animates every skeleton in one stream. */
  animation?: "wave" | "pulse" | false;
  sx?: SxProps<Theme>;
  className?: string;
  style?: CSSProperties;
}) {
  const flat = sx && typeof sx === "object" && !Array.isArray(sx) ? (sx as Record<string, unknown>) : {};
  const { height: sxH, width: sxW, borderRadius: sxR } = flat;
  const own = new Set(["height", "width", "borderRadius", "background", "backgroundColor"]);
  const rest = Object.fromEntries(Object.entries(flat).filter(([k]) => !own.has(k)));
  const h = (height ?? sxH ?? (variant === "text" ? "1em" : "1.2em")) as Len;
  const w = (width ?? sxW ?? (variant === "circular" ? h : "100%")) as Len;
  const r = (sxR ?? (variant === "circular" ? "50%" : variant === "rectangular" ? 0 : undefined)) as Len | undefined;
  return <Bone height={h} width={w} radius={r} className={className} style={style} sx={rest} />;
}
