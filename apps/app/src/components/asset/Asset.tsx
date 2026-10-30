"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ConnectWalletButton from "@/components/common/ConnectWalletButton";
import { InsetCard, SectionCard } from "@/components/common/SectionCard";
import Shimmer from "@/components/common/Shimmer";
import TokenLogo, { PairLogos } from "@/components/common/TokenLogo";
import type { TokenRef } from "@/lib/tokens";
import { Breadcrumbs } from "@/components/earn/EarnUI";
import { LEND_PROTOCOLS, marketHref, useLendMarkets } from "@/components/earn/lendData";
import { poolHref, usePools, venueMeta } from "@/components/earn/poolData";
import { useVaultList, vaultHref, vaultProtocol } from "@/components/earn/vaultData";
import {
  SourceNote,
  categoryLabel,
  compactNum,
  compactUsd,
  pctText,
  priceText,
  swapHref,
  useMarketAssets,
} from "@/components/home/marketData";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { useShared } from "@/lib/useShared";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useWallet } from "@/wallet/WalletContext";
import CompareChart from "@/components/home/CompareChart";
import { StatCard } from "./AssetParts";

type Range = "30d";
type Chart = { ok?: boolean; points?: { t: number; px: number }[]; change?: number | null };

/** ?asset=CODE:ISSUER (classic), CODE:CONTRACT (Soroban-only token) or XLM. */
function useAssetParam() {
  const raw = useSearchParams().get("asset") ?? "XLM";
  const [code, second] = raw.split(":");
  const isXlm = !second && code.toUpperCase() === "XLM";
  const contract = second && /^C[A-Z2-7]{55}$/.test(second) ? second : null;
  const issuer = contract ? null : second || null;
  return {
    code: isXlm ? "XLM" : code,
    issuer,
    contract,
    id: isXlm ? "XLM" : `${code}:${second ?? ""}`,
    /** /prices/chart key (none for Soroban-only tokens). */
    chartKey: isXlm ? "native" : contract ? null : raw,
  };
}

/** USD price chart from the API (same cache keys as the portfolio charts). */
function useChart(chartKey: string | null, range: Range) {
  const key = chartKey ? `chart:${range}:${chartKey}` : null;
  const { value, loading } = useShared<Chart | null>(
    key,
    () => apiJson<Chart>(`/api/prices/chart?asset=${encodeURIComponent(chartKey ?? "")}&range=${range}`),
    300_000,
  );
  return { points: value?.ok ? (value.points ?? []) : [], change: value?.ok ? (value.change ?? null) : null, loading: loading && !value };
}

const SideCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <SectionCard sx={{ gap: "0.75rem" }}>
    <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>{title}</Typography>
    {children}
  </SectionCard>
);

const Line = ({ label, value, sub, busy }: { label: string; value: string; sub?: string; busy?: boolean }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: "0.375rem", gap: "1rem" }}>
    <Typography variant="subtitle3" color="grey.200">
      {label}
    </Typography>
    <Box sx={{ textAlign: "right", flexShrink: 0, whiteSpace: "nowrap" }}>
      <Typography sx={{ fontSize: "0.9375rem", color: "common.black", fontWeight: 500, lineHeight: 1.4 }} component="div">
        <Shimmer on={!!busy} width="5rem">
          {value}
        </Shimmer>
      </Typography>
      {sub && !busy && <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>{sub}</Typography>}
    </Box>
  </Box>
);

/** The connected portfolio's exposure to this asset: wallet, supplied, borrowed. */
function YourHolding({ code, issuer, contract }: { code: string; issuer: string | null; contract: string | null }) {
  const { isConnected } = useWallet();
  const p = usePortfolio();
  if (!isConnected)
    return (
      <SideCard title="Your holding">
        <Typography variant="subtitle3" color="grey.200">
          Connect a wallet to see how much {code} you hold, supply and borrow.
        </Typography>
        <ConnectWalletButton />
      </SideCard>
    );
  const same = (c: string, i: string | null) => (contract ? c.toUpperCase() === code.toUpperCase() && !i : c === code && (i ?? null) === issuer);
  const held = p.assets.filter((t) => same(t.code, t.issuer));
  const amount = held.reduce((s, t) => s + t.amount, 0);
  const usd = held.reduce((s, t) => s + t.usd, 0);
  const supplied = p.supplied.filter((r) => r.kind === "lend" && same(r.code, r.issuer));
  const borrowed = p.borrowed.filter((r) => same(r.code, r.issuer));
  const sum = (rows: { amount: number | null; usd: number }[]) => ({ amount: rows.reduce((s, r) => s + (r.amount ?? 0), 0), usd: rows.reduce((s, r) => s + r.usd, 0) });
  const sup = sum(supplied);
  const bor = sum(borrowed);
  const assetsBusy = (p.assetsLoading && !held.length) || p.assetsRefreshing;
  const posBusy = (p.lendingLoading && !supplied.length && !borrowed.length) || p.lendingRefreshing;
  return (
    <SideCard title="Your holding">
      <Line label="In wallets" value={`${formatAmount(amount, 4)} ${code}`} sub={formatUsd(usd)} busy={assetsBusy} />
      <Line label="Supplied" value={`${formatAmount(sup.amount, 4)} ${code}`} sub={formatUsd(sup.usd)} busy={posBusy} />
      <Line label="Borrowed" value={`${formatAmount(bor.amount, 4)} ${code}`} sub={formatUsd(bor.usd)} busy={posBusy} />
      <Box sx={{ borderTop: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, mt: "0.25rem" }} />
      <Line label="Net value" value={formatUsd(usd + sup.usd - bor.usd)} busy={assetsBusy || posBusy} />
    </SideCard>
  );
}

