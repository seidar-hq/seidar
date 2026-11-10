"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import { Measured } from "@/components/common/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { SectionCard } from "@/components/common/SectionCard";
import TokenLogo, { PairLogos } from "@/components/common/TokenLogo";
import { formatAmount, formatUsd } from "@/lib/format";
import { explorerTx } from "@/lib/tx";
import type { Range } from "@/portfolio/useSeries";
import type { CopyItem, DebtItem } from "./discoverData";
import type { PnlResult, Trade } from "./pnl";
import { CardTitle, RiskPill, Segmented } from "./parts";
import { RANGES } from "./ProfileCards";

type Filter = "all" | "token" | "lend" | "lp" | "vault";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "token", label: "Tokens" },
  { value: "lend", label: "Lending" },
  { value: "lp", label: "Pools" },
  { value: "vault", label: "Vaults" },
];

function ItemLogo({ item }: { item: CopyItem }) {
  const logo = item.kind === "lp" ? <PairLogos legs={item.legs} size="2rem" /> : <TokenLogo code={item.asset.code} issuer={item.asset.issuer} contract={item.asset.contract} size="2.25rem" />;
  return (
    <Box sx={{ position: "relative", flexShrink: 0 }}>
      {logo}
      {item.protocol.logo && (
        <Box
          component="img"
          src={item.protocol.logo}
          alt=""
          sx={{ position: "absolute", right: "-0.25rem", bottom: "-0.25rem", width: "1rem", height: "1rem", borderRadius: "50%", border: (t) => `0.125rem solid ${t.palette.surfaceBg.section}` }}
        />
      )}
    </Box>
  );
}

