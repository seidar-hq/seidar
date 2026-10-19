"use client";

import { useState } from "react";

/** Protocol logo (Blend, XOXNO, DeFindex, Upshift, DEX venues); letter
 *  fallback when the file is missing. Used by Portfolio rows and Markets. */
export function ProtoMark({ id, size = 24 }: { id: string; size?: number }) {
  const src =
    id === "blend"
      ? "/protocol-blend.png"
      : id === "xoxno"
        ? "/protocol-xoxno.png"
        : id === "defindex"
          ? "/defindex-mark.svg"
          : id === "upshift"
            ? "/upshift-logo.png"
            : id === "soroswap"
              ? "/dex-soroswap.png"
              : id === "aqua"
                ? "/aqua-logo.png"
                : id === "phoenix"
                  ? "/dex-phoenix.png"
                  : id === "sushi"
                    ? "/sushi-logo.png"
                    : null;
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span
        className="posx-mark-fb"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {id.slice(0, 1).toUpperCase()}
      </span>
    );
  return (
    <img
      loading="lazy"
      src={src}
      alt=""
      width={size}
      height={size}
      className="posx-mark"
      onError={() => setFailed(true)}
    />
  );
}
