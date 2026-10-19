"use client";
import { useMemo, useRef, useState } from "react";
import { TokenIcon } from "./token-icon";

/* Small SVG charts for the pool page (no chart library in the app):
   - HistoryChart: one daily series (TVL as an area, volume as bars) with a
     crosshair tooltip. TVL and volume are separate charts — never one
     chart with two y-scales.
   - CompositionBar: what the reserves are worth per token, direct-labeled.
   - LiquidityChart: liquidity by price for concentrated pools, the live
     price marked and the user's ranges shaded. */

const GREEN = "#57c36b";
const GRID = "#2b2b2b";

export const fmtUsdShort = (v: number) =>
  v >= 1e9
    ? `$${(v / 1e9).toFixed(2)}B`
    : v >= 1e6
      ? `$${(v / 1e6).toFixed(2)}M`
      : v >= 1e3
        ? `$${(v / 1e3).toFixed(1)}K`
        : `$${v.toFixed(v >= 10 ? 0 : 2)}`;
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const fmtPx = (p: number) =>
  p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(4) : p >= 0.01 ? p.toFixed(5) : p.toPrecision(4);

export function HistoryChart({
  points,
  kind,
  label,
}: {
  points: { t: number; v: number }[];
  kind: "area" | "bars";
  label: string;
}) {
  const W = 640;
  const H = 180;
  const PL = 4;
  const PR = 4;
  const PT = 10;
  const PB = 22;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const vs = points.map((p) => p.v);
  const hi = Math.max(...vs, 0) * 1.08 || 1;
  const lo = kind === "area" ? Math.min(...vs) * 0.92 : 0;
  const n = points.length;
  const slot = (W - PL - PR) / Math.max(1, n);
  const x = (i: number) => (kind === "bars" ? PL + slot * i + slot / 2 : PL + (i / Math.max(1, n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z` : "";
  const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n ? [0] : [];
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = kind === "bars" ? Math.floor((px - PL) / slot) : Math.round(((px - PL) / (W - PL - PR)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }
  const h = hover != null ? points[hover] : null;
  return (
    <div className="pc-chart">
      <div className="pc-head">
        <span>{label}</span>
        <b>{h ? fmtUsdShort(h.v) : n ? fmtUsdShort(points[n - 1].v) : "—"}</b>
        <small>
          {h
            ? fmtDay(h.t)
            : n
              ? new Date(points[n - 1].t).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
                ? "today so far (UTC)"
                : `${fmtDay(points[n - 1].t)} · latest`
              : ""}
        </small>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="pc-svg"
        role="img"
        aria-label={`${label}, daily, last ${n} days`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PL} x2={W - PR} y1={PT + f * (H - PT - PB)} y2={PT + f * (H - PT - PB)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="#3d3d3d" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {kind === "area" ? (
          <>
            <defs>
              <linearGradient id="pc-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity=".28" />
                <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#pc-area)" />}
            <path d={line} fill="none" stroke={GREEN} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </>
        ) : (
          points.map((p, i) => {
            const bw = Math.max(2, slot - 3);
            const top = y(p.v);
            const hgt = Math.max(0, H - PB - top);
            return (
              <rect
                key={p.t}
                x={x(i) - bw / 2}
                y={top}
                width={bw}
                height={hgt}
                rx={Math.min(3, bw / 2)}
                fill={hover === i ? GREEN : "#3f8f4f"}
              />
            );
          })
        )}
        {h && hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="#8a8a8a" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            {kind === "area" && <circle cx={x(hover)} cy={y(h.v)} r="4" fill={GREEN} stroke="#1c1c1c" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          </>
        )}
      </svg>
      <div className="pc-x">
        {ticks.map((i) => (
          <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>
            {fmtDay(points[i].t)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Reserve value split per token (USD when priced, else token amounts only). */
export function CompositionBar({ legs }: { legs: { code: string; amount: number; usd: number | null }[] }) {
  const total = legs.reduce((s, l) => s + (l.usd ?? 0), 0);
  const priced = total > 0 && legs.every((l) => l.usd != null);
  const shades = [GREEN, "#8a8a8a", "#5f5f5f", "#b5b5b5"];
  return (
    <div className="pc-comp">
      {priced && (
        <div className="pc-comp-bar" role="img" aria-label={legs.map((l) => `${l.code} ${(((l.usd ?? 0) / total) * 100).toFixed(1)}%`).join(", ")}>
          {legs.map((l, i) => (
            <i key={l.code} style={{ width: `${((l.usd ?? 0) / total) * 100}%`, background: shades[i % shades.length] }} />
          ))}
        </div>
      )}
      <div className="pc-comp-legs">
        {legs.map((l, i) => (
          <div key={l.code}>
            <span className="pc-dot" style={{ background: shades[i % shades.length] }} />
            <TokenIcon symbol={l.code} size={18} />
            <b>{l.amount.toLocaleString("en-US", { maximumFractionDigits: l.amount >= 100 ? 0 : 4 })} {l.code}</b>
            {priced && (
              <small>
                {fmtUsdShort(l.usd ?? 0)} · {(((l.usd ?? 0) / total) * 100).toFixed(1)}%
              </small>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Liquidity by price (concentrated pools). */
export function LiquidityChart({
  bins,
  price,
  ranges = [],
  base,
  quote,
}: {
  bins: { lo: number; hi: number; liquidity: number }[];
  price: number;
  ranges?: { lo: number; hi: number; inRange: boolean }[];
  base: string;
  quote: string;
}) {
  const W = 640;
  const H = 170;
  const PB = 22;
  const PT = 8;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...bins.map((b) => b.liquidity), 1);
  const lo = bins[0]?.lo ?? 0;
  const hi = bins[bins.length - 1]?.hi ?? 1;
  // Bins are equal in tick (log price) space: place by log price.
  const lx = (p: number) => ((Math.log(p) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * W;
  const bw = W / Math.max(1, bins.length);
  const hb = hover != null ? bins[hover] : null;
  const shaded = useMemo(
    () => ranges.map((r) => ({ ...r, x0: Math.max(0, lx(r.lo)), x1: Math.min(W, lx(r.hi)) })).filter((r) => r.x1 > 0 && r.x0 < W),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranges, lo, hi],
  );
  return (
    <div className="pc-chart">
      <div className="pc-head">
        <span>Liquidity by price</span>
        <b>
          {hb ? `${fmtPx(hb.lo)} – ${fmtPx(hb.hi)}` : fmtPx(price)} {quote}
        </b>
        <small>{hb ? `${((hb.liquidity / max) * 100).toFixed(0)}% of the deepest band` : `per ${base} · live price`}</small>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pc-svg" role="img" aria-label="Liquidity distribution by price" onMouseLeave={() => setHover(null)}>
        {shaded.map((r, i) => (
          <rect key={i} x={r.x0} y={PT} width={r.x1 - r.x0} height={H - PT - PB} fill={r.inRange ? "rgba(87,195,107,.12)" : "rgba(217,180,90,.12)"} />
        ))}
        {bins.map((b, i) => {
          const h = (b.liquidity / max) * (H - PT - PB);
          const inPrice = b.lo <= price && price < b.hi;
          return (
            <rect
              key={i}
              x={i * bw + 1}
              y={H - PB - h}
              width={Math.max(1, bw - 2)}
              height={h}
              rx="2"
              fill={hover === i || inPrice ? GREEN : "#4a4a4a"}
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
        <line x1={lx(price)} x2={lx(price)} y1={PT} y2={H - PB} stroke="#e6e6e6" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={H - PB} y2={H - PB} stroke="#3d3d3d" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="pc-x">
        <span style={{ left: "0%" }}>{fmtPx(lo)}</span>
        <span style={{ left: `${(lx(price) / W) * 100}%` }}>Now {fmtPx(price)}</span>
        <span style={{ left: "100%" }}>{fmtPx(hi)}</span>
      </div>
    </div>
  );
}
