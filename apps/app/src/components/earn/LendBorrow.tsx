"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DataTable, { type Column } from "@/components/common/DataTable";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import TxDialog from "@/components/tx/TxDialog";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, type TxStep } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { useBalances } from "@/wallet/useBalances";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { EarnGrid } from "./EarnParts";
import { LabeledSwitch, ProtocolChips, ProtocolSection, RowAction, SearchBox, StatusPill, TopList } from "./EarnUI";
import {
  LEND_PROTOCOLS,
  actionBlock,
  compactUsd,
  marketHref,
  marketStatus,
  pct,
  useLendMarkets,
  useLendPositions,
  type LendProtocol,
  type Market,
  type UserLeg,
} from "./lendData";

const Num = ({ children, color = "black.main100" }: { children: React.ReactNode; color?: string }) => (
  <Typography variant="body1" sx={{ color, fontSize: "1rem" }}>
    {children}
  </Typography>
);

const healthColor = (h: number | null | undefined) => (h == null ? "grey.200" : h < 1.1 ? "error.main" : h < 1.5 ? "orange.main" : "green.main");

/** Token logo, symbol (+ status pill) and the pool name underneath. */
function AssetCell({ code, issuer, contract, sub, status }: { code: string; issuer?: string | null; contract?: string | null; sub: string; status?: number | null }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <TokenLogo code={code} issuer={issuer} contract={contract} size="2.5rem" />
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "1rem", color: "common.black" }}>{code}</Typography>
          <StatusPill info={marketStatus(status)} small />
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textTransform: "uppercase", maxWidth: "11rem", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </Typography>
      </Box>
    </Box>
  );
}

