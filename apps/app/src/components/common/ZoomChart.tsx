"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, UTCTimestamp } from "lightweight-charts";

// Zoomable time-series chart on TradingView Lightweight Charts (open source, as on Perps):
// drag the price axis to stretch or compress it, drag or wheel the time axis (or the plot) to zoom
// and pan, pinch on touch; double-click an axis or press the reset button to fit everything again.
//
// Several series can share the chart: in "price" mode the first sits on the right axis and the
// others on the left one (two currencies stay readable together); in "percent" mode every series
// shares the right axis as % change from the first visible point.

export type ZoomPoint = { t: number; v: number };
export type ZoomSeries = {
  id: string;
  label: string;
  color: string;
  points: ZoomPoint[];
  kind?: "area" | "line" | "histogram";
};

type Props = {
  series: ZoomSeries[];
  mode?: "price" | "percent";
  height?: string;
  /** Axis / legend formatter for values (price mode). */
  format?: (v: number) => string;
  /** Show clock time on the axis (intraday ranges). */
  intraday?: boolean;
  /** Fit the view again when this changes (e.g. a new period); otherwise the user's zoom is kept. */
  fitKey?: string;
  /** "dual": extra series on the left axis (different currencies); "shared": one axis for all (same unit). */
  scales?: "dual" | "shared";
};

type Legend = { t: number; rows: { label: string; color: string; value: string }[] } | null;

