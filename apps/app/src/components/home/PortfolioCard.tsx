"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { useRouter } from "next/navigation";
import ConnectWalletButton from "@/components/common/ConnectWalletButton";
import Shimmer from "@/components/common/Shimmer";
import { InsetCard } from "@/components/common/SectionCard";
import { formatUsd } from "@/lib/format";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { usePerformance24h } from "@/portfolio/useSeries";
import { useWallet } from "@/wallet/WalletContext";
import { pctText } from "./marketData";

function Row({ label, value, busy }: { label: string; value: string; busy: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: "0.5rem" }}>
      <Typography variant="subtitle3" color="grey.200">
        {label}
      </Typography>
      <Typography sx={{ fontSize: "0.9375rem", color: "common.black", fontWeight: 500 }} component="div">
        <Shimmer on={busy} width="5rem">
          {value}
        </Shimmer>
      </Typography>
    </Box>
  );
}

function Connected() {
  const router = useRouter();
  const { activePortfolio, portfolioAddresses } = useWallet();
  const p = usePortfolio();
  const perf = usePerformance24h(p.exposures);
  const t = p.totals;
  const loading = p.assetsLoading || p.positionsLoading;
  const totalBusy = (loading && !t.totalUsd) || p.assetsRefreshing || p.positionsRefreshing;
  const perfBusy = ((loading || perf.loading) && !perf.base) || p.assetsRefreshing || p.positionsRefreshing;
  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <Typography variant="subtitle3" color="grey.200">
          {activePortfolio?.name ?? "Portfolio"} · {portfolioAddresses.length} wallet{portfolioAddresses.length === 1 ? "" : "s"}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: "2rem", fontWeight: 600, color: "common.black", lineHeight: 1.1 }} component="div">
            <Shimmer on={totalBusy} width="9rem" height="2.25rem">
              {formatUsd(t.totalUsd)}
            </Shimmer>
          </Typography>
          {!perfBusy && <Chip variant="mini" color={perf.pct >= 0 ? "success" : "error"} label={`${pctText(perf.pct)} 24h`} />}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <Row label="Wallet assets" value={formatUsd(t.assetsUsd)} busy={(p.assetsLoading && !t.assetsUsd) || p.assetsRefreshing} />
        <Row label="Supplied, pools & vaults" value={formatUsd(t.utilisedUsd)} busy={(p.positionsLoading && !t.utilisedUsd) || p.positionsRefreshing} />
        <Row label="Borrowed" value={formatUsd(t.borrowedUsd)} busy={(p.positionsLoading && !t.borrowedUsd) || p.positionsRefreshing} />
        <Row label="Unclaimed rewards" value={formatUsd(t.rewardsUsd)} busy={(p.positionsLoading && !t.rewardsUsd) || p.positionsRefreshing} />
      </Box>
      <Button variant="solid" color="primary" fullWidth onClick={() => router.push("/portfolio")} sx={{ mt: "auto", height: "3rem", textTransform: "none" }}>
        View portfolio
      </Button>
    </>
  );
}

/** Home's portfolio summary: the connected portfolio's totals, or a connect prompt. */
export default function PortfolioCard() {
  const { isConnected } = useWallet();
  return (
    <InsetCard sx={{ height: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>Your portfolio</Typography>
      {isConnected ? (
        <Connected />
      ) : (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: "0.875rem", py: "1rem" }}>
          <Box
            sx={{
              width: "3rem",
              height: "3rem",
              borderRadius: "0.875rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "overlay.white08",
              color: "primary.main",
            }}
          >
            <AccountBalanceWalletOutlinedIcon />
          </Box>
          <Typography sx={{ fontSize: "1.0625rem", fontWeight: 500, color: "common.black" }}>Track your Stellar DeFi</Typography>
          <Typography variant="subtitle3" color="grey.200" sx={{ maxWidth: "20rem" }}>
            Balances, lending, pools, vaults and perps across all your wallets. Non-custodial: you sign every transaction in your
            own wallet.
          </Typography>
          <ConnectWalletButton />
        </Box>
      )}
    </InsetCard>
  );
}
