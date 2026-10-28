"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import { PlainCard } from "@/components/common/SectionCard";
import TokenLogo from "@/components/common/TokenLogo";
import ActivityTable from "@/components/transactions/ActivityTable";
import { useActivity } from "@/components/transactions/useActivity";
import TxDialog from "@/components/tx/TxDialog";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, toBase, type TxStep } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import ActionCard, { AmountBox, DetailRows, type DetailRow } from "./ActionCard";
import { Breadcrumbs, ContractRow, ProtocolBadge, StatCard, StatusPill } from "./EarnUI";
import { LEND_PROTOCOLS, actionBlock, compactUsd, marketStatus, pct, useLendMarkets, useLendPositions, type LendAction, type Market } from "./lendData";

const Layout = styled(Box)({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(0, 1fr) 27rem",
  alignItems: "start",
  marginTop: "0.4rem",
  "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
});

const Main = styled(PlainCard)({ display: "flex", flexDirection: "column", gap: "1.75rem", padding: "1.5rem", minWidth: 0 });

const Figure = ({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 }}>
    <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>{label}</Typography>
    <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
      {value}
    </Typography>
    {sub != null && <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{sub}</Typography>}
  </Box>
);

const healthColor = (h: number | null | undefined) => (h == null ? "common.black" : h < 1.1 ? "error.main" : h < 1.5 ? "orange.main" : "green.main");

const TABS: { id: LendAction; label: string }[] = [
  { id: "supply", label: "Supply" },
  { id: "borrow", label: "Borrow" },
  { id: "withdraw", label: "Withdraw" },
  { id: "repay", label: "Repay" },
];

type XoxnoAccount = { accountId: string; spokeId: number; hubId: number };

