"use client";

import { useEffect, useState } from "react";
import { fallbackHue, getTokenMeta, iconCandidates } from "@/lib/tokens";

export function TokenIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const [srcs, setSrcs] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIdx(0);
    setSrcs([]);
    getTokenMeta(symbol).then((m) => {
      if (!cancelled) setSrcs(iconCandidates(m.icon));
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const src = srcs[idx];
  if (src) {
    return (
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        className="token-icon"
        onError={() => setIdx((i) => i + 1)}
        loading="eager"
      />
    );
  }
  return (
    <span
      className="token-fallback"
      aria-label={symbol}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.45)),
        background: `hsl(${fallbackHue(symbol)} 55% 24%)`,
      }}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Overlapping collateral/debt pair, like lending-market rows. */
export function PairIcons({ a, b, size = 22 }: { a: string; b?: string | null; size?: number }) {
  return (
    <span className="pair-icons" aria-hidden="true">
      <TokenIcon symbol={a} size={size} />
      {b && (
        <span className="pair-second">
          <TokenIcon symbol={b} size={size} />
        </span>
      )}
    </span>
  );
}
