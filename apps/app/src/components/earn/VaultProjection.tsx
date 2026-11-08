"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { formatUsd } from "@/lib/format";

const YEARS = 5;
const MONTHS_PER_YEAR = 12;

/** Balance after `month` months at a fixed APY, with `monthly` added at the end of each month. */
export function projectedBalance(initial: number, monthly: number, apyPct: number, month: number): number {
  const rate = Math.pow(1 + apyPct / 100, 1 / MONTHS_PER_YEAR) - 1;
  const growth = Math.pow(1 + rate, month);
  const contributions = rate === 0 ? monthly * month : (monthly * (growth - 1)) / rate;
  return initial * growth + contributions;
}

const parseUsd = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function UsdField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: "0.375rem", flex: "1 1 10rem", minWidth: 0 }}>
      <Typography component="span" sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
        {label}
      </Typography>
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        startAdornment={<Box sx={{ color: "grey.200", mr: "0.25rem" }}>$</Box>}
        inputProps={{ inputMode: "decimal", "aria-label": label }}
        sx={{ height: "3rem", px: "0.875rem", borderRadius: "0.75rem", color: "common.black", backgroundColor: "surfaceBg.softInset", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}
      />
    </Box>
  );
}

/** Projected balance by year. Plain SVG: there is nothing to zoom into on a smooth forward projection. */
function ProjectionChart({ values, years }: { values: number[]; years: number }) {
  const theme = useTheme();
  const width = 600;
  const height = 160;
  const top = Math.max(...values) || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - (v / top) * (height - 6);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", fontSize: "0.75rem", color: "grey.200", mb: "0.25rem" }}>{formatUsd(top)}</Box>
      <Box component="svg" role="img" aria-label={`Projected balance over ${years} years, reaching ${formatUsd(values[values.length - 1])}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" sx={{ display: "block", width: "100%", height: "10rem" }}>
        <defs>
          <linearGradient id="vaultProjectionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity="0.35" />
            <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#vaultProjectionFill)" />
        <path d={line} fill="none" stroke={theme.palette.primary.main} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: "0.5rem", fontSize: "0.75rem", color: "grey.200" }}>
        {Array.from({ length: years + 1 }, (_, year) => (
          <span key={year}>{year === 0 ? "Today" : `Year ${year}`}</span>
        ))}
      </Box>
    </Box>
  );
}

/** "What if" calculator at the vault's current APY. An estimate only, and labelled as one. */
export default function VaultProjection({ apyPct, startUsd }: { apyPct: number; startUsd?: number }) {
  const [initial, setInitial] = useState(startUsd && startUsd >= 1 ? startUsd.toFixed(0) : "1000");
  const [monthly, setMonthly] = useState("100");
  const start = parseUsd(initial);
  const added = parseUsd(monthly);
  const totalMonths = YEARS * MONTHS_PER_YEAR;
  const balance = projectedBalance(start, added, apyPct, totalMonths);
  const earned = balance - start - added * totalMonths;

  const points = useMemo(() => Array.from({ length: totalMonths + 1 }, (_, month) => projectedBalance(start, added, apyPct, month)), [start, added, apyPct, totalMonths]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <UsdField label="Initial deposit" value={initial} onChange={setInitial} />
        <UsdField label="Added every month" value={monthly} onChange={setMonthly} />
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "2rem" }}>
        <Box>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Earned over {YEARS} years</Typography>
          <Typography sx={{ fontSize: "1.5rem", fontWeight: 600, color: "green.main" }}>{formatUsd(earned)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Balance in {YEARS} years</Typography>
          <Typography sx={{ fontSize: "1.5rem", fontWeight: 600, color: "common.black" }}>{formatUsd(balance)}</Typography>
        </Box>
      </Box>
      {start + added > 0 && <ProjectionChart values={points} years={YEARS} />}
      <Typography sx={{ fontSize: "0.75rem", color: "grey.200", lineHeight: 1.5 }}>
        Estimate only. It assumes today&apos;s {apyPct.toFixed(2)}% APY holds for {YEARS} years and that the token keeps its USD value. Vault yields change and are not guaranteed.
      </Typography>
    </Box>
  );
}
