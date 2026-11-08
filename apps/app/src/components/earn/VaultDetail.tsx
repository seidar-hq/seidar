"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import ZoomChart from "@/components/common/ZoomChart";
import { PlainCard } from "@/components/common/SectionCard";
import Shimmer from "@/components/common/Shimmer";
import TokenLogo from "@/components/common/TokenLogo";
import ActivityTable from "@/components/transactions/ActivityTable";
import { useActivity } from "@/components/transactions/useActivity";
import TxDialog from "@/components/tx/TxDialog";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd, floorAmount } from "@/lib/format";
import { runBuilt, toBase, type TxStep } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import ActionCard, { AmountBox, DetailRows, type DetailRow } from "./ActionCard";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import DateRangeOutlinedIcon from "@mui/icons-material/DateRangeOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PercentRoundedIcon from "@mui/icons-material/PercentRounded";
import PieChartOutlineRoundedIcon from "@mui/icons-material/PieChartOutlineRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import { Breadcrumbs, ContractRow, IconLabel, pinnedColumn, ProtocolBadge, StatCard, usePinnedColumn } from "./EarnUI";
import { compactUsd, pct } from "./lendData";
import { apyText, useVaultList, vaultProtocol, withdrawalText, type VaultDetailInfo } from "./vaultData";
import VaultProjection from "./VaultProjection";

const Layout = styled(Box)({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(0, 1fr) 27rem",
  alignItems: "start",
  marginTop: "0.4rem",
  "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
});
const Main = styled(PlainCard)({ display: "flex", flexDirection: "column", gap: "1.75rem", padding: "1.5rem", minWidth: 0 });
const Inset = styled(Box)(({ theme }) => ({ borderRadius: "1rem", backgroundColor: theme.palette.grey[400], border: `0.0625rem solid ${theme.palette.overlay.white08}`, padding: "1.25rem" }));

const SectionTitle = ({ icon, children, mb }: { icon?: React.ReactNode; children: React.ReactNode; mb?: string }) => (
  <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb, "& svg": { color: "grey.200", fontSize: "1.25rem !important" } }}>
    {icon ? <IconLabel icon={icon}>{children}</IconLabel> : children}
  </Typography>
);

const Figure = ({ label, icon, value, sub, color }: { label: string; icon: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; color?: string }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 }}>
    <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>
      <IconLabel icon={icon}>{label}</IconLabel>
    </Typography>
    <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
      {value}
    </Typography>
    {sub != null && <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{sub}</Typography>}
  </Box>
);

type Mode = "deposit" | "withdraw";

