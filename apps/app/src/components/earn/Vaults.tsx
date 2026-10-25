"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import DataTable, { type Column } from "@/components/common/DataTable";
import TokenComponent from "@/components/common/TokenComponent";
import { tokenLogoUrl } from "@/components/common/TokenLogo";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import { apiJson } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { useShared } from "@/lib/useShared";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { EarnGrid, SideCard } from "./EarnParts";
import VaultDialog from "./VaultDialog";

export type VaultListRow = {
  protocol: string;
  address: string;
  name: string;
  asset: string;
  assetCode: string;
  assetDecimals: number;
  tvlUsd: number;
  apyPct: number | null;
  apySource?: string | null;
  curator?: string;
  withdrawalDays?: number | null;
  paused?: boolean;
};

export const VAULT_PROTOCOLS: Record<string, string> = {
  defindex: "DeFindex",
  upshift: "Upshift",
  sentora: "Sentora",
};

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

export function useVaultList() {
  const { value, loading } = useShared<{ rows?: VaultListRow[] } | null>("vaults:list", () => apiJson("/api/vaults", undefined, 180_000), 300_000);
  return { rows: value?.rows ?? [], loading };
}

export const apyText = (r: VaultListRow) => (r.apyPct == null ? "—" : `${r.apyPct.toFixed(2)}%`);

export default function Vaults({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter();
  const { rows, loading } = useVaultList();
  const portfolio = usePortfolio();
  const { byContract } = useTokenCatalogue();
  const [proto, setProto] = useState<string>("all");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ vault: VaultListRow; initial: "deposit" | "withdraw" } | null>(null);

  const list = useMemo(
    () =>
      rows
        .filter((r) => (proto === "all" || r.protocol === proto) && (!q || `${r.name} ${r.assetCode}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.tvlUsd - a.tvlUsd),
    [rows, proto, q],
  );
  const issuer = (r: VaultListRow) => byContract.get(r.asset)?.issuer ?? null;
  const mine = (address: string) => portfolio.vaults.find((v) => v.vault === address);
  const open = (r: VaultListRow) => router.push(`/earn/vaults/view?address=${r.address}`);

  const columns: Column<VaultListRow>[] = [
    {
      id: "vault",
      header: "Vault",
      cell: (r) => (
        <ButtonBase onClick={() => open(r)} sx={{ justifyContent: "flex-start" }}>
          <TokenComponent header={r.name} subtitle={`${VAULT_PROTOCOLS[r.protocol] ?? r.protocol}${r.curator ? ` · ${r.curator}` : ""}`} image={tokenLogoUrl(r.assetCode, issuer(r)) ?? undefined} isTooltip maxTextWidth="14rem" />
        </ButtonBase>
      ),
    },
    { id: "asset", header: "Asset", cell: (r) => <Typography variant="body1" color="black.main100">{r.assetCode}</Typography> },
    {
      id: "apy",
      header: "APY",
      cell: (r) => (
        <Typography variant="body1" color="green.main" title={r.apySource === "advertised" ? "Advertised by the vault curator" : "Measured from on-chain snapshots"}>
          {apyText(r)}
        </Typography>
      ),
    },
    { id: "tvl", header: "TVL", cell: (r) => <Typography variant="body1" color="common.black">{formatUsd(r.tvlUsd)}</Typography> },
    {
      id: "mine",
      header: "Your deposit",
      cell: (r) => {
        const m = mine(r.address);
        return <Typography variant="body1" color={m ? "green.main" : "grey.200"}>{m ? formatUsd(m.usd) : "—"}</Typography>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: (r) => (
        <Box sx={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button size="small" variant="solid" color="primary" disabled={r.paused} onClick={() => setDialog({ vault: r, initial: "deposit" })}>
            Deposit
          </Button>
          <Button size="small" variant="outlined" color="cancel" onClick={() => open(r)}>
            Details
          </Button>
        </Box>
      ),
    },
  ];

  const main = (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", mb: "1rem" }}>
        <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Chip active={proto === "all"} onClick={() => setProto("all")}>
            All vaults
          </Chip>
          {Object.entries(VAULT_PROTOCOLS).map(([id, name]) => (
            <Chip key={id} active={proto === id} onClick={() => setProto(id)}>
              {name}
            </Chip>
          ))}
        </Box>
        <Search>
          <Box sx={{ display: "inline-flex", color: "grey.200" }}>
            <SearchIcon size="1rem" />
          </Box>
          <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vault or asset" sx={{ fontSize: "0.875rem", color: "common.black" }} />
        </Search>
      </Box>
      <DataTable columns={columns} rows={list} isLoading={loading && list.length === 0} emptyDataText="No vaults found" getRowId={(r) => r.address} />
    </>
  );

  const side = (
    <>
      <SideCard title="Your vaults" icon="/assets/topPools.svg">
        {portfolio.vaultsLoading ? (
          <Typography variant="subtitle3" color="grey.200">
            Scanning vaults for your deposits…
          </Typography>
        ) : portfolio.vaults.length === 0 ? (
          <Typography variant="subtitle3" color="grey.200">
            No vault deposits yet.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {portfolio.vaults.map((v) => {
              const r = rows.find((x) => x.address === v.vault);
              return (
                <Box key={`${v.wallet}${v.vault}`} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <TokenComponent header={v.name} subtitle={formatUsd(v.usd)} image={tokenLogoUrl(v.underlying[0]?.code ?? "V", v.underlying[0]?.issuer ?? null) ?? undefined} width="1.75rem" height="1.75rem" />
                  {r && (
                    <Button size="small" variant="outlined" color="cancel" onClick={() => setDialog({ vault: r, initial: "withdraw" })}>
                      Withdraw
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </SideCard>
      <SideCard title="Highest APY" icon="/assets/newPools.svg">
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[...rows]
            .filter((r) => r.tvlUsd >= 10_000 && r.apyPct != null)
            .sort((a, b) => (b.apyPct ?? 0) - (a.apyPct ?? 0))
            .slice(0, 6)
            .map((r) => (
              <ButtonBase key={r.address} onClick={() => open(r)} sx={{ justifyContent: "space-between", width: "100%" }}>
                <TokenComponent header={r.name} subtitle={`${VAULT_PROTOCOLS[r.protocol] ?? r.protocol} · ${formatUsd(r.tvlUsd)}`} image={tokenLogoUrl(r.assetCode, issuer(r)) ?? undefined} width="1.75rem" height="1.75rem" />
                <Typography variant="subtitle1" color="green.main">
                  {apyText(r)}
                </Typography>
              </ButtonBase>
            ))}
        </Box>
      </SideCard>
    </>
  );

  return (
    <>
      <EarnGrid tabs={tabs} main={main} side={side} />
      {dialog && <VaultDialog vault={dialog.vault} initial={dialog.initial} onClose={() => setDialog(null)} />}
    </>
  );
}
