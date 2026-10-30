"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import { PlainCard } from "@/components/common/SectionCard";
import Shimmer from "@/components/common/Shimmer";
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
import { LeverageFields, SLIPPAGE_BPS, useLeverage } from "./leverage";
import { LEND_PROTOCOLS, actionBlock, compactUsd, marketHref, marketStatus, pct, useLendMarkets, useLendPositions, type LendAction, type Market } from "./lendData";

const Layout = styled(Box)({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(0, 1fr) 27rem",
  alignItems: "start",
  marginTop: "0.4rem",
  "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
});

const Main = styled(PlainCard)({ display: "flex", flexDirection: "column", gap: "1.75rem", padding: "1.5rem", minWidth: 0 });

/** A position figure; `after` is what it becomes once the action entered in the form goes through. */
const Figure = ({
  label,
  value,
  sub,
  color,
  after,
  afterColor,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  after?: React.ReactNode;
  /** Defaults to the brand color; red when the result would be unsafe. */
  afterColor?: string;
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 }}>
    <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>{label}</Typography>
    <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
      {value}
    </Typography>
    {after != null && (
      <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: afterColor ?? "primary.main", display: "flex", alignItems: "center", gap: "0.25rem" }} noWrap>
        <Box component="span" aria-label="after">
          →
        </Box>
        {after}
      </Typography>
    )}
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

type XoxnoAccountAsset = {
  sac: string;
  hubId: number;
  amount: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
};

type XoxnoAccount = {
  accountId: string;
  spokeId: number | null;
  spokeName: string | null;
  supplied?: XoxnoAccountAsset[];
  borrow?: XoxnoAccountAsset[];
  availableBorrowUsd: number | null;
  healthFactor: number | null;
};

const xoxnoAssetAmount = (assets: XoxnoAccountAsset[] | undefined, sac: string, hubId: number) =>
  (assets ?? []).reduce((sum, a) => (a.sac === sac && a.hubId === hubId ? sum + Number(a.amount ?? 0) : sum), 0);

