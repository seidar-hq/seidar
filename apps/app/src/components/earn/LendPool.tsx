"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import { styled } from "@mui/material/styles";
import DataTable, { type Column } from "@/components/common/DataTable";
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
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import ActionCard, { AmountBox, DetailRows, sheetOnly, type DetailRow } from "./ActionCard";
import { AssetStack, Breadcrumbs, MarketLogo, ContractRow, pinnedColumn, ProtocolBadge, StatCard, StatusPill, usePinnedColumn } from "./EarnUI";
import { Chip, LeverageFields, SLIPPAGE_BPS, SpokeLtv, canLeverage, leverageSpokes, useLeverage, type LevSide } from "./leverage";
import {
  LEND_PROTOCOLS,
  actionBlock,
  blndApr,
  compactUsd,
  groupPools,
  marketStatus,
  pct,
  poolHref,
  useBlndPrice,
  useLendMarkets,
  useLendPositions,
  type LendAction,
  type Market,
  type UserLeg,
} from "./lendData";

// One lending pool (a Blend pool or an XOXNO hub): the whole position in it (balance, net APY,
// health, borrow power, liquidation price, with "after" values for the action being typed), its
// rewards, every asset it lists, and one action card where the asset is picked inside the form.

const Layout = styled(Box)({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(0, 1fr) 27rem",
  alignItems: "start",
  marginTop: "0.4rem",
  "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
});

const Main = styled(PlainCard)({ display: "flex", flexDirection: "column", gap: "1.75rem", padding: "1.5rem", minWidth: 0 });

const Panel = styled(Box)(({ theme }) => ({
  borderRadius: "1.25rem",
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  backgroundColor: theme.palette.grey[400],
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  minWidth: 0,
}));

/** The Borrow tab's max keeps health at or above this (Blend liquidates below 1.0). */
const SAFE_HEALTH = 1.1;

/** XLM kept back from "max" for network fees. */
const XLM_FEE_BUFFER = 0.1;

const TABS: { id: LendAction; label: string }[] = [
  { id: "supply", label: "Supply" },
  { id: "borrow", label: "Borrow" },
  { id: "withdraw", label: "Withdraw" },
  { id: "repay", label: "Repay" },
];

const healthColor = (h: number | null | undefined) => (h == null ? "common.black" : h < 1.1 ? "error.main" : h < 1.5 ? "orange.main" : "green.main");

const SEG_COLORS = ["#5C84FF", "#4FD1A5", "#F5B14C", "#B57BFF", "#FF7A90", "#56C8E8", "#9BD15B", "#E8E8EA"];
const segColor = (code: string) => {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SEG_COLORS[h % SEG_COLORS.length];
};

const Tip = ({ text }: { text: string }) => (
  <Tooltip title={text} arrow placement="top">
    <InfoOutlinedIcon sx={{ fontSize: "0.875rem", color: "grey.200", cursor: "help", verticalAlign: "-0.125rem", ml: "0.25rem" }} />
  </Tooltip>
);

/** A position figure; `after` is what it becomes once the action typed in the form goes through. */
function Figure({
  label,
  tip,
  value,
  sub,
  color,
  after,
  afterColor,
  inline,
  boxed,
}: {
  label: string;
  tip?: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  after?: React.ReactNode;
  afterColor?: string;
  /** Show the after value on the value's line (keeps rows with and without one aligned). */
  inline?: boolean;
  /** In a stat-card box. */
  boxed?: boolean;
}) {
  const afterEl =
    after != null ? (
      <Box component="span" sx={{ fontSize: "1rem", fontWeight: 600, color: afterColor ?? "primary.main", ml: inline ? "0.625rem" : 0 }}>
        <span aria-label="after">→ </span>
        {after}
      </Box>
    ) : null;
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        minWidth: 0,
        ...(boxed
          ? {
              backgroundColor: "grey.400",
              border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
              borderRadius: "0.875rem",
              p: "1.125rem 1.25rem",
            }
          : {}),
      }}
    >
      <Typography sx={{ fontSize: "0.875rem", color: "grey.200", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
        {tip && <Tip text={tip} />}
      </Typography>
      <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
        {value}
        {inline && afterEl}
      </Typography>
      {!inline && afterEl && <Typography noWrap>{afterEl}</Typography>}
      {sub != null && <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{sub}</Typography>}
    </Box>
  );
}

/** One asset's share of a bar: amount in tokens and in USD. */
type Slice = { code: string; usd: number; amount: number };

const BAR_H = "0.625rem";
const C_OVER_LIMIT = "#F5B14C";
const C_OVER_LIQ = "#E5484D";
const C_GROW = "#8EA2FF";
const C_CUT = "#4A4A4A";

/** Tooltip content: a bold first line, muted lines under it. */
const TipLines = ({ lines }: { lines: (string | null | false | undefined)[] }) => {
  const [head, ...rest] = lines.filter(Boolean) as string[];
  return (
    <Box sx={{ textAlign: "center", px: "0.25rem", py: "0.125rem" }}>
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "common.black", whiteSpace: "nowrap" }}>{head}</Typography>
      {rest.map((l) => (
        <Typography key={l} sx={{ fontSize: "0.75rem", fontWeight: 500, color: "grey.200", whiteSpace: "nowrap" }}>
          {l}
        </Typography>
      ))}
    </Box>
  );
};

const qty = (s: Slice) => [`${formatAmount(s.amount, 4)} ${s.code}`, `(${formatUsd(s.usd)} USD)`];

/** A bar segment with its own hover / focus tooltip. */
function Seg({ pct: w, color, tip }: { pct: number; color: string; tip: (string | null | false | undefined)[] }) {
  if (!(w > 0)) return null;
  return (
    <Tooltip arrow placement="top" title={<TipLines lines={tip} />} disableInteractive>
      <Box tabIndex={0} sx={{ flex: "none", width: `${Math.min(100, w)}%`, height: "100%", backgroundColor: color, outline: "none", transition: "width 250ms ease" }} />
    </Tooltip>
  );
}

/** Track: rounded, clips its segments; markers sit outside the clip so they can stick out. */
function Track({ children, markers }: { children: React.ReactNode; markers?: React.ReactNode }) {
  return (
    <Box sx={{ position: "relative", height: BAR_H }}>
      <Box sx={{ display: "flex", height: "100%", borderRadius: "999rem", overflow: "hidden", backgroundColor: "overlay.white08" }}>{children}</Box>
      {markers}
    </Box>
  );
}

function Marker({ at, color, tip }: { at: number; color: string; tip: (string | null | false | undefined)[] }) {
  return (
    <Tooltip arrow placement="top" title={<TipLines lines={tip} />} disableInteractive>
      <Box
        component="button"
        type="button"
        aria-label={String(tip[0] ?? "")}
        sx={{
          position: "absolute",
          top: "-0.25rem",
          bottom: "-0.25rem",
          left: `${Math.min(100, Math.max(0, at))}%`,
          width: "0.1875rem",
          ml: "-0.09375rem",
          p: 0,
          border: "none",
          borderRadius: "0.125rem",
          backgroundColor: color,
          boxShadow: "0 0 0 0.0625rem rgba(0, 0, 0, 0.6)",
          cursor: "pointer",
          zIndex: 2,
          outline: "none",
          transition: "left 250ms ease",
        }}
      />
    </Tooltip>
  );
}

/** Supplying: one segment per asset across the full width; empty shows its note on hover only. */
function SupplyBar({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.usd, 0);
  return (
    <Track>
      {total > 0.01 ? (
        slices.map((s) => <Seg key={s.code} pct={(s.usd / total) * 100} color={segColor(s.code)} tip={qty(s)} />)
      ) : (
        <Seg pct={100} color="transparent" tip={["No supplied assets"]} />
      )}
    </Track>
  );
}

/** Supplying after the action: what stays, plus the added (light) or removed (grey) part. */
function SupplyPreview({ now, after, slices, via }: { now: number; after: number; slices: Slice[]; via: string }) {
  const mx = Math.max(now, after, 1e-9);
  const grow = after >= now;
  const base = Math.min(now, after);
  const d = Math.abs(after - now);
  const tip = [`After: ${formatUsd(after)}`, ...slices.filter((s) => s.usd > 0.01).map((s) => `${formatAmount(s.amount, 4)} ${s.code}`)];
  return (
    <Track>
      <Seg pct={(base / mx) * 100} color="#5C84FF" tip={tip} />
      <Seg pct={(d / mx) * 100} color={grow ? C_GROW : C_CUT} tip={[grow ? `+${formatUsd(d)} ${via}` : `−${formatUsd(d)} ${via}`, `After: ${formatUsd(after)}`]} />
    </Track>
  );
}

/**
 * Borrowing (ported from real Seidar's borrowBar): the scale covers debt and both limits. Debt up to
 * the borrow limit is split per borrowed asset; debt past the borrow limit is amber, past the
 * liquidation limit red. The empty rest reads "left to borrow" (and how far liquidation is). White
 * marker = borrow limit; red marker = liquidation limit, drawn only where it sits above the borrow
 * limit (Blend liquidates right at its limit, so there the two coincide).
 */
function BorrowBar({ bor, lim, liq, slices }: { bor: number; lim: number; liq: number; slices: Slice[] }) {
  const mx = Math.max(bor, lim, liq, 1);
  const safe = Math.min(bor, lim);
  const mid = Math.max(0, Math.min(bor, liq) - lim);
  const over = Math.max(0, bor - Math.max(lim, liq));
  const rest = Math.max(0, mx - bor);
  const leftB = Math.max(0, lim - bor);
  const leftL = liq - bor;
  const hasBuffer = liq - lim > 0.01;
  const p = (v: number) => (v / mx) * 100;
  const parts = slices.filter((s) => s.usd > 0.01);
  const partsTotal = parts.reduce((a, s) => a + s.usd, 0) || 1;
  const restTip =
    bor > 0.01
      ? ["Left to borrow", formatUsd(leftB), (hasBuffer || bor > lim) && (leftL >= 0 ? `Left to be liquidated ${formatUsd(leftL)}` : `${formatUsd(-leftL)} past liquidation`)]
      : lim > 0
        ? ["No borrowed assets", `Left to borrow ${formatUsd(leftB)}`]
        : ["No borrowed assets", "Supply collateral to borrow"];
  return (
    <Track
      markers={
        <>
          {lim > 0 && (
            <Marker at={p(lim)} color="#FFFFFF" tip={["Borrow limit", formatUsd(lim)]} />
          )}
          {hasBuffer && <Marker at={p(liq)} color={C_OVER_LIQ} tip={["Liquidation limit", formatUsd(liq)]} />}
        </>
      }
    >
      {safe > 0 && parts.map((s) => <Seg key={s.code} pct={(s.usd / partsTotal) * p(safe)} color={segColor(s.code)} tip={qty(s)} />)}
      <Seg pct={p(mid)} color={C_OVER_LIMIT} tip={["Over the borrow limit", formatUsd(bor - lim)]} />
      <Seg pct={p(over)} color={C_OVER_LIQ} tip={["Past the liquidation limit", formatUsd(bor - liq)]} />
      <Seg pct={p(rest)} color="transparent" tip={restTip} />
    </Track>
  );
}

const MiniBtn = ({ label, onClick, disabled, tip }: { label: string; onClick: () => void; disabled?: boolean; tip?: string | null }) => {
  const b = (
    <ButtonBase
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        height: "2.125rem",
        px: "0.875rem",
        borderRadius: "999rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color: "common.black",
        backgroundColor: "overlay.white08",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        "&:hover": { backgroundColor: "overlay.white20" },
        "&.Mui-disabled": { opacity: 0.4 },
      }}
    >
      {label}
    </ButtonBase>
  );
  return tip ? (
    <Tooltip title={tip} arrow placement="top">
      <span onClick={(e) => e.stopPropagation()}>{b}</span>
    </Tooltip>
  ) : (
    b
  );
};

type XoxnoAccountAsset = { sac: string; hubId: number; amount: string | null; priceUsd: number | null; valueUsd: number | null };
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

const positionLabel = (a: XoxnoAccount) => `Position #${a.accountId}${a.spokeName ? ` · ${a.spokeName}` : ""}`;
const usdSum = (xs: XoxnoAccountAsset[] | undefined) => (xs ?? []).reduce((t, x) => t + (x.valueUsd ?? 0), 0);

/**
 * A pill showing one XOXNO position. `nav` styles it like the header's portfolio pill and always opens
 * the list; the compact pill (action card) opens it when there is more than one to choose from.
 */
