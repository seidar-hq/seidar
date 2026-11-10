"use client";

import { Measured } from "./Skeleton";

/** A run of digits about `width` wide, standing in for a value that has none yet. */
function filler(width: string): string {
  const rem = width.endsWith("rem") ? parseFloat(width) : NaN;
  return "0".repeat(Number.isFinite(rem) ? Math.max(2, Math.round(rem * 1.9)) : 6);
}

/** Text with fewer than two letters or digits ("—", "", "0") is too small to give a skeleton its shape. */
const thin = (node: React.ReactNode) =>
  node == null || typeof node === "boolean" || ((typeof node === "string" || typeof node === "number") && String(node).replace(/[^\p{L}\p{N}]/gu, "").length < 2);

/**
 * A value that is loading (first fetch, or an update after a transaction): skullet draws a bone over the value
 * itself, measured from its text, instead of a 0 or a stale figure that then jumps. While there is no value
 * yet, a stand-in about `width` wide gives it its shape.
 */
export default function Shimmer({
  on,
  width = "5rem",
  children,
}: {
  on: boolean;
  width?: string;
  /** No longer used: the bone takes the height of the text it covers. */
  height?: string;
  children?: React.ReactNode;
}) {
  return (
    <Measured loading={on} inline>
      {on && thin(children) ? filler(width) : children}
    </Measured>
  );
}
