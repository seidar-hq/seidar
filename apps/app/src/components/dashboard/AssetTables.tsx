"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import DataTable, { type Column } from "@/components/common/DataTable";
import { PlainCard } from "@/components/common/SectionCard";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import TokenComponent from "@/components/common/TokenComponent";
import { tokenLogoUrl } from "@/components/common/TokenLogo";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import type { BorrowRow, Portfolio, SupplyRow, VaultRow } from "@/portfolio/usePortfolio";
import { usePriceChanges } from "@/portfolio/useSeries";
import type { TokenBalance } from "@/wallet/useBalances";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import PerpsPositions from "./PerpsPositions";

const Root = styled(PlainCard)({ position: "relative" });

const TABS: TabItem[] = [
  { id: "assets", label: "Assets" },
  { id: "supplied", label: "Supplied" },
  { id: "borrowed", label: "Borrowed" },
  { id: "vaults", label: "Vaults" },
  { id: "perps", label: "Perps" },
];

const Num = ({ children, tip, color = "black.main100" }: { children: React.ReactNode; tip?: string; color?: string }) => (
  <Tooltip placement="top" arrow title={tip ?? ""}>
    <Typography variant="body1" color={color} sx={{ display: "inline-block", cursor: "default" }}>
      {children}
    </Typography>
  </Tooltip>
);

const pctText = (v: number) => `${v.toFixed(2)}%`;

function WalletCell({ address }: { address: string }) {
  const { wallets } = useWallet();
  const w = wallets.find((x) => x.address === address);
  return (
    <Tooltip placement="top" arrow title={address}>
      <Typography variant="body3" color="black.main100" sx={{ cursor: "default" }}>
        {w ? walletLabel(w) : shortAddress(address)}
      </Typography>
    </Tooltip>
  );
}

const token = (code: string, issuer: string | null, subtitle?: string) => (
  <TokenComponent
    header={code}
    subtitle={subtitle ?? (issuer ? shortAddress(issuer) : code === "XLM" ? "Stellar Lumens" : "")}
    image={tokenLogoUrl(code, issuer) ?? undefined}
    isTooltip
    maxTextWidth="11rem"
  />
);

