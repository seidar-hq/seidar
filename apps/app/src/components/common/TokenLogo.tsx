"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { ICONS_EVENT, fallbackHue, instantIcon, resolveIcon, type TokenRef } from "@/lib/tokens";

/**
 * Icon for a token via the shared resolver (lib/tokens.ts). Returns the current candidate URL
 * (null while resolving or when nothing is published) and an onError that moves to the next one.
 */
export function useTokenIcon(t: TokenRef | null, override?: string | null) {
  const code = t?.code ?? "";
  const issuer = t?.issuer ?? null;
  const contract = t?.contract ?? null;
  const [srcs, setSrcs] = useState<string[]>(() => {
    if (override) return [override];
    const i = t ? instantIcon(t) : null;
    return i ? [i] : [];
  });
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIdx(0);
    if (override) {
      setSrcs([override]);
      return;
    }
    if (!code) {
      setSrcs([]);
      return;
    }
    const ref = { code, issuer, contract };
    const instant = instantIcon(ref);
    setSrcs(instant ? [instant] : []);
    if (instant) return;
    const run = () =>
      resolveIcon(ref).then((list) => {
        if (!cancelled && list.length) setSrcs((prev) => (prev.length && prev.join() === list.join() ? prev : list));
      });
    void run();
    // The API fills the registry in the background: pick icons up as they land.
    window.addEventListener(ICONS_EVENT, run);
    return () => {
      cancelled = true;
      window.removeEventListener(ICONS_EVENT, run);
    };
  }, [code, issuer, contract, override]);

  return { src: srcs[idx] ?? null, onError: () => setIdx((i) => i + 1) };
}

/** Letter badge used when a token has no published icon. */
export function LetterBadge({ code, size }: { code: string; size: string }) {
  return (
    <Box
      aria-label={code}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `hsl(${fallbackHue(code || "?")} 55% 30%)`,
        color: "#FFFFFF",
        fontSize: `calc(${size} * 0.42)`,
        fontWeight: 600,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {(code || "?").slice(0, 1).toUpperCase()}
    </Box>
  );
}

/** Round token logo that fills its circle, with a letter badge when no image is published. */
export default function TokenLogo({
  code,
  issuer,
  contract,
  src,
  size = "2.5rem",
}: {
  code: string;
  issuer?: string | null;
  contract?: string | null;
  src?: string | null;
  size?: string;
}) {
  const icon = useTokenIcon({ code, issuer, contract }, src);
  if (!icon.src) return <LetterBadge code={code} size={size} />;
  return (
    <Box
      component="img"
      src={icon.src}
      alt={code}
      loading="lazy"
      onError={icon.onError}
      sx={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", objectFit: "cover", display: "block" }}
    />
  );
}

/** Two overlapping token logos (pools, collateral/debt pairs). */
export function PairLogos({ legs, size = "2.5rem" }: { legs: TokenRef[]; size?: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {legs.slice(0, 2).map((l, i) => (
        <Box key={`${l.code}${i}`} sx={{ ml: i ? `calc(${size} * -0.3)` : 0, borderRadius: "50%", lineHeight: 0 }}>
          <TokenLogo code={l.code} issuer={l.issuer} contract={l.contract} size={size} />
        </Box>
      ))}
    </Box>
  );
}