type Opportunity = {
  key: string;
  kind: "Lend" | "Pool" | "Vault";
  title: string;
  sub: string;
  apy: number | null;
  /** The asset(s) deposited: one for lending and vaults, both legs for pools. */
  legs: TokenRef[];
  protocol: { name: string; logo?: string };
  href: string;
};

/** Lend markets, pools and vaults on Seidar that take this asset, best APY first. */
function EarnWith({ code, issuer, contract }: { code: string; issuer: string | null; contract: string | null }) {
  const router = useRouter();
  const { markets } = useLendMarkets();
  const { pools } = usePools();
  const { rows: vaults } = useVaultList();
  const { byContract } = useTokenCatalogue();
  const same = (c: string, i: string | null | undefined, k?: string | null) =>
    contract ? k === contract || (c.toUpperCase() === code.toUpperCase() && !i) : c === code && (i ?? null) === issuer;

  const list = useMemo<Opportunity[]>(() => {
    const out: Opportunity[] = [];
    for (const m of markets)
      if (same(m.code, m.issuer, m.contract) && m.supplyApy != null && (m.status ?? 0) < 2)
        out.push({
          key: `lend:${m.key}`,
          kind: "Lend",
          title: m.poolName,
          sub: m.code,
          apy: m.supplyApy,
          legs: [{ code: m.code, issuer: m.issuer, contract: m.contract }],
          protocol: LEND_PROTOCOLS[m.protocol],
          href: marketHref(m),
        });
    for (const p of pools)
      if (p.legs.some((l) => same(l.code, l.issuer, l.contract)) && (p.tvlUsd ?? 0) >= 10_000)
        out.push({
          key: `pool:${p.key}`,
          kind: "Pool",
          title: p.legs.map((l) => l.code).join(" / "),
          sub: `TVL ${compactUsd(p.tvlUsd)}`,
          apy: p.apyPct ?? null,
          legs: p.legs,
          protocol: venueMeta(p.protocol),
          href: poolHref(p),
        });
    for (const v of vaults) {
      const t = byContract.get(v.asset);
      if (!v.paused && (contract ? v.asset === contract : t ? same(t.code, t.issuer) : v.assetCode === code && !issuer))
        out.push({
          key: `vault:${v.address}`,
          kind: "Vault",
          title: v.name,
          sub: `TVL ${compactUsd(v.tvlUsd)}`,
          apy: v.apyPct,
          legs: [{ code: t?.code ?? v.assetCode, issuer: t?.issuer ?? null, contract: v.asset }],
          protocol: vaultProtocol(v.protocol),
          href: vaultHref(v.address),
        });
    }
    return out.sort((a, b) => (b.apy ?? -1) - (a.apy ?? -1)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, pools, vaults, byContract, code, issuer, contract]);

  return (
    <SideCard title={`Earn with ${code}`}>
      {list.length === 0 ? (
        <Typography variant="subtitle3" color="grey.200">
          No lending market, pool or vault on Seidar takes {code} yet.
        </Typography>
      ) : (
        list.map((o) => (
          <ButtonBase
            key={o.key}
            onClick={() => router.push(o.href)}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              p: "0.625rem 0.75rem",
              borderRadius: "0.75rem",
              backgroundColor: "overlay.white04",
              textAlign: "left",
              "&:hover": { backgroundColor: "overlay.white08" },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
              {o.legs.length > 1 ? <PairLogos legs={o.legs} size="2rem" /> : <TokenLogo code={o.legs[0].code} issuer={o.legs[0].issuer} contract={o.legs[0].contract} size="2rem" />}
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.9375rem", color: "common.black", fontWeight: 500 }} noWrap>
                  {o.title}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", mt: "0.125rem" }}>
                  {o.protocol.logo && (
                    <Box component="img" src={o.protocol.logo} alt="" sx={{ width: "0.9375rem", height: "0.9375rem", borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }} noWrap>
                    {o.protocol.name} · {o.kind} · {o.sub}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Typography sx={{ fontSize: "0.9375rem", color: "green.main", flexShrink: 0 }}>{o.apy == null ? "—" : `${o.apy.toFixed(2)}% APY`}</Typography>
          </ButtonBase>
        ))
      )}
    </SideCard>
  );
}

/** One Stellar asset: price, chart, market stats, the user's holding and where to earn with it. */
export default function Asset() {
  const router = useRouter();
  const { code, issuer, contract, id, chartKey } = useAssetParam();
  const { assets, loading } = useMarketAssets();
  const { tokens } = useTokenCatalogue();
  const a = assets.find((x) => x.id === id) ?? null;
  const month = useChart(chartKey, "30d");
  const tradable = tokens.some((t) => (contract ? t.contract === contract : t.code === code && (t.issuer ?? null) === issuer));
  const busy = loading && !a;
  const expert = contract
    ? `https://stellar.expert/explorer/public/contract/${contract}`
    : `https://stellar.expert/explorer/public/asset/${issuer ? `${code}-${issuer}` : "XLM"}`;

  const stats: { label: string; value: string; change?: number | null }[] = [
    { label: "Market Cap", value: compactUsd(a?.marketCap) },
    { label: "Supply on Stellar", value: a ? `${compactNum(a.supply)} ${code}` : "—" },
    { label: "Holders", value: a?.holders == null ? "Not published" : compactNum(a.holders) },
    { label: "7d DEX Volume", value: compactUsd(a?.volume7d) },
    { label: "24h Change", value: pctText(a?.change24h), change: a?.change24h },
    { label: "7d Change", value: pctText(a?.change7d), change: a?.change7d },
    { label: "30d Change", value: pctText(month.change), change: month.change },
    { label: "Category", value: a ? a.cats.map(categoryLabel).join(", ") : "—" },
  ];

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gap: "1rem", gridTemplateColumns: "minmax(12.500rem, 1fr) 27.375rem", "@media (max-width: 54.250rem)": { gridTemplateColumns: "1fr" } }}>
      <SectionCard sx={{ minWidth: 0, gap: "1.25rem", p: { xs: "1rem", sm: "1.5rem" } }}>
        <Breadcrumbs trail={[{ label: "Home", href: "/" }, { label: code }]} />
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.875rem", minWidth: 0 }}>
            <TokenLogo code={code} issuer={issuer} contract={contract} src={a?.icon} size="3rem" />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <Typography variant="body4" color="common.black">
                  {a?.name && a.name !== code ? `${a.name} (${code})` : code}
                </Typography>
                <Typography variant="body4" color="grey.200" component="div">
                  <Shimmer on={busy} width="5rem">
                    {priceText(a?.price)}
                    {a?.priceSource === "nav" ? " NAV" : ""}
                  </Shimmer>
                </Typography>
                {a?.change24h != null && <Chip variant="mini" color={a.change24h >= 0 ? "success" : "error"} label={`${pctText(a.change24h)} 24h`} />}
              </Box>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }} noWrap>
                {contract
                  ? `Soroban token${a?.domain ? ` · ${a.domain}` : ""} · ${contract.slice(0, 6)}…${contract.slice(-6)}`
                  : issuer
                    ? `${a?.domain ?? "Unknown issuer"} · ${issuer.slice(0, 6)}…${issuer.slice(-6)}`
                    : "Native asset of the Stellar network"}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="outlined" color="cancel" href={expert} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />} sx={{ borderRadius: "999rem", textTransform: "none", whiteSpace: "nowrap" }}>
              Stellar Expert
            </Button>
            <Button
              variant="solid"
              color="primary"
              disabled={tokens.length > 0 && !tradable}
              onClick={() => router.push(swapHref({ code, issuer, contract }))}
              sx={{ textTransform: "none", whiteSpace: "nowrap", px: "1.25rem" }}
            >
              {tokens.length > 0 && !tradable ? "Not swappable yet" : `Swap ${code}`}
            </Button>
          </Box>
        </Box>
        <InsetCard>
          <CompareChart primary={{ id, code, issuer, contract, icon: a?.icon ?? null }} candidates={assets} height="20rem" />
        </InsetCard>
        <Grid container spacing="1rem">
          {stats.map((s) => (
            <Grid key={s.label} size={{ xs: 6, sm: 4, lg: 3 }}>
              {busy ? (
                <Skeleton variant="rounded" animation="wave" sx={{ height: "8rem", borderRadius: "0.5rem" }} />
              ) : (
                <StatCard label={s.label} value={s.value} showChange={s.change != null} changeValue={s.change ?? 0} />
              )}
            </Grid>
          ))}
        </Grid>
        {!busy && !a && (
          <Typography variant="subtitle3" color="grey.200">
            {code} isn&apos;t in Seidar&apos;s market list, so market figures aren&apos;t shown; the chart and your holding still are.
          </Typography>
        )}
        <SourceNote text="Data: Stellar Expert (market figures), Seidar price feed (chart)." />
      </SectionCard>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <YourHolding code={code} issuer={issuer} contract={contract} />
        <EarnWith code={code} issuer={issuer} contract={contract} />
      </Box>
    </Box>
  );
}
