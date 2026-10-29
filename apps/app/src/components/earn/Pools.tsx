"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import DataTable, { type Column } from "@/components/common/DataTable";
import { PairLogos } from "@/components/common/TokenLogo";
import Shimmer from "@/components/common/Shimmer";
import { formatAmount, formatUsd } from "@/lib/format";
import { usePortfolio, type SupplyRow } from "@/portfolio/usePortfolio";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { EarnGrid } from "./EarnParts";
import { LabeledSwitch, ProtocolChips, ProtocolSection, RowAction, SearchBox, TopList } from "./EarnUI";
import { compactUsd, pct } from "./lendData";
import { POOL_VENUES, feeText, isConcentrated, poolHref, poolTypeLabel, usePools, venueMeta, type Pool } from "./poolData";

const Num = ({ children, color = "black.main100" }: { children: React.ReactNode; color?: string }) => (
  <Typography variant="body1" sx={{ color, fontSize: "1rem" }}>
    {children}
  </Typography>
);

function PairCell({ legs, title, sub }: { legs: { code: string; issuer?: string | null; contract?: string | null }[]; title: string; sub: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <PairLogos legs={legs} size="2.5rem" />
      <Box>
        <Typography sx={{ fontSize: "1rem", color: "common.black" }}>{title}</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textTransform: "uppercase" }}>{sub}</Typography>
      </Box>
    </Box>
  );
}

const MIN_TVL = 1_000;