export function HoldingsCard({
  items,
  debts,
  total,
  selected,
  onToggle,
  onSelectAll,
  loading,
}: {
  items: CopyItem[];
  debts: DebtItem[];
  total: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[] | null) => void;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, token: 0, lend: 0, lp: 0, vault: 0 };
    for (const i of items) c[i.kind]++;
    return c;
  }, [items]);
  const firstItems = loading && items.length === 0;
  const shown = (firstItems ? SAMPLE_ITEMS : items).filter((i) => filter === "all" || i.kind === filter);
  const copyable = shown.filter((i) => !i.blocked);
  const allOn = copyable.length > 0 && copyable.every((i) => selected.has(i.id));

  return (
    <SectionCard>
      <CardTitle
        sub="Tick what you want to copy. Each line shows its value, yield and risk."
        right={
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={FILTERS.filter((f) => f.value === "all" || counts[f.value] > 0).map((f) => ({ ...f, label: f.value === "all" ? f.label : `${f.label} ${counts[f.value]}` }))}
          />
        }
      >
        Holdings &amp; positions
      </CardTitle>

      {!firstItems && items.length === 0 ? (
        <Typography color="grey.200" sx={{ py: "2rem", textAlign: "center" }}>
          This wallet holds nothing Seidar can price.
        </Typography>
      ) : (
        <Measured loading={firstItems} id="discover-holdings">
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", px: "0.5rem", color: "grey.200" }}>
              <Checkbox size="small" checked={allOn} indeterminate={!allOn && copyable.some((i) => selected.has(i.id))} onChange={() => onSelectAll(allOn ? null : copyable.map((i) => i.id))} disabled={!copyable.length} sx={{ p: "0.25rem" }} />
              <Typography variant="caption" sx={{ flex: 1 }}>
                {selected.size} selected
              </Typography>
              <Typography variant="caption" sx={{ width: "6.5rem", textAlign: "right", display: { xs: "none", sm: "block" } }}>
                APY
              </Typography>
              <Typography variant="caption" sx={{ width: "6.5rem", textAlign: "right" }}>
                Value
              </Typography>
              <Box sx={{ width: { xs: 0, md: "7.5rem" }, display: { xs: "none", md: "block" } }} />
            </Box>
            {loading && !firstItems && (
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", p: "0.625rem 0.5rem" }}>
                <Measured loading>
                  <Box skullet-block="" sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%" }} />
                </Measured>
                <Box sx={{ flex: 1 }}>
                  <Measured loading>
                    <Typography sx={{ fontSize: "0.875rem" }}>Sample position name</Typography>
                  </Measured>
                  <Typography variant="caption" color="grey.200">
                    Reading lending, pool and vault positions…
                  </Typography>
                </Box>
              </Box>
            )}
            {shown.map((i) => {
              const on = selected.has(i.id);
              const pct = total > 0 ? (i.usd / total) * 100 : 0;
              return (
                <Box
                  key={i.id}
                  onClick={() => !i.blocked && onToggle(i.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    p: "0.625rem 0.5rem",
                    borderRadius: "0.875rem",
                    cursor: i.blocked ? "default" : "pointer",
                    backgroundColor: (t) => (on ? alpha(t.palette.sidebar.primary, 0.1) : "transparent"),
                    border: (t) => `0.0625rem solid ${on ? alpha(t.palette.sidebar.primary, 0.45) : "transparent"}`,
                    transition: "background-color 140ms ease, border-color 140ms ease",
                    "&:hover": { backgroundColor: (t) => (on ? alpha(t.palette.sidebar.primary, 0.14) : t.palette.overlay.white04) },
                  }}
                >
                  <Tooltip title={i.blocked ?? ""} disableHoverListener={!i.blocked}>
                    <span>
                      <Checkbox size="small" checked={on} disabled={!!i.blocked} sx={{ p: "0.25rem" }} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(i.id)} />
                    </span>
                  </Tooltip>
                  <ItemLogo item={i} />
                  <Box sx={{ flex: 1, minWidth: 0, ml: "0.25rem" }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }} noWrap>
                      {i.title}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <Typography variant="caption" color="grey.200" noWrap>
                        {i.subtitle}
                      </Typography>
                      <Box sx={{ display: { xs: "none", sm: "inline-flex" } }}>
                        <RiskPill small level={i.risk.level} reasons={i.risk.reasons} />
                      </Box>
                    </Box>
                  </Box>
                  <Typography sx={{ width: "6.5rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600, color: i.apy ? "green.main" : "grey.200", display: { xs: "none", sm: "block" } }}>
                    {i.apy != null ? `${i.apy.toFixed(2)}%` : "—"}
                  </Typography>
                  <Box sx={{ width: "6.5rem", textAlign: "right" }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>{formatUsd(i.usd)}</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.375rem" }}>
                      <Box sx={{ width: "2.5rem", height: "0.1875rem", borderRadius: "999rem", backgroundColor: "overlay.white08", overflow: "hidden" }}>
                        <Box sx={{ width: `${Math.min(100, pct)}%`, height: "100%", backgroundColor: "primary.main" }} />
                      </Box>
                      <Typography variant="caption" color="grey.200">
                        {pct.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ width: "7.5rem", display: { xs: "none", md: "flex" }, justifyContent: "flex-end" }}>
                    {i.href && (
                      <ButtonBase
                        component={Link}
                        href={i.href}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        sx={{ gap: "0.25rem", px: "0.625rem", height: "1.75rem", borderRadius: "999rem", fontSize: "0.75rem", color: "grey.200", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, "&:hover": { color: "common.black" } }}
                      >
                        {i.blocked ? "Open page" : "Details"}
                        <ArrowForwardRoundedIcon sx={{ fontSize: "0.875rem" }} />
                      </ButtonBase>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Measured>
      )}

      {debts.length > 0 && (filter === "all" || filter === "lend") && (
        <Box sx={{ mt: "0.5rem", p: "0.875rem", borderRadius: "0.875rem", backgroundColor: "surfaceBg.softInset", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          <Box>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>Borrowed</Typography>
            <Typography variant="caption" color="grey.200">
              Copying never borrows for you: you copy what this wallet supplied. Its debt counts in its risk score.
            </Typography>
          </Box>
          {debts.map((d) => (
            <Box key={d.id} sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <TokenLogo code={d.code} issuer={d.issuer} size="1.5rem" />
              <Typography sx={{ fontSize: "0.8125rem", color: "common.black", flex: 1, minWidth: 0 }} noWrap>
                {d.amount != null ? `${formatAmount(d.amount, 4)} ` : ""}
                {d.code} · {d.protocol}
                {d.poolName ? ` ${d.poolName}` : ""}
              </Typography>
              {d.apy != null && (
                <Typography variant="caption" sx={{ color: "#F5B83D" }}>
                  {d.apy.toFixed(2)}% APR
                </Typography>
              )}
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "error.main", width: "6.5rem", textAlign: "right" }}>−{formatUsd(d.usd)}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- trades

/** Stand-ins drawn while a wallet's swaps and holdings first load, so the skeletons have the real layout. */
const SAMPLE_TRADES: Trade[] = Array.from({ length: 5 }, (_, i) => ({
  id: `sample-${i}`,
  at: 0,
  hash: "",
  sold: [{ code: "SAMPLE", issuer: null, amount: 1234.5678 }],
  bought: [{ code: "SAMPLE", issuer: null, amount: 1234.5678 }],
  usdThen: 1234.56,
  edgeNow: 12.34,
}));
const SAMPLE_ITEMS: CopyItem[] = Array.from({ length: 4 }, (_, i) => ({
  id: `sample-${i}`,
  kind: "token" as const,
  title: "Sample holding",
  subtitle: "Sample protocol",
  protocol: { id: "sample", name: "Sample" },
  usd: 1234.56,
  apy: 1.23,
  risk: { level: "low" as const, reasons: [] },
  blocked: null,
  href: null,
  asset: { code: "SAMPLE", issuer: null, contract: null, decimals: 7, price: 1 },
}));

export function TradesCard({ pnl, range, onRange }: { pnl: PnlResult; range: Range; onRange: (r: Range) => void }) {
  const firstTrades = pnl.loading && pnl.trades.length === 0;
  const trades = firstTrades ? SAMPLE_TRADES : pnl.trades;
  const scored = trades.filter((t) => t.edgeNow != null && (t.usdThen ?? 0) >= 1);
  const wins = scored.filter((t) => (t.edgeNow ?? 0) > 0).length;
  const edge = scored.reduce((s, t) => s + (t.edgeNow ?? 0), 0);
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <SectionCard>
      <CardTitle
        sub="Each swap judged by today's prices: what it bought is worth more (or less) than what it sold."
        right={<Segmented size="sm" value={range} onChange={onRange} options={RANGES} />}
      >
        Trades
      </CardTitle>
      {!firstTrades && pnl.trades.length === 0 ? (
        <Typography color="grey.200" sx={{ py: "1.5rem", textAlign: "center" }}>
          No swaps in this period.
        </Typography>
      ) : (
        <Measured loading={firstTrades} id="discover-trades">
          <Box sx={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", px: "0.25rem" }}>
            <Box>
              <Typography variant="caption" color="grey.200">
                Swaps
              </Typography>
              <Typography sx={{ fontWeight: 600, color: "common.black" }}>{trades.length}</Typography>
            </Box>
            {scored.length > 0 && (
              <>
                <Box>
                  <Typography variant="caption" color="grey.200">
                    Worked out
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: "common.black" }}>
                    {wins} of {scored.length} ({Math.round((wins / scored.length) * 100)}%)
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="grey.200">
                    Net vs. holding
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: edge >= 0 ? "green.main" : "error.main" }}>
                    {edge >= 0 ? "+" : "−"}
                    {formatUsd(Math.abs(edge))}
                  </Typography>
                </Box>
              </>
            )}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", maxHeight: "22rem", overflowY: "auto" }}>
            {trades.map((t) => (
              <Box key={t.id} sx={{ display: "flex", alignItems: "center", gap: "0.75rem", py: "0.625rem", px: "0.25rem", borderTop: (th) => `0.0625rem solid ${th.palette.overlay.white08}` }}>
                <Typography variant="caption" color="grey.200" sx={{ width: "3.5rem", flexShrink: 0 }}>
                  {fmtDate(t.at)}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", flex: 1, minWidth: 0 }}>
                  {t.sold[0] && <TokenLogo code={t.sold[0].code} issuer={t.sold[0].issuer} size="1.25rem" />}
                  <Typography sx={{ fontSize: "0.8125rem", color: "common.black" }} noWrap>
                    {t.sold.map((l) => `${formatAmount(l.amount, 4)} ${l.code}`).join(" + ")}
                  </Typography>
                  <ArrowForwardRoundedIcon sx={{ fontSize: "0.875rem", color: "grey.200", flexShrink: 0 }} />
                  {t.bought[0] && <TokenLogo code={t.bought[0].code} issuer={t.bought[0].issuer} size="1.25rem" />}
                  <Typography sx={{ fontSize: "0.8125rem", color: "common.black" }} noWrap>
                    {t.bought.map((l) => `${formatAmount(l.amount, 4)} ${l.code}`).join(" + ")}
                  </Typography>
                </Box>
                <Typography variant="caption" color="grey.200" sx={{ width: "4.5rem", textAlign: "right", display: { xs: "none", sm: "block" } }}>
                  {t.usdThen != null ? formatUsd(t.usdThen) : "—"}
                </Typography>
                <Typography
                  sx={{ width: "5rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 600, color: t.edgeNow == null ? "grey.200" : t.edgeNow >= 0 ? "green.main" : "error.main" }}
                >
                  {t.edgeNow == null ? "—" : `${t.edgeNow >= 0 ? "+" : "−"}${formatUsd(Math.abs(t.edgeNow))}`}
                </Typography>
                <Box component="a" href={explorerTx(t.hash)} target="_blank" rel="noreferrer" sx={{ color: "grey.200", display: "flex", "&:hover": { color: "common.black" } }} aria-label="View on Stellar Expert">
                  <OpenInNewRoundedIcon sx={{ fontSize: "0.875rem" }} />
                </Box>
              </Box>
            ))}
          </Box>
        </Measured>
      )}
    </SectionCard>
  );
}
