"use client";

import { useId } from "react";

// Black "chrome" objects for the theme tiles, drawn as SVG: a dark body gradient, a bright rim and
// a soft specular highlight give each flat shape a glossy, 3-D feel without shipping artwork.

export type IconKind = "coins" | "bar" | "btc" | "eth" | "globe" | "euro" | "growth" | "cube" | "star" | "shield";

function Chrome({ children, size }: { children: (ids: { body: string; rim: string; shine: string }) => React.ReactNode; size: number | string }) {
  const id = useId().replace(/:/g, "");
  const ids = { body: `b${id}`, rim: `r${id}`, shine: `s${id}` };
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={ids.body} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#4a4a4a" />
          <stop offset="0.28" stopColor="#141414" />
          <stop offset="0.7" stopColor="#050505" />
          <stop offset="1" stopColor="#262626" />
        </linearGradient>
        <linearGradient id={ids.rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={ids.shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g style={{ filter: "drop-shadow(0 18px 18px rgba(0,0,0,0.55))" }}>{children(ids)}</g>
    </svg>
  );
}

export function ThemeIcon({ kind, size = 200 }: { kind: IconKind; size?: number | string }) {
  return (
    <Chrome size={size}>
      {({ body, rim, shine }) => {
        const B = `url(#${body})`;
        const R = `url(#${rim})`;
        const S = `url(#${shine})`;
        const sw = 2;
        switch (kind) {
          case "coins":
            return (
              <>
                {[120, 92, 64].map((y) => (
                  <g key={y}>
                    <path d={`M30 ${y} v22 a70 22 0 0 0 140 0 v-22`} fill={B} stroke={R} strokeWidth={sw} />
                    <ellipse cx="100" cy={y} rx="70" ry="22" fill={B} stroke={R} strokeWidth={sw} />
                  </g>
                ))}
                <ellipse cx="88" cy="58" rx="40" ry="8" fill={S} opacity="0.6" />
              </>
            );
          case "bar":
            return (
              <>
                <path d="M40 140 L70 70 H170 L150 140 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M40 140 H150 V165 H40 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M150 140 L170 70 V95 L150 165 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M78 80 H158 L150 100 H70 Z" fill={S} opacity="0.35" />
              </>
            );
          case "btc":
          case "euro":
            return (
              <>
                <ellipse cx="108" cy="104" rx="66" ry="70" fill={B} stroke={R} strokeWidth={sw} />
                <ellipse cx="100" cy="100" rx="66" ry="70" fill={B} stroke={R} strokeWidth={sw} />
                <ellipse cx="100" cy="100" rx="52" ry="56" fill="none" stroke={R} strokeWidth="1.2" opacity="0.6" />
                <text x="100" y="128" textAnchor="middle" fontSize="80" fontWeight="700" fill={S} stroke={R} strokeWidth="1">
                  {kind === "btc" ? "₿" : "€"}
                </text>
                <ellipse cx="80" cy="60" rx="28" ry="12" fill={S} opacity="0.5" />
              </>
            );
          case "eth":
            return (
              <>
                <path d="M100 20 L150 100 L100 128 L50 100 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M100 140 L150 112 L100 182 L50 112 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M100 20 L100 128 L50 100 Z" fill={S} opacity="0.3" />
              </>
            );
          case "globe":
            return (
              <>
                <circle cx="100" cy="100" r="72" fill={B} stroke={R} strokeWidth={sw} />
                <ellipse cx="100" cy="100" rx="32" ry="72" fill="none" stroke={R} strokeWidth="1.4" />
                <path d="M28 100 H172 M40 62 H160 M40 138 H160" stroke={R} strokeWidth="1.4" fill="none" />
                <ellipse cx="74" cy="56" rx="30" ry="14" fill={S} opacity="0.5" />
              </>
            );
          case "growth":
            return (
              <>
                {[
                  [36, 120, 40],
                  [82, 88, 72],
                  [128, 48, 112],
                ].map(([x, y, h]) => (
                  <g key={x}>
                    <path d={`M${x} ${y} h34 v${h} h-34 Z`} fill={B} stroke={R} strokeWidth={sw} />
                    <path d={`M${x} ${y} l10 -10 h34 l-10 10 Z`} fill={B} stroke={R} strokeWidth={sw} />
                    <path d={`M${x + 34} ${y} l10 -10 v${h} l-10 10 Z`} fill={B} stroke={R} strokeWidth={sw} />
                  </g>
                ))}
                <path d="M34 104 L80 70 L120 82 L170 34" fill="none" stroke={R} strokeWidth="3" strokeLinecap="round" />
              </>
            );
          case "cube":
            return (
              <>
                <path d="M100 26 L166 62 L100 98 L34 62 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M34 62 L100 98 V176 L34 140 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M166 62 L100 98 V176 L166 140 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M100 26 L166 62 L100 98 L34 62 Z" fill={S} opacity="0.25" />
              </>
            );
          case "star":
            return (
              <>
                <path d="M100 18 C108 78 122 92 182 100 C122 108 108 122 100 182 C92 122 78 108 18 100 C78 92 92 78 100 18 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M100 18 C108 78 122 92 182 100 L100 100 Z" fill={S} opacity="0.3" />
                <circle cx="100" cy="100" r="86" fill="none" stroke={R} strokeWidth="1.2" opacity="0.5" transform="rotate(-20 100 100) scale(1 0.35) translate(0 186)" />
              </>
            );
          case "shield":
            return (
              <>
                <path d="M100 20 L164 44 V96 C164 140 136 168 100 182 C64 168 36 140 36 96 V44 Z" fill={B} stroke={R} strokeWidth={sw} />
                <path d="M100 38 L148 56 V96 C148 130 128 152 100 164 Z" fill={S} opacity="0.18" />
                <path d="M78 100 L94 116 L126 82" fill="none" stroke={R} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              </>
            );
        }
      }}
    </Chrome>
  );
}