export default function Pools({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter();
  const { portfolioWallets, portfolioAddresses } = useWallet();
  const portfolio = usePortfolio();
  const { pools, pending } = usePools();
  const [venue, setVenue] = useState<string>("all");
  const [q, setQ] = useState("");
  const [hideSmall, setHideSmall] = useState(true);

  const query = q.trim().toLowerCase();
  const multi = portfolioWallets.length > 1 && portfolioAddresses.length > 1;
  const lp = portfolio.supplied.filter((r) => r.kind === "lp");
  // Updating after a transaction: amounts shimmer until the new figures land.
  const posBusy = portfolio.lpRefreshing;
  const poolOf = (r: SupplyRow) => pools.find((p) => p.protocol === r.protocol && p.address === r.pool);
  const open = (p: Pick<Pool, "protocol" | "address">, tab = "supply") => router.push(poolHref(p, tab));

  const columns: Column<Pool>[] = [
    { id: "pool", header: "Asset/ Pool", cell: (p) => <PairCell legs={p.legs} title={p.pair} sub={poolTypeLabel(p.poolType)} />, sortValue: (p) => p.pair },
    { id: "tvl", header: "TVL/ Supply", cell: (p) => <Num>{compactUsd(p.tvlUsd)}</Num>, sortValue: (p) => p.tvlUsd ?? -1 },
    { id: "apy", header: "APY", cell: (p) => <Num color="green.main">{pct(p.apyPct)}</Num>, sortValue: (p) => p.apyPct ?? -1 },
    { id: "fee", header: "Fee Tier", cell: (p) => <Num>{feeText(p.feeBps)}</Num>, sortValue: (p) => p.feeBps ?? -1 },
    { id: "protocol", header: "Protocol", cell: (p) => <Num>{venueMeta(p.protocol).name}{isConcentrated(p) ? " CL" : ""}</Num> },
    { id: "action", header: "Action", align: "center", cell: (p) => <RowAction label="Supply" onClick={() => open(p)} /> },
  ];

  const posColumns: Column<SupplyRow>[] = [
    {
      id: "pool",
      header: "Pool",
      cell: (r) => <PairCell legs={(r.legs ?? []).map((l) => ({ code: l.code, issuer: l.issuer }))} title={r.code} sub={`${poolOf(r) ? poolTypeLabel(poolOf(r)!.poolType) : r.label}${multi ? ` · ${walletLabel(portfolioWallets.find((w) => w.address === r.wallet)!)}` : ""}`} />,
    },
    {
      id: "amounts",
      header: "Your Liquidity",
      cell: (r) => (
        <Box>
          {(r.legs ?? []).map((l) => (
            <Typography key={l.code} sx={{ fontSize: "0.875rem", color: "common.black" }}>
              <Shimmer on={posBusy} width="5rem">{`${formatAmount(l.amount, 4)} ${l.code}`}</Shimmer>
            </Typography>
          ))}
        </Box>
      ),
    },
    {
      id: "value",
      header: "Value",
      cell: (r) => (
        <Num color="common.black">
          <Shimmer on={posBusy} width="4rem">{formatUsd(r.usd)}</Shimmer>
        </Num>
      ),
      sortValue: (r) => r.usd,
    },
    { id: "apy", header: "APY", cell: (r) => <Num color="green.main">{pct(poolOf(r)?.apyPct)}</Num> },
    { id: "action", header: "Action", align: "center", cell: (r) => <RowAction label="Manage" onClick={() => open({ protocol: r.protocol as Pool["protocol"], address: r.pool }, "withdraw")} /> },
  ];

  const section = (v: (typeof POOL_VENUES)[number]) => {
    const rows = pools.filter(
      (p) =>
        p.protocol === v.id &&
        (!query || p.pair.toLowerCase().includes(query) || p.legs.some((l) => l.code.toLowerCase().includes(query))) &&
        (!hideSmall || (p.tvlUsd ?? 0) >= MIN_TVL),
    );
    const mine = lp.filter((r) => r.protocol === v.id && (!query || r.code.toLowerCase().includes(query)));
    return (
      <ProtocolSection key={v.id} name={v.name} logo={v.logo}>
        {mine.length > 0 && (
          <DataTable
            variant="inset"
            title="Your Positions"
            columns={posColumns}
            rows={mine}
            getRowId={(r) => `${r.wallet}:${r.pool}`}
            onRowClick={(r) => open({ protocol: r.protocol as Pool["protocol"], address: r.pool }, "withdraw")}
            defaultSort={{ id: "value", dir: "desc" }}
          />
        )}
        <DataTable
          variant="inset"
          title="Assets To Supply"
          toolbar={<LabeledSwitch label="Hide small pools" tip={`Hide pools with under ${compactUsd(MIN_TVL)} TVL or no price`} checked={hideSmall} onChange={setHideSmall} />}
          columns={columns}
          rows={rows}
          isLoading={pending.has(v.id)}
          emptyDataText={hideSmall ? "No pools above the size filter. Turn off Hide small pools." : "No pools match your search"}
          emptyMinHeight="12rem"
          getRowId={(p) => p.key}
          onRowClick={(p) => open(p)}
          pageSize={10}
          defaultSort={{ id: "tvl", dir: "desc" }}
        />
      </ProtocolSection>
    );
  };

  const top = useMemo(
    () =>
      pools
        .filter((p) => (p.tvlUsd ?? 0) >= 25_000 && p.apyPct != null)
        .sort((a, b) => (b.apyPct ?? 0) - (a.apyPct ?? 0))
        .slice(0, 8),
    [pools],
  );

  const main = (
    <>
      <ProtocolChips items={POOL_VENUES.map((v) => ({ id: v.id, label: v.name, logo: v.logo }))} value={venue} onChange={setVenue} />
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: "1.25rem", mb: "0.25rem" }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search token or pair" />
      </Box>
      {POOL_VENUES.filter((v) => venue === "all" || venue === v.id).map(section)}
    </>
  );

  const side = (
    <TopList
      title="Top Pools"
      nameLabel="Pools"
      valueLabel="APY"
      emptyText="Loading pools…"
      items={top.map((p) => ({
        key: p.key,
        icon: <PairLogos legs={p.legs} size="2.5rem" />,
        title: p.pair,
        subtitle: feeText(p.feeBps),
        badge: { name: venueMeta(p.protocol).name, logo: venueMeta(p.protocol).logo },
        value: pct(p.apyPct),
        onClick: () => open(p),
      }))}
    />
  );

  return <EarnGrid tabs={tabs} main={main} side={side} />;
}
