"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import { MeasuredBlock } from "@/components/common/Skeleton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import PeriodButtons, { type Period } from "@/components/common/PeriodButtons";
import { InsetCard } from "@/components/common/SectionCard";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import ZoomChart from "@/components/common/ZoomChart";
import { SourceNote, changeOf, compactNum, pctText, useMarketOverview, type ActivityPoint } from "./marketData";

type Metric = "transactions" | "operations" | "events";
const METRICS: TabItem[] = [
  { id: "transactions", label: "Transactions" },
  { id: "operations", label: "Operations" },
  { id: "events", label: "Contract events" },
];
const LABEL: Record<Metric, string> = { transactions: "Transactions", operations: "Operations", events: "Contract events" };

type Range = "30d" | "90d" | "1y";
const PERIODS: Period<Range>[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
];
const DAYS: Record<Range, number> = { "30d": 30, "90d": 90, "1y": 365 };

/** Daily Stellar network activity (Stellar Index), one metric at a time, zoomable. */
export default function ActivityChart() {
  const theme = useTheme();
  const { overview, loading } = useMarketOverview();
  const [metric, setMetric] = useState<Metric>("transactions");
  const [range, setRange] = useState<Range>("90d");
  const all = useMemo(() => overview?.activity ?? [], [overview]);
  const n = DAYS[range];
  const points = useMemo(() => all.slice(-n).map((d) => ({ t: d.t, v: d[metric] })), [all, n, metric]);

  // Daily average of the visible period against the period before it.
  const avg = (rows: ActivityPoint[]) => (rows.length ? rows.reduce((s, r) => s + r[metric], 0) / rows.length : null);
  const now = avg(all.slice(-n));
  const before = all.length >= 2 * n ? avg(all.slice(-2 * n, -n)) : null;
  const trend = changeOf(now, before);

  return (
    <InsetCard sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>Network activity</Typography>
        <Tabs tabs={METRICS} activeTab={metric} setActiveTab={(id: string) => setMetric(id as Metric)} isPathProvided={false} />
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <Typography variant="subtitle3" color="grey.200">
          Daily average {LABEL[metric].toLowerCase()}:{" "}
          <Box component="span" sx={{ color: "common.black", fontWeight: 500 }}>
            {compactNum(now)}
          </Box>
          {trend != null && (
            <>
              {" "}
              <Box component="span" sx={{ color: trend >= 0 ? "green.main" : "error.main" }}>
                {pctText(trend)}
              </Box>{" "}
              vs the previous {range}
            </>
          )}
        </Typography>
        <PeriodButtons periods={PERIODS} value={range} onChange={setRange} noTopMargin />
      </Box>
      <MeasuredBlock loading={loading} height="18rem">
        {points.length === 0 ? (
          <Box sx={{ height: "18rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="subtitle2" color="grey.200">
              Network activity is unavailable right now.
            </Typography>
          </Box>
        ) : (
          <ZoomChart
            height="18rem"
            format={compactNum}
            fitKey={`${range}:${metric}`}
            series={[{ id: metric, label: LABEL[metric], color: theme.palette.graph.yieldLine, points, kind: "histogram" }]}
          />
        )}
      </MeasuredBlock>
      <SourceNote text="Data: Stellar Index (daily network throughput, UTC days; contract events are Soroban events)." />
    </InsetCard>
  );
}