export default function AssetTables({ portfolio }: { portfolio: Portfolio }) {
  const [tab, setTab] = useState("assets");
  const { changes } = usePriceChanges(portfolio.exposures, "1d");
  const multi = portfolio.addresses.length > 1;
  const assetsTotal = portfolio.totals.assetsUsd;

  // Assets: one row per token per wallet, so a multi-wallet portfolio shows where each holding sits.
  const assetRows: (TokenBalance & { wallet: string })[] = [];
  for (const t of portfolio.assets) assetRows.push({ ...t, wallet: "" });

  const assetCols: Column<TokenBalance & { wallet: string }>[] = [
    { id: "token", header: "Token", cell: (r) => token(r.code, r.issuer) },
    { id: "balance", header: "Actual Balance", cell: (r) => <Num tip={String(r.amount)}>{formatAmount(r.amount)}</Num> },
    {
      id: "usd",
      header: "USD Balance",
      cell: (r) => (
        <Num color="common.black" tip={r.listed ? undefined : "Unlisted token: no reliable price"}>
          {r.listed && r.price != null ? formatUsd(r.usd) : "—"}
        </Num>
      ),
    },
    {
      id: "change",
      header: "Change 24h",
      cell: (r) => {
        const c = changes[!r.issuer && r.code === "XLM" ? "native" : `${r.code}:${r.issuer}`];
        if (c == null) return <Num>—</Num>;
        return (
          <Num color={c >= 0 ? "green.main" : "error.main"} tip={`${c.toFixed(4)}%`}>
            {c > 0 ? "+" : ""}
            {pctText(c)}
          </Num>
        );
      },
    },
    { id: "alloc", header: "Allocation", cell: (r) => <Num>{assetsTotal > 0 ? pctText((r.usd / assetsTotal) * 100) : "0.00%"}</Num> },
  ];

  const supplyCols: Column<SupplyRow>[] = [
    {
      id: "token",
      header: "Asset",
      cell: (r) =>
        r.kind === "lp" ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Box sx={{ display: "flex" }}>
              {(r.legs ?? []).slice(0, 2).map((l, i) => (
                <Box
                  key={l.code}
                  component="img"
                  src={tokenLogoUrl(l.code, l.issuer) ?? "/assets/tokenFallback.svg"}
                  sx={{ width: "1.75rem", height: "1.75rem", borderRadius: "50%", ml: i ? "-0.5rem" : 0, backgroundColor: "grey.300" }}
                />
              ))}
            </Box>
            <Typography variant="body3" color="common.black">
              {r.code}
            </Typography>
          </Box>
        ) : (
          token(r.code, r.issuer)
        ),
    },
    { id: "protocol", header: "Protocol", cell: (r) => <Num>{r.kind === "lp" ? `${r.label} pool` : r.label}</Num> },
    {
      id: "amount",
      header: "Amount",
      cell: (r) =>
        r.kind === "lp" ? (
          <Num>{(r.legs ?? []).map((l) => `${formatAmount(l.amount, 4)} ${l.code}`).join(" + ")}</Num>
        ) : (
          <Num>{r.amount != null ? `${formatAmount(r.amount)} ${r.code}` : "—"}</Num>
        ),
    },
    { id: "usd", header: "USD Value", cell: (r) => <Num color="common.black">{formatUsd(r.usd)}</Num> },
    ...(multi ? [{ id: "wallet", header: "Wallet", cell: (r: SupplyRow) => <WalletCell address={r.wallet} /> }] : []),
  ];

  const borrowCols: Column<BorrowRow>[] = [
    { id: "token", header: "Asset", cell: (r) => token(r.code, r.issuer) },
    { id: "protocol", header: "Protocol", cell: (r) => <Num>{r.protocol === "blend" ? "Blend" : "XOXNO"}</Num> },
    { id: "amount", header: "Debt", cell: (r) => <Num>{r.amount != null ? `${formatAmount(r.amount)} ${r.code}` : "—"}</Num> },
    { id: "usd", header: "USD Value", cell: (r) => <Num color="error.main">{formatUsd(r.usd)}</Num> },
    ...(multi ? [{ id: "wallet", header: "Wallet", cell: (r: BorrowRow) => <WalletCell address={r.wallet} /> }] : []),
  ];

  const vaultCols: Column<VaultRow>[] = [
    {
      id: "vault",
      header: "Vault",
      cell: (r) => token(r.underlying[0]?.code ?? "V", r.underlying[0]?.issuer ?? null, r.protocol),
    },
    { id: "name", header: "Name", cell: (r) => <Num color="common.black">{r.name}</Num> },
    {
      id: "underlying",
      header: "Underlying",
      cell: (r) => <Num>{r.underlying.map((u) => `${formatAmount(u.amount, 4)} ${u.code}`).join(" + ") || "—"}</Num>,
    },
    { id: "usd", header: "USD Value", cell: (r) => <Num color="common.black">{formatUsd(r.usd)}</Num> },
    ...(multi ? [{ id: "wallet", header: "Wallet", cell: (r: VaultRow) => <WalletCell address={r.wallet} /> }] : []),
  ];

  return (
    <Root overflow="hidden" padding={2} mt="1rem" width="100%">
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "space-between", alignItems: "center", mb: "1rem" }}>
        <Tabs tabs={TABS} activeTab={tab} setActiveTab={setTab} isPathProvided={false} />
        {tab === "borrowed" && portfolio.healthFactor != null && (
          <Typography variant="subtitle1" color="grey.200">
            Health factor{" "}
            <Box component="span" sx={{ color: portfolio.healthFactor < 1.2 ? "error.main" : "green.main" }}>
              {portfolio.healthFactor.toFixed(2)}
            </Box>
          </Typography>
        )}
      </Box>
      {tab === "assets" && (
        <DataTable
          columns={assetCols}
          rows={assetRows}
          isLoading={portfolio.assetsLoading}
          emptyDataText="No assets in this portfolio"
          from="dashboard"
          getRowId={(r) => `${r.code}:${r.issuer}`}
        />
      )}
      {tab === "supplied" && (
        <DataTable
          columns={supplyCols}
          rows={portfolio.supplied}
          isLoading={portfolio.positionsLoading && portfolio.supplied.length === 0}
          emptyDataText="Nothing supplied to lending markets or pools"
          from="dashboard"
          getRowId={(r, i) => `${r.wallet}:${r.pool}:${r.code}:${i}`}
        />
      )}
      {tab === "borrowed" && (
        <DataTable
          columns={borrowCols}
          rows={portfolio.borrowed}
          isLoading={portfolio.lendingLoading && portfolio.borrowed.length === 0}
          emptyDataText="No open borrows"
          from="dashboard"
          getRowId={(r, i) => `${r.wallet}:${r.pool}:${r.code}:${i}`}
        />
      )}
      {tab === "vaults" && (
        <DataTable
          columns={vaultCols}
          rows={portfolio.vaults}
          isLoading={portfolio.vaultsLoading && portfolio.vaults.length === 0}
          emptyDataText="No vault deposits"
          from="dashboard"
          getRowId={(r) => `${r.wallet}:${r.vault}`}
        />
      )}
      {tab === "perps" && <PerpsPositions addresses={portfolio.addresses} />}
    </Root>
  );
}
