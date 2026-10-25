"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, styled, useTheme } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import PeriodButtons, { type Period } from "@/components/common/PeriodButtons";
import { InsetCard, SectionHeaderLeft, SectionHeaderRow, VerticalRule } from "@/components/common/SectionCard";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import { formatUsd } from "@/lib/format";
import type { Portfolio } from "@/portfolio/usePortfolio";
import { usePortfolioSeries, usePriceChanges, type Range } from "@/portfolio/useSeries";

type View = "all" | "assets" | "positions";

const VIEW_LABEL: Record<View, string> = { all: "All Assets + Positions", assets: "Assets", positions: "Positions" };

const TABS: TabItem[] = [
  { id: "timeline", label: "Timeline" },
  { id: "allocation", label: "Allocation" },
  { id: "performer", label: "Performer" },
];

const TIMELINE_PERIODS: Period<Range>[] = [
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
];

const PERFORMER_PERIODS: Period<Range>[] = [
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
  { value: "14d", label: "14d" },
  { value: "30d", label: "30d" },
  { value: "1y", label: "1y" },
];

const Panel = styled(InsetCard)({ zIndex: 1, flex: 1, minHeight: 0 });

const ChartBox = styled(Box)({ position: "relative", width: "100%", height: "18rem", borderRadius: "0.5rem", overflow: "hidden" });

const Empty = ({ text, minHeight = "19.75rem" }: { text: string; minHeight?: string }) => (
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight, mt: "1rem" }}>
    <Typography variant="subtitle2" color="grey.200">
      {text}
    </Typography>
  </Box>
);

const timeLabel = (t: number, range: Range) => {
  const d = new Date(t);
  return range === "1h" || range === "1d"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

function ValueTooltip({ active, payload, range, label }: { active?: boolean; payload?: { value: number; payload: { time: number } }[]; range: Range; label: string }) {
  const theme = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        p: "0.5rem 0.75rem",
        borderRadius: "0.5rem",
        backgroundColor: theme.palette.surfaceBg.main,
        border: `0.0625rem solid ${theme.palette.overlay.white08}`,
      }}
    >
      <Typography variant="caption" color="grey.200">
        {timeLabel(payload[0].payload.time, range)} · {label}
      </Typography>
      <Typography variant="subtitle1" color="common.black">
        {formatUsd(payload[0].value)}
      </Typography>
    </Box>
  );
}

