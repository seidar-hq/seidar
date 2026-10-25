"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import { Area, AreaChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { PlainCard } from "@/components/common/SectionCard";
import TokenLogo from "@/components/common/TokenLogo";
import ActivityTable from "@/components/transactions/ActivityTable";
import { useActivity } from "@/components/transactions/useActivity";
import TxDialog from "@/components/tx/TxDialog";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, toBase, type TxStep } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import ActionCard, { AmountBox, DetailRows, type DetailRow } from "./ActionCard";
import { Breadcrumbs, ContractRow, ProtocolBadge, StatCard } from "./EarnUI";
import { compactUsd, pct } from "./lendData";
import { apyText, useVaultList, vaultProtocol, withdrawalText, type VaultDetailInfo } from "./vaultData";

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

const Figure = ({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 }}>
    <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>{label}</Typography>
    <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
      {value}
    </Typography>
    {sub != null && <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{sub}</Typography>}
  </Box>
);

type Mode = "deposit" | "withdraw";

export default function VaultDetail() {
  const theme = useTheme();
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

  const detail = useShared<{ ok?: boolean; detail?: VaultDetailInfo } | null>(
    vault ? `vaultdetail:${vault.protocol}:${address}` : null,
    () => apiJson(`/api/vaults/detail?protocol=${vault!.protocol}&address=${address}`, undefined, 90_000),
    600_000,
  ).value?.detail;
  const portfolio = usePortfolio(me ? [me] : []);
  const mine = portfolio.vaults.find((v) => v.vault === address);
  const { byAddress } = useBalances(me ? [me] : []);
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
        <Breadcrumbs trail={[{ label: "Earn", href: "/earn" }, { label: "Vaults", href: "/earn/vaults" }, { label: "Vault" }]} />
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
  const yearly = vault.apyPct != null && mine ? (mine.usd * vault.apyPct) / 100 : null;
  const sharePct = mine && vault.tvlUsd > 0 ? (mine.usd / vault.tvlUsd) * 100 : null;
  const history = detail?.history ?? [];

  const blocker = (() => {
    if (!isConnected) return null;
    if (tab === "deposit" && vault.paused) return "Vault paused";
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
  if (detail?.feesBps?.vaultFee != null) details.push({ label: "Performance fee", value: `${(detail.feesBps.vaultFee / 100).toFixed(1)}%` });
  if (mine) details.push({ label: "Your deposit", value: `${formatAmount(deposited, 4)} ${vault.assetCode}` });

  const strategies = detail?.assets?.flatMap((a) => a.strategies ?? []) ?? [];
  const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <Layout>
      <Main>
        <Breadcrumbs
          trail={[
            { label: "Earn", href: "/earn" },
            { label: "Vaults", href: "/earn/vaults" },
            { label: meta.name, href: "/earn/vaults" },
            { label: vault.name },
            { label: tab === "deposit" ? "Deposit" : "Withdraw" },
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
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "1rem" }}>My Position</Typography>
          <Figure label="Deposited" value={`${formatAmount(deposited, 4)} ${vault.assetCode}`} sub={formatUsd(mine?.usd ?? 0)} />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "1.25rem", mt: "1.5rem" }}>
            <Figure label="Wallet Balance" value={`${formatAmount(walletBal, 4)} ${vault.assetCode}`} sub={price != null ? formatUsd(walletBal * price) : undefined} />
            <Figure label="Est. Yearly Earnings" value={yearly != null ? formatUsd(yearly) : "—"} color={yearly ? "green.main" : undefined} />
            <Figure label="Share of Vault" value={sharePct != null ? pct(sharePct, sharePct < 0.01 ? 4 : 2) : "—"} />
            <Figure label="Share Price" value={detail?.sharePrice != null ? detail.sharePrice.toFixed(6) : vault.sharePrice != null ? vault.sharePrice.toFixed(6) : "—"} />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          <StatCard label="TVL" value={compactUsd(vault.tvlUsd)} />
          <StatCard label="APY" value={apyText(vault)} color="green.main" sub={vault.apySource === "advertised" ? "Advertised by the curator" : "Measured on-chain"} />
          <StatCard label="Realized APY (7d)" value={pct(detail?.ownApy7d)} color={detail?.ownApy7d != null ? "green.main" : undefined} />
          <StatCard label="Realized APY (30d)" value={pct(detail?.ownApy30d)} color={detail?.ownApy30d != null ? "green.main" : undefined} />
          <StatCard label="Depositors" value={detail?.depositors != null ? formatAmount(detail.depositors, 0) : "—"} />
          <StatCard label="Withdrawals" value={withdrawalText(vault)} />
        </Box>

        {history.length > 1 && (
          <Inset sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Box>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>Share price</Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Value of one vault share in {vault.assetCode}; it rises as the vault earns.</Typography>
            </Box>
            <Box sx={{ height: "14rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vaultPps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.palette.green.main} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={theme.palette.green.main} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tickFormatter={fmtDay} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={32} />
                  <YAxis orientation="right" domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(4)} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                  <ChartTooltip formatter={(v) => [Number(v).toFixed(6), "Share price"]} labelFormatter={(t) => fmtDay(Number(t))} contentStyle={{ background: "#1F1F1F", border: "1px solid #323232", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="pps" stroke={theme.palette.green.main} strokeWidth={2} fill="url(#vaultPps)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Inset>
        )}

        <Inset sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>About this vault</Typography>
          <Typography sx={{ fontSize: "0.875rem", color: "grey.200", lineHeight: 1.6 }}>{meta.about}</Typography>
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

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "0.5rem" }}>Transactions</Typography>
          <ActivityTable items={vaultActivity} loading={activity.loading && vaultActivity.length === 0} multi={false} />
        </Box>
      </Main>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", position: { lg: "sticky" }, top: { lg: "6.5rem" } }}>
        <ActionCard
          title={tab === "deposit" ? "Deposit" : "Withdraw"}
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
            price={price}
            onMax={available ? () => setAmount(String(Number(available.toFixed(vault.assetDecimals)))) : undefined}
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
