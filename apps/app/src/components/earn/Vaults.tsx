"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import DataTable, { type Column } from "@/components/common/DataTable";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount, formatUsd } from "@/lib/format";
import { usePortfolio, useTokenCatalogue, type VaultRow } from "@/portfolio/usePortfolio";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { EarnGrid } from "./EarnParts";
import { LabeledSwitch, ProtocolChips, RowAction, SearchBox, TopList } from "./EarnUI";
import { compactUsd } from "./lendData";
import { VAULT_PROTOCOLS, apyText, useVaultList, vaultHref, vaultProtocol, withdrawalText, type VaultListRow } from "./vaultData";


const Num = ({ children, color = "black.main100" }: { children: React.ReactNode; color?: string }) => (
  <Typography variant="body1" sx={{ color, fontSize: "1rem" }}>
    {children}
  </Typography>
);

function VaultCell({ code, issuer, contract, title, sub }: { code: string; issuer?: string | null; contract?: string | null; title: string; sub: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <TokenLogo code={code} issuer={issuer} contract={contract} size="2.5rem" />
      <Box>
        <Typography sx={{ fontSize: "1rem", color: "common.black", maxWidth: "14rem", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textTransform: "uppercase" }}>{sub}</Typography>
      </Box>
    </Box>
  );
}

function ProtocolCell({ id }: { id: string }) {
  const meta = vaultProtocol(id);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {meta.logo && <Box component="img" src={meta.logo} alt="" sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%", objectFit: "cover" }} />}
      <Typography sx={{ fontSize: "0.9375rem", color: "common.black", whiteSpace: "nowrap" }}>{meta.name}</Typography>
    </Box>
  );
}

const PROTOCOL_IDS = Object.keys(VAULT_PROTOCOLS);
const MIN_TVL = 1_000;

