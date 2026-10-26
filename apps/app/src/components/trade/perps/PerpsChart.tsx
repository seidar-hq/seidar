"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import TokenLogo from "@/components/common/TokenLogo";
import { apiJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { fmtPx, hourlyPct, type PerpsMarket } from "./usePerps";

// Perps terminal: market header and a TradingView Lightweight Chart of Zenex's own price feed.

const Stat = ({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
      {label}
    </Typography>
    <Typography
      sx={{
        fontSize: "0.9375rem",
        fontWeight: 600,
        color: color ?? "common.black",
      }}
      noWrap
    >
      {value}
    </Typography>
  </Box>
);

type Candle = { t: number; o: number; h: number; l: number; c: number };

/** Interval buttons: Zenex UDF resolution and how far back to load. */
const INTERVALS = [
  { id: "5", label: "5m", spanSec: 2 * 86400 },
  { id: "15", label: "15m", spanSec: 5 * 86400 },
  { id: "60", label: "1H", spanSec: 20 * 86400 },
  { id: "240", label: "4H", spanSec: 60 * 86400 },
  { id: "D", label: "1D", spanSec: 365 * 86400 },
] as const;
type IntervalId = (typeof INTERVALS)[number]["id"];

async function loadCandles(resolution: IntervalId, spanSec: number): Promise<Candle[]> {
  const to = Math.floor(Date.now() / 1000);
  const r = await apiJson<{ ok?: boolean; candles?: Candle[] }>(
    `/api/zenex/candles?symbol=XLMUSD&resolution=${resolution}&from=${to - spanSec}&to=${to}`,
  );
  return r?.candles ?? [];
}

/**
 * TradingView Lightweight Charts (open source) drawing Zenex's oracle candles, the same UDF feed
 * Zenex's own terminal charts. Refreshes every 30s so the last candle follows the market.
 */
function ZenexChart() {
  const theme = useTheme();
  const host = useRef<HTMLDivElement | null>(null);
  const [interval, setIntervalId] = useState<IntervalId>("60");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let cleanup = () => {};
    void (async () => {
      const lc = await import("lightweight-charts");
      if (dead) return;
      const up = theme.palette.green.main;
      const down = theme.palette.error.main;
      const chart = lc.createChart(el, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: theme.palette.grey[200],
          fontFamily: theme.typography.fontFamily,
          attributionLogo: true,
        },
        grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
        timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: interval !== "D", secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
      });
      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
        priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
      });
      const toBars = (cs: Candle[]) =>
        cs.map((c) => ({
          time: Math.floor(c.t / 1000) as import("lightweight-charts").UTCTimestamp,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }));
      const span = INTERVALS.find((i) => i.id === interval)?.spanSec ?? 86400;
      const first = await loadCandles(interval, span).catch(() => [] as Candle[]);
      if (dead) {
        chart.remove();
        return;
      }
      series.setData(toBars(first));
      chart.timeScale().fitContent();
      setEmpty(first.length === 0);
      setLoading(false);
      // Poll a short window and merge it in (update() replaces the last bar or appends a new one).
      const timer = window.setInterval(async () => {
        const recent = await loadCandles(interval, interval === "D" ? 3 * 86400 : 6 * 3600).catch(() => [] as Candle[]);
        if (dead) return;
        for (const b of toBars(recent)) {
          try {
            series.update(b);
          } catch {
            /* older than the last bar */
          }
        }
      }, 30_000);
      cleanup = () => {
        window.clearInterval(timer);
        chart.remove();
      };
    })();
    return () => {
      dead = true;
      cleanup();
    };
  }, [interval, theme]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: "1rem",
        overflow: "hidden",
        backgroundColor: "rgba(17,17,17,1)",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          p: "0.5rem 0.75rem",
          borderBottom: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        }}
      >
        {INTERVALS.map((i) => (
          <ButtonBase
            key={i.id}
            onClick={() => {
              if (i.id === interval) return;
              setLoading(true);
              setIntervalId(i.id);
            }}
            sx={{
              px: "0.625rem",
              height: "1.75rem",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: interval === i.id ? "common.black" : "grey.200",
              backgroundColor: interval === i.id ? "overlay.white08" : "transparent",
              "&:hover": { color: "common.black" },
            }}
          >
            {i.label}
          </ButtonBase>
        ))}
        <Typography sx={{ ml: "auto", fontSize: "0.75rem", color: "grey.200" }} noWrap>
          XLM/USD · Zenex
        </Typography>
      </Box>
      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Box ref={host} sx={{ position: "absolute", inset: 0 }} />
        {loading && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {!loading && empty && (
          <Typography
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "grey.200",
              fontSize: "0.875rem",
            }}
          >
            No price history from Zenex for this interval.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function PerpsChart({ market }: { market: PerpsMarket | null }) {
  const s = market?.stats24h;
  const fundL = hourlyPct(market?.rates?.current?.long.fundingPerSec);
  const fundS = hourlyPct(market?.rates?.current?.short.fundingPerSec);
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        p: "1.25rem",
        borderRadius: "1.5rem",
        backgroundColor: "surfaceBg.section",
        border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "1.75rem",
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <Box sx={{ display: "flex" }}>
            <TokenLogo code="XLM" size="2rem" />
            <Box sx={{ ml: "-0.5rem" }}>
              <TokenLogo
                code="USDC"
                issuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
                size="2rem"
              />
            </Box>
          </Box>
          <Box>
            <Typography
              sx={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "common.black",
                lineHeight: 1.2,
              }}
            >
              {market?.market.symbol ?? "XLM/USD"}
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "grey.200" }}>
              Zenex perp · up to {market?.limits.maxLeverage ?? "—"}x
            </Typography>
          </Box>
        </Box>
        <Stat label="Last Price" value={fmtPx(market?.price?.mid)} />
        <Stat label="24H High" value={fmtPx(s?.high)} />
        <Stat label="24H Low" value={fmtPx(s?.low)} />
        <Stat
          label="24H Change"
          value={
            s?.changePct == null
              ? "—"
              : `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`
          }
          color={
            s?.changePct == null
              ? undefined
              : s.changePct >= 0
                ? "green.main"
                : "error.main"
          }
        />
        <Stat
          label="24H Volume"
          value={s ? `$${formatAmount(s.volume, 2)}` : "—"}
        />
        <Stat
          label="Funding /1h (L · S)"
          value={
            fundL == null
              ? "—"
              : `${fundL.toFixed(4)}% · ${(fundS ?? 0).toFixed(4)}%`
          }
        />
        <Stat
          label="Open Interest"
          value={
            market
              ? `$${formatAmount(market.openInterest.long + market.openInterest.short, 0)}`
              : "—"
          }
        />
      </Box>
      <Box sx={{ height: { xs: "26rem", md: "36rem" }, minWidth: 0 }}>
        <ZenexChart />
      </Box>
    </Box>
  );
}
