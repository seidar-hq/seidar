"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount } from "@/lib/format";
import { fmtPx, hourlyPct, usePerpsTrades, type PerpsMarket } from "./usePerps";

// Perps terminal: market header, the TradingView chart, and a book-style side panel.

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

/**
 * TradingView's Advanced Chart widget (free embed: drawing tools, indicators, timeframes).
 * The widget charts TradingView's own XLM/USD feed; Zenex fills at the Chainlink oracle price,
 * which tracks the same market. Swapping to TradingView's licensed Charting Library would point
 * the same UI at Zenex's own UDF feed.
 */
const TradingViewChart = memo(function TradingViewChart({
  symbol,
}: {
  symbol: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    el.appendChild(inner);
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(17, 17, 17, 1)",
      gridColor: "rgba(255, 255, 255, 0.04)",
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      allow_symbol_change: false,
      save_image: true,
      withdateranges: true,
      details: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol]);
  return (
    <Box
      ref={host}
      className="tradingview-widget-container"
      sx={{
        height: "100%",
        width: "100%",
        borderRadius: "1rem",
        overflow: "hidden",
      }}
    />
  );
});

type Level = { price: number; size: number; total: number; depth: number };

/**
 * Zenex has no order book: every fill is at the Chainlink oracle bid / ask plus the base fee and a
 * size-quadratic impact fee (notional^2 / impactScalar, capped at 10%). This ladder is that exact
 * schedule: the effective price for each cumulative size up to the position cap.
 */
function ladder(m: PerpsMarket, isAsk: boolean): Level[] {
  const p = m.price;
  if (!p) return [];
  const L = m.limits;
  const cap = Math.min(
    L.maxPositionNotional || 500,
    isAsk ? L.capacityLong : L.capacityShort,
  );
  const longDominant = m.openInterest.long >= m.openInterest.short;
  const fee = (isAsk ? longDominant : !longDominant)
    ? L.feeDominant
    : L.feeNonDominant;
  const steps = 10;
  const out: Level[] = [];
  let prevTokens = 0;
  for (let i = 1; i <= steps; i++) {
    const notional = (cap * i) / steps;
    const impactRate =
      L.impactScalar > 0
        ? Math.min(L.maxImpactRate, notional / L.impactScalar)
        : 0;
    const base = isAsk ? p.ask : p.bid;
    const price = isAsk
      ? base * (1 + fee + impactRate)
      : base * (1 - fee - impactRate);
    const tokens = notional / price;
    out.push({
      price,
      size: tokens - prevTokens,
      total: tokens,
      depth: i / steps,
    });
    prevTokens = tokens;
  }
  return out;
}

const fmt7 = (v: number) => v.toFixed(v >= 1 ? 4 : 6);

