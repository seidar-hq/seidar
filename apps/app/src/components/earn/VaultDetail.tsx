"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { KpiCard } from "@/components/common/SectionCard";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useWallet } from "@/wallet/WalletContext";
import { SideCard } from "./EarnParts";
import VaultDialog from "./VaultDialog";
import { VAULT_PROTOCOLS, apyText, useVaultList, type VaultListRow } from "./Vaults";

const Card = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.surfaceBg.section,
  borderRadius: "1.5rem",
  padding: "1.25rem",
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
}));

const ABOUT: Record<string, string> = {
  defindex:
    "DeFindex vaults pool deposits and allocate them across Stellar yield strategies (lending markets, liquidity). You hold vault shares; their value grows as the strategies earn.",
  upshift:
    "Upshift vaults are institutionally curated: the curator allocates deposits across Stellar lending protocols (Blend, Templar and others). Withdrawals may go through a request queue.",
  sentora:
    "Sentora (formerly IntoTheBlock) runs incentivized deposit vaults through Stellar DeFi Hub. Your principal stays in the vault contract and can be withdrawn at any time; the quoted APY is paid as rewards by the curator.",
};

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <KpiCard size={{ xs: 6, md: 3 }} sx={{ height: "auto", minHeight: "6.5rem" }}>
      <Typography variant="subtitle3" color="grey.200">
        {label}
      </Typography>
      <Typography variant="body4" color={tone ?? "common.black"}>
        {value}
      </Typography>
    </KpiCard>
  );
}

function Detail({ address }: { address: string }) {
  const router = useRouter();
  const { isConnected, openConnectModal } = useWallet();
  const { rows, loading } = useVaultList();
  const { byContract } = useTokenCatalogue();
  const portfolio = usePortfolio();
  const [dialog, setDialog] = useState<"deposit" | "withdraw" | null>(null);
  const vault: VaultListRow | undefined = rows.find((r) => r.address === address);
  const mine = portfolio.vaults.filter((v) => v.vault === address);

  if (!vault)
    return (
      <Card>
        {loading ? <Skeleton variant="rounded" height="12rem" /> : <Typography color="grey.200">Vault not found.</Typography>}
      </Card>
    );

  const issuer = byContract.get(vault.asset)?.issuer ?? null;
  const protocol = VAULT_PROTOCOLS[vault.protocol] ?? vault.protocol;
  const myUsd = mine.reduce((s, v) => s + v.usd, 0);
  const myAmount = mine.reduce((s, v) => s + (v.underlying[0]?.amount ?? 0), 0);
  const yearly = vault.apyPct != null ? (myUsd * vault.apyPct) / 100 : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", mt: "0.5rem" }}>
      <ButtonBase onClick={() => router.push("/earn/vaults")} sx={{ alignSelf: "flex-start", gap: "0.375rem", color: "grey.200", borderRadius: "999rem", px: "0.5rem", py: "0.25rem" }}>
        <ArrowBackRoundedIcon sx={{ fontSize: "1.125rem" }} />
        <Typography variant="subtitle1">All vaults</Typography>
      </ButtonBase>

      <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0,1fr) 28.5625rem", alignItems: "start", "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0,1fr)" } }}>
        <Card>
          <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <TokenLogo code={vault.assetCode} issuer={issuer} size="3.25rem" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" color="common.black">
                {vault.name}
              </Typography>
              <Typography variant="subtitle1" color="grey.200">
                {protocol}
                {vault.curator ? ` · curated by ${vault.curator}` : ""} · {vault.assetCode}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="solid" color="primary" disabled={vault.paused} onClick={() => (isConnected ? setDialog("deposit") : void openConnectModal())}>
                Deposit
              </Button>
              <Button variant="outlined" color="cancel" disabled={!mine.length} onClick={() => setDialog("withdraw")}>
                Withdraw
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: "1rem" }}>
            <Stat label={vault.apySource === "advertised" ? "APY (advertised)" : "APY (7d measured)"} value={apyText(vault)} tone="green.main" />
            <Stat label="Total value locked" value={formatUsd(vault.tvlUsd)} />
            <Stat label="Withdrawals" value={vault.withdrawalDays ? `${vault.withdrawalDays}-day queue` : "Instant"} />
            <Stat label="Status" value={vault.paused ? "Paused" : "Open"} tone={vault.paused ? "error.main" : undefined} />
          </Box>

          <Box>
            <Typography variant="subtitle2" color="common.black" sx={{ mb: "0.5rem" }}>
              About this vault
            </Typography>
            <Typography variant="body3">{ABOUT[vault.protocol] ?? "Vault on Stellar."}</Typography>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Typography variant="subtitle2" color="common.black">
              Contracts
            </Typography>
            {[
              { label: "Vault", id: vault.address },
              { label: `${vault.assetCode} token`, id: vault.asset },
            ].map((c) => (
              <Box key={c.id} sx={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <Typography variant="subtitle3" color="grey.200">
                  {c.label}
                </Typography>
                <Link href={`https://stellar.expert/explorer/public/contract/${c.id}`} target="_blank" rel="noopener" variant="subtitle3" sx={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  {shortAddress(c.id, 6, 6)}
                  <OpenInNewRoundedIcon sx={{ fontSize: "0.875rem" }} />
                </Link>
              </Box>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" color="common.black" sx={{ mb: "0.5rem" }}>
              Risks
            </Typography>
            <Typography variant="body3">
              Vaults carry smart-contract risk and the risks of the protocols they allocate to. Advertised rates can change at any time and are not guaranteed.
            </Typography>
          </Box>
        </Card>

        <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SideCard title="Your position" icon="/assets/topPools.svg">
            {!isConnected ? (
              <Button variant="solid" color="primary" onClick={() => void openConnectModal()}>
                Connect wallet
              </Button>
            ) : portfolio.vaultsLoading ? (
              <Skeleton variant="rounded" height="5rem" />
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {[
                  { label: "Deposited", value: `${formatAmount(myAmount, 6)} ${vault.assetCode}` },
                  { label: "Value", value: formatUsd(myUsd) },
                  { label: "Est. yearly earnings", value: yearly != null ? formatUsd(yearly) : "—" },
                ].map((r) => (
                  <Box key={r.label} sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="subtitle3" color="grey.200">
                      {r.label}
                    </Typography>
                    <Typography variant="subtitle1" color="common.black">
                      {r.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </SideCard>
        </Box>
      </Box>
      {dialog && <VaultDialog vault={vault} initial={dialog} onClose={() => setDialog(null)} />}
    </Box>
  );
}

function DetailFromQuery() {
  const params = useSearchParams();
  return <Detail address={params.get("address") ?? ""} />;
}

export default function VaultDetail() {
  return (
    <Suspense fallback={null}>
      <DetailFromQuery />
    </Suspense>
  );
}