function PositionPicker({
  list,
  value,
  active = true,
  nav = false,
  height = "2rem",
  placeholder,
  onPick,
}: {
  list: XoxnoAccount[];
  value: XoxnoAccount | null;
  active?: boolean;
  nav?: boolean;
  /** Shown instead of a position (e.g. "New position"); no row is ticked then. */
  placeholder?: string;
  height?: string;
  onPick: (a: XoxnoAccount) => void;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const shown = value ?? list[0];
  if (!shown) return null;
  const arrow = nav || list.length > 1;
  const chevron = (
    <KeyboardArrowDown sx={{ fontSize: "1.125rem", flexShrink: 0, color: nav ? "sidebar.heading" : undefined, transform: el ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
  );
  return (
    <>
      {nav ? (
        <ButtonBase
          onClick={(e) => setEl(e.currentTarget)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "2.75rem",
            borderRadius: "3.125rem",
            backgroundColor: "surfaceBg.pill",
            borderTop: (t) => `0.0625rem solid ${t.palette.mode === "light" ? t.palette.border.main600 : t.palette.overlay.white08}`,
            borderBottom: (t) => `0.0625rem solid ${t.palette.mode === "light" ? t.palette.border.main600 : t.palette.overlay.white08}`,
            minWidth: { xs: "auto", sm: "9.25rem" },
            padding: { xs: "0.5rem 0.75rem", sm: "0.5rem 1.25rem" },
            gap: "0.625rem",
            "&:hover": { backgroundColor: "overlay.white08" },
          }}
        >
          <Typography variant="body1" noWrap sx={{ color: "sidebar.heading" }}>
            {placeholder ?? positionLabel(shown)}
          </Typography>
          {chevron}
        </ButtonBase>
      ) : (
        <ButtonBase
          onClick={(e) => {
            if (!active) onPick(shown);
            if (arrow) setEl(e.currentTarget);
          }}
          sx={{
            height,
            pl: "0.875rem",
            pr: arrow ? "0.5rem" : "0.875rem",
            gap: "0.25rem",
            borderRadius: "999rem",
            fontSize: "0.8125rem",
            color: active ? "sidebar.white" : "common.black",
            backgroundColor: active ? "sidebar.primary" : "overlay.white08",
          }}
        >
          {positionLabel(shown)}
          {arrow && chevron}
        </ButtonBase>
      )}
      <Menu
        anchorEl={el}
        open={!!el}
        onClose={() => setEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            elevation: 0,
            sx: (t) => ({
              mt: "0.5rem",
              width: "18rem",
              maxHeight: "24rem",
              padding: "0.5rem",
              borderRadius: "1.25rem",
              backgroundColor: t.palette.overlay.white08,
              backgroundImage: "none",
              border: `0.0625rem solid ${t.palette.overlay.white08}`,
              backdropFilter: "blur(2.6875rem)",
              WebkitBackdropFilter: "blur(2.6875rem)",
              boxShadow: `0 0 1.25rem ${t.palette.shadow.heavy}`,
            }),
          },
          list: { sx: { padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" } },
        }}
      >
        {list.map((a) => {
          const debt = usdSum(a.borrow);
          const selected = !placeholder && a.accountId === shown.accountId;
          return (
            <MenuItem
              key={a.accountId}
              selected={selected}
              onClick={() => {
                setEl(null);
                onPick(a);
              }}
              sx={{
                justifyContent: "space-between",
                gap: "0.75rem",
                minHeight: "3.5rem",
                borderRadius: "0.75rem",
                px: "0.875rem",
                "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: "overlay.white08" },
                "&:hover": { backgroundColor: "overlay.white04" },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.9375rem", color: selected ? "sidebar.white" : "sidebar.heading" }}>
                  {positionLabel(a)}
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
                  {formatUsd(usdSum(a.supplied) - debt)} · {debt > 0 && a.healthFactor != null ? `Health ${a.healthFactor.toFixed(2)}` : "No debt"}
                </Typography>
              </Box>
              {selected ? (
                <Box sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%", backgroundColor: "sidebar.purple100", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CheckRoundedIcon sx={{ fontSize: "0.875rem", color: "common.white" }} />
                </Box>
              ) : (
                <Box sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%", backgroundColor: "overlay.white20", flexShrink: 0 }} />
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

export default function LendPool() {
  const params = useSearchParams();
  const router = useRouter();
  const protocol = params.get("protocol") === "xoxno" ? "xoxno" : "blend";
  const poolId = params.get("pool") ?? "";
  const pinnedColumnProps = usePinnedColumn();
  const assetParam = params.get("asset");
  const modeParam = params.get("mode") as LendAction | null;
  const accountParam = params.get("account");
  const { activeWallet, isConnected, openConnectModal } = useWallet();
  const me = activeWallet?.address ?? null;
  const { markets, status: marketsStatus } = useLendMarkets();
  const pool = useMemo(() => groupPools(markets.filter((x) => x.protocol === protocol && x.pool === poolId))[0] ?? null, [markets, protocol, poolId]);
  const positions = useLendPositions(me ? [me] : []);
  const { byAddress, refreshing: balRefreshing } = useBalances(me ? [me] : []);
  const blndPx = useBlndPrice();
  const posLoading = !!me && ((positions.loading && positions.legs.length === 0) || positions.refreshing);
  const balLoading = !!me && ((byAddress[me]?.loading ?? true) || balRefreshing);

  const [tab, setTab] = useState<LendAction>(modeParam && [...TABS.map((t) => t.id), "leverage"].includes(modeParam) ? modeParam : "supply");
  const [assetKey, setAssetKey] = useState<string | null>(assetParam);
  const [amount, setAmount] = useState("");
  const [collateral, setCollateral] = useState(true);
  const [spoke, setSpoke] = useState<number | null>(null);
  const [pickedAccount, setPickedAccount] = useState<string | null>(accountParam);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [openSignal, setOpenSignal] = useState(0);
  const [tx, setTx] = useState<{ open: boolean; title: string; steps: TxStep[]; error: string | null }>({ open: false, title: "", steps: [], error: null });

  // ---- XOXNO accounts in this hub ----
  const xoxnoLimits = useShared<{ ok?: boolean; minBorrowCollateralUsd?: number } | null>(
    protocol === "xoxno" ? "xoxno:limits" : null,
    () => apiJson("/api/lending/xoxno/limits", undefined, 60_000),
    30 * 60_000,
  );
  /** XOXNO: collateral (USD) an account needs before it may hold any debt. */
  const minBorrowColl = xoxnoLimits.value?.ok ? (xoxnoLimits.value.minBorrowCollateralUsd ?? null) : null;
  /** XOXNO supply: open a new position (pick its spoke) instead of adding to an existing one. */
  const [newAcct, setNewAcct] = useState(false);
  const xoxnoAccts = useShared<{ accounts?: XoxnoAccount[] } | null>(
    me && protocol === "xoxno" ? `xoxno:accounts:${me}` : null,
    () => apiJson(`/api/lending/xoxno/accounts?owner=${me}`, undefined, 120_000),
    120_000,
  );
  const hubId = pool?.markets[0]?.xoxno?.hubId ?? null;
  const hubAccounts = useMemo(() => {
    if (protocol !== "xoxno" || hubId == null) return [];
    return (xoxnoAccts.value?.accounts ?? []).filter((a) => [...(a.supplied ?? []), ...(a.borrow ?? [])].some((p) => p.hubId === hubId));
  }, [protocol, hubId, xoxnoAccts.value]);
  const viewAccount = protocol === "xoxno" ? (hubAccounts.find((a) => a.accountId === pickedAccount) ?? hubAccounts[0] ?? null) : null;

  // ---- the position in this pool ----
  const poolLegs = useMemo(
    () =>
      positions.legs.filter(
        (l) => l.protocol === protocol && l.pool === poolId && (protocol !== "xoxno" || !viewAccount || l.xoxno?.accountId === viewAccount.accountId),
      ),
    [positions.legs, protocol, poolId, viewAccount],
  );
  const legsOf = (contract: string | null | undefined) => poolLegs.filter((l) => l.contract === contract);
  const sumOf = (contract: string | null | undefined, k: keyof Pick<UserLeg, "supplied" | "borrowed" | "lent" | "suppliedUsd" | "borrowedUsd">) =>
    legsOf(contract).reduce((s, l) => s + l[k], 0);

  // Selected asset: the URL's, else the largest thing you hold here, else the pool's largest market.
  const m: Market | null = useMemo(() => {
    if (!pool) return null;
    const byKey = (k: string | null) => (k ? pool.markets.find((x) => x.contract === k || x.code === k) : undefined);
    const mine = [...poolLegs].sort((a, b) => b.suppliedUsd + b.borrowedUsd - (a.suppliedUsd + a.borrowedUsd))[0];
    return byKey(assetKey) ?? byKey(mine?.contract ?? null) ?? pool.markets[0] ?? null;
  }, [pool, assetKey, poolLegs]);

  useEffect(() => setAmount(""), [tab, m?.key]);
  useEffect(() => {
    if (m && !m.canCollateral) setCollateral(false);
    else setCollateral(true);
  }, [m]);
  useEffect(() => setPickedAccount(accountParam), [accountParam, me]);

  const code = m?.code ?? "";
  const priceResp = useShared<{ prices?: Record<string, number | null> } | null>(code ? `prices:${code.toUpperCase()}` : null, () => apiJson(`/api/prices?codes=${encodeURIComponent(code)}`), 300_000);
  const heldOf = (x: Pick<Market, "code" | "issuer"> | null | undefined) =>
    me && x ? byAddress[me]?.tokens.find((t) => t.code === x.code && (t.issuer ?? null) === (x.issuer ?? null)) : undefined;
  const held = heldOf(m);
  const price = held?.price ?? m?.priceUsd ?? priceResp.value?.prices?.[code.toUpperCase()] ?? null;
  const isXlm = m?.code === "XLM" && !m?.issuer;
  const walletTotal = held?.amount ?? 0;
  /** What a transaction can take: for XLM, the spendable balance less a fee buffer. */
  const walletBal = isXlm && held?.spendable != null ? Math.max(0, held.spendable - XLM_FEE_BUFFER) : walletTotal;

  /** What a transaction can take of `x`: for XLM, the spendable balance less a fee buffer. */
  const spendOf = (x: Market) => {
    const h = heldOf(x);
    return x.code === "XLM" && !x.issuer && h?.spendable != null ? Math.max(0, h.spendable - XLM_FEE_BUFFER) : (h?.amount ?? 0);
  };

  // Leverage: shown when any asset in the pool can be longed or shorted; the picker lists those for the chosen side.
  const [levSide, setLevSide] = useState<LevSide>(params.get("side") === "short" ? "short" : "long");
  const longable = useMemo(() => (pool ? pool.markets.filter((x) => leverageSpokes(x, markets, "long").length > 0) : []), [pool, markets]);
  const shortable = useMemo(() => (pool ? pool.markets.filter((x) => leverageSpokes(x, markets, "short").length > 0) : []), [pool, markets]);
  const loopable = levSide === "long" ? longable : shortable;
  const lv = useLeverage(m ?? undefined, markets, spendOf, tab === "leverage", levSide);
  const tabs = pool?.markets.some((x) => canLeverage(x, markets)) ? [...TABS, { id: "leverage" as LendAction, label: "Leverage" }] : TABS;
  useEffect(() => {
    if (tab !== "leverage" || !pool) return;
    if (!longable.length && !shortable.length) setTab("supply");
    else if (!loopable.length) setLevSide(levSide === "long" ? "short" : "long");
    else if (m && !loopable.some((x) => x.key === m.key)) setAssetKey(loopable[0].contract ?? loopable[0].code);
  }, [tab, pool, longable, shortable, loopable, levSide, m]);

  const supplied = sumOf(m?.contract, "supplied");
  const lent = sumOf(m?.contract, "lent");
  const borrowed = sumOf(m?.contract, "borrowed");
  const suppliedUsd = sumOf(m?.contract, "suppliedUsd");
  const poolInfo = me && protocol === "blend" ? positions.pools[me]?.[poolId] : undefined;

  // Leverage close (Blend): unwind this collateral against one of the pool's debts.
  const [levMode, setLevMode] = useState<"open" | "close">("open");
  const [closeDebtKey, setCloseDebtKey] = useState<string | null>(null);
  const [closeFrac, setCloseFrac] = useState(1);
  const poolDebts = useMemo(() => poolLegs.filter((l) => l.protocol === "blend" && l.borrowed > 0 && l.contract !== m?.contract).sort((a, b) => b.borrowedUsd - a.borrowedUsd), [poolLegs, m?.contract]);
  const canClose = protocol === "blend" && supplied > 0 && poolDebts.length > 0;
  const closeDebt = poolDebts.find((d) => d.contract === closeDebtKey) ?? poolDebts[0] ?? null;
  useEffect(() => {
    if (!canClose && levMode === "close") setLevMode("open");
  }, [canClose, levMode]);

  // XOXNO: the account an action runs on (the one being viewed when it fits the action).
  /** Can position `a` take action `t` on asset `x` (hold it to withdraw / repay, its spoke lists it to supply / borrow)? */
  const fits = (a: XoxnoAccount, x: Market | null, t: LendAction) => {
    if (!x?.contract || hubId == null) return false;
    const has = (side: "supplied" | "borrow") => xoxnoAssetAmount(a[side], x.contract!, hubId) > 0;
    const onSpoke = (k: "canBorrow" | "canSupply") => !!x.xoxno?.spokes.some((s) => s.spokeId === a.spokeId && s[k]);
    return t === "withdraw" ? has("supplied") : t === "repay" ? has("borrow") : t === "borrow" ? onSpoke("canBorrow") : t === "supply" ? onSpoke("canSupply") : true;
  };
  const actionAccounts = protocol === "xoxno" ? hubAccounts.filter((a) => fits(a, m, tab)) : [];
  // The position only changes when the user picks one (header, card, or an asset listed under another
  // position). Tabs keep it and adapt the asset instead. One exception: a link that names an asset but
  // no position ("Repay USDC" on Lend & Borrow) opens on the position that holds it, once.
  const [linkChecked, setLinkChecked] = useState(false);
  useEffect(() => {
    if (linkChecked || protocol !== "xoxno" || !m || !hubAccounts.length) return;
    setLinkChecked(true);
    if (accountParam || tab === "leverage" || !viewAccount || fits(viewAccount, m, tab)) return;
    const other = hubAccounts.find((a) => fits(a, m, tab));
    if (other) setPickedAccount(other.accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkChecked, protocol, m?.key, hubAccounts.length]);
  const account = protocol !== "xoxno" || (tab === "supply" && newAcct) ? null : viewAccount && fits(viewAccount, m, tab) ? viewAccount : null;
  /**
   * XOXNO: the left card shows an empty, new position while supplying into one (picked, or nothing you
   * hold can take the asset) and on Leverage, which always opens a new position.
   */
  const freshView = protocol === "xoxno" && ((tab === "supply" && !account) || tab === "leverage");
  const accountSupplied = account && m?.contract && hubId != null ? xoxnoAssetAmount(account.supplied, m.contract, hubId) : 0;
  const accountBorrowed = account && m?.contract && hubId != null ? xoxnoAssetAmount(account.borrow, m.contract, hubId) : 0;
  const accountSpoke = protocol === "xoxno" && account ? m?.xoxno?.spokes.find((s) => s.spokeId === account.spokeId) : undefined;
  const roomUsd = (a: XoxnoAccount) => {
    if (a.availableBorrowUsd != null && Number.isFinite(a.availableBorrowUsd)) return Math.max(0, a.availableBorrowUsd);
    const ltvOf = (sac: string) => (pool?.markets.find((x) => x.contract === sac)?.xoxno?.spokes.find((s) => s.spokeId === a.spokeId)?.ltvBps ?? 0) / 10_000;
    const coll = (a.supplied ?? []).reduce((s, p) => s + (p.valueUsd ?? 0) * ltvOf(p.sac), 0);
    const debt = (a.borrow ?? []).reduce((s, p) => s + (p.valueUsd ?? 0), 0);
    return Math.max(0, coll - debt);
  };
  const collUsdOf = (a: XoxnoAccount) => (a.supplied ?? []).reduce((s, p) => s + (p.valueUsd ?? 0), 0);
  const belowFloor = (a: XoxnoAccount | null) => a != null && minBorrowColl != null && collUsdOf(a) < minBorrowColl;
  const xoxnoCapUsd =
    account && accountSpoke?.canBorrow && !belowFloor(account) ? Math.min(roomUsd(account), accountSpoke.borrowCapacity?.usd ?? Infinity) : protocol === "xoxno" ? 0 : null;
  const xoxnoMaxBorrow = xoxnoCapUsd != null && Number.isFinite(xoxnoCapUsd) && price != null && price > 0 ? xoxnoCapUsd / price : null;
  const supplySpokes = (m?.xoxno?.spokes ?? []).filter((s) => s.canSupply);
  const spokeId = account?.spokeId ?? (supplySpokes.some((s) => s.spokeId === spoke) ? spoke : (supplySpokes[0]?.spokeId ?? null));

  // Exact max borrow for Blend (the pool's own math, keeps health >= 1.1).
  const capKey = me && m?.contract && protocol === "blend" && tab === "borrow" ? `borrowcap:${me}:${poolId}:${m.contract}` : null;
  const cap = useShared<{ ok?: boolean; amount?: string } | null>(
    capKey,
    () => apiJson(`/api/lending/borrow-capacity?pool=${poolId}&account=${me}&asset=${m!.contract}&minHealth=${SAFE_HEALTH}`),
    60_000,
  );
  const maxBorrow = protocol === "xoxno" ? xoxnoMaxBorrow : cap.value?.ok && cap.value.amount && m ? Number(cap.value.amount) / 10 ** m.decimals : null;

  const activity = useActivity(me ? [me] : [], "positions");
  const poolActivity = useMemo(
    () => activity.items.filter((i) => (protocol === "blend" ? i.counterparty === poolId : i.protocol === "XOXNO")),
    [activity.items, protocol, poolId],
  );

  if (!pool || !m) {
    return (
      <Main sx={{ mt: "0.4rem" }}>
        <Breadcrumbs trail={[{ label: "Earn", href: "/earn" }, { label: "Lend & Borrow", href: "/earn/lending&borrow" }, { label: "Pool" }]} />
        <Typography color="grey.200">{marketsStatus[protocol] === "loading"
            ? "Loading pool…"
            : marketsStatus[protocol] === "failed"
              ? `Couldn't load ${LEND_PROTOCOLS[protocol].name} markets right now. Try again in a moment.`
              : "Pool not found. Pick one from Lend & Borrow."}</Typography>
      </Main>
    );
  }

  const meta = LEND_PROTOCOLS[protocol];
  const status = marketStatus(pool.status);
  const marketOf = (contract: string) => pool.markets.find((x) => x.contract === contract);
  const pick = (x: Market, mode?: LendAction, accountId?: string) => {
    const next = mode ?? tab;
    setAssetKey(x.contract ?? x.code);
    if (mode) setTab(mode);
    router.replace(poolHref(pool, { asset: x.contract ?? x.code, mode: next, account: accountId ?? pickedAccount ?? undefined }), { scroll: false });
  };
  /**
   * Show position `a` (header or action card). Off Leverage (which opens a new position) back to Supply;
   * when `a` can't take the selected asset for this action, switch to the asset it holds most of that it can.
   */
  /**
   * The asset to land on for action `t`: XOXNO, what position `a` holds most of among those it can use
   * for `t` (then what the wallet holds most of); Blend, the largest supply (withdraw) or debt (repay).
   */
  const bestAsset = (t: LendAction, a: XoxnoAccount | null): Market | undefined => {
    const wallet = (x: Market) => (heldOf(x)?.amount ?? 0) * (x.priceUsd ?? 0);
    if (protocol === "xoxno") {
      if (!a) return undefined;
      const usdIn = (x: Market) => [...(a.supplied ?? []), ...(a.borrow ?? [])].filter((p) => p.sac === x.contract && p.hubId === hubId).reduce((n, p) => n + (p.valueUsd ?? 0), 0);
      return pool.markets.filter((x) => fits(a, x, t)).sort((x, y) => usdIn(y) - usdIn(x) || wallet(y) - wallet(x))[0];
    }
    const side = t === "withdraw" ? "suppliedUsd" : t === "repay" ? "borrowedUsd" : null;
    return side ? pool.markets.filter((x) => sumOf(x.contract, side) > 0.005).sort((x, y) => sumOf(y.contract, side) - sumOf(x.contract, side))[0] : undefined;
  };
  /** Can the shown position (Blend: the pool position) do `t` with `x` as it stands? */
  const usable = (x: Market, t: LendAction) => {
    if (t === "leverage") return true;
    if (protocol === "xoxno") return !viewAccount || (t === "supply" && newAcct) || fits(viewAccount, x, t);
    return t === "withdraw" ? sumOf(x.contract, "supplied") > 0 : t === "repay" ? sumOf(x.contract, "borrowed") > 0 : true;
  };
  /** Switch tabs: the position stays; the asset moves to one it can use (when there is one). */
  const changeTab = (t: LendAction) => {
    // A new position is only a draft while supplying: leaving Supply drops it, so coming back shows
    // the real position again.
    if (t !== "supply" && newAcct) setNewAcct(false);
    const best = usable(m, t) ? undefined : bestAsset(t, viewAccount);
    if (best) return pick(best, t);
    setTab(t);
    router.replace(poolHref(pool, { asset: m.contract ?? m.code, mode: t, account: pickedAccount ?? undefined }), { scroll: false });
  };
  /**
   * The user picked asset `x` (pool table, asset menu): keep the position when it can use `x`; else the
   * position that can (picking an asset there is choosing it), or for supply a new position.
   */
  const chooseAsset = (x: Market, mode?: LendAction) => {
    const t = mode ?? tab;
    if (protocol === "xoxno" && t !== "leverage" && viewAccount && !(t === "supply" && newAcct) && !fits(viewAccount, x, t)) {
      const other = hubAccounts.find((a) => fits(a, x, t));
      if (other) {
        setPickedAccount(other.accountId);
        return pick(x, mode, other.accountId);
      }
      if (t === "supply") setNewAcct(true);
    }
    pick(x, mode);
  };
  /**
   * Show position `a` (header or action card). Off Leverage (which opens a new position) back to Supply;
   * when `a` can't take the selected asset for this action, switch to the asset it holds most of that it can.
   */
  const choosePosition = (a: XoxnoAccount) => {
    setNewAcct(false);
    setPickedAccount(a.accountId);
    const t: LendAction = tab === "leverage" ? "supply" : tab;
    if (fits(a, m, t)) {
      if (t !== tab) pick(m, t, a.accountId);
      return;
    }
    const best = bestAsset(t, a);
    if (best) pick(best, t !== tab ? t : undefined, a.accountId);
    else if (t !== tab) pick(m, t, a.accountId);
  };

  // =============== the position, now ===============
  const shownLegs = freshView ? [] : poolLegs;
  const supSlices: Slice[] = shownLegs.filter((l) => l.supplied > 0).map((l) => ({ code: l.code, usd: l.suppliedUsd, amount: l.supplied }));
  const debtSlices: Slice[] = shownLegs.filter((l) => l.borrowed > 0).map((l) => ({ code: l.code, usd: l.borrowedUsd, amount: l.borrowed }));
  const supUsd = supSlices.reduce((s, x) => s + x.usd, 0);
  const debtUsd = debtSlices.reduce((s, x) => s + x.usd, 0);
  const hasPosition = supUsd > 0.01 || debtUsd > 0.01;
  const earnUsd = shownLegs.reduce((a, l) => a + l.suppliedUsd * (marketOf(l.contract)?.supplyApy ?? 0) - l.borrowedUsd * (marketOf(l.contract)?.borrowApy ?? 0), 0);
  const blndOf = (contract: string, side: "supply" | "borrow") => {
    const x = marketOf(contract);
    return x ? (blndApr(x, side, blndPx) ?? 0) : 0;
  };
  const blndUsd = shownLegs.reduce((a, l) => a + l.suppliedUsd * blndOf(l.contract, "supply") + l.borrowedUsd * blndOf(l.contract, "borrow"), 0);
  const netUsd = supUsd - debtUsd;
  const netApyOf = (earn: number, net: number) => (net > 0.01 ? earn / net : null);
  const netApyNow = netApyOf(earnUsd, netUsd);
  const blndApyNow = netUsd > 0.01 && blndUsd > 0 ? blndUsd / netUsd : null;

  // XOXNO: every position in this hub added up (the header shows one at a time).
  const totals = (() => {
    if (protocol !== "xoxno") return null;
    const legs = positions.legs.filter((l) => l.protocol === "xoxno" && l.pool === poolId);
    const sup = legs.reduce((s, l) => s + l.suppliedUsd, 0);
    const debt = legs.reduce((s, l) => s + l.borrowedUsd, 0);
    const supEarn = legs.reduce((s, l) => s + l.suppliedUsd * (marketOf(l.contract)?.supplyApy ?? 0), 0);
    const debtCost = legs.reduce((s, l) => s + l.borrowedUsd * (marketOf(l.contract)?.borrowApy ?? 0), 0);
    const net = sup - debt;
    const ids = new Set(legs.filter((l) => l.suppliedUsd + l.borrowedUsd > 0.01).map((l) => l.xoxno?.accountId));
    return {
      count: ids.size,
      sup,
      debt,
      net,
      supApy: sup > 0.01 ? supEarn / sup : null,
      debtApy: debt > 0.01 ? debtCost / debt : null,
      netApy: net > 0.01 ? (supEarn - debtCost) / net : null,
      yearUsd: (supEarn - debtCost) / 100,
    };
  })();
  /** The pool's own rates: supply APY weighted by what is supplied, borrow APY by what is borrowed. */
  const poolApy = (side: "supply" | "borrow") => {
    if (!pool) return null;
    let w = 0;
    let s = 0;
    for (const x of pool.markets) {
      const apy = side === "supply" ? x.supplyApy : x.borrowApy;
      const usd = side === "supply" ? x.suppliedUsd : x.borrowedUsd;
      if (apy == null || !(usd > 0)) continue;
      w += usd;
      s += usd * apy;
    }
    return w > 0 ? s / w : null;
  };

  // Limits in USD of debt (as real Seidar): the white "borrow limit" and the red "liquidation limit".
  // Blend: effective collateral C (value x c_factor) against effective debt D (value / l_factor);
  // the limit is C and exceeding it is liquidation, so both limits coincide. In USD of debt, C is
  // scaled by debt USD / D (or the borrow asset's l_factor before any debt).
  // XOXNO: the account's borrow room (LTV) gives the borrow limit; its health (liquidation threshold
  // over debt) gives the liquidation limit, a little above it.
  let C = poolInfo?.effCollateralUsd;
  let D = poolInfo?.effDebtUsd;
  if (protocol === "blend" && (C == null || D == null)) {
    const h = poolInfo?.healthFactor ?? null;
    const capUsd = poolInfo?.borrowCapacityUsd ?? 0;
    if (!poolInfo) [C, D] = [0, 0];
    else if (h == null) [C, D] = [capUsd, 0];
    else if (h > 1) [C, D] = [(h * capUsd) / (h - 1), capUsd / (h - 1)];
  }
  const selLf = m.canBorrow && m.lFactor ? m.lFactor : (pool.borrowables[0]?.lFactor ?? 1);
  const toUsd = (effD: number, debt: number) => (effD > 1e-9 && debt > 0.01 ? debt / effD : selLf);
  const shownAccount = freshView ? null : viewAccount;
  const health = protocol === "blend" ? (poolInfo?.healthFactor ?? null) : (shownAccount?.healthFactor ?? null);
  const lim =
    protocol === "blend"
      ? Math.max(0, (C ?? 0) * toUsd(D ?? 0, debtUsd))
      : shownAccount
        ? debtUsd + roomUsd(shownAccount)
        : 0;
  const liqLim = protocol === "xoxno" && health != null && debtUsd > 0.01 ? Math.max(lim, health * debtUsd) : lim;
  /**
   * Collateral (USD) both protocols require before any borrow ($5 on 2026-11-01): Blend per pool,
   * counted after collateral factors (5.10 USDC at 95% is refused, 5.40 passes); XOXNO governance-set,
   * counted at value. Below it there is nothing to borrow yet, whatever the LTV would allow.
   */
  const minColl = protocol === "blend" ? (pool.markets.find((x) => x.minCollateralUsd != null)?.minCollateralUsd ?? null) : minBorrowColl;
  const metrics = (sup: number, debt: number, limit: number, h: number | null, coll: number) => {
    const belowMin = minColl != null && minColl > 0 && coll < minColl;
    return {
      /** Supplied over borrowed. */
      collRatio: debt > 0.01 ? sup / debt : null,
      /** Liquidation room: the limit over the debt (liquidation at 100%). */
      safety: debt > 0.01 ? (protocol === "blend" ? h : limit / debt) : null,
      used: limit > 0 ? debt / limit : debt > 0.01 ? Infinity : 0,
      left: belowMin ? 0 : Math.max(0, limit - debt),
      belowMin,
    };
  };
  const now = metrics(supUsd, debtUsd, lim, health, protocol === "blend" ? (C ?? 0) : supUsd);

  // Liquidation price: for each asset, its NET exposure (collateral it backs minus debt owed in it,
  // each weighted as the protocol weighs it) gives the one price, falling for a net long or rising
  // for a net short, at which health reaches 1 with every other price unchanged. The card shows the
  // asset closest to that price, i.e. the move that would liquidate the position first. (Tracking
  // collateral only would call a position that borrows XLM safe from XLM, when XLM rising is its risk.)
  type Exposure = Map<string, { code: string; c: number; d: number; p: number }>;
  type LiqPx = { contract: string; code: string; px: number; now: number; rises: boolean };
  /**
   * How far a price must move, comparable both ways: a short at health h needs its debt asset to
   * rise h x and its collateral to fall to 1/h, the same move in log terms (in percent the fall
   * always looks closer). Dollar / euro / treasury tokens barely move, so their distance counts 10x.
   */
  const liqDistance = (r: LiqPx) => Math.abs(Math.log(r.px / r.now)) * (/USD|EUR|GBP|CETES|TESOURO|USTRY|BENJI/i.test(r.code) ? 10 : 1);
  const exposureOf = (legs: UserLeg[]): Exposure => {
    const out: Exposure = new Map();
    for (const l of legs) {
      const c = Math.max(0, l.supplied - (protocol === "blend" ? l.lent : 0));
      const amt = l.supplied + l.borrowed;
      const p = amt > 0 ? (l.suppliedUsd + l.borrowedUsd) / amt : (marketOf(l.contract)?.priceUsd ?? 0);
      const x = out.get(l.contract) ?? { code: l.code, c: 0, d: 0, p };
      x.c += c;
      x.d += l.borrowed;
      out.set(l.contract, x);
    }
    return out;
  };
  /**
   * `effC` / `effD`: Blend effective collateral / debt (USD); XOXNO: liquidation value (health x
   * debt) and debt, with one liquidation threshold for all collateral (effC over collateral value).
   * `only`: price this asset (to follow the same one from now to after) instead of the closest.
   */
  const liqTrack = (exp: Exposure, effC: number, effD: number, only?: string): LiqPx | null => {
    if (!(effD > 1e-9)) return null;
    const collUsd = [...exp.values()].reduce((s, x) => s + x.c * x.p, 0);
    const lt = collUsd > 0 ? effC / collUsd : 0;
    let best: LiqPx | null = null;
    let any: LiqPx | null = null;
    for (const [contract, x] of exp) {
      if (only && contract !== only) continue;
      if (!(x.p > 0)) continue;
      const mk = marketOf(contract);
      const wc = protocol === "blend" ? (mk?.ltvPct ?? 0) / 100 : lt;
      const wd = protocol === "blend" ? 1 / (mk?.lFactor || 1) : 1;
      const net = x.c * wc - x.d * wd;
      if (Math.abs(net * x.p) < 1e-9) continue;
      // Everything but this asset, then the price that makes the two sides equal.
      const restC = effC - x.c * x.p * wc;
      const restD = effD - x.d * x.p * wd;
      const px = (restD - restC) / net;
      const r: LiqPx = { contract, code: x.code, px: Math.max(0, px), now: x.p, rises: net < 0 };
      any ??= r;
      // A net long only liquidates on a fall to a positive price; a net short on a rise.
      if (net > 0 ? !(px > 0 && px < x.p) : !(px > x.p)) continue;
      if (!best || liqDistance(r) < liqDistance(best)) best = r;
    }
    // Nothing that can liquidate it: report "None" against the first asset (or the one asked for).
    return best ?? (any ? { ...any, px: 0 } : null);
  };
  const liqEff = (): [number, number] => (protocol === "blend" ? [C ?? 0, D ?? 0] : [liqLim, debtUsd]);
  const nowExposure = exposureOf(shownLegs);
  // Leverage (opening) follows the asset being longed or shorted, whatever else the position holds.
  const levFocus = tab === "leverage" && levMode !== "close" ? (m.contract ?? undefined) : undefined;
  const liqNow = debtUsd > 0.01 ? liqTrack(nowExposure, ...liqEff(), levFocus && nowExposure.has(levFocus) ? levFocus : undefined) : null;

  // =============== the action being typed ===============
  const n = Number(amount || 0);
  const closing = tab === "leverage" && levMode === "close";
  const levColl = lv.coll ?? m;
  const opening = tab === "leverage" && !closing && lv.preview != null;
  const cfSel = (m.ltvPct ?? 0) / 100;
  const pSel = price ?? m.priceUsd ?? 0;
  const collHeld = Math.max(0, supplied - lent);
  const unitUsd = supplied > 0 ? suppliedUsd / supplied : pSel;
  const closeRepay = closeDebt ? closeDebt.borrowed * closeFrac : 0;
  const closeRepayUsd = closeDebt ? closeDebt.borrowedUsd * closeFrac : 0;
  const closeSold = unitUsd > 0 ? (closeRepayUsd / unitUsd) * (1 + (SLIPPAGE_BPS + 50) / 10_000) : 0;
  const closeBack = Math.max(0, supplied * closeFrac - closeSold);
  const closeShort = closeDebt != null && closeSold > supplied * closeFrac;
  const debtMarket = closing ? (closeDebt ? marketOf(closeDebt.contract) : undefined) : tab === "leverage" ? (lv.debt ?? undefined) : m;

  // What the action changes, in USD and in tokens per asset.
  type Move = { code: string; amount: number; usd: number };
  type Delta = {
    sup: number;
    debt: number;
    /** Blend effective collateral / debt. */
    effC: number;
    effD: number;
    /** Collateral change (USD) x the account's LTV: XOXNO borrow-limit change. */
    limit: number;
    earn: number;
    coll: number;
    supMove?: Move;
    debtMove?: Move;
    /** Contracts the moves are in (supMove: collateral change `coll`; debtMove: debt change). */
    supAsset?: string;
    debtAsset?: string;
    fresh?: boolean;
  };
  const delta: Delta | null = (() => {
    if (!me || posLoading) return null;
    const sApy = m.supplyApy ?? 0;
    const bApy = (debtMarket?.borrowApy ?? 0) as number;
    const lf = debtMarket?.lFactor ?? 1;
    const spokeEntry = accountSpoke ?? m.xoxno?.spokes.find((x) => x.spokeId === spokeId);
    const ltvX = protocol === "xoxno" ? (spokeEntry?.ltvBps ?? 0) / 10_000 || cfSel : cfSel;
    const mv = (code: string, amount: number, usd: number): Move => ({ code, amount, usd });
    if (tab === "supply" && n > 0) {
      const asColl = protocol === "xoxno" || (collateral && m.canCollateral);
      return { sup: n * pSel, debt: 0, effC: asColl ? n * pSel * cfSel : 0, effD: 0, limit: asColl ? n * pSel * ltvX : 0, earn: n * pSel * sApy, coll: asColl ? n : 0, supMove: mv(m.code, n, n * pSel), supAsset: m.contract! };
    }
    if (tab === "withdraw" && n > 0) {
      const w = Math.min(n, protocol === "xoxno" ? accountSupplied : supplied);
      // Blend takes plain supply first (see actions()), so collateral only goes past it.
      const c = protocol === "xoxno" ? w : Math.min(Math.max(0, w - lent), collHeld);
      return { sup: -w * pSel, debt: 0, effC: -c * pSel * cfSel, effD: 0, limit: -c * pSel * ltvX, earn: -w * pSel * sApy, coll: -c, supMove: mv(m.code, -w, -w * pSel), supAsset: m.contract! };
    }
    if (tab === "borrow" && n > 0) return { sup: 0, debt: n * pSel, effC: 0, effD: (n * pSel) / lf, limit: 0, earn: -n * pSel * bApy, coll: 0, debtMove: mv(m.code, n, n * pSel), debtAsset: m.contract! };
    if (tab === "repay" && n > 0) {
      const r = Math.min(n, protocol === "xoxno" ? accountBorrowed : borrowed);
      return { sup: 0, debt: -r * pSel, effC: 0, effD: (-r * pSel) / lf, limit: 0, earn: r * pSel * bApy, coll: 0, debtMove: mv(m.code, -r, -r * pSel), debtAsset: m.contract! };
    }
    if (opening && lv.preview && lv.debt) {
      const p = lv.preview;
      return {
        sup: p.addedUsd,
        debt: p.debtUsd,
        effC: p.addedUsd * ((levColl.ltvPct ?? 0) / 100),
        effD: p.debtUsd / lf,
        limit: p.addedUsd * lv.collLtv,
        earn: p.addedUsd * (levColl.supplyApy ?? 0) - p.debtUsd * bApy,
        coll: p.added,
        supMove: mv(levColl.code, p.added, p.addedUsd),
        debtMove: mv(lv.debt.code, p.debtAmount, p.debtUsd),
        supAsset: levColl.contract!,
        debtAsset: lv.debt.contract!,
        fresh: protocol === "xoxno",
      };
    }
    if (closing && closeDebt && !closeShort) {
      const out = collHeld * closeFrac * unitUsd;
      return {
        sup: -out,
        debt: -closeRepayUsd,
        effC: -out * cfSel,
        effD: -closeRepayUsd / lf,
        limit: -out * ltvX,
        earn: -out * sApy + closeRepayUsd * bApy,
        coll: -collHeld * closeFrac,
        supMove: mv(m.code, -collHeld * closeFrac, -out),
        debtMove: mv(closeDebt.code, -closeRepay, -closeRepayUsd),
        supAsset: m.contract!,
        debtAsset: closeDebt.contract,
      };
    }
    return null;
  })();

  // The position after the action. XOXNO leverage opens a new account: its "after" is that account.
  const after = delta
    ? (() => {
        const apply = (list: Slice[], mv?: Move) => {
          const out = list.map((x) => ({ ...x }));
          if (mv) {
            const hit = out.find((x) => x.code === mv.code);
            if (hit) {
              hit.amount = Math.max(0, hit.amount + mv.amount);
              hit.usd = Math.max(0, hit.usd + mv.usd);
            } else if (mv.usd > 0) out.push({ ...mv });
          }
          return out.filter((x) => x.usd > 0.005);
        };
        const supS = apply(delta.fresh ? [] : supSlices, delta.supMove);
        const debtS = apply(delta.fresh ? [] : debtSlices, delta.debtMove);
        const sup = supS.reduce((a, x) => a + x.usd, 0);
        const debt = debtS.reduce((a, x) => a + x.usd, 0);
        const net = sup - debt;
        let limit = 0;
        let liq = 0;
        let h: number | null = null;
        let liqPx: LiqPx | null = null;
        let effC2 = 0;
        if (protocol === "blend") {
          const c2 = Math.max(0, (C ?? 0) + delta.effC);
          const d2 = Math.max(0, (D ?? 0) + delta.effD);
          h = d2 > 1e-6 ? c2 / d2 : null;
          limit = c2 * toUsd(d2, debt);
          liq = limit;
          effC2 = c2;
        } else if (delta.fresh) {
          limit = delta.limit;
          h = lv.preview?.health ?? null;
          liq = h != null ? Math.max(limit, h * debt) : limit;
          effC2 = h != null ? h * debt : 0;
        } else {
          limit = Math.max(0, lim + delta.limit);
          liq = Math.max(limit, liqLim + delta.limit * (lim > 0 ? liqLim / lim : 1));
          h = debt > 0.01 ? liq / debt : null;
          effC2 = liq;
        }
        // The exposure after: this action's collateral and debt changes on top of (or, for a new
        // XOXNO position, instead of) today's.
        const exp: Exposure = new Map([...(delta.fresh ? [] : nowExposure)].map(([k, v]) => [k, { ...v }]));
        const bump = (contract: string | undefined, dc: number, dd: number, mvx?: Move) => {
          if (!contract || !mvx) return;
          const x = exp.get(contract) ?? { code: mvx.code, c: 0, d: 0, p: mvx.amount ? Math.abs(mvx.usd / mvx.amount) : 0 };
          x.c = Math.max(0, x.c + dc);
          x.d = Math.max(0, x.d + dd);
          exp.set(contract, x);
        };
        bump(delta.supAsset, delta.coll, 0, delta.supMove);
        bump(delta.debtAsset, 0, delta.debtMove?.amount ?? 0, delta.debtMove);
        const effD2 = protocol === "blend" ? Math.max(0, (D ?? 0) + delta.effD) : debt;
        const follow = levFocus ?? liqNow?.contract;
        if (debt > 0.01) liqPx = liqTrack(exp, effC2, effD2, follow && exp.has(follow) ? follow : undefined);
        return { supS, debtS, sup, debt, net, limit, liq, h, liqPx, ...metrics(sup, debt, limit, h, protocol === "blend" ? effC2 : sup), netApy: netApyOf((delta.fresh ? 0 : earnUsd) + delta.earn, net) };
      })()
    : null;
  const approx = opening || closing ? "≈ " : "";
  /** The asset the liquidation price follows. */
  const liqShown = after?.liqPx ?? liqNow;
  const red = (bad: boolean) => (bad ? "error.main" : undefined);
  const ratioTxt = (v: number | null) => (v == null ? "N/A" : `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}%`);
  const usedTxt = (v: number) => (Number.isFinite(v) ? pct(Math.min(v, 9.99) * 100, 0) : "N/A");
  const ratioColor = (v: number | null) => (v == null ? undefined : v < 1.1 ? "error.main" : v < 1.5 ? "orange.main" : "green.main");

  // =============== form ===============
  // Withdraw: with debt open, only what keeps health at SAFE_HEALTH (Blend) or the borrow limit (XOXNO).
  const fullW = protocol === "xoxno" ? accountSupplied : supplied;
  const withdrawable = (() => {
    if (tab !== "withdraw") return fullW;
    if (protocol === "blend") {
      const effD = D ?? 0;
      if (effD <= 1e-9) return fullW;
      // Plain (lent) supply doesn't back the debt; collateral does, at value x c_factor.
      if (!(pSel > 0) || !(cfSel > 0)) return Math.min(fullW, lent);
      const free = Math.max(0, (C ?? 0) - SAFE_HEALTH * effD) / (pSel * cfSel);
      return Math.min(fullW, Math.min(collHeld, free) + lent);
    }
    if (!account || usdSum(account.borrow) <= 0.005) return fullW;
    const ltv = (accountSpoke?.ltvBps ?? 0) / 10_000;
    if (!(pSel > 0) || !(ltv > 0)) return fullW;
    // 1% short of the edge: prices can move between reading and signing.
    return Math.min(fullW, (roomUsd(account) * 0.99) / (pSel * ltv));
  })();
  const wCapped = tab === "withdraw" && withdrawable < fullW - 1e-9;
  const available =
    tab === "supply" ? walletBal : tab === "withdraw" ? withdrawable : tab === "repay" ? (protocol === "xoxno" ? accountBorrowed : borrowed) : (maxBorrow ?? 0);
  const balanceLabel = tab === "supply" ? (isXlm ? "Spendable" : "Wallet") : tab === "withdraw" ? (wCapped ? "Withdrawable" : "Supplied") : tab === "repay" ? "Debt" : "Can borrow";
  /** MAX fills what can actually be done: a repay is also limited by what the wallet holds. */
  const maxFill = tab === "repay" ? Math.min(available ?? 0, walletBal) : available;
  /** Repaying everything sends the live debt plus a little interest headroom (the rest is refunded). */
  const repayAllBuffer = protocol === "blend" ? 1.001 : 1.002;
  // "max" withdraws everything, so it is only sent when everything may go.
  const atMax = available != null && n > 0 && Math.abs(n - available) < 1e-9 && !wCapped;
  const capLoading = tab === "borrow" && (protocol === "blend" ? cap.loading || cap.refreshing : posLoading);
  const availLoading = tab === "supply" ? balLoading : tab === "borrow" ? capLoading : posLoading;

  const blocker = (() => {
    if (!isConnected) return "Connect a wallet";
    const b = actionBlock(m, tab);
    if (b) return b;
    if (availLoading) return tab === "supply" ? "Loading your balance…" : tab === "borrow" ? "Loading borrow capacity…" : "Loading your position…";
    if (protocol === "xoxno" && tab !== "supply" && !account) {
      if (xoxnoAccts.loading) return "Loading XOXNO positions…";
      if (viewAccount) {
        const v = `Position #${viewAccount.accountId}`;
        return tab === "withdraw" ? `${v} has no ${m.code} supplied` : tab === "repay" ? `${v} has no ${m.code} debt` : `${v} can't borrow ${m.code}`;
      }
      if (tab === "withdraw") return `No ${m.code} supplied in this hub`;
      if (tab === "repay") return `No ${m.code} debt in this hub`;
      if (!hubAccounts.length) return "Supply collateral first";
      return `${m.code} can't be borrowed on ${[...new Set(hubAccounts.map((a) => a.spokeName ?? "your spoke"))].join(" / ")}`;
    }
    if (protocol === "xoxno" && tab !== "supply" && account && !accountSpoke) return "This position's spoke is unavailable";
    if (tab === "withdraw" && (protocol === "xoxno" ? accountSupplied : supplied) <= 0) return `No ${m.code} supplied here`;
    if (tab === "repay" && (protocol === "xoxno" ? accountBorrowed : borrowed) <= 0) return `No ${m.code} debt to repay`;
    if (protocol === "xoxno" && tab === "supply" && !spokeId) return "No spoke accepts this asset";
    if (!(n > 0)) return "Enter an amount";
    if ((tab === "supply" || tab === "repay") && n > walletBal + 1e-9)
      return isXlm && n <= walletTotal + 1e-9 ? `Only ${formatAmount(walletBal, 4)} XLM is spendable` : `Insufficient ${m.code} balance`;
    if (tab === "withdraw" && n > fullW + 1e-9) return "More than supplied";
    if (tab === "withdraw" && n > withdrawable + 1e-9) return withdrawable > 0
          ? `Withdraw at most ${formatAmount(withdrawable, 4)} ${m.code} to keep ${protocol === "blend" ? `health at ${SAFE_HEALTH.toFixed(2)} or above` : "within your borrow limit"}`
          : `Your debt needs this ${m.code} as collateral: repay first`;
    if (tab === "repay" && n > (protocol === "xoxno" ? accountBorrowed : borrowed) * 1.002 + 1e-9) return "More than your debt";
    if (tab === "repay" && atMax && walletBal < n * repayAllBuffer)
      return `Repaying all needs ${formatAmount(n * repayAllBuffer, 4)} ${m.code} in your wallet (interest until it lands; the extra comes back)`;
    if (tab === "borrow" && protocol === "xoxno" && belowFloor(account)) return `XOXNO needs $${minBorrowColl} collateral to borrow`;
    if (tab === "borrow" && protocol === "xoxno" && maxBorrow == null) return "Borrow capacity unavailable";
    if (tab === "borrow" && maxBorrow != null && maxBorrow <= 0) return "No borrow capacity";
    if (tab === "borrow" && maxBorrow != null && n > maxBorrow + 1e-9) return "Above your borrow capacity";
    // Last line of defence: never offer an action whose own preview is liquidatable.
    if ((tab === "withdraw" || tab === "borrow") && after?.h != null && after.h < 1) return "This would make your position liquidatable";
    return null;
  })();

  const actions = (): { action: string; asset: string; amount: string }[] => {
    const baseAmt = (v: number) => toBase(v.toFixed(m.decimals), m.decimals) ?? "0";
    const amt = toBase(amount, m.decimals) ?? "0";
    if (tab === "supply") return [{ action: protocol === "blend" && !collateral ? "lend" : "supply", asset: m.contract!, amount: amt }];
    if (tab === "borrow") return [{ action: "borrow", asset: m.contract!, amount: amt }];
    if (tab === "repay") return [{ action: "repay", asset: m.contract!, amount: atMax ? "max" : amt }];
    if (protocol === "xoxno") return [{ action: "withdraw", asset: m.contract!, amount: atMax ? "max" : amt }];
    // Blend keeps collateral and plain supply apart: take the plain supply first (it backs no debt),
    // then collateral.
    if (atMax) return [...(lent > 0 ? [{ action: "unlend", asset: m.contract!, amount: "max" }] : []), ...(collHeld > 0 ? [{ action: "withdraw", asset: m.contract!, amount: "max" }] : [])];
    if (n <= lent + 1e-12 || collHeld <= 0) return [{ action: "unlend", asset: m.contract!, amount: amt }];
    if (lent <= 0) return [{ action: "withdraw", asset: m.contract!, amount: amt }];
    return [
      { action: "unlend", asset: m.contract!, amount: baseAmt(lent) },
      { action: "withdraw", asset: m.contract!, amount: baseAmt(n - lent) },
    ];
  };

  const run = async (title: string, label: string, path: string, body: unknown, onDone?: () => void) => {
    if (!activeWallet) return;
    setTx({ open: true, title, steps: [{ key: "s0", label, status: "building" }], error: null });
    try {
      const r = await runBuilt(path, body, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
      if (!r.unsigned) onDone?.();
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const submit = () => {
    if (!activeWallet) return;
    const body =
      protocol === "blend"
        ? { protocol: "blend", from: activeWallet.address, pool: poolId, actions: actions() }
        : { protocol: "xoxno", from: activeWallet.address, actions: actions(), xoxno: { hubId: m.xoxno?.hubId, spokeId, accountId: account?.accountId } };
    void run(`${meta.name} · ${pool.name}`, `${TABS.find((t) => t.id === tab)?.label} ${amount} ${m.code} · ${pool.name}`, "/api/lending/build", body, () => setAmount(""));
  };
  const submitLeverage = () => {
    const body = activeWallet ? lv.body(activeWallet.address) : null;
    if (!body) return;
    const what = levSide === "long" ? `Long ${m.code} ${lv.lev.toFixed(1)}x · ${lv.amount} ${m.code}, borrow ${lv.debt?.code}` : `Short ${m.code} ${lv.lev.toFixed(1)}x · ${lv.amount} ${lv.coll?.code} collateral`;
    void run(`${meta.name} · ${pool.name}`, what, lv.path, body, () => lv.setAmount(""));
  };
  const submitClose = () => {
    if (!activeWallet || !closeDebt || !m.contract) return;
    void run(
      `${meta.name} · ${pool.name}`,
      `Close ${Math.round(closeFrac * 100)}% · ${m.code} / ${closeDebt.code}`,
      "/api/lending/blend/leverage/close",
      { from: activeWallet.address, pool: poolId, collateral: m.contract, debt: closeDebt.contract, fraction: closeFrac, slippageBps: SLIPPAGE_BPS },
    );
  };
  const claimable = poolInfo?.claimableBlnd ?? 0;
  const submitClaim = () => {
    if (!activeWallet) return;
    void run("Claim rewards", `Claim ${formatAmount(claimable, 4)} BLND · ${pool.name}`, "/api/lending/claim", { from: activeWallet.address, pool: poolId });
  };

  const levBlocker = !isConnected
    ? "Connect a wallet"
    : (actionBlock(m, "leverage") ??
      lv.blocker ??
      (protocol === "xoxno" && minBorrowColl != null && lv.preview && lv.preview.addedUsd < minBorrowColl ? `XOXNO needs $${minBorrowColl} collateral to borrow` : null));
  const closeBlocker = !isConnected
    ? "Connect a wallet"
    : !lv.oneStep
      ? "One-step close isn't live yet: use Repay and Withdraw"
      : m.status != null && m.status >= 2
        ? `Pool is ${m.status >= 4 ? "frozen" : "on ice"}: close with Repay and Withdraw`
        : !closeDebt
          ? "No debt to repay in this pool"
          : closeShort
            ? `This ${m.code} alone can't cover that much ${closeDebt.code}: close a smaller part`
            : null;

  const details: DetailRow[] = [];
  if (tab === "supply" || tab === "withdraw") {
    details.push({ label: "Supply APY", value: pct(m.supplyApy), color: "green.main" });
    const b = blndApr(m, "supply", blndPx);
    if (b) details.push({ label: "BLND rewards", value: `+${pct(b)}`, color: "green.main" });
  }
  if (tab === "borrow" && protocol === "blend") details.push({ label: "Max borrow keeps health at", value: `${SAFE_HEALTH.toFixed(2)} or above` });
  if (tab === "borrow" || tab === "repay") {
    details.push({ label: "Borrow APY", value: pct(m.borrowApy) });
    const b = blndApr(m, "borrow", blndPx);
    if (b) details.push({ label: "BLND rewards", value: `+${pct(b)}`, color: "green.main" });
  }
  if (m.ltvPct != null) details.push({ label: "Collateral factor", value: pct(m.ltvPct, 0) });
  if (isXlm && (tab === "supply" || tab === "repay") && held?.spendable != null && walletTotal - walletBal > 0.0001)
    details.push({ label: "Kept in wallet (reserve + fees)", value: `${formatAmount(walletTotal - walletBal, 4)} XLM` });
  if (protocol === "xoxno" && tab === "borrow" && minBorrowColl != null)
    details.push({
      label: "XOXNO minimum collateral to borrow",
      value: `$${minBorrowColl.toFixed(2)}${account ? ` (you have ${formatUsd(collUsdOf(account))})` : ""}`,
      color: belowFloor(account) ? "error.main" : undefined,
    });
  if (protocol === "xoxno" && tab === "borrow" && !account && hubAccounts.length) {
    const can = pool.markets.filter((x) => hubAccounts.some((a) => x.xoxno?.spokes.some((s) => s.spokeId === a.spokeId && s.canBorrow))).map((x) => x.code);
    details.push({ label: hubAccounts.length > 1 ? "Your positions can borrow" : "Your position can borrow", value: can.length ? can.slice(0, 4).join(", ") + (can.length > 4 ? "…" : "") : "Nothing here" });
  }
  if (tab === "repay")
    details.push({
      label: "Wallet balance",
      value: <Shimmer on={balLoading} width="4rem">{`${formatAmount(walletBal, 4)} ${m.code}`}</Shimmer>,
      color: !balLoading && walletBal + 1e-9 < n ? "error.main" : undefined,
    });
  const closeDetails: DetailRow[] = closeDebt
    ? [
        { label: `${m.code} sold to repay (at most)`, value: `≈ ${formatAmount(closeSold, 4)} ${m.code}` },
        { label: `${m.code} back to your wallet`, value: `≈ ${formatAmount(closeBack, 4)} ${m.code}`, color: "green.main" },
        { label: "Swap slippage", value: pct(SLIPPAGE_BPS / 100, 1) },
        { label: "Transactions", value: "1" },
      ]
    : [];

  // On phones the form is a bottom sheet over the overview: repeat what changes as "now → after".
  const change = (now: string, then: string, color?: string) => (
    <>
      {now}{" "}
      <Box component="span" sx={{ color: color ?? "primary.main", fontWeight: 600 }}>
        → {then}
      </Box>
    </>
  );
  const sheetRows: DetailRow[] = [];
  if (after) {
    sheetRows.push({ label: "Supplying", value: change(formatUsd(supUsd), `${approx}${formatUsd(after.sup)}`) });
    sheetRows.push({ label: "Borrowing", value: change(formatUsd(debtUsd), `${approx}${formatUsd(after.debt)}`, red(after.debt > after.limit + 0.01)) });
    sheetRows.push({ label: "Safety ratio", value: change(ratioTxt(now.safety), after.safety == null ? "No debt" : ratioTxt(after.safety), red(after.safety != null && after.safety < 1.1)) });
    sheetRows.push({ label: "Borrow power used", value: change(usedTxt(now.used), usedTxt(after.used), red(after.used > 1)) });
    sheetRows.push({ label: "Net APY", value: change(pct(netApyNow ?? 0), pct(after.netApy ?? 0), red(after.netApy != null && after.netApy < 0)) });
  }

  // =============== asset picker ===============
  const pickValue = (x: Market) => {
    if (tab === "leverage" && levSide === "short") return x.borrowApy != null ? `${pct(x.borrowApy)} borrow APY` : "";
    if (tab === "supply" || tab === "leverage") {
      const h = heldOf(x);
      return h?.amount ? `${formatAmount(h.amount, 4)} in wallet` : x.supplyApy != null ? `${pct(x.supplyApy)} APY` : "";
    }
    if (tab === "withdraw") {
      const s = sumOf(x.contract, "supplied");
      return s > 0 ? `${formatAmount(s, 4)} supplied` : "None supplied";
    }
    if (tab === "repay") {
      const b = sumOf(x.contract, "borrowed");
      return b > 0 ? `${formatAmount(b, 4)} owed` : "No debt";
    }
    return x.borrowApy != null ? `${pct(x.borrowApy)} APY` : "";
  };
  /**
   * The asset menu, grouped by where each asset lives: the shown position's first (picking one keeps
   * it), then what only another position holds or takes, named (picking one switches to it, or for
   * supply to a new position). Withdraw / repay never list what no position holds.
   */
  type PickItem = { x: Market; note: string; acct?: XoxnoAccount; fresh?: boolean };
  type PickGroup = { title?: string; items: PickItem[]; empty?: string };
  const amtIn = (a: XoxnoAccount, side: "supplied" | "borrow", x: Market) => (hubId != null && x.contract ? xoxnoAssetAmount(a[side], x.contract, hubId) : 0);
  const pickGroups: PickGroup[] = (() => {
    const plain = (xs: Market[]) => xs.map((x) => ({ x, note: pickValue(x) }));
    if (tab === "leverage") return [{ items: plain(loopable) }];
    const held = tab === "withdraw" || tab === "repay";
    if (protocol === "xoxno" && viewAccount && !(tab === "supply" && newAcct)) {
      const v = viewAccount;
      const title = positionLabel(v);
      const others = hubAccounts.filter((a) => a.accountId !== v.accountId);
      if (held) {
        const side = tab === "withdraw" ? "supplied" : "borrow";
        const word = tab === "withdraw" ? "supplied" : "owed";
        const mine = pool.markets.filter((x) => amtIn(v, side, x) > 0).map((x) => ({ x, note: `${formatAmount(amtIn(v, side, x), 4)} ${word}` }));
        const theirs = others.flatMap((a) =>
          pool.markets.filter((x) => amtIn(a, side, x) > 0).map((x) => ({ x, acct: a, note: `${formatAmount(amtIn(a, side, x), 4)} · Position #${a.accountId}` })),
        );
        return [
          { title, items: mine, empty: tab === "withdraw" ? "Nothing supplied in this position" : "No debt in this position" },
          ...(theirs.length ? [{ title: "In your other positions", items: theirs }] : []),
        ];
      }
      if (tab === "supply") {
        const mine = plain(pool.markets.filter((x) => fits(v, x, "supply")));
        const rest = pool.markets
          .filter((x) => !fits(v, x, "supply") && x.xoxno?.spokes.some((p) => p.canSupply))
          .map((x): PickItem => {
            const a = others.find((o) => fits(o, x, "supply"));
            return a ? { x, acct: a, note: `Position #${a.accountId}` } : { x, fresh: true, note: "New position" };
          });
        return [{ title, items: mine, empty: "This position's spoke takes none of these" }, ...(rest.length ? [{ title: "Other positions", items: rest }] : [])];
      }
      return [{ title, items: plain(pool.markets.filter((x) => fits(v, x, "borrow"))), empty: "This position's spoke lends none of these" }];
    }
    if (held && me) {
      const key = tab === "withdraw" ? "supplied" : "borrowed";
      return [{ items: plain(pool.markets.filter((x) => sumOf(x.contract, key) > 0)), empty: tab === "withdraw" ? "Nothing supplied here yet" : "No debt here" }];
    }
    return [{ items: plain(tab === "borrow" ? pool.markets.filter((x) => x.canBorrow) : pool.markets) }];
  })();
  const pickItems = pickGroups.flatMap((g) => g.items);
  /** The token button opens the menu when it offers anything besides what's already selected. */
  const canPick = pickItems.some((it) => it.x.key !== m.key || it.acct || it.fresh);
  const choosePick = (it: PickItem) => {
    setMenuEl(null);
    if (it.acct) {
      setNewAcct(false);
      setPickedAccount(it.acct.accountId);
      pick(it.x, undefined, it.acct.accountId);
    } else if (it.fresh) {
      setNewAcct(true);
      pick(it.x);
    } else pick(it.x);
  };

  // =============== pool assets table ===============
  const assetCols: Column<Market>[] = [
    {
      id: "asset",
      header: "Asset",
      cell: (x) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <MarketLogo m={x} size="2.25rem" />
          <Box>
            <Typography sx={{ fontSize: "1rem", color: "common.black", fontWeight: x.key === m.key ? 600 : 400 }}>{x.code}</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "grey.200", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {x.canCollateral ? `Collateral ${pct(x.ltvPct, 0)}` : x.canBorrow ? "Borrow only" : "Lend only"}
            </Typography>
          </Box>
        </Box>
      ),
      sortValue: (x) => x.code,
    },
    {
      id: "supplyApy",
      header: "Supply APY",
      cell: (x) => {
        const b = blndApr(x, "supply", blndPx);
        return (
          <Box>
            <Typography sx={{ fontSize: "1rem", color: "green.main" }}>{pct(x.supplyApy)}</Typography>
            {b && <Typography sx={{ fontSize: "0.6875rem", color: "grey.200", whiteSpace: "nowrap" }}>+{pct(b)} BLND</Typography>}
          </Box>
        );
      },
      sortValue: (x) => x.supplyApy,
    },
    {
      id: "borrowApy",
      header: "Borrow APY",
      cell: (x) => {
        const b = blndApr(x, "borrow", blndPx);
        return (
          <Box>
            <Typography sx={{ fontSize: "1rem", color: "common.black" }}>{x.canBorrow ? pct(x.borrowApy) : "N/A"}</Typography>
            {x.canBorrow && b && <Typography sx={{ fontSize: "0.6875rem", color: "grey.200", whiteSpace: "nowrap" }}>+{pct(b)} BLND</Typography>}
          </Box>
        );
      },
      sortValue: (x) => x.borrowApy,
    },
    { id: "supplied", header: "Supplied", cell: (x) => <Typography sx={{ fontSize: "1rem", color: "common.black" }}>{compactUsd(x.suppliedUsd)}</Typography>, sortValue: (x) => x.suppliedUsd },
    { id: "available", header: "Available", cell: (x) => <Typography sx={{ fontSize: "1rem", color: "common.black" }}>{compactUsd(x.availableUsd)}</Typography>, sortValue: (x) => x.availableUsd },
    { id: "util", header: "Utilization", cell: (x) => <Typography sx={{ fontSize: "1rem", color: "common.black" }}>{pct(x.utilPct, 1)}</Typography>, sortValue: (x) => x.utilPct },
    ...(hasPosition
      ? [
          {
            id: "you",
            header: "You",
            cell: (x: Market) => {
              const s = sumOf(x.contract, "supplied");
              const b = sumOf(x.contract, "borrowed");
              if (s <= 0 && b <= 0) return <Typography sx={{ color: "grey.200" }}>N/A</Typography>;
              return (
                <Box>
                  {s > 0 && <Typography sx={{ fontSize: "0.875rem", color: "green.main", whiteSpace: "nowrap" }}>+{formatAmount(s, 4)}</Typography>}
                  {b > 0 && <Typography sx={{ fontSize: "0.875rem", color: "error.main", whiteSpace: "nowrap" }}>−{formatAmount(b, 4)}</Typography>}
                </Box>
              );
            },
            sortValue: (x: Market) => sumOf(x.contract, "suppliedUsd") + sumOf(x.contract, "borrowedUsd"),
          } satisfies Column<Market>,
        ]
      : []),
    {
      id: "action",
      header: "",
      align: "right",
      cell: (x) => (
        <Box sx={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end" }}>
          <MiniBtn
            label="Supply"
            disabled={!!actionBlock(x, "supply")}
            tip={actionBlock(x, "supply")}
            onClick={() => {
              chooseAsset(x, "supply");
              setOpenSignal((s) => s + 1);
            }}
          />
          <MiniBtn
            label="Borrow"
            disabled={!!actionBlock(x, "borrow")}
            tip={actionBlock(x, "borrow")}
            onClick={() => {
              chooseAsset(x, "borrow");
              setOpenSignal((s) => s + 1);
            }}
          />
        </Box>
      ),
    },
  ];

  // =============== render ===============
  const emissions = protocol === "blend" ? pool.markets.flatMap((x) => (["supply", "borrow"] as const).map((side) => ({ x, side, apr: blndApr(x, side, blndPx) })).filter((e) => e.apr != null)) : [];
  const tabLabel = tabs.find((t) => t.id === tab)?.label ?? "";

  return (
    <Layout>
      <Main>
        <Breadcrumbs
          trail={[
            { label: "Earn", href: "/earn" },
            { label: "Lend & Borrow", href: "/earn/lending&borrow" },
            { label: meta.name, href: "/earn/lending&borrow" },
            { label: pool.name },
          ]}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <AssetStack markets={pool.markets} max={4} size="2.75rem" />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
              {meta.name} {protocol === "blend" ? "pool" : "hub"} · {pool.markets.length} assets
            </Typography>
            <Typography sx={{ fontSize: "1.75rem", fontWeight: 700, color: "common.black", lineHeight: 1.2 }}>{pool.name}</Typography>
          </Box>
          <ProtocolBadge name={meta.name} logo={meta.logo} />
          <StatusPill info={status} />
        </Box>

        {status && (
          <Box sx={{ p: "1rem 1.25rem", borderRadius: "1rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
            <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>
              <b>{status.label}.</b> {status.tip}
            </Typography>
          </Box>
        )}

        {/* ---------- your position ---------- */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>My Position</Typography>
            {protocol === "xoxno" && hubAccounts.length > 0 && (
              <PositionPicker
                nav
                list={hubAccounts}
                value={viewAccount}
                placeholder={freshView ? "New position" : undefined}
                onPick={choosePosition}
              />
            )}
          </Box>

          {!isConnected ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: "0.9375rem", color: "grey.200" }}>Connect a wallet to see your position, health and rewards in this pool.</Typography>
              <MiniBtn label="Connect wallet" onClick={() => void openConnectModal()} />
            </Box>
          ) : (
            <>
              {/* Supplying and borrowing first, each with its bar and, while an amount is typed, the bar after. */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "1.5rem" }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 }}>
                  <Figure
                    label="Supplying"
                    inline
                    tip="What you supply in this pool."
                    value={<Shimmer on={posLoading} width="6rem" height="1.5rem">{formatUsd(supUsd)}</Shimmer>}
                    after={after && Math.abs(after.sup - supUsd) > 0.005 ? `${approx}${formatUsd(after.sup)}` : undefined}
                  />
                  <SupplyBar slices={supSlices} />
                  {after && Math.abs(after.sup - supUsd) > 0.005 && <SupplyPreview now={supUsd} after={after.sup} slices={after.supS} via={delta?.supMove?.code ?? m.code} />}
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 }}>
                  <Figure
                    label="Borrowing"
                    inline
                    tip="What you owe in this pool."
                    value={<Shimmer on={posLoading} width="6rem" height="1.5rem">{formatUsd(debtUsd)}</Shimmer>}
                    after={after && Math.abs(after.debt - debtUsd) > 0.005 ? `${approx}${formatUsd(after.debt)}` : undefined}
                    afterColor={red(after != null && after.debt > after.limit + 0.01)}
                  />
                  <BorrowBar bor={debtUsd} lim={lim} liq={liqLim} slices={debtSlices} />
                  {after && (Math.abs(after.debt - debtUsd) > 0.005 || Math.abs(after.limit - lim) > 0.005) && <BorrowBar bor={after.debt} lim={after.limit} liq={after.liq} slices={after.debtS} />}
                </Box>
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, columnGap: "1.25rem", rowGap: "1.5rem" }}>
                <Figure
                  label="Net value"
                  tip="Supplied minus borrowed."
                  value={<Shimmer on={posLoading} width="6rem" height="1.5rem">{formatUsd(netUsd)}</Shimmer>}
                  after={after ? `${approx}${formatUsd(after.net)}` : undefined}
                />
                <Figure
                  label="Net APY"
                  tip="Yearly interest earned minus interest paid, on your balance."
                  value={<Shimmer on={posLoading} width="3.5rem" height="1.5rem">{pct(netApyNow ?? 0)}</Shimmer>}
                  color={netApyNow != null && netApyNow < 0 ? "error.main" : undefined}
                  after={after ? `${approx}${pct(after.netApy ?? 0)}` : undefined}
                  afterColor={red(after?.netApy != null && after.netApy < 0)}
                  sub={
                    netApyNow != null
                      ? `${formatUsd((netUsd * netApyNow) / 100)} / year${blndApyNow ? ` · +${pct(blndApyNow)} BLND` : ""}`
                      : blndApyNow
                        ? `+${pct(blndApyNow)} BLND`
                        : undefined
                  }
                />
                <Figure
                  label="Collateral ratio"
                  tip="Supplied over borrowed."
                  value={<Shimmer on={posLoading} width="3.5rem" height="1.5rem">{now.collRatio != null ? ratioTxt(now.collRatio) : hasPosition ? "No debt" : "N/A"}</Shimmer>}
                  after={after ? (after.collRatio == null ? "No debt" : `${approx}${ratioTxt(after.collRatio)}`) : undefined}
                />
                <Figure
                  label="Safety ratio"
                  tip="Liquidation limit over debt. At 100% the position is liquidated."
                  value={<Shimmer on={posLoading} width="3.5rem" height="1.5rem">{now.safety != null ? ratioTxt(now.safety) : hasPosition ? "No debt" : "0%"}</Shimmer>}
                  color={posLoading ? undefined : ratioColor(now.safety)}
                  after={after ? (after.safety == null ? "No debt" : `${approx}${ratioTxt(after.safety)}`) : undefined}
                  afterColor={red(after?.safety != null && after.safety < 1.1)}
                />
                <Figure
                  label="Health factor"
                  tip="Below 1.00 the position is liquidated."
                  value={<Shimmer on={posLoading} width="3rem" height="1.5rem">{health != null ? health.toFixed(2) : hasPosition ? "No debt" : "N/A"}</Shimmer>}
                  color={posLoading ? undefined : healthColor(health)}
                  after={after ? (after.h == null ? "No debt" : `${approx}${after.h.toFixed(2)}`) : undefined}
                  afterColor={red(after?.h != null && after.h < 1.1)}
                  sub={protocol === "xoxno" && delta?.fresh ? "New position" : undefined}
                />
                <Figure
                  label="Borrow power used"
                  tip="Share of your borrow limit in use."
                  value={<Shimmer on={posLoading} width="3rem" height="1.5rem">{Number.isFinite(now.used) ? pct(Math.min(now.used, 9.99) * 100, 0) : "N/A"}</Shimmer>}
                  color={now.used > 0.9 ? "error.main" : now.used > 0.7 ? "orange.main" : undefined}
                  after={after ? `${approx}${Number.isFinite(after.used) ? pct(Math.min(after.used, 9.99) * 100, 0) : "N/A"}` : undefined}
                  afterColor={red(after != null && after.used > 1)}
                />
                <Figure
                  label="Left to borrow"
                  tip={
                    minColl
                      ? `How much more you can borrow. ${meta.name} needs ${formatUsd(minColl)} of collateral${protocol === "blend" ? " (counted after collateral factors)" : ""} before any borrow.`
                      : "How much more you can borrow."
                  }
                  value={<Shimmer on={posLoading} width="4.5rem" height="1.5rem">{formatUsd(now.left)}</Shimmer>}
                  after={after ? `${approx}${formatUsd(after.left)}` : undefined}
                  sub={minColl && (after ? after.belowMin : now.belowMin) ? `Borrowing opens at ${formatUsd(minColl)} collateral` : undefined}
                />
                <Figure
                  label={liqShown ? `Liquidation price (${liqShown.code})` : "Liquidation price"}
                  tip={
                    liqShown
                      ? `The ${liqShown.code} price at which this position is liquidated, as ${liqShown.code} ${liqShown.rises ? "rises" : "falls"} with other prices unchanged. Of all its assets, the one closest to that point.`
                      : "The price at which this position is liquidated."
                  }
                  value={
                    <Shimmer on={posLoading} width="4.5rem" height="1.5rem">
                      {liqNow != null ? (liqNow.px <= 0 ? "None" : formatUsd(liqNow.px)) : debtUsd > 0.01 ? "N/A" : hasPosition ? "No debt" : "N/A"}
                    </Shimmer>
                  }
                  sub={(() => {
                    // The distance from today's price, from the "after" while an amount is typed.
                    const l = after?.liqPx ?? liqNow;
                    if (!l) return undefined;
                    if (l.px <= 0) return "No single price move liquidates it";
                    const move = (l.px / l.now - 1) * 100;
                    return `Now ${formatUsd(l.now)} · ${move >= 0 ? "+" : "−"}${Math.abs(move).toFixed(1)}%`;
                  })()}
                  after={after ? (after.liqPx == null ? (after.debt > 0.01 ? "N/A" : "No debt") : after.liqPx.px <= 0 ? "None" : `${approx}${formatUsd(after.liqPx.px)}`) : undefined}
                  afterColor={red(after?.liqPx != null && after.liqPx.px > 0 && Math.abs(after.liqPx.px / after.liqPx.now - 1) <= 0.1)}
                />
              </Box>
            </>
          )}
        </Box>

        {/* ---------- XOXNO: all positions in this hub, totalled ---------- */}
        {protocol === "xoxno" && (
          <Panel sx={{ gap: "1.25rem" }}>
            <Box>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>All positions</Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                {!isConnected
                  ? "Connect a wallet to see your totals in this pool."
                  : totals && totals.count > 0
                    ? `Totals across your ${totals.count} position${totals.count === 1 ? "" : "s"} in ${pool.name}. What you earn on XOXNO is in each asset's supply APY.`
                    : posLoading
                      ? "Loading your positions…"
                      : `You have no positions in ${pool.name} yet.`}
              </Typography>
            </Box>
            {isConnected && totals && (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" }, columnGap: "1.25rem", rowGap: "1.5rem" }}>
                <Figure label="Total supplying" tip="Everything you supply in this pool, all positions." value={<Shimmer on={posLoading} width="6rem" height="1.5rem">{formatUsd(totals.sup)}</Shimmer>} />
                <Figure label="Total borrowing" tip="Everything you owe in this pool, all positions." value={<Shimmer on={posLoading} width="6rem" height="1.5rem">{formatUsd(totals.debt)}</Shimmer>} />
                <Figure label="Total net value" tip="Supplied minus borrowed, all positions." value={<Shimmer on={posLoading} width="6rem" height="1.5rem">{formatUsd(totals.net)}</Shimmer>} />
                <Figure
                  label="Supply APY"
                  tip="What your supply earns, averaged by amount across all positions."
                  value={<Shimmer on={posLoading} width="3.5rem" height="1.5rem">{totals.supApy != null ? pct(totals.supApy) : "N/A"}</Shimmer>}
                  color={totals.supApy != null ? "green.main" : undefined}
                />
                <Figure
                  label="Borrow APY"
                  tip="What your debt costs, averaged by amount across all positions."
                  value={<Shimmer on={posLoading} width="3.5rem" height="1.5rem">{totals.debtApy != null ? pct(totals.debtApy) : "No debt"}</Shimmer>}
                />
                <Figure
                  label="Net APY"
                  tip="Yearly interest earned minus interest paid, on your total net value."
                  value={<Shimmer on={posLoading} width="3.5rem" height="1.5rem">{totals.netApy != null ? pct(totals.netApy) : "N/A"}</Shimmer>}
                  color={totals.netApy != null && totals.netApy < 0 ? "error.main" : undefined}
                  sub={totals.netApy != null ? `${formatUsd(totals.yearUsd)} / year` : undefined}
                />
              </Box>
            )}
          </Panel>
        )}

        {/* ---------- rewards (Blend) ---------- */}
        {protocol === "blend" && (
        <Panel sx={{ gap: "1rem" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <TokenLogo code={protocol === "blend" ? "BLND" : "XLM"} size="2.25rem" />
              <Box>
                <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>Rewards</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                  {protocol === "blend" ? "BLND emissions earned by your supply and borrows in this pool" : "XOXNO pays no separate reward token"}
                </Typography>
              </Box>
            </Box>
            {protocol === "blend" && (
              <Box sx={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: claimable > 0 ? "green.main" : "common.black" }}>
                    <Shimmer on={posLoading} width="5rem">{isConnected ? `${formatAmount(claimable, 4)} BLND` : "0 BLND"}</Shimmer>
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>{claimable > 0 && blndPx ? `≈ ${formatUsd(claimable * blndPx)} claimable` : "Claimable"}</Typography>
                </Box>
                <MiniBtn
                  label="Claim"
                  disabled={!isConnected || posLoading || claimable <= 0.0001}
                  tip={!isConnected ? "Connect a wallet" : claimable <= 0.0001 ? "Nothing to claim yet" : null}
                  onClick={submitClaim}
                />
              </Box>
            )}
          </Box>
          {protocol === "blend" ? (
            emissions.length ? (
              <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {emissions.map(({ x, side, apr }) => (
                  <Box key={`${x.key}${side}`} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", height: "2.25rem", px: "0.75rem", borderRadius: "999rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
                    <MarketLogo m={x} size="1.25rem" />
                    <Typography sx={{ fontSize: "0.8125rem", color: "common.black" }}>
                      {side === "supply" ? "Supply" : "Borrow"} {x.code}
                    </Typography>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "green.main" }}>+{pct(apr)}</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{blndPx ? "This pool isn't paying BLND emissions right now." : "Emission rates load with the BLND price…"}</Typography>
            )
          ) : null}
        </Panel>
        )}

        {/* ---------- pool assets ---------- */}
        <DataTable
          variant="inset"
          title={`Assets in ${pool.name}`}
          columns={assetCols}
          rows={pool.markets}
          getRowId={(x) => x.key}
          onRowClick={(x) => chooseAsset(x)}
          defaultSort={{ id: "supplied", dir: "desc" }}
        />

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          <StatCard label="Total Supplied" value={compactUsd(pool.suppliedUsd)} />
          <StatCard label="Total Borrowed" value={compactUsd(pool.borrowedUsd)} />
          <StatCard label="Available Liquidity" value={compactUsd(pool.availableUsd)} />
          <StatCard label="Utilization" value={pct(pool.suppliedUsd > 0 ? (pool.borrowedUsd / pool.suppliedUsd) * 100 : null, 1)} />
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem", mt: "-0.5rem" }}>
          <StatCard label="Supply APY" value={pct(poolApy("supply"))} color="green.main" sub="Average across the pool, by amount supplied" />
          <StatCard label="Borrow APY" value={pct(poolApy("borrow"))} color="green.main" sub="Average across the pool, by amount borrowed" />
        </Box>

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "0.5rem" }}>Transactions</Typography>
          <ActivityTable items={poolActivity} loading={activity.loading && poolActivity.length === 0} multi={false} />
        </Box>
      </Main>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", ...pinnedColumn }} {...pinnedColumnProps}>
        <ActionCard
          tabs={tabs.map((t) => ({ ...t, blocked: actionBlock(m, t.id) }))}
          active={tab}
          openSignal={openSignal}
          onTab={(id) => changeTab(id as LendAction)}
          cta={
            isConnected ? (tab === "leverage" ? (closing ? (closeFrac >= 1 ? "Close Position" : `Close ${Math.round(closeFrac * 100)}%`) : `${levSide === "long" ? "Long" : "Short"} ${m.code} ${lv.lev.toFixed(1)}x`) : `${tabLabel} ${m.code}`) : "Connect wallet"
          }
          blocker={isConnected ? (tab === "leverage" ? (closing ? closeBlocker : levBlocker) : blocker) : null}
          onSubmit={() => (isConnected ? (tab === "leverage" ? (closing ? submitClose() : submitLeverage()) : submit()) : void openConnectModal())}
        >
          {tab === "leverage" && (
            <Box sx={{ display: "flex", gap: "0.375rem" }}>
              {[
                ...(longable.length ? [{ id: "long", label: "Long", on: !closing && levSide === "long", pick: () => { setLevMode("open"); setLevSide("long"); } }] : []),
                ...(shortable.length ? [{ id: "short", label: "Short", on: !closing && levSide === "short", pick: () => { setLevMode("open"); setLevSide("short"); } }] : []),
                ...(canClose ? [{ id: "close", label: "Close", on: closing, pick: () => setLevMode("close") }] : []),
              ].map((o) => (
                <ButtonBase
                  key={o.id}
                  onClick={o.pick}
                  sx={{
                    flex: 1,
                    height: "2.25rem",
                    borderRadius: "999rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: o.on ? "sidebar.white" : "grey.200",
                    backgroundColor: o.on ? (o.id === "short" ? "error.main" : o.id === "long" ? "green.main" : "sidebar.primary") : "overlay.white04",
                  }}
                >
                  {o.label}
                </ButtonBase>
              ))}
            </Box>
          )}
          {closing ? (
            <>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                Collateral <b style={{ color: "inherit" }}>{m.code}</b> · repay debt in
              </Typography>
              <Box sx={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
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
                      color: closeDebt?.contract === d.contract ? "sidebar.white" : "common.black",
                      backgroundColor: closeDebt?.contract === d.contract ? "sidebar.primary" : "overlay.white08",
                    }}
                  >
                    <TokenLogo code={d.code} contract={d.contract} size="1.125rem" />
                    {d.code}
                  </ButtonBase>
                ))}
              </Box>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>How much of the position to close</Typography>
              <Box sx={{ display: "flex", gap: "0.375rem" }}>
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
              <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
                Sells part of your {m.code} for {closeDebt?.code ?? "the debt"} with a flash loan, repays it and returns the rest, in one transaction.
              </Typography>
            </>
          ) : tab === "leverage" ? (
            <>
              {lv.coll && lv.debt && (
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", p: "0.625rem 0.875rem", borderRadius: "0.875rem", backgroundColor: "overlay.white04" }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{levSide === "long" ? "Long" : "Short"}</Typography>
                  <ButtonBase
                    onClick={canPick ? (e) => setMenuEl(e.currentTarget) : undefined}
                    disabled={!canPick}
                    sx={{ gap: "0.375rem", borderRadius: "999rem", px: "0.25rem" }}
                  >
                    <TokenLogo code={m.code} issuer={m.issuer} contract={m.contract} size="1.125rem" />
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "common.black" }}>{m.code}</Typography>
                    {canPick && <KeyboardArrowDown sx={{ fontSize: "1rem", color: "grey.200" }} />}
                  </ButtonBase>
                  {/* The divider sits midway between the two halves; the second half keeps to the right edge. */}
                  <Box sx={{ flex: 1, minWidth: "0.5rem" }} />
                  <Box sx={{ width: "0.0625rem", alignSelf: "stretch", minHeight: "1.25rem", flexShrink: 0, backgroundColor: "overlay.white20" }} />
                  <Box sx={{ flex: 1, minWidth: "0.5rem" }} />
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", whiteSpace: "nowrap" }}>
                      <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{levSide === "long" ? "Borrow" : "Collateral"}</Typography>
                      <TokenLogo code={lv.other!.code} issuer={lv.other!.issuer} contract={lv.other!.contract} size="1.125rem" />
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "common.black" }}>{lv.other!.code}</Typography>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "grey.200" }}>{lv.lev.toFixed(1)}x</Typography>
                    </Box>
                  </Box>
                </Box>
              )}
              <AmountBox
                label={`Deposit ${levColl.code} as collateral`}
                token={{ code: levColl.code, issuer: levColl.issuer, contract: levColl.contract }}
                amount={lv.amount}
                onAmount={lv.setAmount}
                balance={isConnected ? lv.walletBal : null}
                balanceNote={isConnected ? undefined : "Connect a wallet"}
                balanceLabel={levColl.code === "XLM" && !levColl.issuer ? "Spendable" : "Wallet"}
                balanceLoading={balLoading}
                price={levColl.priceUsd ?? null}
                onMax={lv.walletBal ? () => lv.setAmount(floorAmount(lv.walletBal, levColl.decimals)) : undefined}
                onTokenClick={levSide === "long" && canPick ? setMenuEl : undefined}
              />
              <LeverageFields lv={lv} />
              <DetailRows rows={lv.details} />
            </>
          ) : (
            <>
              <AmountBox
                label={`${tabLabel} ${m.code}`}
                token={{ code: m.code, issuer: m.issuer, contract: m.contract }}
                amount={amount}
                onAmount={setAmount}
                balance={isConnected ? available : null}
                balanceNote={isConnected ? undefined : "Connect a wallet"}
                balanceLabel={balanceLabel}
                balanceLoading={isConnected && availLoading}
                price={price}
                onMax={maxFill ? () => setAmount(floorAmount(maxFill, m.decimals)) : undefined}
                onTokenClick={canPick ? setMenuEl : undefined}
              />
              {tab === "supply" && protocol === "blend" && (
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
              {protocol === "xoxno" && !!me && (tab === "supply" || actionAccounts.length > 0) && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                    {tab === "supply" ? "Supply into" : tab === "withdraw" ? "Withdraw from" : tab === "borrow" ? "Borrow on" : "Repay on"}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    {tab === "supply" && (
                      <ButtonBase
                        onClick={() => setNewAcct(true)}
                        sx={{ height: "2.25rem", px: "0.875rem", borderRadius: "999rem", fontSize: "0.8125rem", color: !account ? "sidebar.white" : "common.black", backgroundColor: !account ? "sidebar.primary" : "overlay.white08" }}
                      >
                        + New position
                      </ButtonBase>
                    )}
                    {actionAccounts.length > 0 && (
                      <PositionPicker list={actionAccounts} value={account ?? actionAccounts[0]} active={!!account} height="2.25rem" onPick={choosePosition} />
                    )}
                  </Box>
                </Box>
              )}
              {tab === "supply" && protocol === "xoxno" && !account && supplySpokes.length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>XOXNO spoke</Typography>
                  <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {supplySpokes.map((s) => {
                      const on = spokeId === s.spokeId;
                      return (
                        <Chip key={s.spokeId} on={on} onClick={() => setSpoke(s.spokeId)}>
                          {s.spokeName}
                          {s.canBeCollateral === false ? (
                            <Box component="span" sx={{ color: on ? "sidebar.white" : "grey.200", opacity: on ? 0.75 : 1 }}>
                              Not collateral
                            </Box>
                          ) : (
                            <SpokeLtv on={on} code={m.code} pct={s.ltvBps / 100} />
                          )}
                        </Chip>
                      );
                    })}
                  </Box>
                </Box>
              )}
              <DetailRows rows={details} />
            </>
          )}
          {sheetRows.length > 0 && (
            <Box sx={{ ...sheetOnly, pt: "0.75rem", borderTop: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
              <DetailRows rows={sheetRows} />
            </Box>
          )}
        </ActionCard>

        <Menu
          anchorEl={menuEl}
          open={!!menuEl}
          onClose={() => setMenuEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { mt: "0.5rem", minWidth: "17rem", maxHeight: "22rem", borderRadius: "1rem", backgroundColor: "surfaceBg.section", backgroundImage: "none", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` } } }}
        >
          {pickGroups.flatMap((g, gi) => [
            ...(g.title
              ? [
                  <ListSubheader
                    key={`h${gi}`}
                    sx={{ lineHeight: "2rem", pt: gi ? "0.5rem" : 0, fontSize: "0.75rem", fontWeight: 600, color: "grey.200", backgroundColor: "surfaceBg.section" }}
                  >
                    {g.title}
                  </ListSubheader>,
                ]
              : []),
            ...(g.items.length === 0 && g.empty
              ? [
                  <MenuItem key={`e${gi}`} disabled sx={{ py: "0.625rem", fontSize: "0.8125rem" }}>
                    {g.empty}
                  </MenuItem>,
                ]
              : []),
            ...g.items.map((it) => (
              <MenuItem
                key={`${gi}:${it.x.key}:${it.acct?.accountId ?? (it.fresh ? "new" : "")}`}
                selected={it.x.key === m.key && !it.acct && !it.fresh}
                onClick={() => choosePick(it)}
                sx={{ gap: "0.75rem", py: "0.625rem" }}
              >
                <MarketLogo m={it.x} size="1.75rem" />
                <Typography sx={{ flex: 1, fontSize: "0.9375rem", color: "common.black" }}>{it.x.code}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: it.acct || it.fresh ? "primary.main" : "grey.200" }}>{it.note}</Typography>
              </MenuItem>
            )),
          ])}
        </Menu>

        <Box sx={{ borderRadius: "1.25rem", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, backgroundColor: "surfaceBg.section", p: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Stellar Network</Typography>
          {protocol === "blend" ? (
            <ContractRow icon={<Box component="img" src={meta.logo} sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />} label={`${pool.name} pool`} address={poolId} />
          ) : (
            <ContractRow icon={<Box component="img" src={meta.logo} sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />} label="XOXNO controller" address="CAUCMIN5KSXEVZ7NMXR3LZATGD5EFIEUI5XWTFLYRO2R5OTXI22WE5JX" />
          )}
          {m.contract && <ContractRow icon={<TokenLogo code={m.code} issuer={m.issuer} contract={m.contract} size="1.5rem" />} label={m.code} address={m.contract} />}
        </Box>
      </Box>
      <TxDialog open={tx.open} title={tx.title} steps={tx.steps} error={tx.error} onClose={() => setTx((t) => ({ ...t, open: false }))} />
    </Layout>
  );
}