function CollateralMark({ ok }: { ok: boolean }) {
  return (
    <Box
      sx={{
        width: "2.5rem",
        height: "2.5rem",
        borderRadius: "50%",
        backgroundColor: "overlay.white08",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {ok ? <CheckRoundedIcon sx={{ color: "green.main", fontSize: "1.25rem" }} /> : <CloseRoundedIcon sx={{ color: "error.main", fontSize: "1.25rem" }} />}
    </Box>
  );
}

export default function LendBorrow({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter();
  const { activeWallet, portfolioAddresses, portfolioWallets } = useWallet();
  const { markets, loading } = useLendMarkets();
  const positions = useLendPositions(portfolioAddresses);
  const { byAddress } = useBalances(activeWallet ? [activeWallet.address] : []);
  const held = activeWallet ? (byAddress[activeWallet.address]?.tokens ?? []) : [];
  const [proto, setProto] = useState<string>("all");
  const [mode, setMode] = useState<string>("lend");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [claim, setClaim] = useState<{ steps: TxStep[]; error: string | null; open: boolean }>({ steps: [], error: null, open: false });
  const blndPrice = useShared<{ prices?: Record<string, number | null> } | null>("prices:BLND", () => apiJson("/api/prices?codes=BLND"), 300_000).value?.prices?.BLND ?? null;

  const multi = portfolioWallets.length > 1 && portfolioAddresses.length > 1;
  const walletName = (a: string) => {
    const w = portfolioWallets.find((x) => x.address === a);
    return w ? walletLabel(w) : a.slice(0, 6);
  };
  const balanceOf = (m: Market) => held.find((h) => h.code === m.code && (h.issuer ?? null) === (m.issuer ?? null))?.amount ?? 0;
  const marketOf = (l: UserLeg) => markets.find((m) => m.protocol === l.protocol && m.pool === l.pool && m.contract === l.contract);
  const query = q.trim().toLowerCase();
  const matches = (m: Market) => !query || m.code.toLowerCase().includes(query) || m.poolName.toLowerCase().includes(query);

  const venues = (["blend", "xoxno"] as LendProtocol[]).filter((p) => proto === "all" || proto === p);
  const open = (m: Market, a: "supply" | "borrow" | "withdraw" | "repay") => router.push(marketHref(m, a));

  const runClaim = async (pool: string) => {
    if (!activeWallet) return;
    setClaim({ steps: [{ key: "s0", label: "Claim BLND rewards", status: "building" }], error: null, open: true });
    try {
      await runBuilt("/api/lending/claim", { from: activeWallet.address, pool }, activeWallet, (steps) => setClaim((c) => ({ ...c, steps })));
    } catch (e) {
      setClaim((c) => ({ ...c, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  // ---- columns ----
  const supplyCols: Column<Market>[] = [
    { id: "asset", header: "Asset", cell: (m) => <AssetCell code={m.code} issuer={m.issuer} contract={m.contract} sub={m.poolName} status={m.status} />, sortValue: (m) => m.code },
    {
      id: "wallet",
      header: "Wallet Balance",
      cell: (m) => (
        <Num>
          {formatAmount(balanceOf(m), 4)} {m.code}
        </Num>
      ),
      sortValue: balanceOf,
    },
    { id: "supplied", header: "Total Supplied", cell: (m) => <Num>{compactUsd(m.suppliedUsd)}</Num>, sortValue: (m) => m.suppliedUsd },
    { id: "apy", header: "Supply APY", cell: (m) => <Num color="green.main">{pct(m.supplyApy)}</Num>, sortValue: (m) => m.supplyApy },
    { id: "ltv", header: "LTV", cell: (m) => <Num>{m.ltvPct != null ? pct(m.ltvPct, 0) : "—"}</Num> },
    { id: "collateral", header: "Collateral", align: "center", cell: (m) => <CollateralMark ok={m.canCollateral} /> },
    {
      id: "action",
      header: "Action",
      align: "center",
      cell: (m) => {
        const block = actionBlock(m, "supply");
        return <RowAction label="Supply" disabled={!!block} tip={block} onClick={() => open(m, "supply")} />;
      },
    },
  ];

  const borrowCols: Column<Market>[] = [
    { id: "asset", header: "Asset", cell: (m) => <AssetCell code={m.code} issuer={m.issuer} contract={m.contract} sub={m.poolName} status={m.status} />, sortValue: (m) => m.code },
    { id: "available", header: "Available", cell: (m) => <Num>{compactUsd(m.availableUsd)}</Num>, sortValue: (m) => m.availableUsd },
    { id: "borrowed", header: "Total Borrowed", cell: (m) => <Num>{compactUsd(m.borrowedUsd)}</Num>, sortValue: (m) => m.borrowedUsd },
    { id: "util", header: "Utilization", cell: (m) => <Num>{pct(m.utilPct, 1)}</Num>, sortValue: (m) => m.utilPct },
    { id: "apy", header: "Borrow APY", cell: (m) => <Num color="green.main">{pct(m.borrowApy)}</Num>, sortValue: (m) => m.borrowApy },
    {
      id: "action",
      header: "Action",
      align: "center",
      cell: (m) => {
        const block = actionBlock(m, "borrow");
        return <RowAction label="Borrow" disabled={!!block} tip={block} onClick={() => open(m, "borrow")} />;
      },
    },
  ];

  const legCell = (l: UserLeg) => {
    const m = marketOf(l);
    return <AssetCell code={l.code} issuer={m?.issuer} contract={l.contract} sub={`${m?.poolName ?? ""}${multi ? ` · ${walletName(l.wallet)}` : ""}`} status={m?.status} />;
  };
  const healthOf = (l: UserLeg) => (l.protocol === "blend" ? positions.pools[l.wallet]?.[l.pool]?.healthFactor : positions.xoxnoHealth[l.wallet]) ?? null;

  const yourSupplyCols: Column<UserLeg>[] = [
    { id: "asset", header: "Asset", cell: legCell },
    {
      id: "amount",
      header: "Supplied",
      cell: (l) => (
        <Box>
          <Num color="common.black">
            {formatAmount(l.supplied, 4)} {l.code}
          </Num>
          <Typography variant="caption" color="grey.200">
            {formatUsd(l.suppliedUsd)}
          </Typography>
        </Box>
      ),
      sortValue: (l) => l.suppliedUsd,
    },
    { id: "apy", header: "Supply APY", cell: (l) => <Num color="green.main">{pct(marketOf(l)?.supplyApy)}</Num> },
    { id: "collateral", header: "Collateral", align: "center", cell: (l) => <CollateralMark ok={l.protocol === "xoxno" || l.supplied - l.lent > 1e-9} /> },
    {
      id: "action",
      header: "Action",
      align: "center",
      cell: (l) => {
        const m = marketOf(l);
        return <RowAction label="Withdraw" disabled={!m} onClick={() => m && open(m, "withdraw")} />;
      },
    },
  ];

  const yourBorrowCols: Column<UserLeg>[] = [
    { id: "asset", header: "Asset", cell: legCell },
    {
      id: "debt",
      header: "Debt",
      cell: (l) => (
        <Box>
          <Num color="common.black">
            {formatAmount(l.borrowed, 4)} {l.code}
          </Num>
          <Typography variant="caption" color="grey.200">
            {formatUsd(l.borrowedUsd)}
          </Typography>
        </Box>
      ),
      sortValue: (l) => l.borrowedUsd,
    },
    { id: "apy", header: "Borrow APY", cell: (l) => <Num color="green.main">{pct(marketOf(l)?.borrowApy)}</Num> },
    {
      id: "health",
      header: "Health Factor",
      cell: (l) => {
        const h = healthOf(l);
        return <Num color={healthColor(h)}>{h == null ? "—" : h.toFixed(2)}</Num>;
      },
    },
    {
      id: "action",
      header: "Action",
      align: "center",
      cell: (l) => {
        const m = marketOf(l);
        return <RowAction label="Repay" disabled={!m} onClick={() => m && open(m, "repay")} />;
      },
    },
  ];

  const rewardsStrip = (p: LendProtocol) => {
    if (p !== "blend" || !activeWallet) return null;
    const pools = Object.entries(positions.pools[activeWallet.address] ?? {}).filter(([, v]) => v.claimableBlnd > 0.0001);
    if (pools.length === 0) return null;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", p: "1rem 1.25rem", borderRadius: "1.25rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
        <Typography variant="h6" sx={{ fontSize: "1.125rem", fontWeight: 500, color: "purple.main100" }}>
          Your Rewards
        </Typography>
        {pools.map(([pool, v]) => {
          const name = markets.find((m) => m.pool === pool)?.poolName ?? `${pool.slice(0, 6)}…`;
          return (
            <Box key={pool} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", py: "0.5rem", flexWrap: "wrap" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <TokenLogo code="BLND" size="2.5rem" />
                <Box>
                  <Typography sx={{ fontSize: "1rem", color: "common.black" }}>
                    {formatAmount(v.claimableBlnd, 4)} BLND
                  </Typography>
                  <Typography variant="caption" color="grey.200">
                    {name} pool emissions{blndPrice ? ` · ${formatUsd(v.claimableBlnd * blndPrice)}` : ""}
                  </Typography>
                </Box>
              </Box>
              <RowAction label="Claim" onClick={() => void runClaim(pool)} />
            </Box>
          );
        })}
      </Box>
    );
  };

  const section = (p: LendProtocol) => {
    const meta = LEND_PROTOCOLS[p];
    const list = markets.filter((m) => m.protocol === p && matches(m));
    const legs = positions.legs.filter((l) => l.protocol === p && (!query || l.code.toLowerCase().includes(query)));
    const supplies = legs.filter((l) => l.supplied > 0);
    const borrows = legs.filter((l) => l.borrowed > 0);
    const lendRows = showAll ? list : list.filter((m) => balanceOf(m) > 0);
    const borrowRows = list.filter((m) => m.borrowApy != null && m.canBorrow);
    const venueSupplied = supplies.reduce((s, l) => s + l.suppliedUsd, 0);
    const venueBorrowed = borrows.reduce((s, l) => s + l.borrowedUsd, 0);
    return (
      <ProtocolSection
        key={p}
        name={meta.name}
        logo={meta.logo}
        right={
          (venueSupplied > 0 || venueBorrowed > 0) && (
            <Box sx={{ display: "flex", gap: "1.5rem" }}>
              <Typography variant="subtitle1" color="grey.200">
                Supplied <Box component="span" sx={{ color: "common.black" }}>{formatUsd(venueSupplied)}</Box>
              </Typography>
              <Typography variant="subtitle1" color="grey.200">
                Borrowed <Box component="span" sx={{ color: "common.black" }}>{formatUsd(venueBorrowed)}</Box>
              </Typography>
            </Box>
          )
        }
      >
        {mode === "lend" ? (
          <>
            {rewardsStrip(p)}
            {supplies.length > 0 && (
              <DataTable
                variant="inset"
                title="Your Supplies"
                columns={yourSupplyCols}
                rows={supplies}
                getRowId={(l) => `${l.wallet}:${l.pool}:${l.contract}`}
                onRowClick={(l) => {
                  const m = marketOf(l);
                  if (m) open(m, "withdraw");
                }}
                defaultSort={{ id: "amount", dir: "desc" }}
              />
            )}
            <DataTable
              variant="inset"
              title="Assets To Supply"
              toolbar={<LabeledSwitch label="Show all assets" tip="Off: only assets you hold in the active wallet" checked={showAll} onChange={setShowAll} />}
              columns={supplyCols}
              rows={lendRows}
              isLoading={loading}
              emptyDataText={showAll ? "No markets match your search" : "You hold none of these assets. Turn on Show all assets."}
              emptyMinHeight="12rem"
              getRowId={(m) => m.key}
              onRowClick={(m) => open(m, "supply")}
              pageSize={10}
              defaultSort={{ id: "supplied", dir: "desc" }}
            />
          </>
        ) : (
          <>
            {borrows.length > 0 && (
              <DataTable
                variant="inset"
                title="Your Borrows"
                columns={yourBorrowCols}
                rows={borrows}
                getRowId={(l) => `${l.wallet}:${l.pool}:${l.contract}`}
                onRowClick={(l) => {
                  const m = marketOf(l);
                  if (m) open(m, "repay");
                }}
                defaultSort={{ id: "debt", dir: "desc" }}
              />
            )}
            <DataTable
              variant="inset"
              title={<Typography variant="h6" sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>Assets To Borrow</Typography>}
              columns={borrowCols}
              rows={borrowRows}
              isLoading={loading}
              emptyDataText="No borrowable markets match your search"
              emptyMinHeight="12rem"
              getRowId={(m) => m.key}
              onRowClick={(m) => open(m, "borrow")}
              pageSize={10}
              defaultSort={{ id: "available", dir: "desc" }}
            />
          </>
        )}
      </ProtocolSection>
    );
  };

  const top = useMemo(
    () =>
      [...markets]
        .filter((m) => m.suppliedUsd >= 50_000 && m.supplyApy != null && !actionBlock(m, "supply"))
        .sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0))
        .slice(0, 7),
    [markets],
  );

  const main = (
    <>
      <ProtocolChips items={(["blend", "xoxno"] as LendProtocol[]).map((p) => ({ id: p, label: LEND_PROTOCOLS[p].name, logo: LEND_PROTOCOLS[p].logo }))} value={proto} onChange={setProto} />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", mt: "1.25rem", mb: "0.25rem" }}>
        <Tabs
          tabs={[
            { id: "lend", label: "Lend", padding: "0 1rem" },
            { id: "borrow", label: "Borrow", padding: "0 1rem" },
          ]}
          activeTab={mode}
          setActiveTab={setMode}
          isPathProvided={false}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search asset or pool" />
      </Box>
      {venues.map(section)}
    </>
  );

  const side = (
    <TopList
      title="Top Markets"
      nameLabel="Markets"
      valueLabel="Supply APY"
      emptyText="Loading markets…"
      items={top.map((m) => ({
        key: m.key,
        icon: <TokenLogo code={m.code} issuer={m.issuer} contract={m.contract} size="2.75rem" />,
        title: m.code,
        subtitle: m.poolName,
        badge: { name: LEND_PROTOCOLS[m.protocol].name, logo: LEND_PROTOCOLS[m.protocol].logo },
        value: pct(m.supplyApy),
        onClick: () => open(m, "supply"),
      }))}
    />
  );

  return (
    <>
      <EarnGrid tabs={tabs} main={main} side={side} />
      <TxDialog open={claim.open} title="Claim rewards" steps={claim.steps} error={claim.error} onClose={() => setClaim((c) => ({ ...c, open: false }))} />
    </>
  );
}