export default function ZoomChart({ series, mode = "price", height = "18rem", format = (v) => v.toLocaleString(), intraday = false, fitKey = "", scales = "dual" }: Props) {
  const theme = useTheme();
  const host = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lcRef = useRef<typeof import("lightweight-charts") | null>(null);
  const seriesRef = useRef(new Map<string, { api: ISeriesApi<SeriesType>; kind: string; scale: string }>());
  const formatRef = useRef(format);
  formatRef.current = format;
  const [ready, setReady] = useState(false);
  const [legend, setLegend] = useState<Legend>(null);
  const metaRef = useRef(new Map<string, { label: string; color: string }>());
  const fittedRef = useRef<string | null>(null);

  // One chart per mount.
  useEffect(() => {
    const el = host.current;
    const live = seriesRef.current;
    if (!el) return;
    let dead = false;
    void (async () => {
      const lc = await import("lightweight-charts");
      if (dead) return;
      lcRef.current = lc;
      const line = theme.palette.overlay.white08;
      const chart = lc.createChart(el, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: theme.palette.grey[200],
          fontFamily: theme.typography.fontFamily,
          fontSize: 11,
          attributionLogo: false,
        },
        grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.05)", style: lc.LineStyle.Dashed } },
        rightPriceScale: { borderColor: line, scaleMargins: { top: 0.1, bottom: 0.08 } },
        leftPriceScale: { borderColor: line, visible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderColor: line, timeVisible: intraday, secondsVisible: false, rightOffset: 2 },
        crosshair: { mode: lc.CrosshairMode.Magnet },
        localization: { priceFormatter: (v: number) => formatRef.current(v) },
        handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true, axisDoubleClickReset: true },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      });
      chart.subscribeCrosshairMove((p: MouseEventParams) => {
        if (!p.time || !p.point) return setLegend(null);
        const rows: { label: string; color: string; value: string }[] = [];
        for (const [id, s] of seriesRef.current) {
          const d = p.seriesData.get(s.api) as { value?: number } | undefined;
          const meta = metaRef.current.get(id);
          if (d?.value != null && meta) rows.push({ label: meta.label, color: meta.color, value: formatRef.current(d.value) });
        }
        setLegend({ t: (p.time as number) * 1000, rows });
      });
      chartRef.current = chart;
      setReady(true);
    })();
    return () => {
      dead = true;
      chartRef.current?.remove();
      chartRef.current = null;
      live.clear();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Series and data follow the props; the user's zoom is kept across data refreshes.
  const shape = series.map((s, i) => `${s.id}:${s.kind ?? (i === 0 ? "area" : "line")}`).join("|") + `:${scales}`;
  const data = series.map((s) => `${s.id}:${s.points.length}:${s.points[s.points.length - 1]?.t ?? 0}:${s.points[s.points.length - 1]?.v ?? 0}`).join("|");
  useEffect(() => {
    const chart = chartRef.current;
    const lc = lcRef.current;
    if (!ready || !chart || !lc) return;
    const percent = mode === "percent";
    const live = seriesRef.current;
    let added = false;
    series.forEach((s, i) => {
      const scale = percent || scales === "shared" || i === 0 ? "right" : "left";
      // Unless told otherwise, the first series is an area and the others are lines.
      const kind = s.kind ?? (i === 0 ? "area" : "line");
      const prev = live.get(s.id);
      if (prev && (prev.kind !== kind || prev.scale !== scale)) {
        chart.removeSeries(prev.api);
        live.delete(s.id);
      }
      if (!live.has(s.id)) {
        const opts = { priceScaleId: scale, lastValueVisible: true, priceLineVisible: true, priceLineStyle: lc.LineStyle.Dotted, priceLineColor: s.color };
        const api =
          kind === "histogram"
            ? chart.addSeries(lc.HistogramSeries, { ...opts, color: s.color, priceLineVisible: false })
            : kind === "line"
              ? chart.addSeries(lc.LineSeries, { ...opts, color: s.color, lineWidth: 2 })
              : chart.addSeries(lc.AreaSeries, { ...opts, lineColor: s.color, lineWidth: 2, topColor: alpha(s.color, 0.33), bottomColor: alpha(s.color, 0) });
        live.set(s.id, { api, kind, scale });
        added = true;
      }
      metaRef.current.set(s.id, { label: s.label, color: s.color });
      // Ascending, one point per second (the library rejects duplicates).
      const seen = new Set<number>();
      const pts = [...s.points]
        .sort((a, b) => a.t - b.t)
        .map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.v }))
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));
      live.get(s.id)!.api.setData(pts);
    });
    for (const [id, s] of live)
      if (!series.some((x) => x.id === id)) {
        chart.removeSeries(s.api);
        live.delete(id);
        metaRef.current.delete(id);
      }
    const mode_ = percent ? lc.PriceScaleMode.Percentage : lc.PriceScaleMode.Normal;
    chart.priceScale("right").applyOptions({ mode: mode_ });
    chart.priceScale("left").applyOptions({ mode: mode_, visible: !percent && scales === "dual" && series.length > 1 });
    if (added || fittedRef.current !== fitKey) {
      chart.timeScale().fitContent();
      fittedRef.current = fitKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shape, data, mode, fitKey, scales]);

  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { timeVisible: intraday } });
  }, [intraday]);

  const reset = () => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({ autoScale: true });
    chart.priceScale("left").applyOptions({ autoScale: true });
    chart.timeScale().fitContent();
  };

  return (
    <Box sx={{ position: "relative", height, width: "100%" }}>
      <Box ref={host} sx={{ position: "absolute", inset: 0 }} />
      {legend && legend.rows.length > 0 && (
        <Box
          sx={{
            position: "absolute",
            top: "0.25rem",
            left: "0.5rem",
            zIndex: 2,
            pointerEvents: "none",
            display: "flex",
            gap: "0.875rem",
            flexWrap: "wrap",
            alignItems: "center",
            px: "0.5rem",
            py: "0.25rem",
            borderRadius: "0.5rem",
            backgroundColor: "rgba(20,20,20,0.75)",
          }}
        >
          <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
            {new Date(legend.t).toLocaleString([], intraday ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" })}
          </Typography>
          {legend.rows.map((r) => (
            <Box key={r.label} sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <Box sx={{ width: "0.625rem", height: "0.625rem", borderRadius: "0.125rem", backgroundColor: r.color }} />
              <Typography sx={{ fontSize: "0.75rem", color: "common.black", fontWeight: 600 }}>
                {r.label} {r.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      <Tooltip title="Reset zoom (or double-click an axis). Drag the price or time axis to stretch or compress it." placement="left" arrow>
        <IconButton
          onClick={reset}
          size="small"
          sx={{ position: "absolute", top: "0.25rem", right: "0.25rem", zIndex: 2, color: "grey.200", backgroundColor: "overlay.white04", "&:hover": { backgroundColor: "overlay.white08" } }}
        >
          <CenterFocusStrongOutlinedIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