export default function LendMarket() {
  const params = useSearchParams();
  const router = useRouter();
  const protocol = params.get("protocol") === "xoxno" ? "xoxno" : "blend";
  const pool = params.get("pool") ?? "";
  const asset = params.get("asset") ?? "";
  const initial = (params.get("mode") as LendAction) || "supply";
  const { activeWallet, isConnected, openConnectModal } = useWallet();
  const me = activeWallet?.address ?? null;
  const { markets, loading } = useLendMarkets();
  const m: Market | undefined = markets.find((x) => x.protocol === protocol && x.pool === pool && (x.contract === asset || x.code === asset));
  const positions = useLendPositions(me ? [me] : []);
  const { byAddress } = useBalances(me ? [me] : []);
  const [tab, setTab] = useState<LendAction>(TABS.some((t) => t.id === initial) ? initial : "supply");
  const [amount, setAmount] = useState("");
  const [collateral, setCollateral] = useState(true);
  const [spoke, setSpoke] = useState<number | null>(null);
  const [tx, setTx] = useState<{ open: boolean; steps: TxStep[]; error: string | null }>({ open: false, steps: [], error: null });

  useEffect(() => setAmount(""), [tab]);
  useEffect(() => {
    if (m && !m.canCollateral) setCollateral(false);
  }, [m]);

  const code = m?.code ?? "";
  const priceResp = useShared<{ prices?: Record<string, number | null> } | null>(code ? `prices:${code.toUpperCase()}` : null, () => apiJson(`/api/prices?codes=${encodeURIComponent(code)}`), 300_000);
  const held = me ? byAddress[me]?.tokens.find((t) => t.code === m?.code && (t.issuer ?? null) === (m?.issuer ?? null)) : undefined;
  const price = held?.price ?? m?.priceUsd ?? priceResp.value?.prices?.[code.toUpperCase()] ?? null;
  const walletBal = held?.amount ?? 0;
  const marketLegs = positions.legs.filter((l) => l.protocol === protocol && l.pool === pool && l.contract === m?.contract);
  const supplied = marketLegs.reduce((s, l) => s + l.supplied, 0);
  const lent = marketLegs.reduce((s, l) => s + l.lent, 0);
  const borrowed = marketLegs.reduce((s, l) => s + l.borrowed, 0);
  const suppliedUsd = marketLegs.reduce((s, l) => s + l.suppliedUsd, 0);
  const borrowedUsd = marketLegs.reduce((s, l) => s + l.borrowedUsd, 0);
  const poolInfo = me && protocol === "blend" ? positions.pools[me]?.[pool] : undefined;
  const health = protocol === "blend" ? (poolInfo?.healthFactor ?? null) : me ? (positions.xoxnoHealth[me] ?? null) : null;

  const xoxnoAccts = useShared<{ accounts?: XoxnoAccount[] } | null>(
    me && protocol === "xoxno" ? `xoxno:accounts:${me}` : null,
    () => apiJson(`/api/lending/xoxno/accounts?owner=${me}`, undefined, 120_000),
    120_000,
  );
  const account = xoxnoAccts.value?.accounts?.find((a) => a.hubId === m?.xoxno?.hubId) ?? null;
  const supplySpokes = (m?.xoxno?.spokes ?? []).filter((s) => s.canSupply);
  const spokeId = account?.spokeId ?? spoke ?? supplySpokes[0]?.spokeId ?? null;

  // Exact max borrow for Blend (pool's own math, keeps health >= 1.1).
  const capKey = me && m?.contract && protocol === "blend" && tab === "borrow" ? `borrowcap:${me}:${pool}:${m.contract}` : null;
  const cap = useShared<{ ok?: boolean; amount?: string } | null>(
    capKey,
    () => apiJson(`/api/lending/borrow-capacity?pool=${pool}&account=${me}&asset=${m!.contract}&minHealth=1.1`),
    60_000,
  );
  const maxBorrow = cap.value?.ok && cap.value.amount && m ? Number(cap.value.amount) / 10 ** m.decimals : null;

  const activity = useActivity(me ? [me] : [], "positions");
  const marketActivity = useMemo(
    () =>
      activity.items.filter((i) =>
        protocol === "blend" ? i.counterparty === pool && (!m || i.legs.some((l) => l.code === m.code) || !i.legs.length) : i.protocol === "XOXNO" && (!m || i.legs.some((l) => l.code === m.code)),
      ),
    [activity.items, protocol, pool, m],
  );

  if (!m) {
    return (
      <Main sx={{ mt: "0.4rem" }}>
        <Breadcrumbs trail={[{ label: "Earn", href: "/earn" }, { label: "Lend & Borrow", href: "/earn/lending&borrow" }, { label: "Market" }]} />
        <Typography color="grey.200">{loading ? "Loading market…" : "Market not found. Pick one from Lend & Borrow."}</Typography>
      </Main>
    );
  }

  const meta = LEND_PROTOCOLS[m.protocol];
  const status = marketStatus(m.status);
  const n = Number(amount || 0);
  const available = tab === "supply" ? walletBal : tab === "withdraw" ? supplied : tab === "repay" ? borrowed : maxBorrow;
  const balanceLabel = tab === "supply" ? "Wallet" : tab === "withdraw" ? "Supplied" : tab === "repay" ? "Debt" : "Can borrow";
  const atMax = available != null && n > 0 && Math.abs(n - available) < 1e-9;

  const blocker = (() => {
    if (!isConnected) return "Connect a wallet";
    const b = actionBlock(m, tab);
    if (b) return b;
    if (tab === "withdraw" && supplied <= 0) return "Nothing supplied here";
    if (tab === "repay" && borrowed <= 0) return "No debt to repay";
    if (m.protocol === "xoxno" && tab !== "supply" && !account) return "Supply first to open an XOXNO account";
    if (m.protocol === "xoxno" && tab === "supply" && !spokeId) return "No spoke accepts this asset";
    if (!(n > 0)) return "Enter an amount";
    if ((tab === "supply" || tab === "repay") && n > walletBal + 1e-9) return `Insufficient ${m.code} balance`;
    if (tab === "withdraw" && n > supplied + 1e-9) return "More than supplied";
    if (tab === "repay" && n > borrowed * 1.002 + 1e-9) return "More than your debt";
    if (tab === "borrow" && maxBorrow != null && n > maxBorrow + 1e-9) return "Above your borrow capacity";
    return null;
  })();

  const actions = (): { action: string; asset: string; amount: string }[] => {
    const base = (v: number) => toBase(v.toFixed(m.decimals), m.decimals) ?? "0";
    const amt = toBase(amount, m.decimals) ?? "0";
    if (tab === "supply") return [{ action: m.protocol === "blend" && !collateral ? "lend" : "supply", asset: m.contract!, amount: amt }];
    if (tab === "borrow") return [{ action: "borrow", asset: m.contract!, amount: amt }];
    if (tab === "repay") return [{ action: "repay", asset: m.contract!, amount: atMax && Math.abs(n - borrowed) < 1e-9 ? "max" : amt }];
    // Withdraw: Blend keeps collateral and plain supply apart; take collateral first, then plain supply.
    if (m.protocol === "xoxno") return [{ action: "withdraw", asset: m.contract!, amount: atMax ? "max" : amt }];
    const coll = Math.max(0, supplied - lent);
    if (atMax) return [...(coll > 0 ? [{ action: "withdraw", asset: m.contract!, amount: "max" }] : []), ...(lent > 0 ? [{ action: "unlend", asset: m.contract!, amount: "max" }] : [])];
    if (n <= coll + 1e-12 || lent <= 0) return [{ action: "withdraw", asset: m.contract!, amount: amt }];
    if (coll <= 0) return [{ action: "unlend", asset: m.contract!, amount: amt }];
    return [
      { action: "withdraw", asset: m.contract!, amount: base(coll) },
      { action: "unlend", asset: m.contract!, amount: base(n - coll) },
    ];
  };

  const submit = async () => {
    if (!activeWallet) return;
    const body =
      m.protocol === "blend"
        ? { protocol: "blend", from: activeWallet.address, pool: m.pool, actions: actions() }
        : { protocol: "xoxno", from: activeWallet.address, actions: actions(), xoxno: { hubId: m.xoxno?.hubId, spokeId, accountId: account?.accountId } };
    const label = `${TABS.find((t) => t.id === tab)?.label} ${amount} ${m.code} · ${meta.name} ${m.poolName}`;
    setTx({ open: true, steps: [{ key: "s0", label, status: "building" }], error: null });
    try {
      const r = await runBuilt("/api/lending/build", body, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
      if (!r.unsigned) setAmount("");
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const details: DetailRow[] = [];
  if (tab === "supply" || tab === "withdraw") details.push({ label: "Supply APY", value: pct(m.supplyApy), color: "green.main" });
  if (tab === "borrow" || tab === "repay") details.push({ label: "Borrow APY", value: pct(m.borrowApy), color: "green.main" });
  if (m.ltvPct != null) details.push({ label: "Collateral factor", value: pct(m.ltvPct, 0) });
  if (health != null) details.push({ label: "Health factor", value: health.toFixed(2), color: healthColor(health) });
  if (poolInfo && tab === "borrow") details.push({ label: "Borrow capacity", value: formatUsd(poolInfo.borrowCapacityUsd) });
  if (m.protocol === "xoxno" && account) details.push({ label: "XOXNO account", value: `#${account.accountId}` });
  if (tab === "repay") details.push({ label: "Wallet balance", value: `${formatAmount(walletBal, 4)} ${m.code}`, color: walletBal + 1e-9 < n ? "error.main" : undefined });

  return (
    <Layout>
      <Main>
        <Breadcrumbs
          trail={[
            { label: "Earn", href: "/earn" },
            { label: "Lend & Borrow", href: "/earn/lending&borrow" },
            { label: meta.name, href: "/earn/lending&borrow" },
            { label: m.poolName },
            { label: m.code },
            { label: TABS.find((t) => t.id === tab)?.label ?? "" },
          ]}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.875rem", flexWrap: "wrap" }}>
          <TokenLogo code={m.code} issuer={m.issuer} contract={m.contract} size="3.25rem" />
          <Box>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{m.poolName} pool</Typography>
            <Typography sx={{ fontSize: "1.75rem", fontWeight: 700, color: "common.black", lineHeight: 1.2 }}>{m.code}</Typography>
          </Box>
          <ProtocolBadge name={meta.name} logo={meta.logo} />
          <StatusPill info={status} />
        </Box>

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "1rem" }}>My Position</Typography>
          <Figure
            label="My Supply"
            value={`${formatAmount(supplied, 4)} ${m.code}`}
            sub={price != null ? formatUsd(supplied * price) : formatUsd(suppliedUsd)}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "1.25rem", mt: "1.5rem" }}>
            <Figure label="Wallet Balance" value={`${formatAmount(walletBal, 4)} ${m.code}`} sub={price != null ? formatUsd(walletBal * price) : undefined} />
            <Figure label="Borrowed" value={`${formatAmount(borrowed, 4)} ${m.code}`} sub={formatUsd(borrowedUsd)} />
            <Figure label="Health Factor" value={health == null ? "—" : health.toFixed(2)} color={healthColor(health)} sub={protocol === "blend" ? "This pool" : "XOXNO account"} />
            <Figure label="Collateral" value={supplied - lent > 1e-9 || (protocol === "xoxno" && supplied > 0) ? "Yes" : supplied > 0 ? "No (lent only)" : "—"} />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          <StatCard label="Total Supplied" value={compactUsd(m.suppliedUsd)} />
          <StatCard label="Total Borrowed" value={compactUsd(m.borrowedUsd)} />
          <StatCard label="Available Liquidity" value={compactUsd(m.availableUsd)} />
          <StatCard label="Utilization" value={pct(m.utilPct, 1)} />
          <StatCard label="Supply APY" value={pct(m.supplyApy)} color="green.main" />
          <StatCard label="Borrow APY" value={pct(m.borrowApy)} color="green.main" />
        </Box>

        {status && (
          <Box sx={{ p: "1rem 1.25rem", borderRadius: "1rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
            <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>
              <b>{status.label}.</b> {status.tip}
            </Typography>
          </Box>
        )}

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "0.5rem" }}>Transactions</Typography>
          <ActivityTable items={marketActivity} loading={activity.loading && marketActivity.length === 0} multi={false} />
        </Box>
      </Main>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", position: { lg: "sticky" }, top: { lg: "6.5rem" } }}>
        <ActionCard
          title={TABS.find((t) => t.id === tab)?.label ?? ""}
          tabs={TABS.map((t) => ({ ...t, blocked: actionBlock(m, t.id) }))}
          active={tab}
          onTab={(id) => {
            setTab(id as LendAction);
            router.replace(`/earn/lending&borrow/view?protocol=${protocol}&pool=${encodeURIComponent(pool)}&asset=${encodeURIComponent(asset)}&mode=${id}`, { scroll: false });
          }}
          cta={isConnected ? (TABS.find((t) => t.id === tab)?.label ?? "") : "Connect wallet"}
          blocker={isConnected ? blocker : null}
          onSubmit={() => (isConnected ? void submit() : void openConnectModal())}
        >
          <AmountBox
            label={`${TABS.find((t) => t.id === tab)?.label} ${m.code}`}
            token={{ code: m.code, issuer: m.issuer, contract: m.contract }}
            amount={amount}
            onAmount={setAmount}
            balance={available}
            balanceLabel={balanceLabel}
            price={price}
            onMax={available ? () => setAmount(String(Number(available.toFixed(m.decimals)))) : undefined}
          />
          {tab === "supply" && m.protocol === "blend" && (
            <ButtonBase
              disabled={!m.canCollateral}
              onClick={() => setCollateral((c) => !c)}
              sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", p: "0.75rem 1rem", borderRadius: "0.875rem", backgroundColor: "overlay.white04", textAlign: "left" }}
            >
              <Box>
                <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>Use as collateral</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
                  {m.canCollateral ? (collateral ? "Counts toward your borrow limit" : "Earns interest only, can't be liquidated") : "This asset can't be collateral here"}
                </Typography>
              </Box>
              <Box sx={{ width: "2.5rem", height: "1.375rem", borderRadius: "999rem", p: "0.1875rem", backgroundColor: collateral ? "primary.main" : "overlay.white20", transition: "background-color 150ms" }}>
                <Box sx={{ width: "1rem", height: "1rem", borderRadius: "50%", backgroundColor: "common.white", transform: collateral ? "translateX(1.125rem)" : "none", transition: "transform 150ms" }} />
              </Box>
            </ButtonBase>
          )}
          {tab === "supply" && m.protocol === "xoxno" && !account && supplySpokes.length > 1 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>XOXNO spoke (risk profile for your new account)</Typography>
              <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {supplySpokes.map((s) => (
                  <ButtonBase
                    key={s.spokeId}
                    onClick={() => setSpoke(s.spokeId)}
                    sx={{
                      height: "2.25rem",
                      px: "0.875rem",
                      borderRadius: "999rem",
                      fontSize: "0.8125rem",
                      color: spokeId === s.spokeId ? "sidebar.white" : "common.black",
                      backgroundColor: spokeId === s.spokeId ? "sidebar.primary" : "overlay.white08",
                    }}
                  >
                    {s.spokeName} · LTV {(s.ltvBps / 100).toFixed(0)}%
                  </ButtonBase>
                ))}
              </Box>
            </Box>
          )}
          <DetailRows rows={details} />
        </ActionCard>

        <Box sx={{ borderRadius: "1.25rem", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, backgroundColor: "surfaceBg.section", p: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Stellar Network</Typography>
          {m.contract && <ContractRow icon={<TokenLogo code={m.code} issuer={m.issuer} contract={m.contract} size="1.5rem" />} label={m.code} address={m.contract} />}
          {m.protocol === "blend" && <ContractRow icon={<Box component="img" src={meta.logo} sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />} label={`${m.poolName} pool`} address={m.pool} />}
          {m.protocol === "xoxno" && (
            <ContractRow icon={<Box component="img" src={meta.logo} sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />} label="XOXNO controller" address="CAUCMIN5KSXEVZ7NMXR3LZATGD5EFIEUI5XWTFLYRO2R5OTXI22WE5JX" />
          )}
        </Box>
      </Box>
      <TxDialog open={tx.open} title={`${meta.name} · ${m.code}`} steps={tx.steps} error={tx.error} onClose={() => setTx((t) => ({ ...t, open: false }))} />
    </Layout>
  );
}