export default function Vaults({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter();
  const { rows, loading } = useVaultList();
  const { portfolioWallets, portfolioAddresses } = useWallet();
  const portfolio = usePortfolio();
  const { byContract } = useTokenCatalogue();
  const [proto, setProto] = useState<string>("all");
  const [q, setQ] = useState("");
  const [hideSmall, setHideSmall] = useState(true);
  const multi = portfolioWallets.length > 1 && portfolioAddresses.length > 1;
  const query = q.trim().toLowerCase();
  const issuer = (contract: string) => byContract.get(contract)?.issuer ?? null;
  const open = (address: string, mode: "deposit" | "withdraw" = "deposit") => router.push(vaultHref(address, mode));
  const listed = (v: VaultRow) => rows.find((r) => r.address === v.vault);

  const columns: Column<VaultListRow>[] = [
    {
      id: "vault",
      header: "Vault",
      cell: (r) => <VaultCell code={r.assetCode} issuer={issuer(r.asset)} contract={r.asset} title={r.name} sub={r.curator && r.curator !== vaultProtocol(r.protocol).name ? r.curator : r.assetCode} />,
      sortValue: (r) => r.name,
    },
    { id: "protocol", header: "Protocol", cell: (r) => <ProtocolCell id={r.protocol} />, sortValue: (r) => vaultProtocol(r.protocol).name },
    { id: "tvl", header: "TVL", cell: (r) => <Num>{compactUsd(r.tvlUsd)}</Num>, sortValue: (r) => r.tvlUsd },
    {
      id: "apy",
      header: "APY",
      cell: (r) => (
        <Typography variant="body1" sx={{ fontSize: "1rem", color: "green.main" }} title={r.apySource === "advertised" ? "Advertised by the vault curator" : "Measured from on-chain share price"}>
          {apyText(r)}
        </Typography>
      ),
      sortValue: (r) => r.apyPct ?? -1,
    },
    { id: "asset", header: "Asset", cell: (r) => <Num>{r.assetCode}</Num> },
    { id: "withdrawals", header: "Withdrawals", cell: (r) => <Num>{r.paused ? "Paused" : withdrawalText(r)}</Num> },
    { id: "action", header: "Action", align: "center", cell: (r) => <RowAction label="Deposit" disabled={!!r.paused} tip={r.paused ? "This vault is paused" : null} onClick={() => open(r.address)} /> },
  ];

  const posColumns: Column<VaultRow>[] = [
    {
      id: "vault",
      header: "Vault",
      cell: (v) => {
        const u = v.underlying[0];
        return (
          <VaultCell
            code={u?.code ?? "?"}
            issuer={u?.issuer}
            title={v.name}
            sub={multi ? walletLabel(portfolioWallets.find((w) => w.address === v.wallet)!) : (u?.code ?? "")}
          />
        );
      },
    },
    { id: "protocol", header: "Protocol", cell: (v) => <ProtocolCell id={v.protocol} />, sortValue: (v) => vaultProtocol(v.protocol).name },
    {
      id: "amount",
      header: "Deposited",
      cell: (v) => (
        <Box>
          <Num color="common.black">{v.underlying.map((u) => `${formatAmount(u.amount, 4)} ${u.code}`).join(" + ")}</Num>
          <Typography variant="caption" color="grey.200">
            {formatUsd(v.usd)}
          </Typography>
        </Box>
      ),
      sortValue: (v) => v.usd,
    },
    { id: "apy", header: "APY", cell: (v) => <Num color="green.main">{listed(v) ? apyText(listed(v)!) : "—"}</Num> },
    { id: "action", header: "Action", align: "center", cell: (v) => <RowAction label="Withdraw" onClick={() => open(v.vault, "withdraw")} /> },
  ];

  // One list across every venue; the chips narrow it to a protocol and the Protocol column says which.
  const inProto = (id: string) => proto === "all" || proto === id;
  const list = rows.filter((r) => inProto(r.protocol) && (!query || `${r.name} ${r.assetCode} ${r.curator ?? ""}`.toLowerCase().includes(query)) && (!hideSmall || r.tvlUsd >= MIN_TVL));
  const mine = portfolio.vaults.filter((v) => inProto(v.protocol) && (!query || v.name.toLowerCase().includes(query)));

  const main = (
    <>
      <ProtocolChips items={PROTOCOL_IDS.map((id) => ({ id, label: VAULT_PROTOCOLS[id].name, logo: VAULT_PROTOCOLS[id].logo }))} value={proto} onChange={setProto} />
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: "1.25rem", mb: "0.75rem" }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search vault or asset" />
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {mine.length > 0 && (
          <DataTable
            variant="inset"
            title="Your Deposits"
            columns={posColumns}
            rows={mine}
            getRowId={(v) => `${v.wallet}:${v.vault}`}
            onRowClick={(v) => open(v.vault, "withdraw")}
            defaultSort={{ id: "amount", dir: "desc" }}
          />
        )}
        <DataTable
          variant="inset"
          title="Vaults"
          toolbar={<LabeledSwitch label="Hide small vaults" tip={`Hide vaults under ${compactUsd(MIN_TVL)} TVL`} checked={hideSmall} onChange={setHideSmall} />}
          columns={columns}
          rows={list}
          isLoading={loading}
          emptyDataText="No vaults match your filters"
          emptyMinHeight="12rem"
          getRowId={(r) => r.address}
          onRowClick={(r) => open(r.address)}
          pageSize={15}
          defaultSort={{ id: "tvl", dir: "desc" }}
        />
      </Box>
    </>
  );

  const top = useMemo(() => [...rows].filter((r) => r.tvlUsd >= 25_000 && r.apyPct != null && !r.paused).sort((a, b) => (b.apyPct ?? 0) - (a.apyPct ?? 0)).slice(0, 7), [rows]);

  const side = (
    <TopList
      title="Top Vaults"
      nameLabel="Vaults"
      valueLabel="APY"
      emptyText="Loading vaults…"
      items={top.map((r) => ({
        key: r.address,
        icon: <TokenLogo code={r.assetCode} issuer={issuer(r.asset)} contract={r.asset} size="2.75rem" />,
        title: r.name,
        subtitle: compactUsd(r.tvlUsd),
        badge: { name: vaultProtocol(r.protocol).name, logo: vaultProtocol(r.protocol).logo },
        value: apyText(r),
        onClick: () => open(r.address),
      }))}
    />
  );

  return <EarnGrid tabs={tabs} main={main} side={side} />;
}
