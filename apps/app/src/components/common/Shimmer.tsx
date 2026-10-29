"use client";

import Skeleton from "@mui/material/Skeleton";

/**
 * The loading shimmer used for numbers (as on the dashboard's portfolio KPIs): shown in place of a
 * value while it is first fetched, or while it updates after a transaction, instead of a 0 or a
 * stale figure that then jumps.
 */
export default function Shimmer({
  on,
  width = "5rem",
  height = "1.2em",
  children,
}: {
  on: boolean;
  width?: string;
  height?: string;
  children?: React.ReactNode;
}) {
  if (!on) return <>{children}</>;
  return <Skeleton variant="rounded" animation="wave" width={width} height={height} sx={{ display: "inline-block", verticalAlign: "middle" }} />;
}