export default function LendMarket() {
  const params = useSearchParams();
  const router = useRouter();
  const protocol = params.get("protocol") === "xoxno" ? "xoxno" : "blend";
  const pool = params.get("pool") ?? "";
  const asset = params.get("asset") ?? "";
  const initial = (params.get("mode") as LendAction) || "supply";
  const accountParam = params.get("account");
  const { activeWallet, isConnected, openConnectModal } = useWallet();
  const me = activeWallet?.address ?? null;
  const { markets, loading } = useLendMarkets();
  const m: Market | undefined = markets.find((x) => x.protocol === protocol && x.pool === pool && (x.contract === asset || x.code === asset));
  const positions = useLendPositions(me ? [me] : []);
  const { byAddress, refreshing: balRefreshing } = useBalances(me ? [me] : []);
  // Shimmer, not 0, while the position or wallet balance is first fetched or updating after a transaction.
  const posLoading = !!me && ((positions.loading && positions.legs.length === 0) || positions.refreshing);
  const balLoading = !!me && ((byAddress[me]?.loading ?? true) || balRefreshing);
  const [tab, setTab] = useState<LendAction>(TABS.some((t) => t.id === initial) || initial === "leverage" ? initial : "supply");
  const [amount, setAmount] = useState("");
  const [collateral, setCollateral] = useState(true);
  const [spoke, setSpoke] = useState<number | null>(null);
  const [pickedAccount, setPickedAccount] = useState<string | null>(accountParam);
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
  const lv = useLeverage(m, markets, walletBal, tab === "leverage");
  // Leverage shows only on markets that can be looped; a stale ?mode=leverage link falls back to Supply.
  const tabs: { id: LendAction; label: string }[] = lv.available ? [...TABS, { id: "leverage", label: "Leverage" }] : TABS;
  useEffect(() => {
    if (tab === "leverage" && m && !lv.available) setTab("supply");
  }, [tab, m, lv.available]);
  const marketLegs = positions.legs.filter((l) => l.protocol === protocol && l.pool === pool && l.contract === m?.contract);
  const supplied = marketLegs.reduce((s, l) => s + l.supplied, 0);
  const lent = marketLegs.reduce((s, l) => s + l.lent, 0);
  const borrowed = marketLegs.reduce((s, l) => s + l.borrowed, 0);
  const suppliedUsd = marketLegs.reduce((s, l) => s + l.suppliedUsd, 0);
  const borrowedUsd = marketLegs.reduce((s, l) => s + l.borrowedUsd, 0);
  const poolInfo = me && protocol === "blend" ? positions.pools[me]?.[pool] : undefined;
  const health = protocol === "blend" ? (poolInfo?.healthFactor ?? null) : me ? (positions.xoxnoHealth[me] ?? null) : null;

  // Leverage tab, close mode (Blend): unwind this collateral against one of the pool's debts in one
  // transaction; step-by-step Repay / Withdraw stays available on their tabs.
  const [levMode, setLevMode] = useState<"open" | "close">("open");
  const [closeDebtKey, setCloseDebtKey] = useState<string | null>(null);
  const [closeFrac, setCloseFrac] = useState(1);
  const poolDebts = useMemo(
    () =>
      positions.legs
        .filter((l) => l.protocol === "blend" && l.pool === pool && l.borrowed > 0 && l.contract !== m?.contract)
        .sort((a, b) => b.borrowedUsd - a.borrowedUsd),
    [positions.legs, pool, m?.contract],
  );
  const canClose = protocol === "blend" && supplied > 0 && poolDebts.length > 0;
  const closeDebt = poolDebts.find((d) => d.contract === closeDebtKey) ?? poolDebts[0] ?? null;
  useEffect(() => {
    if (!canClose && levMode === "close") setLevMode("open");
  }, [canClose, levMode]);

  const xoxnoAccts = useShared<{ accounts?: XoxnoAccount[] } | null>(
    me && protocol === "xoxno" ? `xoxno:accounts:${me}` : null,
    () => apiJson(`/api/lending/xoxno/accounts?owner=${me}`, undefined, 120_000),
    120_000,
  );
  const xoxnoHubId = m?.xoxno?.hubId ?? null;
  const xoxnoAccounts = useMemo(() => {
    if (protocol !== "xoxno" || xoxnoHubId == null) return [];
    return (xoxnoAccts.value?.accounts ?? []).filter((a) =>
      [...(a.supplied ?? []), ...(a.borrow ?? [])].some((p) => p.hubId === xoxnoHubId),
    );
  }, [protocol, xoxnoHubId, xoxnoAccts.value]);
  const actionAccounts = useMemo(() => {
    if (!m?.contract || protocol !== "xoxno" || xoxnoHubId == null) return [];
    if (tab === "withdraw")
      return xoxnoAccounts
        .filter((a) => xoxnoAssetAmount(a.supplied, m.contract!, xoxnoHubId) > 0)
        .sort((a, b) => xoxnoAssetAmount(b.supplied, m.contract!, xoxnoHubId) - xoxnoAssetAmount(a.supplied, m.contract!, xoxnoHubId));
    if (tab === "repay")
      return xoxnoAccounts
        .filter((a) => xoxnoAssetAmount(a.borrow, m.contract!, xoxnoHubId) > 0)
        .sort((a, b) => xoxnoAssetAmount(b.borrow, m.contract!, xoxnoHubId) - xoxnoAssetAmount(a.borrow, m.contract!, xoxnoHubId));
    if (tab === "borrow")
      return xoxnoAccounts
        .filter((a) => m.xoxno?.spokes.some((s) => s.spokeId === a.spokeId && s.canBorrow))
        .sort((a, b) => {
          const cap = (x: XoxnoAccount) => {
            const spoke = m.xoxno?.spokes.find((s) => s.spokeId === x.spokeId);
            return Math.min(x.availableBorrowUsd ?? 0, spoke?.borrowCapacity?.usd ?? Infinity);
          };
          return cap(b) - cap(a);
        });
    if (tab === "supply")
      return xoxnoAccounts
        .filter((a) => m.xoxno?.spokes.some((s) => s.spokeId === a.spokeId && s.canSupply))
        .sort((a, b) => xoxnoAssetAmount(b.supplied, m.contract!, xoxnoHubId) - xoxnoAssetAmount(a.supplied, m.contract!, xoxnoHubId));
    return xoxnoAccounts;
  }, [m, protocol, tab, xoxnoHubId, xoxnoAccounts]);
  const account = actionAccounts.find((a) => a.accountId === pickedAccount) ?? actionAccounts[0] ?? null;
  useEffect(() => setPickedAccount(accountParam), [accountParam, m?.key, me]);

  const accountSupplied = account && m?.contract && xoxnoHubId != null ? xoxnoAssetAmount(account.supplied, m.contract, xoxnoHubId) : 0;
  const accountBorrowed = account && m?.contract && xoxnoHubId != null ? xoxnoAssetAmount(account.borrow, m.contract, xoxnoHubId) : 0;
  const accountSpoke = protocol === "xoxno" && account ? m?.xoxno?.spokes.find((s) => s.spokeId === account.spokeId) : undefined;
  const xoxnoBorrowCapUsd =
    account && accountSpoke?.canBorrow
      ? Math.min(account.availableBorrowUsd ?? Infinity, accountSpoke.borrowCapacity?.usd ?? Infinity)
      : null;
  const xoxnoMaxBorrow =
    xoxnoBorrowCapUsd != null && Number.isFinite(xoxnoBorrowCapUsd) && price != null && price > 0
      ? xoxnoBorrowCapUsd / price
      : null;

  const supplySpokes = (m?.xoxno?.spokes ?? []).filter((s) => s.canSupply);
  const spokeId = account?.spokeId ?? spoke ?? supplySpokes[0]?.spokeId ?? null;

  // Exact max borrow for Blend (pool's own math, keeps health >= 1.1).
  const capKey = me && m?.contract && protocol === "blend" && tab === "borrow" ? `borrowcap:${me}:${pool}:${m.contract}` : null;
  const cap = useShared<{ ok?: boolean; amount?: string } | null>(
    capKey,
    () => apiJson(`/api/lending/borrow-capacity?pool=${pool}&account=${me}&asset=${m!.contract}&minHealth=1.1`),
    60_000,
  );
  const maxBorrow =
    protocol === "xoxno"
      ? xoxnoMaxBorrow
      : cap.value?.ok && cap.value.amount && m
        ? Number(cap.value.amount) / 10 ** m.decimals
        : null;

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
  const available =
    tab === "supply"
      ? walletBal
      : tab === "withdraw"
        ? protocol === "xoxno"
          ? accountSupplied
          : supplied
        : tab === "repay"
          ? protocol === "xoxno"
            ? accountBorrowed
            : borrowed
          : maxBorrow;
  const balanceLabel =
    tab === "supply"
      ? "Wallet"
      : tab === "withdraw"
        ? protocol === "xoxno"
          ? "Account supplied"
          : "Supplied"
        : tab === "repay"
          ? protocol === "xoxno"
            ? "Account debt"
            : "Debt"
          : "Can borrow";
  const atMax = available != null && n > 0 && Math.abs(n - available) < 1e-9;

  const capLoading = tab === "borrow" && (protocol === "blend" ? cap.loading || cap.refreshing : posLoading);
  const availLoading = tab === "supply" ? balLoading : tab === "borrow" ? capLoading : posLoading;
  const blocker = (() => {
    if (!isConnected) return "Connect a wallet";
    const b = actionBlock(m, tab);
    if (b) return b;
    if (availLoading) return tab === "supply" ? "Loading your balance…" : tab === "borrow" ? "Loading borrow capacity…" : "Loading your position…";
    if (m.protocol === "xoxno" && tab !== "supply" && !account) {
      if (xoxnoAccts.loading) return "Loading XOXNO accounts…";
      if (tab === "withdraw") return supplied > 0 ? "No XOXNO account with this supply" : "Nothing supplied here";
      if (tab === "repay") return borrowed > 0 ? "No XOXNO account with this debt" : "No debt to repay";
      return "No XOXNO account can borrow this asset";
    }
    if (m.protocol === "xoxno" && tab !== "supply" && account && !accountSpoke) return "This XOXNO account's spoke is unavailable";
    if (tab === "withdraw" && (protocol === "xoxno" ? accountSupplied : supplied) <= 0) return "Nothing supplied here";
    if (tab === "repay" && (protocol === "xoxno" ? accountBorrowed : borrowed) <= 0) return "No debt to repay";
    if (m.protocol === "xoxno" && tab === "supply" && !spokeId) return "No spoke accepts this asset";
    if (!(n > 0)) return "Enter an amount";
    if ((tab === "supply" || tab === "repay") && n > walletBal + 1e-9) return `Insufficient ${m.code} balance`;
    if (tab === "withdraw" && n > (protocol === "xoxno" ? accountSupplied : supplied) + 1e-9) return "More than supplied";
    if (tab === "repay" && n > (protocol === "xoxno" ? accountBorrowed : borrowed) * 1.002 + 1e-9) return "More than your debt";
    if (tab === "borrow" && protocol === "xoxno" && maxBorrow == null) return "Borrow capacity unavailable";
    if (tab === "borrow" && maxBorrow != null && maxBorrow <= 0) return "No borrow capacity";
    if (tab === "borrow" && maxBorrow != null && n > maxBorrow + 1e-9) return "Above your borrow capacity";
    return null;
  })();

  const actions = (): { action: string; asset: string; amount: string }[] => {
    const base = (v: number) => toBase(v.toFixed(m.decimals), m.decimals) ?? "0";
    const amt = toBase(amount, m.decimals) ?? "0";
    if (tab === "supply") return [{ action: m.protocol === "blend" && !collateral ? "lend" : "supply", asset: m.contract!, amount: amt }];
    if (tab === "borrow") return [{ action: "borrow", asset: m.contract!, amount: amt }];
    if (tab === "repay") return [{ action: "repay", asset: m.contract!, amount: atMax ? "max" : amt }];
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

  const submitLeverage = async () => {
    const body = activeWallet ? lv.body(activeWallet.address) : null;
    if (!activeWallet || !body) return;
    const label = `Leverage ${lv.amount} ${m.code} ${lv.lev.toFixed(1)}x with ${lv.debt?.code} · ${LEND_PROTOCOLS[m.protocol].name}`;
    setTx({ open: true, steps: [{ key: "s0", label, status: "building" }], error: null });
    try {
      const r = await runBuilt(lv.path, body, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
      if (!r.unsigned) lv.setAmount("");
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    }
  };
  const levBlocker = !isConnected ? "Connect a wallet" : (actionBlock(m, "leverage") ?? lv.blocker);

  const closing = tab === "leverage" && levMode === "close";
  const closeBlocker = !isConnected
    ? "Connect a wallet"
    : !lv.oneStep
      ? "One-step close isn't live yet: use Repay and Withdraw"
      : m.status != null && m.status >= 2
        ? `Pool is ${m.status >= 4 ? "frozen" : "on ice"}: close with Repay and Withdraw`
        : !closeDebt
          ? "No debt to repay in this pool"
          : null;
  // Estimate: the debt share repaid, the collateral sold for it (oracle + slippage), what comes back.
  const closeRepay = closeDebt ? closeDebt.borrowed * closeFrac : 0;
  const closeRepayUsd = closeDebt ? closeDebt.borrowedUsd * closeFrac : 0;
  const unitUsd = supplied > 0 ? suppliedUsd / supplied : 0;
  const closeSold = unitUsd > 0 ? (closeRepayUsd / unitUsd) * (1 + (SLIPPAGE_BPS + 50) / 10_000) : 0;
  const closeBack = Math.max(0, supplied * closeFrac - closeSold);
  // Debt backed by several collaterals can be more than this one covers: say so before the click.
  const closeShort = closeDebt != null && closeSold > supplied * closeFrac;
  const closeReason =
    closeBlocker ??
    (closeShort ? `This ${m.code} alone can't cover that much ${closeDebt?.code}: close a smaller part, or from your other collateral` : null);
  const closeDetails: DetailRow[] = closeDebt
    ? [
        { label: `${m.code} sold to repay (at most)`, value: `≈ ${formatAmount(closeSold, 4)} ${m.code}` },
        { label: `${m.code} back to your wallet`, value: `≈ ${formatAmount(closeBack, 4)} ${m.code}`, color: "green.main" },
        { label: "Swap slippage", value: pct(SLIPPAGE_BPS / 100, 1) },
        { label: "Transactions", value: "1" },
      ]
    : [];

  const submitClose = async () => {
    if (!activeWallet || !closeDebt || !m.contract) return;
    const label = `Close ${Math.round(closeFrac * 100)}% · ${m.code} / ${closeDebt.code} · Blend`;
    setTx({ open: true, steps: [{ key: "s0", label, status: "building" }], error: null });
    try {
      await runBuilt(
        "/api/lending/blend/leverage/close",
        { from: activeWallet.address, pool: m.pool, collateral: m.contract, debt: closeDebt.contract, fraction: closeFrac, slippageBps: SLIPPAGE_BPS },
        activeWallet,
        (steps) => setTx((t) => ({ ...t, steps })),
      );
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  // "After" values for the My Position card: the position once the action in the form goes through,
  // at oracle prices. Blend health = collateral x c_factor / (debt / l_factor), per pool.
  const opening = tab === "leverage" && !closing && lv.preview != null;
  const levDebt = closing ? closeDebt : tab === "leverage" ? lv.debt : null;
  const debtLegs = levDebt ? positions.legs.filter((l) => l.protocol === protocol && l.pool === pool && l.contract === levDebt.contract) : [];
  const debtHeld = debtLegs.reduce((s, l) => s + l.borrowed, 0);
  const debtHeldUsd = debtLegs.reduce((s, l) => s + l.borrowedUsd, 0);
  const levDebtMarket = levDebt ? markets.find((x) => x.protocol === protocol && x.pool === pool && x.contract === levDebt.contract) : undefined;
  const collateralHeld = Math.max(0, supplied - lent);
  const preview = (() => {
    if (!me || posLoading) return null;
    const p = price ?? m.priceUsd ?? 0;
    if (tab === "supply" && n > 0) return { supply: supplied + n, coll: protocol === "xoxno" || (collateral && m.canCollateral) ? n * p : 0, debt: 0 };
    if (tab === "withdraw" && n > 0) return { supply: Math.max(0, supplied - n), coll: -Math.min(n, collateralHeld) * p, debt: 0 };
    if (tab === "borrow" && n > 0) return { borrowed: borrowed + n, coll: 0, debt: n * p };
    if (tab === "repay" && n > 0) return { borrowed: Math.max(0, borrowed - n), coll: 0, debt: -Math.min(n, borrowed) * p };
    if (opening && lv.preview) return { supply: supplied + lv.preview.added, coll: lv.preview.addedUsd, debt: lv.preview.debtUsd, debtAfter: debtHeld + lv.preview.debtAmount };
    if (closing && closeDebt && !closeShort) {
      const full = closeFrac >= 1;
      return {
        supply: full ? lent : supplied - collateralHeld * closeFrac,
        coll: -collateralHeld * closeFrac * unitUsd,
        debt: -closeRepayUsd,
        debtAfter: full ? 0 : Math.max(0, debtHeld - closeRepay),
      };
    }
    return null;
  })();
  // Health after: Blend from the pool's effective collateral and debt (older API builds: derived
  // from health and capacity); XOXNO only for leverage, which opens a fresh account.
  const healthAfter = (() => {
    if (!preview) return undefined;
    if (protocol === "xoxno") return opening ? (lv.preview?.health ?? undefined) : undefined;
    const h = poolInfo?.healthFactor ?? null;
    const capUsd = poolInfo?.borrowCapacityUsd ?? 0;
    let C = poolInfo?.effCollateralUsd;
    let D = poolInfo?.effDebtUsd;
    if (C == null || D == null) {
      if (!poolInfo) [C, D] = [0, 0];
      else if (h == null) [C, D] = [capUsd, 0];
      else if (h > 1) [C, D] = [(h * capUsd) / (h - 1), capUsd / (h - 1)];
      else return undefined;
    }
    const cF = (m.ltvPct ?? 0) / 100;
    const lF = (tab === "leverage" ? levDebtMarket?.lFactor : m.lFactor) ?? null;
    if (!lF) return undefined;
    const c = C + preview.coll * cF;
    const d = D + preview.debt / lF;
    return d > 1e-6 ? c / d : null;
  })();
  const showDebt = tab === "leverage" && levDebt != null;

  const details: DetailRow[] = [];
  if (tab === "supply" || tab === "withdraw") details.push({ label: "Supply APY", value: pct(m.supplyApy), color: "green.main" });
  if (tab === "borrow" || tab === "repay") details.push({ label: "Borrow APY", value: pct(m.borrowApy), color: "green.main" });
  if (m.ltvPct != null) details.push({ label: "Collateral factor", value: pct(m.ltvPct, 0) });
  if (poolInfo && tab === "borrow") details.push({ label: "Borrow capacity", value: <Shimmer on={posLoading} width="4rem">{formatUsd(poolInfo.borrowCapacityUsd)}</Shimmer> });
  if (m.protocol === "xoxno" && account)
    details.push({ label: "XOXNO account", value: `#${account.accountId}${account.spokeName ? ` · ${account.spokeName}` : ""}` });
  if (m.protocol === "xoxno" && tab === "borrow" && account)
    details.push({ label: "Borrow capacity", value: <Shimmer on={capLoading} width="4rem">{maxBorrow != null ? `${formatAmount(maxBorrow, 4)} ${m.code}` : "—"}</Shimmer> });
  if (tab === "repay")
    details.push({
      label: "Wallet balance",
      value: <Shimmer on={balLoading} width="4rem">{`${formatAmount(walletBal, 4)} ${m.code}`}</Shimmer>,
      color: !balLoading && walletBal + 1e-9 < n ? "error.main" : undefined,
    });

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
            { label: tabs.find((t) => t.id === tab)?.label ?? "" },
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
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "1.25rem" }}>
            <Figure
              label="My Supply"
              value={<Shimmer on={posLoading} width="7rem" height="1.5rem">{`${formatAmount(supplied, 4)} ${m.code}`}</Shimmer>}
              after={preview?.supply != null ? `${opening ? "≈ " : ""}${formatAmount(preview.supply, 4)} ${m.code}` : undefined}
              sub={<Shimmer on={posLoading} width="4rem" height="0.875rem">{price != null ? formatUsd(supplied * price) : formatUsd(suppliedUsd)}</Shimmer>}
            />
            {showDebt && levDebt ? (
              <Figure
                label={`Borrowed ${levDebt.code}`}
                value={<Shimmer on={posLoading} width="7rem" height="1.5rem">{`${formatAmount(debtHeld, 4)} ${levDebt.code}`}</Shimmer>}
                after={preview?.debtAfter != null ? `${formatAmount(preview.debtAfter, 4)} ${levDebt.code}` : undefined}
                sub={<Shimmer on={posLoading} width="4rem" height="0.875rem">{formatUsd(debtHeldUsd)}</Shimmer>}
              />
            ) : (
              <Figure
                label="Borrowed"
                value={<Shimmer on={posLoading} width="7rem" height="1.5rem">{`${formatAmount(borrowed, 4)} ${m.code}`}</Shimmer>}
                after={preview?.borrowed != null ? `${formatAmount(preview.borrowed, 4)} ${m.code}` : undefined}
                sub={<Shimmer on={posLoading} width="4rem" height="0.875rem">{formatUsd(borrowedUsd)}</Shimmer>}
              />
            )}
            <Figure
              label="Health Factor"
              value={<Shimmer on={posLoading} width="3rem" height="1.5rem">{health == null ? "—" : health.toFixed(2)}</Shimmer>}
              color={posLoading ? undefined : healthColor(health)}
              after={healthAfter === undefined ? undefined : healthAfter == null ? "No debt" : `${opening ? "≈ " : ""}${healthAfter.toFixed(2)}`}
              afterColor={healthAfter != null && healthAfter < 1.1 ? "error.main" : undefined}
              sub={protocol === "blend" ? "This pool" : opening ? "New XOXNO account" : "XOXNO account"}
            />
            {opening && lv.preview && (
              <Figure
                label="Net APY (est.)"
                value="—"
                after={lv.preview.netApy != null ? pct(lv.preview.netApy) : "—"}
                afterColor={lv.preview.netApy != null && lv.preview.netApy < 0 ? "error.main" : undefined}
                sub="On the leveraged amount"
              />
            )}
            <Figure
              label="Collateral"
              value={<Shimmer on={posLoading} width="3rem" height="1.5rem">{supplied - lent > 1e-9 || (protocol === "xoxno" && supplied > 0) ? "Yes" : supplied > 0 ? "No (lent only)" : "—"}</Shimmer>}
            />
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
          title={tabs.find((t) => t.id === tab)?.label ?? ""}
          tabs={tabs.map((t) => ({ ...t, blocked: actionBlock(m, t.id) }))}
          active={tab}
          onTab={(id) => {
            setTab(id as LendAction);
            router.replace(marketHref(m, id as LendAction, account?.accountId), { scroll: false });
          }}
          cta={
            isConnected
              ? tab === "leverage"
                ? closing
                  ? closeFrac >= 1
                    ? "Close Position"
                    : `Close ${Math.round(closeFrac * 100)}%`
                  : "Open Leveraged Position"
                : (tabs.find((t) => t.id === tab)?.label ?? "")
              : "Connect wallet"
          }
          blocker={isConnected ? (tab === "leverage" ? (closing ? closeReason : levBlocker) : blocker) : null}
          onSubmit={() => (isConnected ? void (tab === "leverage" ? (closing ? submitClose() : submitLeverage()) : submit()) : void openConnectModal())}
        >
          {tab === "leverage" && canClose && (
            <Box sx={{ display: "flex", gap: "0.375rem", mb: "0.75rem" }}>
              {(["open", "close"] as const).map((mode) => (
                <ButtonBase
                  key={mode}
                  onClick={() => setLevMode(mode)}
                  sx={{
                    flex: 1,
                    height: "2.25rem",
                    borderRadius: "999rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: levMode === mode ? "sidebar.white" : "grey.200",
                    backgroundColor: levMode === mode ? "sidebar.primary" : "overlay.white04",
                  }}
                >
                  {mode === "open" ? "Open / add" : "Close"}
                </ButtonBase>
              ))}
            </Box>
          )}
          {closing ? (
            <>
              {poolDebts.length > 1 && (
                <Box sx={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", mb: "0.75rem" }}>
                  {poolDebts.map((d) => (
                    <ButtonBase
                      key={d.contract}
                      onClick={() => setCloseDebtKey(d.contract)}
                      sx={{
                        height: "2rem",
                        px: "0.75rem",
                        gap: "0.375rem",
                        borderRadius: "999rem",
                        fontSize: "0.8125rem",
                        color: "common.black",
                        backgroundColor: closeDebt?.contract === d.contract ? "surfaceBg.pill" : "overlay.white04",
                      }}
                    >
                      <TokenLogo code={d.code} contract={d.contract} size="1.125rem" />
                      Repay {d.code}
                    </ButtonBase>
                  ))}
                </Box>
              )}
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200", mb: "0.5rem" }}>How much of the position to close</Typography>
              <Box sx={{ display: "flex", gap: "0.375rem", mb: "0.75rem" }}>
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <ButtonBase
                    key={f}
                    onClick={() => setCloseFrac(f)}
                    sx={{
                      flex: 1,
                      height: "2.25rem",
                      borderRadius: "0.75rem",
                      fontSize: "0.875rem",
                      color: closeFrac === f ? "sidebar.white" : "common.black",
                      backgroundColor: closeFrac === f ? "sidebar.primary" : "overlay.white04",
                    }}
                  >
                    {f === 1 ? "All" : `${f * 100}%`}
                  </ButtonBase>
                ))}
              </Box>
              <DetailRows rows={closeDetails} />
              <Typography sx={{ fontSize: "0.75rem", color: "grey.200", mt: "0.5rem" }}>
                Sells part of your {m.code} for {closeDebt?.code ?? "the debt"} with a flash loan, repays it and returns the rest, in one
                transaction. To repay gradually instead, use the Repay and Withdraw tabs.
              </Typography>
            </>
          ) : tab === "leverage" ? (
            <>
              <AmountBox
                label={`Deposit ${m.code}`}
                token={{ code: m.code, issuer: m.issuer, contract: m.contract }}
                amount={lv.amount}
                onAmount={lv.setAmount}
                balance={walletBal}
                balanceLabel="Wallet"
                balanceLoading={balLoading}
                price={m.priceUsd ?? price}
                onMax={walletBal ? () => lv.setAmount(String(Number(walletBal.toFixed(m.decimals)))) : undefined}
              />
              <LeverageFields lv={lv} />
              <DetailRows rows={lv.details} />
            </>
          ) : (
            <>
              <AmountBox
                label={`${TABS.find((t) => t.id === tab)?.label} ${m.code}`}
                token={{ code: m.code, issuer: m.issuer, contract: m.contract }}
                amount={amount}
                onAmount={setAmount}
                balance={available}
                balanceLabel={balanceLabel}
                balanceLoading={isConnected && availLoading}
                price={price}
                onMax={available ? () => setAmount(String(Number(available.toFixed(m.decimals)))) : undefined}
              />
              {protocol === "xoxno" && actionAccounts.length > 1 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>XOXNO account</Typography>
                  <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {actionAccounts.map((a) => (
                      <ButtonBase
                        key={a.accountId}
                        onClick={() => setPickedAccount(a.accountId)}
                        sx={{
                          height: "2.25rem",
                          px: "0.875rem",
                          borderRadius: "999rem",
                          fontSize: "0.8125rem",
                          color: account?.accountId === a.accountId ? "sidebar.white" : "common.black",
                          backgroundColor: account?.accountId === a.accountId ? "sidebar.primary" : "overlay.white08",
                        }}
                      >
                        #{a.accountId}
                        {a.spokeName ? ` · ${a.spokeName}` : ""}
                      </ButtonBase>
                    ))}
                  </Box>
                </Box>
              )}
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
            </>
          )}
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
