"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { useAlerts } from "@/components/common/Alerts";
import { SectionCard } from "@/components/common/SectionCard";
import Shimmer from "@/components/common/Shimmer";
import { formatUsd, shortAddress } from "@/lib/format";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { usePerformance24h, usePortfolioSeries, type Range } from "@/portfolio/useSeries";
import { useWallet } from "@/wallet/WalletContext";
import CopyPanel from "./CopyPanel";
import { useAccountInfo, useCopyItems, useSavedWallets } from "./discoverData";
import { HoldingsCard, TradesCard } from "./HoldingsCard";
import { AddressSearch, RiskPill, Stat, WalletAvatar } from "./parts";
import { useWalletPnl } from "./pnl";
import { AllocationCard, PerformanceCard, RiskCard } from "./ProfileCards";
import { riskReport } from "./risk";

const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;

export default function WalletProfile({ address }: { address: string }) {
  const { successAlert } = useAlerts();
  const { activeWallet } = useWallet();
  const saved = useSavedWallets();
  const addresses = useMemo(() => [address], [address]);
  const p = usePortfolio(addresses);
  const { info } = useAccountInfo(address);
  const { items, debts } = useCopyItems(p);
  const perf = usePerformance24h(p.exposures);
  const [range, setRange] = useState<Range>("30d");
  const pnlRaw = useWalletPnl(address, p.exposures, range);
  const pnl = p.assetsLoading || p.positionsLoading ? { ...pnlRaw, series: [], trades: [], loading: true } : pnlRaw;
  const { series: series30 } = usePortfolioSeries(p.exposures, "30d");

  // Nothing that depends on positions is shown until they have loaded: a half-loaded wallet must
  // not read as emptier (or safer) than it is.
  const loading = p.assetsLoading || p.positionsLoading;
  const t = p.totals;
  const report = useMemo(
    () => (loading ? null : riskReport({ exposures: p.exposures, totals: t, healthFactor: p.healthFactor, items, unpricedCount: p.assets.filter((a) => !a.listed && a.amount > 0).length, series30d: series30 })),
    [loading, p.exposures, t, p.healthFactor, items, p.assets, series30],
  );
  const positionsUsd = items.filter((i) => i.kind !== "token").reduce((s, i) => s + i.usd, 0);
  const apyItems = items.filter((i) => i.apy != null && i.kind !== "token");
  const yieldApy = positionsUsd > 0 ? apyItems.reduce((s, i) => s + i.usd * (i.apy ?? 0), 0) / Math.max(1, apyItems.reduce((s, i) => s + i.usd, 0)) : null;
  const itemsTotal = items.reduce((s, i) => s + i.usd, 0);

  // Selection: the larger copyable positions to start with (up to six).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const sig = items.map((i) => i.id).join(",");
  useEffect(() => {
    if (touched || !items.length) return;
    const total = items.reduce((s, i) => s + i.usd, 0);
    setSelected(new Set(items.filter((i) => !i.blocked && i.usd >= total * 0.02).slice(0, 6).map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, touched]);
  useEffect(() => {
    setTouched(false);
    setSelected(new Set());
    saved.visit(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);
  const toggle = (id: string) => {
    setTouched(true);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const chosen = items.filter((i) => selected.has(i.id) && !i.blocked);

  const watched = saved.isWatched(address);
  const name = info?.label ?? saved.watch.find((w) => w.address === address)?.name ?? null;
  const own = activeWallet?.address === address;
  const created = info?.created ? new Date(info.created).toLocaleDateString([], { month: "short", year: "numeric" }) : null;
  const totalBusy = loading;

  return (
    <Box sx={{ minHeight: "100vh", pb: { xs: "5.5rem", md: 0 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", mb: "1rem", flexWrap: "wrap" }}>
        <ButtonBase component={Link} href="/discover" sx={{ gap: "0.375rem", px: "0.75rem", height: "2.25rem", borderRadius: "999rem", color: "grey.200", fontSize: "0.875rem", "&:hover": { color: "common.black", backgroundColor: "overlay.white08" } }}>
          <ArrowBackRoundedIcon sx={{ fontSize: "1.125rem" }} />
          Discover
        </ButtonBase>
        <Box sx={{ flex: 1, minWidth: "16rem", maxWidth: "30rem", ml: "auto" }}>
          <AddressSearch compact />
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(12.5rem, 1fr) 27.375rem", alignItems: "start", "@media (max-width: 54.25rem)": { gridTemplateColumns: "1fr" } }}>
        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Identity + headline numbers */}
          <SectionCard
            sx={(th) => ({
              gap: "1.25rem",
              background: `radial-gradient(40rem 12rem at 100% 0%, ${alpha(th.palette.sidebar.primary, 0.16)}, transparent 70%), ${th.palette.surfaceBg.section}`,
            })}
          >
            <Box sx={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <WalletAvatar address={address} size="3.5rem" />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: "1.375rem", fontWeight: 600, color: "common.black" }}>{name ?? shortAddress(address, 6, 6)}</Typography>
                  {own && <Chip variant="mini" color="success" label="Your wallet" />}
                  {report && <RiskPill level={report.level} label={report.label} />}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem", mt: "0.125rem" }}>
                  <Typography sx={{ fontSize: "0.75rem", color: "grey.200", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" }}>{address}</Typography>
                  <Tooltip title="Copy address">
                    <IconButton
                      size="small"
                      onClick={() => {
                        void navigator.clipboard?.writeText(address);
                        successAlert({ message: "Address copied" });
                      }}
                      sx={{ color: "grey.200" }}
                    >
                      <ContentCopyOutlinedIcon sx={{ fontSize: "0.875rem" }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Open on Stellar Expert">
                    <IconButton size="small" component="a" href={`https://stellar.expert/explorer/public/account/${address}`} target="_blank" rel="noreferrer" sx={{ color: "grey.200" }}>
                      <OpenInNewRoundedIcon sx={{ fontSize: "0.875rem" }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              <Button
                variant="outlined"
                onClick={() => saved.toggleWatch(address, name ?? undefined)}
                startIcon={watched ? <StarRoundedIcon sx={{ color: "#F5B83D" }} /> : <StarBorderRoundedIcon />}
                sx={{ textTransform: "none", borderRadius: "999rem", height: "2.25rem", color: "common.black", borderColor: (th) => th.palette.overlay.white16 }}
              >
                {watched ? "Watching" : "Watch"}
              </Button>
            </Box>

            <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {created && <MetaChip label={`On Stellar since ${created}`} />}
              {info?.activity?.monthly && <MetaChip label={`Activity: ${info.activity.monthly}`} />}
              {info?.payments != null && <MetaChip label={`${info.payments.toLocaleString()} payments`} />}
              {info?.trades != null && info.trades > 0 && <MetaChip label={`${info.trades.toLocaleString()} DEX trades`} />}
              {info?.domain && <MetaChip label={info.domain} />}
            </Box>

            <Box sx={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
              <Box>
                <Typography variant="subtitle3" color="grey.200">
                  Net worth
                </Typography>
                <Typography component="div" sx={{ fontSize: { xs: "2rem", sm: "2.5rem" }, fontWeight: 700, color: "common.black", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  <Shimmer on={totalBusy} width="11rem" height="2.75rem">
                    {formatUsd(t.totalUsd)}
                  </Shimmer>
                </Typography>
              </Box>
              {!totalBusy && !perf.loading && perf.base > 0 && (
                <Chip variant="mini" color={perf.pct >= 0 ? "success" : "error"} label={`${pct(perf.pct)} · ${perf.delta >= 0 ? "+" : "−"}${formatUsd(Math.abs(perf.delta))} 24h`} sx={{ mb: "0.375rem" }} />
              )}
            </Box>

            <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", lg: "repeat(5, 1fr)" }, pt: "1rem", borderTop: (th) => `0.0625rem solid ${th.palette.overlay.white08}` }}>
              {totalBusy ? (
                Array.from({ length: 5 }, (_, i) => <Skeleton key={i} variant="rounded" animation="wave" height="2.75rem" />)
              ) : (
                <>
                  <Stat label="In wallet" value={formatUsd(t.assetsUsd)} />
                  <Stat label="In DeFi" value={formatUsd(t.utilisedUsd)} sub={`${items.filter((i) => i.kind !== "token").length} positions`} />
                  <Stat label="Borrowed" value={t.borrowedUsd > 0 ? formatUsd(t.borrowedUsd) : "None"} color={t.borrowedUsd > 0 ? "error.main" : undefined} />
                  <Stat label="Health factor" value={p.healthFactor != null ? p.healthFactor.toFixed(2) : "—"} sub={p.healthFactor != null ? (p.healthFactor < 1.2 ? "Close to liquidation" : "Blend loans") : "No loans"} color={p.healthFactor != null && p.healthFactor < 1.2 ? "error.main" : undefined} />
                  <Stat label="Yield on positions" value={yieldApy != null ? `${yieldApy.toFixed(2)}%` : "—"} color={yieldApy ? "green.main" : undefined} sub="weighted APY" />
                </>
              )}
            </Box>
          </SectionCard>

          <PerformanceCard pnl={pnl} range={range} onRange={setRange} />

          <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
            <RiskCard report={report} loading={loading} />
            <AllocationCard portfolio={p} items={items} loading={loading} />
          </Box>

          <HoldingsCard
            items={items}
            debts={debts}
            total={itemsTotal}
            selected={selected}
            onToggle={toggle}
            onSelectAll={(ids) => {
              setTouched(true);
              setSelected(new Set(ids ?? []));
            }}
            loading={loading}
          />

          <TradesCard pnl={pnl} range={range} onRange={setRange} />
        </Box>

        <Box sx={{ minWidth: 0, position: { md: "sticky" }, top: { md: "6.5rem" } }}>
          <CopyPanel viewed={address} items={chosen} onRemove={toggle} />
        </Box>
      </Box>

      {/* Phones: the copy panel is below everything; a bar keeps it one tap away. */}
      <Box
        sx={{
          display: "none",
          "@media (max-width: 54.25rem)": { display: chosen.length ? "flex" : "none" },
          position: "fixed",
          left: "1rem",
          right: "1rem",
          bottom: "1rem",
          zIndex: 20,
        }}
      >
        <Button
          variant="solid"
          color="primary"
          fullWidth
          onClick={() => document.getElementById("copy-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          sx={{ height: "3.25rem", borderRadius: "999rem", textTransform: "none", boxShadow: "0 0.75rem 2rem rgba(0,0,0,0.45)" }}
        >
          Copy {chosen.length} position{chosen.length === 1 ? "" : "s"}
        </Button>
      </Box>
    </Box>
  );
}

function MetaChip({ label }: { label: string }) {
  return (
    <Box component="span" sx={{ px: "0.625rem", height: "1.625rem", display: "inline-flex", alignItems: "center", borderRadius: "999rem", fontSize: "0.75rem", color: "grey.200", backgroundColor: "overlay.white08", textTransform: "none" }}>
      {label}
    </Box>
  );
}