export default function VaultDetail() {
  const theme = useTheme();
  const pinnedColumnProps = usePinnedColumn();
  const params = useSearchParams();
  const router = useRouter();
  const address = params.get("address") ?? "";
  const { activeWallet, isConnected, openConnectModal } = useWallet();
  const me = activeWallet?.address ?? null;
  const { rows, loading } = useVaultList();
  const { byContract } = useTokenCatalogue();
  const vault = rows.find((r) => r.address === address);
  const [tab, setTab] = useState<Mode>(params.get("mode") === "withdraw" ? "withdraw" : "deposit");
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<{ open: boolean; steps: TxStep[]; error: string | null }>({ open: false, steps: [], error: null });
  useEffect(() => setAmount(""), [tab]);

  const detailResp = useShared<{ ok?: boolean; detail?: VaultDetailInfo } | null>(
    vault ? `vaultdetail:${vault.protocol}:${address}` : null,
    () => apiJson(`/api/vaults/detail?protocol=${vault!.protocol}&address=${address}`, undefined, 90_000),
    600_000,
  );
  const detail = detailResp.value?.detail;
  const detailLoading = detailResp.loading && !detail;
  const portfolio = usePortfolio(me ? [me] : []);
  const mine = portfolio.vaults.find((v) => v.vault === address);
  const { byAddress, refreshing: balRefreshing } = useBalances(me ? [me] : []);
  // Shimmer, not 0, while the position or wallet balance is first fetched or updating after a transaction.
  const posLoading = !!me && ((portfolio.vaultsLoading && !mine) || portfolio.vaultsRefreshing);
  const balLoading = !!me && ((byAddress[me]?.loading ?? true) || balRefreshing);
  const issuer = vault ? (byContract.get(vault.asset)?.issuer ?? null) : null;
  const held = me && vault ? byAddress[me]?.tokens.find((t) => t.code === vault.assetCode && (t.issuer ?? null) === issuer) : undefined;
  const priceResp = useShared<{ prices?: Record<string, number | null> } | null>(
    vault ? `prices:${vault.assetCode.toUpperCase()}` : null,
    () => apiJson(`/api/prices?codes=${vault!.assetCode}`),
    300_000,
  );
  const price = held?.price ?? (vault ? priceResp.value?.prices?.[vault.assetCode.toUpperCase()] : null) ?? null;
  const activity = useActivity(me ? [me] : [], "positions");
  const vaultActivity = useMemo(() => activity.items.filter((i) => i.counterparty === address), [activity.items, address]);

  if (!vault) {
    return (
      <Main sx={{ mt: "0.4rem" }}>
        <Breadcrumbs backTo="/earn/vaults" trail={[{ label: "Earn", href: "/earn" }, { label: "Vaults", href: "/earn/vaults" }, { label: "Vault" }]} />
        <Typography color="grey.200">{loading ? "Loading vault…" : "Vault not found. Pick one from Vaults."}</Typography>
      </Main>
    );
  }

  const meta = vaultProtocol(vault.protocol);
  const deposited = mine?.underlying[0]?.amount ?? 0;
  const walletBal = held?.amount ?? 0;
  const n = Number(amount || 0);
  const available = tab === "deposit" ? walletBal : deposited;
  const atMax = n > 0 && Math.abs(n - available) < 1e-9;
  // No deposit is a real zero; "—" only when it can't be worked out (a vault with no APY).
  const yearly = vault.apyPct != null ? ((mine?.usd ?? 0) * vault.apyPct) / 100 : null;
  const sharePct = vault.tvlUsd > 0 ? ((mine?.usd ?? 0) / vault.tvlUsd) * 100 : 0;
  const history = detail?.history ?? [];
  // "N/A": the figure doesn't exist for this vault. "—": it should, but couldn't be read just now.
  const flatShares = detail?.rewardsPaidSeparately === true;
  // Upshift's vaultFee is its platform fee and performanceFee is separate; DeFindex only has vaultFee.
  const perfFeeBps = detail?.feesBps?.performanceFee ?? detail?.feesBps?.vaultFee;

  const blocker = (() => {
    if (!isConnected) return null;
    if (tab === "deposit" && vault.paused) return "Vault paused";
    if (tab === "withdraw" && posLoading) return "Loading your position…";
    if (tab === "deposit" && balLoading) return "Loading your balance…";
    if (tab === "withdraw" && deposited <= 0) return "Nothing deposited";
    if (!(n > 0)) return "Enter an amount";
    if (tab === "deposit" && n > walletBal + 1e-9) return `Insufficient ${vault.assetCode} balance`;
    if (tab === "withdraw" && n > deposited + 1e-9) return "More than deposited";
    return null;
  })();

  const submit = async () => {
    if (!activeWallet) return;
    const base = { protocol: vault.protocol, vault: vault.address, caller: activeWallet.address, slippageBps: 50 };
    const body =
      tab === "withdraw" && atMax
        ? vault.protocol === "sentora"
          ? { ...base, action: "withdraw", shares: "max" }
          : { ...base, action: "withdraw-shares", shares: mine?.shares ?? "0" }
        : { ...base, action: tab, amounts: [toBase(amount, vault.assetDecimals) ?? "0"] };
    const label = `${tab === "deposit" ? "Deposit" : "Withdraw"} ${atMax && tab === "withdraw" ? "all" : amount} ${vault.assetCode} · ${vault.name}`;
    setTx({ open: true, steps: [{ key: "s0", label, status: "building" }], error: null });
    try {
      const r = await runBuilt("/api/vaults/build", body, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
      if (!r.unsigned) setAmount("");
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const details: DetailRow[] = [
    { label: "APY", value: apyText(vault), color: "green.main" },
    { label: "Withdrawals", value: withdrawalText(vault) },
  ];
  if (tab === "deposit" && n > 0 && vault.apyPct != null && price != null) details.push({ label: "Est. yearly earnings", value: formatUsd((n * price * vault.apyPct) / 100) });
  if (perfFeeBps != null) details.push({ label: "Performance fee", value: `${(perfFeeBps / 100).toFixed(1)}%` });
  if (mine || posLoading)
    details.push({ label: "Your deposit", value: <Shimmer on={posLoading} width="4.5rem">{`${formatAmount(deposited, 4)} ${vault.assetCode}`}</Shimmer> });

  const strategies = detail?.assets?.flatMap((a) => a.strategies ?? []) ?? [];

  return (
    <Layout>
      <Main>
        <Breadcrumbs
          backTo="/earn/vaults"
          trail={[
            { label: "Earn", href: "/earn" },
            { label: "Vaults", href: "/earn/vaults" },
            { label: meta.name, href: "/earn/vaults" },
            { label: vault.name },
          ]}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.875rem", flexWrap: "wrap" }}>
          <TokenLogo code={vault.assetCode} issuer={issuer} contract={vault.asset} size="3.25rem" />
          <Box>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{vault.curator && vault.curator !== meta.name ? `Curated by ${vault.curator}` : `${vault.assetCode} vault`}</Typography>
            <Typography sx={{ fontSize: "1.75rem", fontWeight: 700, color: "common.black", lineHeight: 1.2 }}>{vault.name}</Typography>
          </Box>
          <ProtocolBadge name={meta.name} logo={meta.logo} />
          {vault.paused && <ProtocolBadge name="Paused" />}
        </Box>

        <Box>
          <SectionTitle mb="1rem">My Position</SectionTitle>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "1.25rem" }}>
            <Figure
              label="Deposited"
              icon={<AccountBalanceWalletOutlinedIcon />}
              value={<Shimmer on={posLoading} width="7rem" height="1.5rem">{`${formatAmount(deposited, 4)} ${vault.assetCode}`}</Shimmer>}
              sub={<Shimmer on={posLoading} width="4rem" height="0.875rem">{formatUsd(mine?.usd ?? 0)}</Shimmer>}
            />
            <Figure
              label="Est. Yearly Earnings"
              icon={<PaymentsOutlinedIcon />}
              value={<Shimmer on={posLoading} width="5rem" height="1.5rem">{yearly != null ? formatUsd(yearly) : "—"}</Shimmer>}
              color={yearly && !posLoading ? "green.main" : undefined}
            />
            <Figure label="Share of Vault" icon={<PieChartOutlineRoundedIcon />} value={<Shimmer on={posLoading} width="4rem" height="1.5rem">{pct(sharePct, sharePct > 0 && sharePct < 0.01 ? 4 : 2)}</Shimmer>} />
            <Figure
              label="Share Price"
              icon={<SellOutlinedIcon />}
              value={
                <Shimmer on={detailLoading && vault.sharePrice == null} width="5.5rem" height="1.5rem">
                  {detail?.sharePrice != null ? detail.sharePrice.toFixed(6) : vault.sharePrice != null ? vault.sharePrice.toFixed(6) : "—"}
                </Shimmer>
              }
            />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          <StatCard label="TVL" icon={<LockOutlinedIcon />} value={compactUsd(vault.tvlUsd)} />
          <StatCard label="APY" icon={<PercentRoundedIcon />} value={apyText(vault)} color="green.main" sub={vault.apySource === "advertised" ? "Advertised by the curator" : "Measured on-chain"} />
          <StatCard label="Realized APY (7d)" icon={<DateRangeOutlinedIcon />} value={<Shimmer on={detailLoading} width="4rem" height="1.5rem">{flatShares ? "N/A" : pct(detail?.ownApy7d)}</Shimmer>} color={detail?.ownApy7d != null ? "green.main" : undefined} />
          <StatCard label="Realized APY (30d)" icon={<CalendarMonthOutlinedIcon />} value={<Shimmer on={detailLoading} width="4rem" height="1.5rem">{flatShares ? "N/A" : pct(detail?.ownApy30d)}</Shimmer>} color={detail?.ownApy30d != null ? "green.main" : undefined} />
          <StatCard label="Depositors" icon={<GroupOutlinedIcon />} value={<Shimmer on={detailLoading} width="3rem" height="1.5rem">{detail?.depositors != null ? formatAmount(detail.depositors, 0) : "—"}</Shimmer>} />
          <StatCard label="Withdrawals" icon={<ScheduleRoundedIcon />} value={withdrawalText(vault)} />
        </Box>

        {history.length > 1 && (
          <Inset sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Box>
              <SectionTitle icon={<SellOutlinedIcon />}>Share price</SectionTitle>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Value of one vault share in {vault.assetCode}; it rises as the vault earns.</Typography>
            </Box>
            <Box sx={{ height: "14rem" }}>
              <ZoomChart
                height="100%"
                format={(v) => v.toFixed(6)}
                fitKey="pps"
                series={[{ id: "pps", label: "Share price", color: theme.palette.green.main, points: history.map((p) => ({ t: p.t, v: p.pps })) }]}
              />
            </Box>
          </Inset>
        )}
        {flatShares && (
          <Inset sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <SectionTitle icon={<SellOutlinedIcon />}>Share price</SectionTitle>
            <Typography sx={{ fontSize: "0.875rem", color: "grey.200", lineHeight: 1.6 }}>Rewards are paid separately, so the share price stays at 1.</Typography>
          </Inset>
        )}

        <Inset sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <SectionTitle icon={<AccountTreeOutlinedIcon />}>About this vault</SectionTitle>
          <Typography sx={{ fontSize: "0.875rem", color: "grey.200", lineHeight: 1.6 }}>{meta.about}</Typography>
          {perfFeeBps != null && <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>Performance fee: {(perfFeeBps / 100).toFixed(1)}%</Typography>}
          {strategies.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", mt: "0.25rem" }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>Strategies</Typography>
              {strategies.map((s) => (
                <Box key={s.address} sx={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>{s.name.replace(/_/g, " ")}</Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: s.paused ? "orange.main" : "green.main" }}>{s.paused ? "Paused" : "Active"}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Inset>

        {vault.apyPct != null && vault.apyPct > 0 && (
          <Inset sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <SectionTitle icon={<CalculateOutlinedIcon />}>Projection</SectionTitle>
            <VaultProjection apyPct={vault.apyPct} startUsd={mine?.usd} />
          </Inset>
        )}

        <Box>
          <SectionTitle icon={<ReceiptLongOutlinedIcon />} mb="0.5rem">Transactions</SectionTitle>
          <ActivityTable items={vaultActivity} loading={activity.loading && vaultActivity.length === 0} multi={false} />
        </Box>
      </Main>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", ...pinnedColumn }} {...pinnedColumnProps}>
        <ActionCard
          tabs={[
            { id: "deposit", label: "Deposit", blocked: vault.paused ? "Vault paused" : null },
            { id: "withdraw", label: "Withdraw" },
          ]}
          active={tab}
          onTab={(id) => {
            setTab(id as Mode);
            router.replace(`/earn/vaults/view?address=${address}&mode=${id}`, { scroll: false });
          }}
          cta={isConnected ? (tab === "deposit" ? "Deposit" : "Withdraw") : "Connect wallet"}
          blocker={isConnected ? blocker : null}
          onSubmit={() => (isConnected ? void submit() : void openConnectModal())}
        >
          <AmountBox
            label={`${tab === "deposit" ? "Deposit" : "Withdraw"} ${vault.assetCode}`}
            token={{ code: vault.assetCode, issuer, contract: vault.asset }}
            amount={amount}
            onAmount={setAmount}
            balance={isConnected ? available : null}
            balanceLabel={tab === "deposit" ? "Wallet" : "Deposited"}
            balanceLoading={isConnected && (tab === "deposit" ? balLoading : posLoading)}
            price={price}
            onMax={available ? () => setAmount(floorAmount(available, vault.assetDecimals)) : undefined}
          />
          <DetailRows rows={details} />
        </ActionCard>
        <Box sx={{ borderRadius: "1.25rem", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, backgroundColor: "surfaceBg.section", p: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Stellar Network</Typography>
          <ContractRow icon={<Box component="img" src={meta.logo} sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />} label="Vault" address={vault.address} />
          <ContractRow icon={<TokenLogo code={vault.assetCode} issuer={issuer} contract={vault.asset} size="1.5rem" />} label={vault.assetCode} address={vault.asset} />
          {detail?.manager && <ContractRow label="Manager" address={detail.manager} />}
        </Box>
      </Box>
      <TxDialog open={tx.open} title={`${meta.name} · ${vault.name}`} steps={tx.steps} error={tx.error} onClose={() => setTx((t) => ({ ...t, open: false }))} />
    </Layout>
  );
}