function AreaSeries({
  data,
  dataKey,
  color,
  top,
  range,
  label,
}: {
  data: { time: number }[];
  dataKey: string;
  color: string;
  top: string;
  range: Range;
  label: string;
}) {
  const theme = useTheme();
  const id = `grad-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={top} />
            <stop offset="100%" stopColor={alpha(top, 0)} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" hide />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <ChartTooltip
          content={<ValueTooltip range={range} label={label} />}
          cursor={{ stroke: theme.palette.overlay.white20 }}
        />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Timeline({ portfolio, view }: { portfolio: Portfolio; view: View }) {
  const theme = useTheme();
  const [range, setRange] = useState<Range>("7d");
  const { series, loading } = usePortfolioSeries(portfolio.exposures, range);
  const hasPositions = portfolio.exposures.some((e) => e.positions !== 0);
  const busy = portfolio.assetsLoading || (loading && series.length === 0);

  const assetsLine = { color: theme.palette.sidebar.primary, top: theme.palette.graph.assetAreaTop };
  const positionsLine = { color: theme.palette.graph.yieldLine, top: theme.palette.graph.yieldAreaTop };

  let body: React.ReactNode;
  if (busy) body = <Skeleton variant="rectangular" animation="wave" sx={{ height: "18rem", borderRadius: "0.5rem" }} />;
  else if (series.length === 0) body = <Empty text="No price history available for these assets yet." />;
  else if (view === "all")
    body = (
      <ChartBox>
        <Box sx={{ height: hasPositions ? "50%" : "100%" }}>
          <AreaSeries data={series} dataKey="assets" range={range} label="Assets" {...assetsLine} />
        </Box>
        {hasPositions && (
          <Box sx={{ height: "50%" }}>
            <AreaSeries data={series} dataKey="positions" range={range} label="Positions" {...positionsLine} />
          </Box>
        )}
      </ChartBox>
    );
  else
    body = (
      <ChartBox>
        <AreaSeries
          data={series}
          dataKey={view}
          range={range}
          label={VIEW_LABEL[view]}
          {...(view === "positions" ? positionsLine : assetsLine)}
        />
      </ChartBox>
    );

  return (
    <Box>
      <Box sx={{ position: "relative" }}>
        {body}
        {loading && series.length > 0 && (
          <Box sx={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}>
            <CircularProgress size={16} />
          </Box>
        )}
      </Box>
      <PeriodButtons periods={TIMELINE_PERIODS} value={range} onChange={setRange} />
    </Box>
  );
}

type Slice = { key: string; name: string; code: string; issuer: string | null; usd: number; pct: number; others?: Slice[] };

function Allocation({ portfolio, view }: { portfolio: Portfolio; view: View }) {
  const theme = useTheme();
  const colors = view === "positions" ? theme.palette.chart.yieldPie : theme.palette.chart.pie;

  const slices = useMemo<Slice[]>(() => {
    const rows: Omit<Slice, "pct">[] = [];
    if (view !== "positions")
      for (const t of portfolio.assets)
        if (t.usd > 0) rows.push({ key: `a:${t.code}:${t.issuer}`, name: t.code, code: t.code, issuer: t.issuer, usd: t.usd });
    if (view !== "assets") {
      for (const r of portfolio.supplied)
        rows.push({
          key: `s:${r.wallet}:${r.pool}:${r.code}`,
          name: r.kind === "lp" ? `${r.code} LP` : `${r.code} · ${r.label}`,
          code: r.kind === "lp" ? (r.legs?.[0]?.code ?? r.code) : r.code,
          issuer: r.kind === "lp" ? (r.legs?.[0]?.issuer ?? null) : r.issuer,
          usd: r.usd,
        });
      for (const v of portfolio.vaults)
        rows.push({
          key: `v:${v.wallet}:${v.vault}`,
          name: v.name,
          code: v.underlying[0]?.code ?? "V",
          issuer: v.underlying[0]?.issuer ?? null,
          usd: v.usd,
        });
    }
    const total = rows.reduce((s, r) => s + r.usd, 0);
    if (total <= 0) return [];
    const all = rows.map((r) => ({ ...r, pct: (r.usd / total) * 100 })).sort((a, b) => b.usd - a.usd);
    const big = all.filter((r) => r.pct >= 1);
    const small = all.filter((r) => r.pct < 1);
    if (small.length)
      big.push({
        key: "other",
        name: "Other",
        code: "…",
        issuer: null,
        usd: small.reduce((s, r) => s + r.usd, 0),
        pct: small.reduce((s, r) => s + r.pct, 0),
        others: small,
      });
    return big;
  }, [portfolio.assets, portfolio.supplied, portfolio.vaults, view]);

  const loading = view === "assets" ? portfolio.assetsLoading : portfolio.assetsLoading || portfolio.positionsLoading;
  if (loading && slices.length === 0)
    return <Skeleton variant="rectangular" animation="wave" sx={{ height: "19.85rem", borderRadius: "0.5rem", mt: "1rem" }} />;
  if (slices.length === 0)
    return <Empty text={view === "positions" ? "No open positions in this portfolio." : "No assets available in your wallet."} minHeight="19.85rem" />;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "2rem",
        mt: "1rem",
        minHeight: "19.85rem",
        [theme.breakpoints.down("md")]: { flexDirection: "column" },
      }}
    >
      <Box sx={{ width: "15rem", minWidth: "15rem", height: "15rem" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="usd"
              nameKey="name"
              innerRadius="48%"
              outerRadius="96%"
              paddingAngle={0.5}
              cornerRadius={4}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((s, i) => (
                <Cell key={s.key} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <ChartTooltip
              content={({ active, payload }) => {
                const s = active ? (payload?.[0]?.payload as Slice | undefined) : undefined;
                if (!s) return null;
                return (
                  <Box sx={{ p: "0.75rem", borderRadius: "0.75rem", backgroundColor: "surfaceBg.main", minWidth: "12rem" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <Typography variant="subtitle1" color="common.black">
                        {s.name}
                      </Typography>
                      <Typography variant="subtitle1" color="primary.main">
                        {s.pct.toFixed(2)}%
                      </Typography>
                    </Box>
                    {s.others?.map((o) => (
                      <Box key={o.key} sx={{ display: "flex", justifyContent: "space-between", gap: "1rem", mt: "0.25rem" }}>
                        <Typography variant="caption" color="grey.200">
                          {o.name}
                        </Typography>
                        <Typography variant="caption" color="primary.main">
                          {o.pct.toFixed(2)}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          maxHeight: "19rem",
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          columnGap: "2.5rem",
          width: "100%",
        }}
      >
        {slices.map((s, i) => (
          <Box key={s.key}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
                <Box sx={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", flexShrink: 0, backgroundColor: colors[i % colors.length] }} />
                {s.key !== "other" && <TokenLogo code={s.code} issuer={s.issuer} size="2.25rem" />}
                <Typography variant="body3" color="common.black" noWrap>
                  {s.name}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <Typography variant="body1" sx={{ fontWeight: 500, color: "primary.main" }}>
                  {s.pct.toFixed(2)}%
                </Typography>
                <Typography variant="caption" color="grey.200">
                  {formatUsd(s.usd)}
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ opacity: 0.5, my: "0.75rem" }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const Rule = ({ flip }: { flip?: boolean }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        flex: 1,
        height: "0.0625rem",
        background: `linear-gradient(${flip ? "90deg" : "270deg"}, ${theme.palette.overlay.white20}, transparent)`,
      }}
    />
  );
};

type Mover = { key: string; code: string; issuer: string | null; usd: number; change: number; usdChange: number; label: string };

function MoverChart({ rows, good }: { rows: Mover[]; good: boolean }) {
  const theme = useTheme();
  const color = good ? theme.palette.green.main : theme.palette.error.main;
  const max = Math.max(...rows.map((r) => Math.abs(r.usdChange)), 0) * 1.05;
  const data = rows.map((r) => ({ ...r, bar: Math.abs(r.usdChange) }));
  return (
    <ResponsiveContainer width="100%" height={rows.length * 40 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 80, bottom: 10, left: 0 }}>
        <XAxis type="number" domain={[0, max || 1]} hide />
        <YAxis
          type="category"
          dataKey="key"
          width={110}
          axisLine={{ stroke: theme.palette.border.main600 }}
          tickLine={false}
          tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
            const r = rows.find((m) => m.key === payload.value);
            if (!r) return <g />;
            return (
              <g transform={`translate(${x},${y})`}>
                <foreignObject x={-106} y={-16} width={102} height={32}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem", height: "100%", pr: "0.25rem" }}>
                    <Typography variant="body3" color="common.black" noWrap>
                      {r.code}
                    </Typography>
                    <TokenLogo code={r.code} issuer={r.issuer} size="2rem" />
                  </Box>
                </foreignObject>
              </g>
            );
          }}
        />
        <ChartTooltip
          cursor={{ fill: alpha(theme.palette.common.white, 0.05) }}
          content={({ active, payload }) => {
            const r = active ? (payload?.[0]?.payload as Mover | undefined) : undefined;
            if (!r) return null;
            return (
              <Box sx={{ p: "0.5rem", borderRadius: "0.5rem", backgroundColor: "surfaceBg.main", minWidth: "8.75rem" }}>
                <Typography variant="subtitle2">{r.code}</Typography>
                <Typography variant="subtitle4" color={r.change >= 0 ? "success.main" : "error.main"}>
                  {r.change >= 0 ? "+" : ""}
                  {r.change.toFixed(2)}%
                </Typography>
              </Box>
            );
          }}
        />
        <Bar dataKey="bar" barSize={16} minPointSize={1} isAnimationActive={false}>
          {data.map((r, i) => (
            <Cell key={r.key} fill={alpha(color, Math.max(0.1, 1 - i * 0.25))} />
          ))}
          <LabelList dataKey="label" position="right" style={{ fill: theme.palette.grey[200], fontSize: "0.875rem", fontWeight: 500 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Performer({ portfolio }: { portfolio: Portfolio }) {
  const [range, setRange] = useState<Range>("1d");
  const { changes, loading } = usePriceChanges(portfolio.exposures, range);

  const { best, worst } = useMemo(() => {
    const movers: Mover[] = [];
    for (const e of portfolio.exposures) {
      const usd = (e.assets + e.positions) * e.price;
      const c = changes[e.key];
      if (c == null || c === 0 || usd <= 0) continue;
      const usdChange = (usd * c) / 100;
      movers.push({
        key: e.key,
        code: e.code,
        issuer: e.issuer,
        usd,
        change: c,
        usdChange,
        label: `${usdChange >= 0 ? "+" : "-"}${formatUsd(Math.abs(usdChange))}`,
      });
    }
    return {
      best: movers.filter((m) => m.change > 0).sort((a, b) => b.usdChange - a.usdChange).slice(0, 5),
      worst: movers.filter((m) => m.change < 0).sort((a, b) => a.usdChange - b.usdChange).slice(0, 5),
    };
  }, [portfolio.exposures, changes]);

  if (portfolio.assetsLoading || (loading && !best.length && !worst.length))
    return <Skeleton variant="rectangular" animation="wave" sx={{ height: "24rem", borderRadius: "0.5rem", mt: "1rem" }} />;

  const column = (title: string, rows: Mover[], good: boolean) => (
    <Box sx={{ pb: "1.25rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", mb: "1rem" }}>
        <Rule />
        <Typography variant="subtitle5" sx={{ color: "common.black", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {title}
        </Typography>
        <Rule flip />
      </Box>
      {rows.length === 0 ? (
        <Empty text={`No ${good ? "best" : "worst"} performers available`} minHeight="13.75rem" />
      ) : (
        <MoverChart rows={rows} good={good} />
      )}
    </Box>
  );

  return (
    <Box sx={{ pt: "1rem" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "1.5rem", minHeight: "16.75rem" }}>
        {column("Best Performer", best, true)}
        {column("Worst Performer", worst, false)}
      </Box>
      <PeriodButtons periods={PERFORMER_PERIODS} value={range} onChange={setRange} />
    </Box>
  );
}

/** Portfolio Balance card: timeline, allocation and best/worst performers for the selected portfolio. */
export default function PortfolioBalance({ portfolio }: { portfolio: Portfolio }) {
  const theme = useTheme();
  const [tab, setTab] = useState("timeline");
  const [view, setView] = useState<View>("all");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <Panel>
      <SectionHeaderRow>
        <SectionHeaderLeft>
          <Typography variant="h6" sx={{ fontWeight: 500, color: "common.black" }}>
            Portfolio Balance
          </Typography>
          {tab !== "performer" && (
            <>
              <VerticalRule />
              <Tooltip
                arrow
                placement="top"
                title="Assets are tokens in your wallets. Positions are funds deployed in protocols: lending supply, pool liquidity and vaults, minus borrowing."
              >
                <Button
                  onClick={(e) => setAnchor(e.currentTarget)}
                  sx={{ gap: "0.5rem", p: 0, minWidth: 0, textTransform: "none", "&:hover": { backgroundColor: "transparent" } }}
                >
                  <Typography variant="body1" sx={{ color: "primary.main", whiteSpace: "nowrap", fontSize: "1rem" }}>
                    {VIEW_LABEL[view]}
                  </Typography>
                  <KeyboardArrowDown sx={{ fontSize: "1.5rem", color: "primary.main" }} />
                </Button>
              </Tooltip>
              <Menu
                anchorEl={anchor}
                open={!!anchor}
                onClose={() => setAnchor(null)}
                slotProps={{
                  paper: {
                    elevation: 0,
                    sx: {
                      mt: "0.5rem",
                      width: "16rem",
                      p: "0.5rem",
                      backgroundColor: theme.palette.overlay.white08,
                      backgroundImage: "none",
                      border: `0.0625rem solid ${theme.palette.overlay.white08}`,
                      borderRadius: "1.25rem",
                      backdropFilter: "blur(2.6875rem)",
                      boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
                    },
                  },
                  list: { sx: { p: 0, display: "flex", flexDirection: "column", gap: "0.5rem" } },
                }}
              >
                {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                  <MenuItem
                    key={v}
                    selected={view === v}
                    onClick={() => {
                      setView(v);
                      setAnchor(null);
                    }}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      height: "3rem",
                      borderRadius: "0.5rem",
                      px: "0.75rem",
                      "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: "grey.800" },
                    }}
                  >
                    <Typography variant="subtitle1" sx={{ color: "sidebar.heading" }}>
                      {VIEW_LABEL[v]}
                    </Typography>
                    {view === v ? (
                      <CheckCircleRoundedIcon sx={{ fontSize: "1rem", color: "primary.main" }} />
                    ) : (
                      <Box sx={{ width: "1rem", height: "1rem", borderRadius: "50%", border: `0.0625rem solid ${theme.palette.overlay.white20}` }} />
                    )}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </SectionHeaderLeft>
        <Tabs tabs={TABS} activeTab={tab} setActiveTab={setTab} isPathProvided={false} />
      </SectionHeaderRow>
      {tab === "timeline" && <Timeline portfolio={portfolio} view={view} />}
      {tab === "allocation" && <Allocation portfolio={portfolio} view={view} />}
      {tab === "performer" && <Performer portfolio={portfolio} />}
    </Panel>
  );
}