function BookPanel({ market }: { market: PerpsMarket | null }) {
  const [tab, setTab] = useState("book");
  const trades = usePerpsTrades();
  const asks = useMemo(
    () => (market ? ladder(market, true).reverse() : []),
    [market],
  );
  const bids = useMemo(() => (market ? ladder(market, false) : []), [market]);
  const spread = market?.price ? market.price.ask - market.price.bid : null;
  const row = (l: Level, ask: boolean) => (
    <Box
      key={`${ask}${l.price}`}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr 1fr",
        alignItems: "center",
        height: "1.75rem",
        px: "0.75rem",
        fontSize: "0.8125rem",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: `${Math.max(4, l.depth * 100)}%`,
          backgroundColor: ask
            ? "rgba(229,72,77,0.16)"
            : "rgba(0,196,107,0.14)",
        }}
      />
      <Typography
        sx={{
          position: "relative",
          fontSize: "0.8125rem",
          color: ask ? "error.main" : "green.main",
        }}
      >
        {fmt7(l.price)}
      </Typography>
      <Typography
        sx={{
          position: "relative",
          fontSize: "0.8125rem",
          color: "common.black",
          textAlign: "right",
        }}
      >
        {formatAmount(l.size, 2)}
      </Typography>
      <Typography
        sx={{
          position: "relative",
          fontSize: "0.8125rem",
          color: "common.black",
          textAlign: "right",
        }}
      >
        {formatAmount(l.total, 2)}
      </Typography>
    </Box>
  );
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        borderRadius: "1rem",
        backgroundColor: "overlay.white04",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: "0.625rem" }}>
        <Tabs
          tabs={[
            { id: "book", label: "Order Book", padding: "0 0.75rem" },
            { id: "recent", label: "Recent", padding: "0 0.75rem" },
          ]}
          activeTab={tab}
          setActiveTab={setTab}
          isPathProvided={false}
          fullWidth
        />
      </Box>
      {tab === "book" ? (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr 1fr",
              px: "0.75rem",
              py: "0.375rem",
            }}
          >
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
              Price
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "grey.200",
                textAlign: "right",
              }}
            >
              Size (XLM)
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "grey.200",
                textAlign: "right",
              }}
            >
              Total (XLM)
            </Typography>
          </Box>
          {asks.map((l) => row(l, true))}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: "0.75rem",
              py: "0.5rem",
              my: "0.25rem",
              backgroundColor: "overlay.white08",
            }}
          >
            <Typography
              sx={{
                fontSize: "1.0625rem",
                fontWeight: 700,
                color: "common.black",
              }}
            >
              {fmt7(market?.price?.mid ?? 0)}
            </Typography>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <Typography sx={{ fontSize: "0.8125rem", color: "common.black" }}>
                Spread {spread != null ? fmt7(spread) : "—"}
              </Typography>
              <Tooltip
                arrow
                placement="top"
                title="Zenex fills every order at the Chainlink oracle price, so there's no resting order book. Each row is the real price you'd pay for that cumulative size: oracle bid/ask plus the trading fee and Zenex's size-based price impact, up to the 500 USDC position cap."
              >
                <InfoOutlinedIcon
                  sx={{
                    fontSize: "0.9375rem",
                    color: "primary.main",
                    cursor: "help",
                  }}
                />
              </Tooltip>
            </Box>
          </Box>
          {bids.map((l) => row(l, false))}
        </>
      ) : (
        <Box sx={{ maxHeight: "36rem", overflowY: "auto" }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              px: "0.75rem",
              py: "0.375rem",
            }}
          >
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
              Price
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "grey.200",
                textAlign: "right",
              }}
            >
              Size (USDC)
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "grey.200",
                textAlign: "right",
              }}
            >
              Time
            </Typography>
          </Box>
          {trades.length === 0 ? (
            <Typography
              sx={{
                fontSize: "0.8125rem",
                color: "grey.200",
                p: "1rem",
                textAlign: "center",
              }}
            >
              No recent trades.
            </Typography>
          ) : (
            trades.map((t) => {
              const buy = (t.side === "long") === (t.kind === "increase");
              return (
                <Box
                  key={t.id}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    alignItems: "center",
                    height: "1.75rem",
                    px: "0.75rem",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.8125rem",
                      color: buy ? "green.main" : "error.main",
                    }}
                  >
                    {fmt7(t.price)}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8125rem",
                      color: "common.black",
                      textAlign: "right",
                    }}
                  >
                    {t.notional ? formatAmount(t.notional, 2) : "—"}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: "grey.200",
                      textAlign: "right",
                    }}
                  >
                    {new Date(t.at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Typography>
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}

export default function PerpsChart({ market }: { market: PerpsMarket | null }) {
  const s = market?.stats24h;
  const fundL = hourlyPct(market?.rates?.current?.long.fundingPerSec);
  const fundS = hourlyPct(market?.rates?.current?.short.fundingPerSec);
  const live = market?.price
    ? Date.now() / 1000 - market.price.at < 120
    : false;
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
        <Box
          sx={{
            ml: "auto",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            px: "0.75rem",
            height: "1.75rem",
            borderRadius: "999rem",
            backgroundColor: live ? "rgba(0,196,107,0.12)" : "overlay.white08",
          }}
        >
          <Box
            sx={{
              width: "0.4rem",
              height: "0.4rem",
              borderRadius: "50%",
              backgroundColor: live ? "green.main" : "grey.200",
            }}
          />
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: live ? "green.main" : "grey.200",
            }}
          >
            {market && market.market.status !== 0
              ? market.market.statusLabel
              : live
                ? "Live"
                : "Delayed"}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ containerType: "inline-size" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 20rem",
            gap: "0.75rem",
            "@container (max-width: 52rem)": {
              gridTemplateColumns: "minmax(0, 1fr)",
            },
          }}
        >
          <Box sx={{ height: "40rem", minWidth: 0 }}>
            <TradingViewChart symbol="COINBASE:XLMUSD" />
          </Box>
          <BookPanel market={market} />
        </Box>
      </Box>
    </Box>
  );
}
