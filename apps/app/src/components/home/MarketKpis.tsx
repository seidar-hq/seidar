"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { KpiCard, KpiFooterRow, KpiTop, KpiValueRow } from "@/components/common/SectionCard";
import { InfoIcon } from "@/components/wallets/PortfolioKpis";
import { changeOf, compactNum, compactUsd, pctText, priceText, useMarketAssets, useMarketOverview } from "./marketData";

type Kpi = { heading: string; info: string; value: string | null; change: number | null; foot: string; footValue: string | null };

/** Market KPIs: XLM, stablecoin supply and yesterday's network activity. */
export default function MarketKpis() {
  const { overview, loading } = useMarketOverview();
  const { assets, loading: assetsLoading } = useMarketAssets();
  const xlm = assets.find((a) => a.id === "XLM");
  const day = overview?.day ?? null;
  const dayLabel = day ? new Date(day.t).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

  const kpis: Kpi[] = [
    {
      heading: "XLM Price",
      info: "Stellar Lumens, last price on the Stellar DEX (Stellar Expert).",
      value: xlm ? priceText(xlm.price) : null,
      change: xlm?.change24h ?? null,
      foot: "Market cap",
      footValue: xlm ? compactUsd(xlm.marketCap) : null,
    },
    {
      heading: "Stablecoins",
      info: "Market cap of every stablecoin issued on Stellar (DefiLlama).",
      value: overview?.stablecoinsUsd != null ? compactUsd(overview.stablecoinsUsd) : null,
      change: null,
      foot: "Listed here",
      footValue: assets.length ? String(assets.filter((a) => a.cats.includes("stable")).length) : null,
    },
    {
      heading: "Daily Payments",
      info: "Payments on the Stellar network over the last full day (UTC), against the day before (Stellar Expert).",
      value: day ? compactNum(day.payments) : null,
      change: day ? changeOf(day.payments, day.paymentsPrev) : null,
      foot: "Transactions",
      footValue: day ? compactNum(day.transactions) : null,
    },
    {
      heading: "Active Accounts",
      info: "Accounts that sent at least one transaction over the last full day (UTC), against the day before (Stellar Expert).",
      value: day ? compactNum(day.activeAccounts) : null,
      change: day ? changeOf(day.activeAccounts, day.activeAccountsPrev) : null,
      foot: "Day",
      footValue: day ? dayLabel : null,
    },
  ];

  const busy = (v: string | null, l: boolean) => v == null && l;
  return (
    <Grid container spacing="1rem">
      {kpis.map((k) => {
        const l = k.heading === "XLM Price" ? assetsLoading : loading;
        return (
          <KpiCard key={k.heading} size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiTop>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Typography variant="subtitle5">{k.heading}</Typography>
                <Tooltip placement="top" arrow title={k.info}>
                  <Box sx={{ display: "flex", cursor: "default", color: "grey.200" }}>
                    <InfoIcon size={14} />
                  </Box>
                </Tooltip>
              </Box>
              <KpiValueRow>
                <Typography variant="body4" color="common.black" component="div">
                  {busy(k.value, l) ? <Skeleton variant="rounded" animation="wave" width="7rem" height="1.75rem" /> : (k.value ?? "—")}
                </Typography>
                {k.change != null && <Chip variant="mini" color={k.change >= 0 ? "success" : "error"} label={pctText(k.change)} />}
              </KpiValueRow>
            </KpiTop>
            <KpiFooterRow>
              <Typography variant="subtitle5">{k.foot}</Typography>
              <Typography variant="subtitle3" component="div">
                {busy(k.footValue, l) ? <Skeleton variant="rounded" animation="wave" width="4rem" height="1rem" /> : (k.footValue ?? "—")}
              </Typography>
            </KpiFooterRow>
          </KpiCard>
        );
      })}
    </Grid>
  );
}
