"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import Tabs from "@/components/common/Tabs";
import { formatAmount } from "@/lib/format";

// Price-range picker for concentrated pools: Full / Custom range, the pair's recent price with the
// chosen band, liquidity by price (when the venue publishes it), and min / max inputs with steppers.

export type ClInfo = {
  ok?: boolean;
  codes: string[];
  decimals: number[];
  tick: number;
  tickSpacing: number;
  price: number;
  bins?: { lo: number; hi: number; liquidity: number }[];
};

export type RangeValue = { full: boolean; lower: number | null; upper: number | null };

const fmtPx = (v: number) => (v >= 1000 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4));

function Stepper({ label, value, onChange, step }: { label: string; value: string; onChange: (v: string) => void; step: (dir: 1 | -1) => void }) {
  return (
    <Box sx={{ flex: "1 1 14rem", borderRadius: "0.875rem", backgroundColor: "grey.400", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, p: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <InputBase
          value={value}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
          inputProps={{ inputMode: "decimal", "aria-label": label }}
          sx={{ flex: 1, fontSize: "1.375rem", fontWeight: 600, color: "common.black" }}
        />
        {([-1, 1] as const).map((d) => (
          <ButtonBase
            key={d}
            onClick={() => step(d)}
            aria-label={d < 0 ? "Lower" : "Raise"}
            sx={{
              width: "2rem",
              height: "2rem",
              borderRadius: "50%",
              fontSize: "1.125rem",
              color: d < 0 ? "error.main" : "green.main",
              backgroundColor: d < 0 ? "rgba(255, 92, 92, 0.12)" : "rgba(0, 196, 107, 0.12)",
            }}
          >
            {d < 0 ? "−" : "+"}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

export default function PoolRange({
  info,
  history,
  value,
  onChange,
}: {
  info: ClInfo;
  /** Recent prices of token0 in token1 (oldest first); may be empty. */
  history: { t: number; px: number }[];
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}) {
  const theme = useTheme();
  const [lo, setLo] = useState("");
  const [hi, setHi] = useState("");
  const unit = `${info.codes[1]} per ${info.codes[0]}`;
  // One tick-spacing step in price terms.
  const stepFactor = Math.pow(1.0001, Math.max(1, info.tickSpacing));

  // Custom defaults: ±10% around the current price.
  useEffect(() => {
    if (!value.full && value.lower == null && value.upper == null) {
      const l = info.price * 0.9;
      const u = info.price * 1.1;
      setLo(fmtPx(l));
      setHi(fmtPx(u));
      onChange({ full: false, lower: l, upper: u });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.full]);

  const set = (which: "lo" | "hi", s: string) => {
    (which === "lo" ? setLo : setHi)(s);
    const n = Number(s);
    onChange({ full: false, lower: which === "lo" ? (n > 0 ? n : null) : value.lower, upper: which === "hi" ? (n > 0 ? n : null) : value.upper });
  };
  const step = (which: "lo" | "hi", d: 1 | -1) => {
    const cur = which === "lo" ? (value.lower ?? info.price) : (value.upper ?? info.price);
    set(which, fmtPx(d > 0 ? cur * stepFactor : cur / stepFactor));
  };

  const series = useMemo(() => (history.length > 1 ? history : [{ t: Date.now() - 3600_000, px: info.price }, { t: Date.now(), px: info.price }]), [history, info.price]);
  const pxs = series.map((p) => p.px);
  const bandLo = value.full ? null : value.lower;
  const bandHi = value.full ? null : value.upper;
  const yMin = Math.min(...pxs, bandLo ?? Infinity, info.price) * 0.97;
  const yMax = Math.max(...pxs, bandHi ?? 0, info.price) * 1.03;
  const bins = (info.bins ?? []).filter((b) => b.hi >= yMin && b.lo <= yMax);
  const maxLiq = Math.max(1, ...bins.map((b) => b.liquidity));
  const inRange = value.full || (bandLo != null && bandHi != null && info.price >= bandLo && info.price < bandHi);
  const green = theme.palette.green.main;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Set Price Range</Typography>
      <Box sx={{ alignSelf: "flex-start" }}>
        <Tabs
          tabs={[
            { id: "full", label: "Full Range", padding: "0 0.875rem" },
            { id: "custom", label: "Custom Range", padding: "0 0.875rem" },
          ]}
          activeTab={value.full ? "full" : "custom"}
          setActiveTab={(id) => onChange(id === "full" ? { full: true, lower: null, upper: null } : { full: false, lower: null, upper: null })}
          isPathProvided={false}
        />
      </Box>

      <Box sx={{ borderRadius: "1rem", backgroundColor: "grey.400", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, p: "1rem 1.25rem" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", mb: "0.75rem" }}>
          <Box>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>Current Price</Typography>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>
              {fmtPx(info.price)} {unit}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>Range</Typography>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: inRange ? "green.main" : "orange.main" }}>
              {value.full ? "Full range (0 → ∞)" : `${bandLo != null ? fmtPx(bandLo) : "?"} → ${bandHi != null ? fmtPx(bandHi) : "?"}`}
              {!value.full && !inRange ? " · out of range" : ""}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: "0.75rem", height: "13rem" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rangeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={green} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={[yMin, yMax]} hide />
                {value.full ? (
                  <ReferenceArea y1={yMin} y2={yMax} fill={green} fillOpacity={0.08} />
                ) : (
                  bandLo != null && bandHi != null && <ReferenceArea y1={Math.max(bandLo, yMin)} y2={Math.min(bandHi, yMax)} fill={green} fillOpacity={0.12} stroke={green} strokeOpacity={0.4} />
                )}
                <ReferenceLine y={info.price} stroke={theme.palette.grey[200]} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="px" stroke={green} strokeWidth={1.75} fill="url(#rangeFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
          {bins.length > 0 && (
            <Box sx={{ width: "4.5rem", position: "relative" }} aria-label="Liquidity by price">
              {bins.map((b, i) => {
                const top = ((yMax - Math.min(b.hi, yMax)) / (yMax - yMin)) * 100;
                const h = ((Math.min(b.hi, yMax) - Math.max(b.lo, yMin)) / (yMax - yMin)) * 100;
                return (
                  <Box
                    key={i}
                    sx={{ position: "absolute", right: 0, top: `${top}%`, height: `${Math.max(h, 0.5)}%`, width: `${(b.liquidity / maxLiq) * 100}%`, backgroundColor: green, opacity: 0.75, borderRadius: "0.125rem" }}
                  />
                );
              })}
            </Box>
          )}
        </Box>
        {history.length <= 1 && (
          <Typography sx={{ fontSize: "0.75rem", color: "grey.200", mt: "0.5rem" }}>No price history for this pair yet; showing the pool&apos;s live price.</Typography>
        )}
      </Box>

      {!value.full && (
        <Box sx={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Stepper label={`Minimum (${unit})`} value={lo} onChange={(s) => set("lo", s)} step={(d) => step("lo", d)} />
          <Stepper label={`Maximum (${unit})`} value={hi} onChange={(s) => set("hi", s)} step={(d) => step("hi", d)} />
        </Box>
      )}
      {!value.full && bandLo != null && bandHi != null && !(bandHi > bandLo) && (
        <Typography sx={{ fontSize: "0.8125rem", color: "error.main" }}>The maximum must be above the minimum.</Typography>
      )}
      {!value.full && !inRange && bandLo != null && bandHi != null && bandHi > bandLo && (
        <Typography sx={{ fontSize: "0.8125rem", color: "orange.main" }}>
          This range is {info.price < bandLo ? "above" : "below"} the current price: it takes only {info.price < bandLo ? info.codes[0] : info.codes[1]} and earns no fees until the price moves into it.
        </Typography>
      )}
      <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
        Prices snap to the pool&apos;s tick spacing ({info.tickSpacing}). Current tick {info.tick} · {formatAmount(info.price, 6)}.
      </Typography>
    </Box>
  );
}
