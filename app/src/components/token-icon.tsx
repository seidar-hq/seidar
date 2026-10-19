"use client";

import { useEffect, useState } from "react";
import { DEX_ICONS_EVENT, dexIcon, fallbackHue, getTokenMeta, iconCandidates, loadDexIcons, pinnedTokenMeta } from "@/lib/tokens";

export function TokenIcon({ symbol, size = 22, contract }: { symbol: string; size?: number; contract?: string | null }) {
  // Pinned icons paint on the first render; others resolve via the list,
  // then the per-contract DEX registry (lib/tokens.ts loadDexIcons).
  const [srcs, setSrcs] = useState<string[]>(() => iconCandidates(pinnedTokenMeta(symbol)?.icon ?? null));
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIdx(0);
    const pinned = pinnedTokenMeta(symbol);
    if (pinned) {
      setSrcs(iconCandidates(pinned.icon));
      return;
    }
    setSrcs([]);
    const resolve = async () => {
      // An exact contract match wins over the code-keyed curated list.
      const exact = contract ? (dexIcon(symbol, contract) ?? (await loadDexIcons(), dexIcon(symbol, contract))) : null;
      if (exact) return iconCandidates(exact);
      const m = await getTokenMeta(symbol);
      if (m.icon) return iconCandidates(m.icon);
      await loadDexIcons();
      const byCode = dexIcon(symbol, contract);
      return iconCandidates(byCode);
    };
    resolve().then((list) => {
      if (!cancelled) setSrcs(list);
    });
    // The API fills icons in the background: pick them up as they land.
    const onIcons = () => {
      if (cancelled) return;
      const hit = dexIcon(symbol, contract);
      if (hit) setSrcs((prev) => (prev.length ? prev : iconCandidates(hit)));
    };
    window.addEventListener(DEX_ICONS_EVENT, onIcons);
    return () => {
      cancelled = true;
      window.removeEventListener(DEX_ICONS_EVENT, onIcons);
    };
  }, [symbol, contract]);

  const src = srcs[idx];
  if (src) {
    return (
      <img loading="lazy"
        src={src}
        alt={symbol}
        width={size}
        height={size}
        className="token-icon"
        onError={() => setIdx((i) => i + 1)}
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

/** Four circularly overlapping icons (RWA baskets, multi-token badges). */
export function QuadStack({ codes, size = 20 }: { codes: string[]; size?: number }) {
  return (
    <span className="quad-stack" aria-hidden="true">
      {codes.slice(0, 4).map((c) => (
        <TokenIcon key={c} symbol={c} size={size} />
      ))}
    </span>
  );
}
