"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import DataTable, { type Column } from "@/components/common/DataTable";
import TokenComponent from "@/components/common/TokenComponent";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { toBase } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import ActionDialog, { type ActionSpec } from "./ActionDialog";
import { EarnGrid, SideCard } from "./EarnParts";

type PoolAsset = {
  pool: string;
  poolName: string;
  protocol: "blend" | "xoxno";
  code: string;
  asset?: string;
  decimals?: number;
  suppliedUsd?: number;
  borrowedUsd?: number;
  supplyApy: number | null;
  borrowApy: number | null;
  ltvPct?: number | null;
  canBorrow?: boolean;
  canCollateral?: boolean;
};

type XoxnoMarket = {
  sac: string;
  symbol: string;
  decimals: number;
  hubId: number;
  priceUsd?: number;
  spokes: { spokeId: number; spokeName: string; ltvBps: number; canSupply: boolean; canBorrow: boolean }[];
};

export type Market = PoolAsset & { key: string; contract: string | null; issuer: string | null; decimals: number; xoxno?: XoxnoMarket };

const Chip = styled(ButtonBase, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(({ theme, active }) => ({
  padding: "0.375rem 0.875rem",
  borderRadius: "999rem",
  fontSize: "0.8125rem",
  color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText,
  backgroundColor: active ? theme.palette.sidebar.primary : theme.palette.overlay.white05,
}));

const Search = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  height: "2.5rem",
  padding: "0 0.875rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  minWidth: "14rem",
}));

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v >= 100 ? v.toFixed(0) : v.toFixed(2)}%`);

/** Blend pools + XOXNO hubs as one market list, with token contracts resolved for building. */
export function useLendMarkets() {
  const { byContract, tokens } = useTokenCatalogue();
  const blend = useShared<{ assets?: PoolAsset[] } | null>("pools:blend", () => apiJson("/api/pools?protocol=blend", undefined, 120_000), 300_000);
  const xoxnoPools = useShared<{ assets?: PoolAsset[] } | null>("pools:xoxno", () => apiJson("/api/pools?protocol=xoxno", undefined, 120_000), 300_000);
  const xoxnoMk = useShared<{ assets?: XoxnoMarket[] } | null>("xoxno:markets", () => apiJson("/api/lending/xoxno/markets", undefined, 120_000), 300_000);

  const markets = useMemo<Market[]>(() => {
    const out: Market[] = [];
    for (const a of blend.value?.assets ?? []) {
      const meta = a.asset ? byContract.get(a.asset) : undefined;
      out.push({ ...a, protocol: "blend", key: `blend:${a.pool}:${a.code}`, contract: a.asset ?? null, issuer: meta?.issuer ?? null, decimals: a.decimals ?? meta?.decimals ?? 7 });
    }
    for (const a of xoxnoPools.value?.assets ?? []) {
      const hub = Number(String(a.pool).split("-").pop());
      const mk = xoxnoMk.value?.assets?.find((m) => m.symbol === a.code && m.hubId === hub);
      const t = mk ? byContract.get(mk.sac) : tokens.find((x) => x.code === a.code);
      out.push({
        ...a,
        protocol: "xoxno",
        key: `xoxno:${a.pool}:${a.code}`,
        contract: mk?.sac ?? (t && "contract" in t ? (t as { contract: string }).contract : null),
        issuer: t?.issuer ?? null,
        decimals: mk?.decimals ?? 7,
        xoxno: mk,
      });
    }
    return out;
  }, [blend.value, xoxnoPools.value, xoxnoMk.value, byContract, tokens]);

  return { markets, loading: blend.loading || xoxnoPools.loading };
}

type Dialog = { market: Market; initial: string } | null;

export default function LendBorrow({ tabs }: { tabs: React.ReactNode }) {
  const { activeWallet } = useWallet();
  const { markets, loading } = useLendMarkets();
  const portfolio = usePortfolio();
  const { byAddress } = useBalances(activeWallet ? [activeWallet.address] : []);
  const held = activeWallet ? byAddress[activeWallet.address]?.tokens ?? [] : [];
  const xoxnoAccounts = useShared<{ accounts?: { accountId: string; spokeId: number; hubId: number }[] } | null>(
    activeWallet ? `xoxno:accounts:${activeWallet.address}` : null,
    () => apiJson(`/api/lending/xoxno/accounts?owner=${activeWallet!.address}`, undefined, 120_000),
    120_000,
  );
  const [proto, setProto] = useState<"all" | "blend" | "xoxno">("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(20);
  const [dialog, setDialog] = useState<Dialog>(null);

  const rows = useMemo(
    () =>
      markets
        .filter((m) => (proto === "all" || m.protocol === proto) && (!q || m.code.toLowerCase().includes(q.toLowerCase()) || m.poolName.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (b.suppliedUsd ?? 0) - (a.suppliedUsd ?? 0)),
    [markets, proto, q],
  );

  const walletAmount = (m: Market) => held.find((h) => h.code === m.code && (h.issuer ?? null) === (m.issuer ?? null))?.amount ?? 0;
  const priceOf = (m: Market) => held.find((h) => h.code === m.code)?.price ?? m.xoxno?.priceUsd ?? null;
  const mine = (m: Market) => ({
    supplied: portfolio.supplied.find((s) => s.kind === "lend" && s.protocol === m.protocol && s.code === m.code && (m.protocol === "xoxno" || s.pool === m.pool) && s.wallet === activeWallet?.address),
    borrowed: portfolio.borrowed.find((s) => s.protocol === m.protocol && s.code === m.code && (m.protocol === "xoxno" || s.pool === m.pool) && s.wallet === activeWallet?.address),
  });

  const buildBody = (m: Market, action: string, amount: string) => {
    const base = amount === "max" ? "max" : (toBase(amount, m.decimals) ?? "0");
    const from = activeWallet!.address;
    if (m.protocol === "blend") return { protocol: "blend", from, pool: m.pool, actions: [{ action, asset: m.contract, amount: base }] };
    const spoke = m.xoxno?.spokes.find((s) => (action === "borrow" ? s.canBorrow : s.canSupply)) ?? m.xoxno?.spokes[0];
    const acct = xoxnoAccounts.value?.accounts?.find((a) => a.hubId === m.xoxno?.hubId);
    return {
      protocol: "xoxno",
      from,
      actions: [{ action, asset: m.contract, amount: base }],
      xoxno: { hubId: m.xoxno?.hubId, spokeId: acct?.spokeId ?? spoke?.spokeId, accountId: acct?.accountId },
    };
  };

  const specsFor = (m: Market): ActionSpec[] => {
    const { supplied, borrowed } = mine(m);
    const label = `${m.protocol === "blend" ? "Blend" : "XOXNO"} · ${m.poolName}`;
    const missing = !m.contract ? "MARKET UNAVAILABLE" : null;
    const mk = (id: string, name: string, available: number | null, availableLabel: string, extra: Partial<ActionSpec> = {}): ActionSpec => ({
      id,
      label: name,
      available,
      availableLabel,
      disabledReason: missing,
      build: (amount) => ({ path: "/api/lending/build", body: buildBody(m, id, amount), label: `${name} ${m.code} on ${label}` }),
      ...extra,
    });
    return [
      mk("supply", "Supply", walletAmount(m), "Wallet balance", {
        details: [
          { label: "Supply APY", value: pct(m.supplyApy) },
          { label: "Collateral factor", value: m.ltvPct != null ? `${m.ltvPct}%` : "—" },
        ],
      }),
      mk("withdraw", "Withdraw", supplied?.amount ?? 0, "Supplied", { allowMax: true }),
      mk("borrow", "Borrow", null, "Limited by your collateral", {
        details: [
          { label: "Borrow APY", value: pct(m.borrowApy) },
          { label: "Health factor now", value: portfolio.healthFactor != null ? portfolio.healthFactor.toFixed(2) : "—" },
        ],
        disabledReason: missing ?? (m.canBorrow === false ? "BORROWING DISABLED" : null),
      }),
      mk("repay", "Repay", Math.min(borrowed?.amount ?? 0, walletAmount(m)), "Debt (payable)", { allowMax: true }),
    ];
  };

  const columns: Column<Market>[] = [
    {
      id: "asset",
      header: "Asset",
      cell: (m) => <TokenComponent header={m.code} subtitle={`${m.protocol === "blend" ? "Blend" : "XOXNO"} · ${m.poolName}`} token={{ code: m.code, issuer: m.issuer }} isTooltip maxTextWidth="12rem" />,
    },
    { id: "supplyApy", header: "Supply APY", cell: (m) => <Typography variant="body1" color="green.main">{pct(m.supplyApy)}</Typography> },
    { id: "borrowApy", header: "Borrow APY", cell: (m) => <Typography variant="body1" color="black.main100">{pct(m.borrowApy)}</Typography> },
    { id: "supplied", header: "Total supplied", cell: (m) => <Typography variant="body1" color="common.black">{m.suppliedUsd != null ? formatUsd(m.suppliedUsd) : "—"}</Typography> },
    { id: "borrowed", header: "Total borrowed", cell: (m) => <Typography variant="body1" color="black.main100">{m.borrowedUsd != null ? formatUsd(m.borrowedUsd) : "—"}</Typography> },
    {
      id: "actions",
      header: "",
      cell: (m) => (
        <Box sx={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button size="small" variant="solid" color="primary" sx={{ minWidth: 0, px: "0.75rem" }} onClick={() => setDialog({ market: m, initial: "supply" })}>
            Supply
          </Button>
          <Button size="small" variant="outlined" color="cancel" sx={{ minWidth: 0, px: "0.75rem" }} disabled={m.canBorrow === false || m.borrowApy == null} onClick={() => setDialog({ market: m, initial: "borrow" })}>
            Borrow
          </Button>
        </Box>
      ),
    },
  ];

  const myRows = [...portfolio.supplied.filter((s) => s.kind === "lend"), ...portfolio.borrowed.map((b) => ({ ...b, borrowedRow: true as const }))];

  const main = (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", mb: "1rem" }}>
        <Box sx={{ display: "flex", gap: "0.5rem" }}>
          {(["all", "blend", "xoxno"] as const).map((p) => (
            <Chip key={p} active={proto === p} onClick={() => setProto(p)}>
              {p === "all" ? "All markets" : p === "blend" ? "Blend" : "XOXNO"}
            </Chip>
          ))}
        </Box>
        <Search>
          <Box sx={{ display: "inline-flex", color: "grey.200" }}>
            <SearchIcon size="1rem" />
          </Box>
          <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search asset or pool" sx={{ fontSize: "0.875rem", color: "common.black" }} />
        </Search>
      </Box>
      <DataTable columns={columns} rows={rows.slice(0, shown)} isLoading={loading && rows.length === 0} emptyDataText="No lending markets found" getRowId={(m) => m.key} />
      {rows.length > shown && (
        <Button variant="outlined" color="cancel" size="small" onClick={() => setShown((n) => n + 20)} sx={{ alignSelf: "center", mt: "1rem" }}>
          Show more ({rows.length - shown})
        </Button>
      )}
    </>
  );

  const side = (
    <>
        <SideCard title="Your lending" icon="/assets/topPools.svg">
          {portfolio.lendingLoading ? (
            <Typography variant="subtitle3" color="grey.200">
              Loading your positions…
            </Typography>
          ) : myRows.length === 0 ? (
            <Typography variant="subtitle3" color="grey.200">
              No lending positions yet. Supply an asset to start earning.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {portfolio.healthFactor != null && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="subtitle3" color="grey.200">
                    Health factor
                  </Typography>
                  <Typography variant="subtitle1" color={portfolio.healthFactor < 1.2 ? "error.main" : "green.main"}>
                    {portfolio.healthFactor.toFixed(2)}
                  </Typography>
                </Box>
              )}
              {myRows.map((r, i) => {
                const isBorrow = "borrowedRow" in r;
                const m = markets.find((x) => x.protocol === r.protocol && x.code === r.code && (r.protocol === "xoxno" || x.pool === r.pool));
                return (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <TokenComponent
                      header={`${isBorrow ? "Borrowed" : "Supplied"} ${r.code}`}
                      subtitle={`${r.amount != null ? formatAmount(r.amount, 4) : ""} · ${formatUsd(r.usd)}`}
                      token={{ code: r.code, issuer: r.issuer }}
                      width="1.75rem"
                      height="1.75rem"
                    />
                    {m && (
                      <Button size="small" variant="outlined" color="cancel" sx={{ minWidth: 0, px: "0.75rem" }} onClick={() => setDialog({ market: m, initial: isBorrow ? "repay" : "withdraw" })}>
                        {isBorrow ? "Repay" : "Withdraw"}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </SideCard>
        <SideCard title="Top supply rates" icon="/assets/newPools.svg">
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[...markets]
              .filter((m) => (m.suppliedUsd ?? 0) > 10_000 && m.supplyApy != null)
              .sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0))
              .slice(0, 6)
              .map((m) => (
                <Box key={m.key} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <TokenComponent header={m.code} subtitle={m.poolName} token={{ code: m.code, issuer: m.issuer }} width="1.75rem" height="1.75rem" />
                  <ButtonBase onClick={() => setDialog({ market: m, initial: "supply" })}>
                    <Typography variant="subtitle1" color="green.main">
                      {pct(m.supplyApy)}
                    </Typography>
                  </ButtonBase>
                </Box>
              ))}
          </Box>
        </SideCard>
    </>
  );

  return (
    <>
      <EarnGrid tabs={tabs} main={main} side={side} />
      {dialog && (
        <ActionDialog
          open
          onClose={() => setDialog(null)}
          title={`${dialog.market.code} · ${dialog.market.protocol === "blend" ? "Blend" : "XOXNO"} ${dialog.market.poolName}`}
          token={{ code: dialog.market.code, issuer: dialog.market.issuer }}
          price={priceOf(dialog.market)}
          actions={specsFor(dialog.market)}
          initial={dialog.initial}
        />
      )}
    </>
  );
}
