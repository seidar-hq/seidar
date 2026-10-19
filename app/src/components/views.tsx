"use client";
import { MarketStatusPill } from "./market-status";
import { ModeSwitch, PositionOverview, type OverviewStat } from "./position-overview";
import { accountLabel, accountName, useAccountNames } from "@/lib/account-names";
import { shortAddress } from "@/lib/format";
import { AccountTag } from "./account-tag";
import { explorerBase, getNetwork, horizonBase } from "@/lib/network";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { healthBps, healthStatus, netApy } from "@seidar/positions-sdk";
import { evaluateRule } from "@seidar/automation-sdk";
import {
  boostRecipe,
  repayRecipe,
  quoteFee,
  feeTierBps,
  Recipe,
} from "@seidar/sdk";
import type { AppView } from "./shell";
import { DiceAvatar, useTxActive, useShellSmarts, useViewScope } from "./shell";
import { EarnView } from "./earn";
import { LoadingMark } from "./loading";
import { TokenIcon } from "./token-icon";
import { ProtoMark } from "./proto-mark";
import { VaultsHub } from "./markets-hub";
import { LendSection } from "./lend-section";
import { PoolMove, VaultMove } from "./refinance-moves";
import { PoolAutomate } from "./pool-automate";
import { CompositionBar, HistoryChart, fmtPx, fmtUsdShort } from "./pool-charts";
import { ClDeposit, ClRanges, useClPool, useClPositions } from "./pool-range";
import { ExchangeView, executeMarketSwap, XRouteSelect, routeLabel, isAutoRoute, quoteOut, quoteRoutes, toBaseUnits, type Quote, type RouteChoice, type SwapToken } from "./exchange";
import { LeverageModal, maxLeverageForLtv } from "./leverage";
import { StrategyBuilder } from "./recipes";
import { fallbackHue } from "@/lib/tokens";
import { apiFetch } from "@/lib/api";
import { signAndSend, toBase, type TxStep } from "@/lib/tx";
import { runActs, runChain, planFor, type LendAct, type LendCtx } from "./lending-exec";
import { TxSteps } from "./tx-steps";
import { TxModal, type TxRow, type TxSpec } from "./tx-modal";
import { AquaRwaDeposit, StableVaultDeposit, topVaults } from "./earn-deposit";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";
import { AutomationSummary, LiquidationProtectionPanel } from "./automate";
import { AutomationVenue, blendStatusNote, useAutomation, useBlendAutoPool, usePositionView, venuePool } from "./automate-kit";
import {
  ClosePanel,
  CollateralSwitchPanel,
  LeverageManagementPanel,
  TargetPricePanel,
} from "./automate-strategies";
import { EarnFeed, showOpportunities } from "./earn-feed";
import { ProtocolHistory } from "./protocol-history";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { HORIZON_MAINNET, HORIZON_TESTNET, useHorizonSSE } from "@/lib/use-horizon-sse";

/** Deterministic per-asset bar color (brighter twin of the letter badge). */
function segColor(code: string): string {
  return `hsl(${fallbackHue(code)} 65% 55%)`;
}
const STABLES = new Set(["USDC", "EURC", "USDT0", "USDGLO", "PYUSD"]);
function goto(view: AppView) {
  window.dispatchEvent(new CustomEvent("seidar:goto-view", { detail: view }));
}
/* Smart-gate morph label: while a quote button waits for its smart account
   it shows an animated Switch/Create pill; every other state renders the
   normal content untouched. Distinct keys remount the span so the swap
   animates. */
function gateLabel(armed: boolean, normal: React.ReactNode, word = "Create") {
  if (!armed) {
    return (
      <span key="go" className="btn-swap">
        {normal}
      </span>
    );
  }
  return (
    <span key="create" className="btn-swap">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>{" "}
      {word}
    </span>
  );
}
/* Smart-gate chooser modal: quoting runs as the active account, so when it
   is not a smart account this offers both ways forward - switch to an
   existing smart (single row, or a dropdown when several exist) and a
   Create entry that flips to the smart-account creator. Reuses the
   search/sa modal language. */
function SmartGateModal({
  open,
  smarts,
  onPick,
  onCreate,
  onClose,
}: {
  open: boolean;
  smarts: string[];
  onPick: (addr: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(smarts[0] ?? "");
  useEffect(() => {
    if (open) setSel(smarts[0] ?? "");
  }, [open, smarts]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="search-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="search-modal sa-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Smart account required"
      >
        <h3>Smart account required</h3>
        <p className="sa-sub">
          Quotes run as the active account. Switch to a smart account or
          create one to continue.
        </p>{" "}
        {smarts.length === 1 ? (
          <button
            key={smarts[0]}
            type="button"
            className="proto-acct-row sg-pick"
            onClick={() => onPick(smarts[0])}
          >
            <DiceAvatar address={smarts[0]} size={20} square />{" "}
            <AccountTag address={smarts[0]} className="proto-acct-addr" />{" "}
            <span className="proto-acct-tag">Smart wallet</span>
          </button>
        ) : smarts.length > 1 ? (
          <div className="sg-switch">
            <select
              className="proto-select"
              aria-label="Smart account"
              value={sel}
              onChange={(e) => setSel(e.target.value)}
            >
              {smarts.map((s) => (
                <option key={s} value={s}>
                  {shortAddr(s)} · Smart wallet
                </option>
              ))}
            </select>{" "}
            <button
              type="button"
              className="btn primary"
              disabled={!sel}
              onClick={() => {
                if (sel) onPick(sel);
              }}
            >
              Switch
            </button>
          </div>
        ) : null}{" "}
        <button
          type="button"
          className="btn primary sg-create"
          onClick={onCreate}
        >
          {" "}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>{" "}
          Create smart account
        </button>{" "}
        <button type="button" className="btn sg-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
type WalletLeg = {
  protocol: "blend" | "xoxno";
  asset: string;
  code: string;
  /** Pool/market contract (Blend pool). Absent when the
      upstream does not attribute one (XOXNO reserves). */
  pool?: string;
  suppliedUsd: number;
  borrowedUsd: number;
  /** Human token units straight from /api/positions (may be absent). */
  supplyAmount?: number;
  borrowAmount?: number;
  /** Set by useMergedPositions: the account holding the leg and that
      account's health factor on the leg's protocol. */
  account?: string;
  hf?: number | null;
};
type WalletPositions = {
  ok: boolean;
  totalSupplied: number;
  totalBorrowed: number;
  /** Unclaimed Blend BLND emissions (usd null when BLND is unpriced). */
  claimable?: { blnd: number; usd: number | null };
  updatedAt: number;
  perProtocol: Record<
    string,
    {
      supplied: number;
      borrowed: number;
      netApy?: number;
      pending?: boolean;
      effectiveCollateral?: number;
      effectiveLiabilities?: number;
      borrowLimit?: number;
      collateralFactorsBps?: Record<string, number>;
      healthFactor?: number | null;
      dropToLiquidationPct?: number | null;
      liquidationThresholdsBps?: Record<string, number>;
    }
  >;
  legs: WalletLeg[];
};
function useWalletAddress() {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    function onWallet(e: Event) {
      setAddress((e as CustomEvent<string | null>).detail ?? null);
    }
    window.addEventListener("seidar:wallet", onWallet);
    try {
      const raw = window.localStorage.getItem("seidar.wallet");
      if (raw) setAddress(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("seidar:wallet", onWallet);
  }, []);
  return address;
}
function useWalletPositions(overrideAddr: string | null = null) {
  const self = useWalletAddress();
  const address = overrideAddr ?? self;
  const [data, setData] = useState<WalletPositions | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    function load() {
      apiFetch(`/api/positions?address=${address}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d?.ok) setData(d as WalletPositions);
        })
        .catch(() => {
          /* keep last */
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      cancelled = true;
      window.removeEventListener("seidar:refresh", load);
    };
  }, [address]);
  return { address, data, loading };
}
/** Positions for one or several addresses (comma-joined key): merged legs
 *  with summed totals, so "All wallets" reads as one set of books. */
function useMergedPositions(addrsKey: string) {
  const [data, setData] = useState<{
    totalSupplied: number;
    totalBorrowed: number;
    claimable: { blnd: number; usd: number };
    legs: WalletLeg[];
    /** Accounts whose read still failed after retries (shown as partial). */
    missing: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const addrs = addrsKey ? addrsKey.split(",") : [];
    if (addrs.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    // Never show one scope's numbers under another scope's label.
    setData(null);
    setLoading(true);
    function load(attempt = 0) {
      if (retry) clearTimeout(retry);
      Promise.all(
        addrs.map((a) =>
          apiFetch(`/api/positions?address=${a}`)
            .then((r) => r.json())
            .catch(() => null),
        ),
      )
        .then((rows) => {
          if (cancelled) return;
          const failed = addrs.filter((_, i) => !rows[i]?.ok);
          // An incomplete read retries a few times before it is shown as
          // partial — a page must never sit on "Loading positions…".
          if (failed.length && attempt < 3) {
            retry = setTimeout(() => load(attempt + 1), 2500 * (attempt + 1));
            return;
          }
          const okIdx = addrs.map((_, i) => i).filter((i) => rows[i]?.ok);
          const ok = okIdx.map((i) => rows[i] as WalletPositions);
          setData({
            missing: failed,
            totalSupplied: ok.reduce((s, d) => s + (d.totalSupplied ?? 0), 0),
            totalBorrowed: ok.reduce((s, d) => s + (d.totalBorrowed ?? 0), 0),
            claimable: {
              blnd: ok.reduce((s, d) => s + (d.claimable?.blnd ?? 0), 0),
              usd: ok.reduce((s, d) => s + (d.claimable?.usd ?? 0), 0),
            },
            legs: ok.flatMap((d, k) =>
              (d.legs ?? []).map((l) => ({
                ...l,
                account: addrs[okIdx[k]],
                hf: d.perProtocol?.[l.protocol]?.healthFactor ?? null,
              })),
            ),
          });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    const refresh = () => load();
    load();
    window.addEventListener("seidar:refresh", refresh);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener("seidar:refresh", refresh);
    };
  }, [addrsKey]);
  return { data, loading };
}
/** Blend pool contract -> display name (e.g. "Fixed"), for position titles. */
function useBlendPoolNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    apiFetch("/api/pools?protocol=blend", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (dead || !d?.ok) return;
        const m: Record<string, string> = {};
        for (const r of [...(d.rows ?? []), ...(d.assets ?? [])] as { pool?: string; poolName?: string }[])
          if (r.pool && r.poolName) m[r.pool] = r.poolName;
        setNames(m);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);
  return names;
}
/** Vault deposits (DeFindex + Upshift) across one or several accounts. */
type VaultPositionRow = {
  protocol?: string;
  vault?: string;
  name?: string;
  shares?: string;
  underlying?: { asset: string; code?: string; amount: string }[];
  valueUsd?: number | null;
  /** Set by useMergedVaultPositions: the account holding the shares. */
  account?: string;
};
function useMergedVaultPositions(addrsKey: string) {
  const [positions, setPositions] = useState<VaultPositionRow[]>([]);
  useEffect(() => {
    const addrs = addrsKey ? addrsKey.split(",") : [];
    if (addrs.length === 0) {
      setPositions([]);
      return;
    }
    let dead = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    setPositions([]);
    const load = (attempt = 0): Promise<void> =>
      Promise.all(
        addrs.map((a) =>
          apiFetch(`/api/vaults/positions?address=${a}`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null),
        ),
      )
        .then((rows) => {
          if (dead) return;
          if (rows.some((d) => !d?.ok) && attempt < 3) {
            retry = setTimeout(() => load(attempt + 1), 2500 * (attempt + 1));
            return;
          }
          setPositions(
            rows.flatMap((d, i) =>
              d?.ok ? ((d.positions ?? []) as VaultPositionRow[]).map((p) => ({ ...p, account: addrs[i] })) : [],
            ),
          );
        })
        .catch(() => {
          /* keep last */
        });
    const refresh = () => void load();
    load();
    window.addEventListener("seidar:refresh", refresh);
    return () => {
      dead = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener("seidar:refresh", refresh);
    };
  }, [addrsKey]);
  return positions;
}
/** Live token -> USD prices, polled so projections track the market.
 * Unknown codes arrive as null (route pins stables, falls back EURC) —
 * callers use px() below which degrades to 1.0 (estimate). */
function useTokenPrices(codes: string[]) {
  const key = [...new Set(codes.map((c) => c.toUpperCase()))]
    .sort()
    .join(",");
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await apiFetch(`/api/prices?codes=${encodeURIComponent(key)}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!cancelled && d?.ok) {
          setPrices(d.prices ?? {});
          setUpdatedAt(d.updatedAt ?? Date.now());
        }
      } catch {
        /* keep last */
      }
    }
    load();
    const t = setInterval(load, 45000);
    window.addEventListener("seidar:refresh", load);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("seidar:refresh", load);
    };
  }, [key]);
  return { prices, updatedAt };
}
/** Short address, or the owner's name for one of their smart accounts. */
function shortAddr(a: string | null) {
  return a && a.length > 9 ? accountLabel(a) : "this wallet";
}
/** Spendable token balances for an account (mainnet Horizon via
 *  /api/balances). Powers supply-side ceilings: you cannot supply what
 *  the active account does not hold. */
function useTokenBalances(address: string | null) {
  const [bals, setBals] = useState<Record<string, number>>({});
  const load = useCallback(() => {
    if (!address) {
      setBals({});
      return;
    }
    apiFetch(`/api/balances?address=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.balances)) {
          const m: Record<string, number> = {};
          for (const b of d.balances as {
            code?: unknown;
            balance?: unknown;
            issuer?: unknown;
            listed?: unknown;
          }[]) {
            // An unlisted issuer's "USDC" is not USDC: keep it apart (and
            // unpriced) instead of merging it into the real asset.
            const raw = typeof b?.code === "string" ? b.code.toUpperCase() : "";
            const code =
              raw && b?.listed === false
                ? `${raw} · ${String(b.issuer ?? "").slice(0, 4)}`
                : raw;
            const n = Number(b?.balance);
            if (code && n > 0) m[code] = Math.max(m[code] ?? 0, n);
          }
          setBals(m);
        }
      })
      .catch(() => {
        /* keep last */
      });
  }, [address]);
  useEffect(() => {
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      window.removeEventListener("seidar:refresh", load);
    };
  }, [address, load]);
  // Live mainnet feed: trustline changes refetch within ~2s (refresh stays).
  useHorizonSSE(horizonBase(), address, load);
  return bals;
}
/** Spendable token balances across one or several accounts: each account's
 *  per-code balance summed, unlisted issuers kept apart like above. */
function useMergedTokenBalances(addrsKey: string) {
  const [bals, setBals] = useState<Record<string, number>>({});
  const load = useCallback(() => {
    const addrs = addrsKey ? addrsKey.split(",") : [];
    if (addrs.length === 0) {
      setBals({});
      return;
    }
    Promise.all(
      addrs.map((a) =>
        apiFetch(`/api/balances?address=${a}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ),
    )
      .then((rows) => {
        if (rows.some((d) => !d?.ok)) return; // keep last complete read
        const merged: Record<string, number> = {};
        for (const d of rows) {
          const per: Record<string, number> = {};
          for (const b of (d.balances ?? []) as {
            code?: unknown;
            balance?: unknown;
            issuer?: unknown;
            listed?: unknown;
          }[]) {
            // An unlisted issuer's "USDC" is not USDC: keep it apart (and
            // unpriced) instead of merging it into the real asset.
            const raw = typeof b?.code === "string" ? b.code.toUpperCase() : "";
            const code =
              raw && b?.listed === false
                ? `${raw} · ${String(b.issuer ?? "").slice(0, 4)}`
                : raw;
            const n = Number(b?.balance);
            if (code && n > 0) per[code] = Math.max(per[code] ?? 0, n);
          }
          for (const [code, n] of Object.entries(per))
            merged[code] = (merged[code] ?? 0) + n;
        }
        setBals(merged);
      })
      .catch(() => {
        /* keep last */
      });
  }, [addrsKey]);
  useEffect(() => {
    // One scope's balances must not sit under another scope's label.
    setBals({});
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      window.removeEventListener("seidar:refresh", load);
    };
  }, [addrsKey, load]);
  return bals;
}
/** Numbers-only input: digits with a single decimal point, no leading zeros. */ function onlyNum(
  v: string,
) {
  const clean = v.replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  const num =
    dot === -1
      ? clean
      : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "");
  return num.replace(/^0+(?=\d)/, "");
}
const PROTOCOL_ICONS: Record<string, string> = {
  blend: "/protocol-blend.png",
  xoxno: "/protocol-xoxno.png",
};
const PROTOCOL_ICON_SIZE: Record<string, number> = {
  blend: 24,
  xoxno: 22,
};
function ProtoIcon({ protocol, size }: { protocol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = PROTOCOL_ICONS[protocol];
  const px = size ?? PROTOCOL_ICON_SIZE[protocol] ?? 18;
  if (!src || failed) {
    return (
      <span
        className="token-fallback"
        aria-label={protocol}
        style={{
          width: px,
          height: px,
          fontSize: Math.max(8, Math.round(px * 0.42)),
          background: "#232323",
        }}
      >
        {" "}
        {protocol.slice(0, 1).toUpperCase()}{" "}
      </span>
    );
  }
  return (
    <img loading="lazy"
      src={src}
      alt=""
      width={px}
      height={px}
      className="token-icon"
      onError={() => setFailed(true)}
    />
  );
}
function healthPill(collateralValue: number, debtValue: number) {
  const h = healthBps(collateralValue, debtValue);
  const s = healthStatus(h);
  if (s === "yield") return <span className="pill">Yield</span>;
  const bps = (h as number).toFixed(0);
  if (s === "healthy")
    return (
      <span className="pill green">
        Healthy · {(Number(bps) / 10000).toFixed(2)}
      </span>
    );
  if (s === "watch")
    return (
      <span className="pill amber">
        Watch · {(Number(bps) / 10000).toFixed(2)}
      </span>
    );
  return (
    <span className="pill red">Risk · {(Number(bps) / 10000).toFixed(2)}</span>
  );
}
/* ---------------------------- Earn: getting started ---------------------------- */ type FeatureCard =
  {
    asset: string;
    against?: string;
    tint: string;
    titleA: string;
    leverage: string;
    leverageColor: string;
    primary: string;
    secondary: string;
    browse: string;
  view: AppView;
  spark: string;
  img?: string;
  /** Asset code for the live trading subline (price + 24h change). */
  live?: string;
  /** Primary/secondary buttons open the blank modal instead of navigating. */
  openModal?: boolean;
};
type EarnAsset = { code: string; liveKey?: string };
type EarnCard = {
  tag: string;
  title: string;
  assets: EarnAsset[];
  /** Static badge art replacing the icon/APY badge. */
  badgeImg?: string;
  /** Show codes next to the title icons (else icons live in the badge). */
  inlineCodes: boolean;
  /** Title icon size (default 18). */
  iconSize?: number;
  cta: string;
  action:
    | { type: "goto"; view: AppView }
    | { type: "href"; href: string }
    | { type: "market"; protocol: string; collateral: string }
    /** Opens a one-step deposit modal (components/earn-deposit.tsx). */
    | { type: "deposit"; id: "stable" | "rwa-pool" };
  desc?: string;
};
const EARN_START: { earns: EarnCard[] } = {
    earns: [
      {
        tag: "DeFindex",
        title: "Earn with",
        assets: [
          { code: "USDC", liveKey: "defindex|USDC" },
        ],
        inlineCodes: true,
        iconSize: 26,
        cta: "Deposit USDC",
        action: { type: "deposit", id: "stable" },
      },
      {
        tag: "Aqua",
        title: "Earn Treasury yield on Aqua",
        assets: [{ code: "USTRY" }, { code: "USDC" }],
        badgeImg: "/ustry-coin-wrapped.png",
        inlineCodes: true,
        iconSize: 22,
        cta: "Add liquidity",
        action: { type: "deposit", id: "rwa-pool" },
      },
    ],
};
function Spark({ points, tint }: { points: string; tint: string }) {
  return (
    <svg
      viewBox="0 0 160 40"
      preserveAspectRatio="none"
      className="dz-spark"
      aria-hidden="true"
    >
      {" "}
      <polyline
        points={points}
        fill="none"
        stroke={tint}
        strokeWidth="1.5"
        opacity="0.7"
      />{" "}
    </svg>
  );
}
/* Net-worth sparkline: the wallet's own observed equity curve. Server
   history (per-hour piggyback snapshots, 90 days) is truth when reachable;
   the hourly local sampler stays as instant paint + offline fallback (last
   120 kept). Same computed net worth the card shows — real numbers, never
   invented. Green when the wallet is up since the first sample, red when
   down. */
export type EqPoint = { t: number; v: number };
function readEquity(addr: string): EqPoint[] {
  try {
    const raw = window.localStorage.getItem(`seidar.equity.${getNetwork()}.${addr}`);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (p): p is EqPoint =>
          typeof p?.t === "number" &&
          typeof p?.v === "number" &&
          p.t > 0 &&
          p.v >= 0,
      )
      .slice(-120);
  } catch {
    return [];
  }
}
export function EqSpark({ points }: { points: EqPoint[] }) {
  const W = 84;
  const H = 30;
  const PAD = 3;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  // No range (single sample, or a perfectly static curve) renders as the
  // reference dormant state: a mid-panel flat line with area beneath it —
  // never a lone dot, never glued to the bottom edge.
  const flatRange = hi - lo <= 0;
  const xy =
    points.length === 1
      ? [`${PAD},${H / 2}`, `${W - PAD},${H / 2}`]
      : points.map((p, i) => {
          const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
          const y = flatRange
            ? H / 2
            : H - PAD - ((p.v - lo) / (hi - lo)) * (H - PAD * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
  const t = eqTrend(points);
  const line =
    xy.length >= 2
      ? `M${xy.join(" L")}`
      : "";
  const area =
    xy.length >= 2
      ? `${line} L ${xy[xy.length - 1].split(",")[0]} ${H + 4} L ${xy[0].split(",")[0]} ${H + 4} Z`
      : "";
  const [lx, ly] = xy[xy.length - 1].split(",").map(Number);
  return (
    <svg
      className="eq-spark"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Net worth trend, ${t.word}`}
    >
      {" "}
      <title>{`Net worth ${t.word} since tracking started`}</title>{" "}
      <defs>
        <linearGradient id="eq-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={t.hex}
            stopOpacity=".32"
            style={{ transition: "stop-color .6s" }}
          />
          <stop
            offset="100%"
            stopColor={t.hex}
            stopOpacity="0"
            style={{ transition: "stop-color .6s" }}
          />
        </linearGradient>
      </defs>{" "}
      {area && <path d={area} fill="url(#eq-area-grad)" />}{" "}
      {line && (
        <path
          d={line}
          fill="none"
          stroke={t.hex}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: "stroke .6s" }}
        />
      )}{" "}
      <circle
        fill="none"
        stroke={t.hex}
        strokeWidth="1.5"
        cx={lx}
        cy={ly}
        r="2.5"
        opacity=".6"
        style={{ transition: "stroke .6s" }}
      >
        <animate
          attributeName="r"
          values="2.5;7.5"
          dur="1.8s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values=".6;0"
          dur="1.8s"
          repeatCount="indefinite"
        />
      </circle>{" "}
      <circle
        cx={lx}
        cy={ly}
        r="2.6"
        fill={t.hex}
        style={{ transition: "fill .6s" }}
      />{" "}
    </svg>
  );
}
/* Trend of an equity curve: first-to-last move, signed percent, palette
   triple shared by the spark, the pill and the state word. */
export function eqTrend(points: EqPoint[]): {
  dir: 1 | -1 | 0;
  word: string;
  pct: string;
  sign: string;
  hex: string;
  rgb: string;
} {
  const first = points[0]?.v ?? 0;
  const last = points[points.length - 1]?.v ?? 0;
  const dir = last > first ? 1 : last < first ? -1 : 0;
  const pct =
    first > 0 ? (Math.abs(last - first) / first) * 100 : 0;
  const fixed = pct.toFixed(2);
  return {
    dir,
    word: dir === 0 ? "stable" : dir > 0 ? "rising" : "falling",
    pct: fixed,
    sign: dir === 0 ? "0.00" : dir > 0 ? `+${fixed}` : `−${fixed}`,
    hex: dir === 0 ? "#94a3b8" : dir > 0 ? "#57c36b" : "#e66b6b",
    rgb:
      dir === 0 ? "148,163,184" : dir > 0 ? "87,195,107" : "230,107,107",
  };
}
/* Pill direction glyphs from the reference: triangle up / down, dash flat. */
export function EqDirIcon({ dir }: { dir: 1 | -1 | 0 }) {
  if (dir === 0) {
    return (
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="1" y="4.2" width="8" height="1.6" rx=".8" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      {dir > 0 ? (
        <path d="M5 1.5l4 6.5H1z" fill="currentColor" />
      ) : (
        <path d="M5 8.5L1 2h8z" fill="currentColor" />
      )}
    </svg>
  );
}
/* Directional action glyph: primary legs point up (green), secondary
   legs point down (red). Replaces the old generic zap. */
function DirArrow({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      className={`dz-dir dz-${dir}`}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {" "}
      {dir === "up" ? (
        <>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </>
      ) : (
        <>
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </>
      )}{" "}
    </svg>
  );
}
/* Blank placeholder modal: an empty card with only a cancel icon until
   the real flow lands. Shared by the Earn cards. */
export function BlankModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="search-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="search-modal sa-modal blank-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Coming soon"
      >
        {" "}
        <button
          type="button"
          className="mv-x blank-x"
          onClick={onClose}
          aria-label="Close"
        >
          {" "}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>{" "}
        </button>{" "}
      </div>
    </div>
  );
}
/* Quote confirmation model: one normalized shape for every action tab. */
export type ConfirmLeg = { label: string; usd: number; code: string };
export type ConfirmModel = {
  title: string;
  pool: string | null;
  legs: ConfirmLeg[];
  rate: { text: string; out: string } | null;
  flash: { tok: number; code: string; fee: number; feeBps: number } | null;
  steps: string;
  health: string | null;
  route: string | null;
  slippage: string | null;
  sendTo: string | null;
  moveTo?: string | null;
  /** Live swap-leg price impact (Soroswap), null when unquoted. */
  impact: string | null;
  warnings: string[];
  intentJson?: string;
  confirmLabel: string;
  px: (code: string) => number;
  /** Real execution: build -> sign -> confirm each step, reporting progress. */
  execute?: (onSteps: (s: TxStep[]) => void) => Promise<void>;
};
/* Action confirmation: every board action (supply, borrow, withdraw,
   repay, boost, switches) confirms and reports through the shared
   transaction popup — details first, then per-transaction results with
   stellar.expert links. ok means ledger SUCCESS. */
export function QuoteModal({
  model,
  onClose,
}: {
  model: ConfirmModel | null;
  onClose: () => void;
}) {
  let spec: TxSpec | null = null;
  if (model) {
    const tok = (usd: number, code: string) => {
      const p = model.px(code);
      return (p > 0 ? usd / p : 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
    };
    const lead = model.legs[0];
    const rows: TxRow[] = model.legs.map((l) => ({
      label: l.label,
      value: `${tok(l.usd, l.code)} ${l.code}`,
      sub: `$${fmtNum(l.usd)}`,
    }));
    if (model.rate) rows.push({ label: model.rate.text, value: model.rate.out });
    if (model.impact != null) rows.push({ label: "Price impact", value: `${model.impact}%` });
    if (model.health != null)
      rows.push({ label: "Health after", value: model.health, hint: "Below 1.00 the position can be liquidated." });
    if (model.route != null) rows.push({ label: "Exchange route", value: model.route });
    if (model.slippage != null) rows.push({ label: "Slippage guard", value: model.slippage });
    if (model.sendTo != null) rows.push({ label: "Sending to", value: shortAddr(model.sendTo) });
    rows.push({ label: "Signatures", value: model.steps, hint: "Each step is one approval in your wallet." });
    spec = {
      title: model.legs.length === 1 && lead ? `${lead.label}: ${tok(lead.usd, lead.code)} ${lead.code}` : model.title,
      code: lead?.code,
      amount: lead ? tok(lead.usd, lead.code) : undefined,
      context: model.pool ?? undefined,
      rows,
      notes: model.warnings,
      confirmLabel: model.confirmLabel || "Accept",
      execute:
        model.execute ??
        (async () => {
          throw new Error("This action can't be executed yet.");
        }),
    };
  }
  return <TxModal spec={spec} onClose={onClose} />;
}
/* Card visual: photo when the card names one (missing file falls back to
   the SVG spark, never a broken image). */
function DzVisual({ f }: { f: FeatureCard }) {
  const [imgOk, setImgOk] = useState(true);
  if (f.img && imgOk) {
    return (
      <img loading="lazy"
        src={f.img}
        alt=""
        className="dz-photo"
        onError={() => setImgOk(false)}
      />
    );
  }
  return <Spark points={f.spark} tint={f.tint} />;
}
/* Live trading subline for feature cards ("Trading at $X, down Y% over
   the last 24h"). Renders only when the feed served a price — the change
   clause drops out when its leg is unknown. */
function DzTicker({
  px,
  chg,
}: {
  px: number | null;
  chg: number | null;
}) {
  if (px == null || !(px > 0)) return null;
  const price = `$${px.toLocaleString("en-US", { maximumFractionDigits: px >= 1 ? 2 : 4 })}`;
  const move =
    chg != null && chg > 0
      ? { cls: "tk-up", text: `up ${chg.toFixed(2)}%` }
      : chg != null && chg < 0
        ? { cls: "tk-down", text: `down ${Math.abs(chg).toFixed(2)}%` }
        : null;
  return (
    <p className="dz-ticker">
      {" "}
      Trading at <b>{price}</b>
      {move ? (
        <>
          {", "}
          <span className={move.cls}>{move.text}</span> over the last 24h.
        </>
      ) : (
        "."
      )}{" "}
    </p>
  );
}
/* Earn → Getting started: the curated cards at the top of the Earn page. */
function EarnStart() {
  const router = useRouter();
  const data = EARN_START;
  const [liveApy, setLiveApy] = useState<Record<string, number> | null>(null);
  /* APY of the top DeFindex vault per asset (the deposit modal's targets). */
  const [vaultApy, setVaultApy] = useState<Record<string, number> | null>(null);
  const [deposit, setDeposit] = useState<null | "stable" | "rwa-pool">(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/vaults?protocol=defindex", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok || !Array.isArray(d.rows)) return;
        const out: Record<string, number> = {};
        for (const v of topVaults(d.rows, ["USDC"])) if (v.apyPct != null) out[`defindex|${v.assetCode}`] = v.apyPct;
        setVaultApy(out);
      })
      .catch(() => {
        /* badge stays without a number */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/pools")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok || !Array.isArray(d.rows)) return;
        const best: Record<string, number> = {};
        for (const m of d.rows as {
          protocol: string;
          collateral: string;
          supplyApy: number;
        }[]) {
          const k = `${m.protocol}|${m.collateral}`;
          best[k] = Math.max(best[k] ?? 0, m.supplyApy);
        }
        setLiveApy(best);
      })
      .catch(() => {
        /* the badge stays without a number, never fake ones */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="pf-card pf-home" style={{ marginTop: 12 }}>
      {" "}
        <div className="dz-head">
          {" "}
          <span className="dz-kicker">Getting Started</span>{" "}
          <button
          type="button"
          className="dz-more"
          onClick={() => showOpportunities("all")}
        >
          {" "}
          <span className="dz-more-ico" aria-hidden="true">
            {" "}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 2.5" />
            </svg>{" "}
          </span>{" "}
          View more{" "}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>{" "}
        </button>{" "}
      </div>{" "}
      {deposit === "stable" && <StableVaultDeposit onClose={() => setDeposit(null)} />}
      {deposit === "rwa-pool" && <AquaRwaDeposit onClose={() => setDeposit(null)} />}
      <div className="dz-grid">
        {" "}
        <div className="dz-col">
          {" "}
          <div className="dz-card dz-explore">
            {" "}
            <p className="dz-explore-title">Explore more options</p>{" "}
            <p className="dz-explore-sub">
              Compare every vault across protocols.
            </p>{" "}
            <div className="dz-chips">
              {" "}
              <button type="button" onClick={() => showOpportunities("all")}>
                All vaults <span aria-hidden="true">→</span>
              </button>{" "}
              <button type="button" onClick={() => showOpportunities("earn")}>
                Earn <span aria-hidden="true">→</span>
              </button>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        <div className="dz-col">
          {" "}
          {data.earns.map((c) => {
            const apys = c.assets.map((a) =>
              a.liveKey ? (liveApy?.[a.liveKey] ?? vaultApy?.[a.liveKey]) : undefined,
            );
            const best =
              apys.length > 0
                ? Math.max(
                    ...apys.filter(
                      (v): v is number => typeof v === "number",
                    ),
                  )
                : undefined;
            const multi = c.assets.length > 1;
            return (
              <div className="dz-card dz-earn" key={c.tag + c.title}>
                {" "}
                <div>
                  {" "}
                  <small className="dz-tag">{c.tag}</small>{" "}
                  <p className="dz-title">
                    {" "}
                    {c.title}{" "}
                    {c.inlineCodes &&
                      c.assets.map((a) => (
                        <span key={a.code} className="dz-tasset">
                          {" "}
                          <TokenIcon symbol={a.code} size={c.iconSize ?? 18} /> {a.code}{" "}
                        </span>
                      ))}{" "}
                  </p>{" "}
                  {c.desc && <p className="dz-desc">{c.desc}</p>}{" "}
                  <button
                    type="button"
                    className="dz-open"
                    onClick={() => {
                      const a = c.action;
                      if (a.type === "href") router.push(a.href);
                      else if (a.type === "deposit") setDeposit(a.id);
                      else if (a.type === "market") {
                        try {
                          window.localStorage.setItem(
                            "seidar.prefillMarket",
                            JSON.stringify({ collateral: a.collateral, debt: null }),
                          );
                        } catch {
                          /* board defaults */
                        }
                        router.push(`/markets/${a.protocol}/lend`);
                      } else goto(a.view);
                    }}
                  >
                    {" "}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 17L17 7" />
                      <path d="M8 7h9v9" />
                    </svg>{" "}
                    {c.cta}{" "}
                  </button>{" "}
                </div>{" "}
                {c.badgeImg ? (
                  <img loading="lazy"
                    className="dz-apy-img"
                    src={c.badgeImg}
                    alt={`${c.title} ${c.assets.map((a) => a.code).join(" ")}`}
                  />
                ) : (
                  c.assets.length > 0 && (
                    <div className="dz-apy">
                      {" "}
                      <span className="dz-apy-icons">
                        {" "}
                        {c.assets.map((a) => (
                          <TokenIcon
                            key={a.code}
                            symbol={a.code}
                            size={multi ? 28 : 40}
                          />
                        ))}{" "}
                      </span>{" "}
                      {best != null && Number.isFinite(best) && (
                        <b>{best.toFixed(2)}%</b>
                      )}{" "}
                    </div>
                  )
                )}{" "}
              </div>
            );
          })}{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
/** Asset dropdown with token logos (replaces the native select). */ function AssetSelect({
  value,
  onChange,
  options,
  label,
  role,
  disabledCodes,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
  role: string;
  /** code -> brief reason: blurred, unclickable, reason on hover. */
  disabledCodes?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div
      className="dv-select proto-aselect"
      ref={ref}
      onClick={() => setOpen((o) => !o)}
    >
      {" "}
      <button
        type="button"
        className="proto-cell-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={label}
      >
        {" "}
        <TokenIcon symbol={value} size={18} />{" "}
        <span className="proto-cell-code">{value}</span>{" "}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      <small>{role}</small>{" "}
      {open && (
        <div className="dv-drop" role="listbox" aria-label={label}>
          {" "}
          <div className="dv-options">
            {" "}
            {options.map((code) => {
              const why = disabledCodes?.[code] ?? null;
              return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={value === code}
                aria-disabled={why != null}
                disabled={why != null}
                title={why ?? undefined}
                className={`dv-option${value === code ? " selected" : ""}${why != null ? " off" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(code);
                  setOpen(false);
                }}
              >
                {" "}
                <TokenIcon symbol={code} size={20} /> <span>{code}</span>{" "}
                {value === code && (
                  <svg
                    className="dv-tick"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}{" "}
              </button>
              );
            })}{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
/** Boxed single-asset dropdown with token logos + cap details (Notify
   supply-cap watch). Custom menu, caret pinned right with breathing room. */
function CapAssetSelect({
  value,
  onChange,
  options,
  caps,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  caps: Record<string, number>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  function capText(code: string) {
    const cap = caps[code];
    return cap != null && cap > 0
      ? `cap ${Math.round(cap).toLocaleString()}`
      : null;
  }
  const picked = value ? capText(value) : null;
  return (
    <div className="dv-select nt-capselect" ref={ref}>
      {" "}
      <button
        type="button"
        className="nt-capbtn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Asset"
        disabled={disabled}
      >
        {" "}
        {value ? <TokenIcon symbol={value} size={20} /> : null}{" "}
        <span className={value ? "nt-capcode" : "nt-capplaceholder"}>
          {value || "Asset"}
        </span>{" "}
        {picked ? <span className="nt-capdetail">{picked}</span> : null}{" "}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && !disabled && (
        <div className="dv-drop" role="listbox" aria-label="Asset">
          {" "}
          <div className="dv-options">
            {" "}
            {options.map((code) => {
              const detail = capText(code);
              return (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={value === code}
                  className={`dv-option${value === code ? " selected" : ""}`}
                  onClick={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                >
                  {" "}
                  <TokenIcon symbol={code} size={20} /> <span>{code}</span>{" "}
                  {detail ? (
                    <span className="nt-capdetail">{detail}</span>
                  ) : null}{" "}
                  {value === code && (
                    <svg
                      className="dv-tick"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}{" "}
                </button>
              );
            })}{" "}
          </div>
        </div>
      )}{" "}
    </div>
  );
}
/** Empty token slot: icon only, hover/focus reveals why it's unavailable. */ function EmptyToken({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  return (
    <Tip
      tip={tip}
    >
      <span className="proto-cell-empty" role="img" aria-label={tip}>
        {" "}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="5" y1="5" x2="19" y2="19" />
        </svg>{" "}
        <small>{label}</small>{" "}
      </span>
    </Tip>
  );
}
/** Compact USD ($108.53M / $8.69K) for market detail panels. */ function fmtCompactUsd(
  v: number,
): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
/** Utilization ring (0..1) for the market details popup. */ function UtilRing({
  frac,
}: {
  frac: number;
}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, frac));
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        stroke="#2a2a2a"
        strokeWidth="3"
      />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        stroke="var(--green)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - p)}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}
/* --------------- Portfolio: position cards ------------------------------
   One row per open position, live reads only: the protocol (or vault
   token) logo, which wallet holds it, amounts with their asset logos and
   the safety ratio. */
/** "Wallet"/"Smart wallet" + short address: which account holds a row. */
function PosWallet({ account }: { account?: string }) {
  if (!account) return null;
  return (
    <span className="posx-wallet">
      <small>{isSmartAddress(account) ? "Smart wallet" : "Wallet"}</small>
      <b>{shortAddr(account)}</b>
    </span>
  );
}
/** Small stacked token logos in front of an amount. */
function PosAssets({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <span className="posx-assets" aria-hidden="true">
      {codes.slice(0, 3).map((c) => (
        <TokenIcon key={c} symbol={c} size={16} />
      ))}
    </span>
  );
}
/** Safety ratio pill (health factor as %), toned like the Manage card. */
function safetyPill(hf: number | null | undefined, hasDebt: boolean) {
  if (!hasDebt) return <span className="pill">No debt</span>;
  if (hf == null || !Number.isFinite(hf)) return <span className="pill">Ratio —</span>;
  const tone = hf >= 1.5 ? "green" : hf >= 1.15 ? "amber" : "red";
  return <span className={`pill ${tone}`}>{(hf * 100).toFixed(2)}%</span>;
}
type PosCardLending = {
  id: string;
  protoId: "blend" | "xoxno";
  title: string;
  account?: string;
  collateral: string[];
  debt: string[];
  collateralUsd: number;
  debtUsd: number;
  hf: number | null;
};
function LendingPositionCard({ p }: { p: PosCardLending }) {
  return (
    <article className="posx-row">
      <span className="posx-main">
        <ProtoMark id={p.protoId} size={36} />
        <span className="posx-title">
          <b>{p.title}</b>
          <small>Lending</small>
        </span>
        <PosWallet account={p.account} />
      </span>
      <span className="posx-cells">
        <span className="posx-cell">
          <small>Collateral</small>
          <b>
            <PosAssets codes={p.collateral} />${Math.round(p.collateralUsd).toLocaleString()}
          </b>
        </span>
        <span className="posx-cell">
          <small>Debt</small>
          <b>
            <PosAssets codes={p.debt} />
            {p.debtUsd > 0.01 ? `$${Math.round(p.debtUsd).toLocaleString()}` : "—"}
          </b>
        </span>
      </span>
      <span className="posx-pill" title="Safety ratio">
        {safetyPill(p.hf, p.debtUsd > 0.01)}
      </span>
    </article>
  );
}
type PosCardVault = {
  id: string;
  protoId: string;
  /** The vault's deposit token: main logo, protocol as a badge on it. */
  token: string | null;
  protocol: string;
  name: string;
  valueLabel: string;
  account?: string;
};
function VaultPositionCard({ p }: { p: PosCardVault }) {
  return (
    <article className="posx-row">
      <span className="posx-main">
        {p.token ? (
          <span className="posx-badged">
            <TokenIcon symbol={p.token} size={36} />
            <span className="posx-badge">
              <ProtoMark id={p.protoId} size={16} />
            </span>
          </span>
        ) : (
          <ProtoMark id={p.protoId} size={36} />
        )}
        <span className="posx-title">
          <b>{p.name}</b>
          <small>{p.protocol} · Vault</small>
        </span>
        <PosWallet account={p.account} />
      </span>
      <span className="posx-cells">
        <span className="posx-cell">
          <small>Value</small>
          <b>
            {p.token && <PosAssets codes={[p.token]} />}
            {p.valueLabel}
          </b>
        </span>
        <span className="posx-cell">
          <small>Strategy</small>
          <b>Managed</b>
        </span>
      </span>
      {/* Pill slot stays empty: keeps value columns aligned. */}
      <span className="posx-pill" />
    </article>
  );
}
type PosCardPool = {
  id: string;
  protoId: string;
  venue: string;
  pair: string;
  liquidityLabel: string;
  shareLabel: string;
  feesLabel: string;
  account?: string;
};
function PoolPositionCard({ p }: { p: PosCardPool }) {
  return (
    <article className="posx-row">
      <span className="posx-main">
        <ProtoMark id={p.protoId} size={36} />
        <span className="posx-title">
          <b>{p.pair}</b>
          <small>{p.venue} · Pool</small>
        </span>
        <PosWallet account={p.account} />
      </span>
      <span className="posx-cells">
        <span className="posx-cell">
          <small>Liquidity</small>
          <b>{p.liquidityLabel}</b>
        </span>
        <span className="posx-cell">
          <small>Pool share</small>
          <b>{p.shareLabel}</b>
        </span>
        <span className="posx-cell">
          <small>Fees earned</small>
          <b>{p.feesLabel}</b>
        </span>
      </span>
      <span className="posx-pill" />
    </article>
  );
}

/** Greyed in the Overview "Tokens" cell until a vault position tells us the real set. */
const DEFAULT_VAULT_TOKENS = ["USDC", "EURC", "CETES", "USTRY"];

/* Small info marker with a native tooltip — sits beside card labels. */
function InfoDot({ text }: { text: string }) {
  return (
    <span className="info-dot" title={text} aria-label={text} role="img">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="10.8" x2="12" y2="16.4" />
        <circle cx="12" cy="7.4" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

/* ------------------------------- Portfolio ------------------------------ */ function Portfolio() {
  const [tab, setTab] = useState<"all" | "vaults" | "strategies">("all");
  const ownerAddr = useWalletAddress();
  const { smarts } = useShellSmarts(ownerAddr);
  /* Wallet scope picked in the Overview card (or the navbar menu): null =
     All wallets — the owner plus every smart account, combined — or one
     smart account. Every card below reads through scopeAddrs. */
  const viewScope = useViewScope(ownerAddr);
  const scopeAddr = viewScope && smarts.includes(viewScope) ? viewScope : null;
  const scopeAddrs = useMemo(() => {
    const list = scopeAddr ? [scopeAddr] : [ownerAddr, ...smarts];
    return [...new Set(list.filter((a): a is string => !!a))];
  }, [scopeAddr, ownerAddr, smarts]);
  const scopeKey = scopeAddrs.join(",");
  /* The equity curve keys off one account; All wallets anchors on the
     main wallet (the smart accounts inherit its funds). */
  const primaryAddr = scopeAddr ?? ownerAddr;
  const { data: walletData } = useMergedPositions(scopeKey);
  const poolNames = useBlendPoolNames();
  const watchBals = useMergedTokenBalances(scopeKey);
  const vaultPositions = useMergedVaultPositions(scopeKey);
  /* Live APYs for the Overview card: vault APY by address + best lending
     supply APY per protocol|asset. Missing numbers stay "—", never faked. */
  const [apyMaps, setApyMaps] = useState<{
    vaults: Record<string, number>;
    lend: Record<string, number>;
  } | null>(null);
  useEffect(() => {
    let dead = false;
    Promise.all([
      apiFetch("/api/vaults", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      apiFetch("/api/pools", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]).then((res) => {
      if (dead) return;
      const v = res[0] as { ok?: boolean; rows?: { address?: string; apyPct?: number | null }[] } | null;
      const p = res[1] as { ok?: boolean; rows?: { protocol?: string; collateral?: string; supplyApy?: number | null }[] } | null;
      const vaults: Record<string, number> = {};
      if (v?.ok && Array.isArray(v.rows))
        for (const row of v.rows)
          if (row.address && typeof row.apyPct === "number") vaults[row.address.toLowerCase()] = row.apyPct;
      const lend: Record<string, number> = {};
      if (p?.ok && Array.isArray(p.rows))
        for (const m of p.rows) {
          if (!m.protocol || !m.collateral || typeof m.supplyApy !== "number") continue;
          const k = `${m.protocol}|${m.collateral.toUpperCase()}`;
          lend[k] = Math.max(lend[k] ?? 0, m.supplyApy);
        }
      setApyMaps({ vaults, lend });
    });
    return () => {
      dead = true;
    };
  }, []);
  /* Live prices for every held code (XLM included) — powers holdings USD. */
  const holdPrices = useTokenPrices(Object.keys(watchBals));
  const supplied = walletData?.totalSupplied ?? 0;
  const borrowed = Math.round(walletData?.totalBorrowed ?? 0);
  // Vault deposits (DeFindex + Upshift), valued server-side from on-chain
  // share prices; merged across the selected scope.
  const vaultValue = vaultPositions.reduce(
    (s, p) => s + (typeof p.valueUsd === "number" ? p.valueUsd : 0),
    0,
  );
  // Animated for smooth count transitions; null usd keeps the last value.
  // resetKey snaps instantly on wallet switch/disconnect (no glide-down).
  // Every priced holding of the active account (smart account or wallet),
  // not just XLM.
  const holdingsUsd = Object.entries(watchBals).reduce((sum, [code, amt]) => {
    const px = holdPrices.prices[code] ?? null;
    return sum + (px != null && px > 0 ? px * amt : 0);
  }, 0);
  const ausd = useAnimatedNumber(holdingsUsd, 700, scopeKey);
  const tokensValue = ausd ?? 0;
  const netWorth = supplied - borrowed + tokensValue + vaultValue;
  /* Observed equity curve for the sparkline (see EqSpark). */
  const [eqCurve, setEqCurve] = useState<EqPoint[]>([]);
  const eqTrendNow = eqCurve.length >= 1 ? eqTrend(eqCurve) : null;
  useEffect(() => {
    if (!primaryAddr) {
      setEqCurve([]);
      return;
    }
    // Server truth first (cross-device, no 60-point amnesia); the local
    // hourly sampler below stays as instant paint + offline fallback.
    // Pre-network keys mixed mainnet and testnet values: drop them.
    try {
      window.localStorage.removeItem(`seidar.equity.${primaryAddr}`);
      window.localStorage.removeItem(`seidar.balance.${primaryAddr}`);
    } catch {
      /* ignore */
    }
    let cancelled = false;
    apiFetch(`/api/portfolio/history?wallet=${primaryAddr}&points=120`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok || !Array.isArray(d.points)) return;
        const server = (d.points as { t?: unknown; net?: unknown }[])
          .map((p) => ({ t: Number(p?.t), v: Number(p?.net) }))
          .filter((p) => Number.isFinite(p.t) && p.v > 0)
          .slice(-120);
        // The server is the truth for this network: no history there means
        // none here either (a stale local curve once showed another
        // network's trend).
        if (server.length === 0) {
          try {
            window.localStorage.removeItem(`seidar.equity.${getNetwork()}.${primaryAddr}`);
          } catch {
            /* ignore */
          }
          if (!cancelled) setEqCurve([]);
          return;
        }
        try {
          window.localStorage.setItem(
            `seidar.equity.${getNetwork()}.${primaryAddr}`,
            JSON.stringify(server),
          );
        } catch {
          /* private mode — memory only */
        }
        if (!cancelled) setEqCurve(server);
      })
      .catch(() => {
        /* offline — local curve below covers it */
      });
    return () => {
      cancelled = true;
    };
  }, [primaryAddr]);
  useEffect(() => {
    if (!primaryAddr) {
      setEqCurve([]);
      return;
    }
    try {
      const key = `seidar.equity.${getNetwork()}.${primaryAddr}`;
      let pts = readEquity(primaryAddr);
      // Never seed the curve with a pre-feed $0 — it would fake a spike.
      if (
        netWorth > 0 &&
        (pts.length === 0 ||
          Date.now() - pts[pts.length - 1].t > 3600000)
      ) {
        pts = [
          ...pts,
          { t: Date.now(), v: Math.round(netWorth * 100) / 100 },
        ].slice(-120);
        window.localStorage.setItem(key, JSON.stringify(pts));
      }
      setEqCurve(pts);
    } catch {
      /* ignore */
    }
  }, [primaryAddr, netWorth]);
  /* Live reads → position cards (LendingPositionCard / VaultPositionCard). */
  /* One lending row per account + protocol + pool: collateral and debt
     legs together, with that account's safety ratio. */
  const lendingCards: PosCardLending[] = (() => {
    const groups = new Map<string, PosCardLending>();
    for (const l of walletData?.legs ?? []) {
      if (l.suppliedUsd <= 0.01 && l.borrowedUsd <= 0.01) continue;
      const key = `${l.account ?? ""}|${l.protocol}|${l.pool ?? ""}`;
      const proto = l.protocol === "blend" ? "Blend" : "XOXNO";
      const pool = l.pool
        ? l.pool.startsWith("xoxno-hub-")
          ? `Hub ${l.pool.slice(10)}`
          : poolNames[l.pool]
        : undefined;
      const g =
        groups.get(key) ??
        ({
          id: key,
          protoId: l.protocol,
          title: pool ? `${proto} · ${pool}` : proto,
          account: l.account,
          collateral: [],
          debt: [],
          collateralUsd: 0,
          debtUsd: 0,
          hf: l.hf ?? null,
        } as PosCardLending);
      if (l.suppliedUsd > 0.01) {
        g.collateralUsd += l.suppliedUsd;
        if (!g.collateral.includes(l.code)) g.collateral.push(l.code);
      }
      if (l.borrowedUsd > 0.01) {
        g.debtUsd += l.borrowedUsd;
        if (!g.debt.includes(l.code)) g.debt.push(l.code);
      }
      groups.set(key, g);
    }
    return [...groups.values()].sort((x, y) => y.collateralUsd - x.collateralUsd);
  })();
  const vaultCards: PosCardVault[] = vaultPositions.map((p, i) => ({
    id: `${p.protocol}-${p.vault}-${i}`,
    protoId: p.protocol === "upshift" ? "upshift" : "defindex",
    protocol: p.protocol === "upshift" ? "Upshift" : "DeFindex",
    token: p.underlying?.find((u) => u.code)?.code ?? null,
    name: p.name ?? "Vault",
    valueLabel:
      typeof p.valueUsd === "number"
        ? `${Math.round(p.valueUsd).toLocaleString()}`
        : "—",
    account: p.account,
  }));
  /* Overview card: tokens the user put money into via vault deposits —
     real ones when a position is known, the greyed default set otherwise. */
  const vaultTokens = [
    ...new Set(
      vaultPositions.flatMap((p) => (p.underlying ?? []).map((u) => u.code).filter((c): c is string => !!c)),
    ),
  ];
  const shownTokens = vaultTokens.length > 0 ? vaultTokens : DEFAULT_VAULT_TOKENS;
  const blendedApy = (() => {
    if (!apyMaps) return null;
    let yieldUsd = 0;
    let base = 0;
    for (const p of vaultPositions) {
      const apy = p.vault ? apyMaps.vaults[p.vault.toLowerCase()] : undefined;
      const val = typeof p.valueUsd === "number" ? p.valueUsd : 0;
      if (apy != null && val > 0.01) {
        yieldUsd += (val * apy) / 100;
        base += val;
      }
    }
    for (const l of walletData?.legs ?? []) {
      const apy = apyMaps.lend[`${l.protocol}|${(l.code ?? "").toUpperCase()}`];
      if (apy != null && l.suppliedUsd > 0.01) {
        yieldUsd += (l.suppliedUsd * apy) / 100;
        base += l.suppliedUsd;
      }
    }
    if (base <= 0.01) return null;
    return { pct: (yieldUsd / base) * 100 };
  })();
  /* Row content per tab: only what the selected wallets actually hold.
     Strategies have no on-chain position read yet, so that tab stays empty. */
  const lendingRows: PosCardLending[] = tab === "all" ? lendingCards : [];
  const vaultRows: PosCardVault[] = tab === "all" || tab === "vaults" ? vaultCards : [];
  const noRows = lendingRows.length + vaultRows.length === 0;
  const scopeLabel = scopeAddr ? shortAddr(scopeAddr) : "all wallets";
  const emptyKind = tab === "vaults" ? "vault" : tab === "strategies" ? "strategy" : "active";
  return (
    <>
      {" "}
      <div className="pf-grid pf-home">
        {" "}
        <div className="pf-col">
          {" "}
          <div className="pf-card">
            {" "}
            <div className="pf-ovx">
              {" "}
              <div className="pf-ovx-cell">
                {" "}
                <span className="pf-ovx-label">
                  Net worth <InfoDot text="What you own minus what you owe, across every wallet in scope." />
                </span>{" "}
                <b className="pf-ovx-value">
                  ${Math.round(netWorth).toLocaleString()}
                </b>{" "}
                <small className="pf-ovx-sub">
                  Uninvested ${Math.round(tokensValue).toLocaleString()}
                </small>{" "}
              </div>{" "}
              <div className="pf-ovx-cell">
                {" "}
                <span className="pf-ovx-label">
                  Tokens <InfoDot text="The tokens your vault deposits are exposed to." />
                </span>{" "}
                <span className={`pf-ovx-marks${vaultTokens.length === 0 ? " idle" : ""}`}>
                  {" "}
                  {shownTokens.slice(0, 4).map((t) => (
                    <span key={t} className="pf-ovx-mark">
                      <TokenIcon symbol={t} size={26} />
                    </span>
                  ))}{" "}
                  {shownTokens.length > 4 && (
                    <em className="pf-ovx-more">+{shownTokens.length - 4}</em>
                  )}{" "}
                </span>{" "}
              </div>{" "}
              <div className="pf-ovx-cell">
                {" "}
                <span className="pf-ovx-label">
                  Performance <InfoDot text="Net-worth change across the sampled history." />
                </span>{" "}
                {eqTrendNow ? (
                  <b className="pf-ovx-value" style={{ color: eqTrendNow.hex }}>
                    {eqTrendNow.sign}%
                  </b>
                ) : (
                  <b className="pf-ovx-value">0.00%</b>
                )}{" "}
              </div>{" "}
              <div className="pf-ovx-cell">
                {" "}
                <span className="pf-ovx-label">
                  APY <InfoDot text="Value-weighted deposit yield across your vaults and lending supplies." />
                </span>{" "}
                <b className="pf-ovx-value">
                  {blendedApy ? `${blendedApy.pct.toFixed(2)}%` : "0.00%"}
                </b>{" "}
              </div>{" "}
              <div className="pf-ovx-cell">
                {" "}
                <span className="pf-ovx-label">
                  PnL <InfoDot text="Cost-basis profit and loss needs price history per position — not tracked yet." />
                </span>{" "}
                <b className="pf-ovx-value">$0</b>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          <div className="pf-card">
            {" "}
            <div className="pf-head">
              {" "}
              <span className="pf-title">Positions</span>{" "}
              <div
                className="tabs"
                role="tablist"
                aria-label="Position filters"
              >
                {" "}
                {(["all", "vaults", "strategies"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    className={`tab${tab === t ? " active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {" "}
                    {t === "all"
                      ? "All"
                      : t === "vaults"
                        ? "Vaults"
                        : "Strategies"}{" "}
                  </button>
                ))}{" "}
              </div>{" "}
            </div>{" "}
            {walletData && walletData.missing.length > 0 && (
              <p className="proto-warn">
                Couldn&apos;t read lending positions for {walletData.missing.map((a) => shortAddr(a)).join(", ")} right now —
                showing the rest. They load on the next refresh.
              </p>
            )}{" "}
            {noRows ? (
              <div className="pf-empty-block">
                <img className="pf-empty-fisher" src="/fisherman-gray.png" alt="" width={48} height={90} draggable={false} />
                {ownerAddr && walletData == null ? (
                  <p>
                    <span className="load-row">
                      <LoadingMark size={12} /> Loading positions…
                    </span>
                  </p>
                ) : (
                  <p>{`No ${emptyKind} positions found for ${scopeLabel}.`}</p>
                )}
                {/* Hidden while loading, but its space is kept so the card
                    never resizes. */}
                <div className={`pf-empty-cta${ownerAddr && walletData == null ? " pending" : ""}`}>
                  <a className="btn primary" href="/vaults">
                    Explore Vaults
                  </a>
                  <a className="btn" href="/strategies">
                    Create Strategies
                  </a>
                </div>
              </div>
            ) : (
            <div className="posx-list">
              {" "}
              {lendingRows.map((p) => (
                <LendingPositionCard key={p.id} p={p} />
              ))}{" "}
              {vaultRows.map((p) => (
                <VaultPositionCard key={p.id} p={p} />
              ))}{" "}
            </div>
            )}{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </>
  );
}
const PROTOCOL_META: Record<
  string,
  { name: string; desc: string; ltv: string; view: AppView }
> = {
  blend: {
    name: "Blend",
    desc: "Isolated lending pools with flash-submit and Reflector oracles.",
    ltv: "75% max LTV",
    view: "blend",
  },
  xoxno: {
    name: "XOXNO",
    desc: "Hub-and-spoke money market with health-factor limits.",
    ltv: "80% max LTV",
    view: "xoxno",
  },
};
const PROTOCOL_ORDER = ["blend", "xoxno"] as const;
type ProtocolId = (typeof PROTOCOL_ORDER)[number];
const PROTOCOL_SPECS: Record<
  ProtocolId,
  {
    model: string;
    caps: string;
    oracle: string;
    markets: string;
    note: string;
    ltvBps: number;
    liqBps: number;
  }
> = {
  blend: {
    model: "Isolated pools",
    caps: "75% max LTV · 150% liq.",
    oracle: "Reflector",
    markets: "PoolV2.load live — supply + borrow APY per reserve",
    note: "Supply, borrow, boost, repay and automate Blend V2 pools with flash-submit + Soroswap swaps.",
    ltvBps: 7500,
    liqBps: 15000,
  },
  xoxno: {
    model: "Hub & spoke",
    caps: "80% max LTV · 150% liq.",
    oracle: "XOXNO + Reflector guard",
    markets: "api.xoxno.com Stellar-lending reserves — spoke:hub risk module",
    note: "Hub-and-spoke markets with health-factor limits, flash loans and dual-oracle guards.",
    ltvBps: 8000,
    liqBps: 15000,
  },
};
export type ProtocolSection =
  "manage" | "automate" | "notify" | "history" | "create" | "lend";
function ProtoEmpty({
  letter,
  sub,
  action,
  onAction,
}: {
  letter: string;
  sub: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="proto-empty">
      {" "}
      <span className="proto-empty-art" aria-hidden="true">
        {" "}
        <i /> <i /> <i />{" "}
        <svg width="34" height="38" viewBox="0 0 34 38" fill="none">
          {" "}
          <path
            d="M17 1.5 30.5 7v10.2c0 8.4-5.6 14.6-13.5 19.3C9.1 31.8 3.5 25.6 3.5 17.2V7L17 1.5Z"
            fill="rgba(87,195,107,0.18)"
            stroke="#57c36b"
            strokeWidth="1.6"
          />{" "}
          <text
            x="17"
            y="23"
            textAnchor="middle"
            fontSize="13"
            fontWeight="800"
            fill="#8ea2ff"
          >
            {" "}
            {letter}{" "}
          </text>{" "}
        </svg>{" "}
      </span>{" "}
      <button type="button" className="proto-empty-btn" onClick={onAction}>
        {" "}
        {action}{" "}
      </button>{" "}
      <p className="proto-empty-sub">{sub}</p>{" "}
    </div>
  );
}
const SECTION_TABS: ProtocolSection[] = [
  "manage",
  "automate",
  "notify",
  "history",
  "create",
  "lend",
];

/* Header of a lending market page: protocol logo, the market name and its
   live totals from the pools feed. */
function MarketHero({ id }: { id: ProtocolId }) {
  const market = useMarketScope();
  const [stats, setStats] = useState<{ tvl: number; borrowed: number; assets: number; topApy: number | null; status: number | null } | null>(null);
  useEffect(() => {
    if (!market) return;
    let dead = false;
    apiFetch(`/api/pools?protocol=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (dead || !d?.ok) return;
        const rows = (
          (d.rows ?? []) as { pool: string; poolName: string; poolSupplied?: number | null; poolBorrowed?: number | null; poolStatus?: number | null }[]
        ).filter((r) => r.poolName === market);
        // A market groups same-name pools: its status is the most usable one.
        const statuses = rows.map((r) => r.poolStatus).filter((v): v is number => typeof v === "number");
        const assets = ((d.assets ?? []) as { poolName: string; code: string; supplyApy?: number | null }[]).filter((a) => a.poolName === market);
        const sup = new Map<string, number>();
        const bor = new Map<string, number>();
        for (const r of rows) {
          sup.set(r.pool, Math.max(sup.get(r.pool) ?? 0, r.poolSupplied ?? 0));
          bor.set(r.pool, Math.max(bor.get(r.pool) ?? 0, r.poolBorrowed ?? 0));
        }
        const apys = assets.map((a) => a.supplyApy ?? 0).filter((v) => v > 0);
        setStats({
          tvl: [...sup.values()].reduce((a, b) => a + b, 0),
          borrowed: [...bor.values()].reduce((a, b) => a + b, 0),
          assets: new Set(assets.map((a) => a.code)).size,
          topApy: apys.length ? Math.max(...apys) : null,
          status: statuses.length ? Math.min(...statuses) : null,
        });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [id, market]);
  const name = PROTOCOL_META[id].name;
  return (
    <PageHero
      back={{ href: "/markets/lend-borrow", label: "Lend and Borrow" }}
      logo={<ProtoMark id={id} size={52} />}
      title={market ?? name}
      status={stats?.status ?? null}
      facts={[
        ...(stats?.topApy != null && stats.topApy >= 0.01 ? [{ text: `Up to ${stats.topApy.toFixed(2)}% supply APY`, strong: true }] : []),
        { icon: <ProtoMark id={id} size={18} />, text: name },
        ...(stats
          ? [
              { text: `TVL ${fmtTvl(stats.tvl)}` },
              ...(stats.borrowed > 0 ? [{ text: `Borrowed ${fmtTvl(stats.borrowed)}` }] : []),
              { text: `${stats.assets} asset${stats.assets === 1 ? "" : "s"}` },
            ]
          : []),
      ]}
    />
  );
}

/* Market scope: a protocol's section pages are fixed to one market
   (?pool=<pool name>, set by the Lend & Borrow "Manage" buttons) and every
   section tab carries it, so Manage / Automate / Create / Lend all stay on
   that market. */
function marketScope(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("pool");
  } catch {
    return null;
  }
}
function sectionHref(id: ProtocolId, s: ProtocolSection, pool = marketScope()): string {
  const base = s === "manage" ? `/markets/${id}` : `/markets/${id}/${s}`;
  return pool ? `${base}?pool=${encodeURIComponent(pool)}` : base;
}
/** The market this section page is fixed to (null until mounted / none). */
function useMarketScope(): string | null {
  const [pool, setPool] = useState<string | null>(null);
  useEffect(() => setPool(marketScope()), []);
  return pool;
}
function sectionLabel(s: ProtocolSection): string {
  return s === "manage"
    ? "Manage"
    : s === "automate"
      ? "Automate"
      : s === "notify"
        ? "Notify"
        : s === "history"
          ? "History"
          : s === "create"
            ? "Create"
            : "Lend";
}

/* Automate: strategy catalogue with live position context. Rows link
   into the real flows (Exchange limit orders, Refinance, hands-off). */
type AutoStrat = {
  id: string;
  name: string;
  desc: string;
  requires: string;
  cta: string;
  view: AppView;
  live?: boolean;
};

const AUTO_STRATS: AutoStrat[] = [
  {
    id: "liq",
    name: "Liquidation Protection",
    desc: "Repays debt with your collateral the moment health drops below your trigger, back to your target — hands-off, bounded on-chain.",
    requires: "Automation account (Blend)",
    cta: "",
    view: "exchange",
    live: true,
  },
  {
    id: "lev",
    name: "Automated Leverage Management",
    desc: "Keeps your leverage inside a band you choose, boosting into strength and repaying into weakness without manual txs.",
    requires: "Smart account (Blend)",
    cta: "",
    view: "exchange",
    live: true,
  },
  {
    id: "stop",
    name: "Stop Loss",
    desc: "Unwinds the position automatically when the market moves against you past your level.",
    requires: "Smart account (Blend)",
    cta: "",
    view: "exchange",
    live: true,
  },
  {
    id: "take",
    name: "Take Profit",
    desc: "Locks in gains by unwinding into strength at your target price.",
    requires: "Smart account (Blend)",
    cta: "",
    view: "exchange",
    live: true,
  },
  {
    id: "boost",
    name: "Boost on Target Price",
    desc: "Adds leverage automatically when price reaches the level where you want more exposure.",
    requires: "Smart account (Blend)",
    cta: "",
    view: "exchange",
    live: true,
  },
  {
    id: "repay",
    name: "Repay on Target Price",
    desc: "Deleverages into strength at your target without watching charts.",
    requires: "Smart account (Blend)",
    cta: "",
    view: "exchange",
    live: true,
  },
  {
    id: "switch",
    name: "Collateral Switch",
    desc: "Swaps your collateral into another asset when the market price crosses your threshold.",
    requires: "Smart account (Blend)",
    cta: "",
    view: "refinance",
    live: true,
  },
];

/** Line icon per strategy (Automate list). */
function StratIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    // Shield
    liq: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    // Up/down band
    lev: (
      <>
        <polyline points="7 8 12 3 17 8" />
        <polyline points="7 16 12 21 17 16" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </>
    ),
    // Falling line onto a floor
    stop: (
      <>
        <polyline points="3 5 9 11 13 8 21 16" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </>
    ),
    // Rising line to a flag
    take: (
      <>
        <polyline points="3 18 9 12 13 15 19 7" />
        <polyline points="15 7 19 7 19 11" />
      </>
    ),
    // Double chevron up (as the Boost action)
    boost: (
      <>
        <polyline points="5 13 12 6 19 13" />
        <polyline points="5 19 12 12 19 19" />
      </>
    ),
    // Double chevron down (as the Repay action)
    repay: (
      <>
        <polyline points="5 11 12 18 19 11" />
        <polyline points="5 5 12 12 19 5" />
      </>
    ),
    // Swap arrows
    switch: (
      <>
        <polyline points="17 3 21 7 17 11" />
        <line x1="3" y1="7" x2="21" y2="7" />
        <polyline points="7 13 3 17 7 21" />
        <line x1="21" y1="17" x2="3" y2="17" />
      </>
    ),
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[id] ?? paths.liq}
    </svg>
  );
}

function AutomateSection({ id }: { id: ProtocolId }) {
  const { owner } = useSectionAccount();
  const [picked, setPicked] = useState<string>("liq");
  /* XOXNO: which of the smart account's XOXNO accounts to automate. */
  const { account: smartAcct } = useSmartAccount();
  const { cfg: autoCfg } = useAutomation(owner ?? null);
  const xList = usePositionView(id === "xoxno" ? smartAcct : null, id === "xoxno" ? venuePool(autoCfg, "xoxno") : null).xoxnoAccounts;
  const [xAcct, setXAcct] = useState<string | null>(null);
  /* Blend: the market page's pool (the one holding the account's position). */
  const market = useMarketScope();
  const blendAuto = useBlendAutoPool(id === "blend" ? autoCfg : null, id === "blend" ? smartAcct : null, market);
  const [bPool, setBPool] = useState<string | null>(null);
  const blendPool = id === "blend" ? (bPool ?? blendAuto.pool?.address ?? null) : null;
  const [unified, setUnified] = useState(false);
  const [history, setHistory] = useState<
    { id: unknown; kind: unknown; status: unknown; last_note: unknown }[]
  >([]);

  useEffect(() => {
    try {
      setUnified(
        window.localStorage.getItem("seidar.unifiedHistory") === "1",
      );
    } catch {
      setUnified(false);
    }
  }, []);

  useEffect(() => {
    if (!unified || !owner) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/strategies?wallet=${owner}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.strategies))
          setHistory(d.strategies);
      })
      .catch(() => {
        /* keep last */
      });
    return () => {
      cancelled = true;
    };
  }, [unified, owner]);

  function toggleUnified() {
    const next = !unified;
    setUnified(next);
    try {
      window.localStorage.setItem(
        "seidar.unifiedHistory",
        next ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="at-wrap">
      {" "}
      <SectionTabs id={id} section="automate" />{" "}
      <PositionHeader id={id} compact />{" "}
      <div className="at-head">
        {" "}
        <h2 className="nt-h">Available automation</h2>{" "}
        <label className="at-unified">
          {" "}
          Unified History{" "}
          <button
            type="button"
            role="switch"
            aria-checked={unified}
            className={`x-switch${unified ? " on" : ""}`}
            onClick={toggleUnified}
          >
            <i aria-hidden="true" />
          </button>{" "}
        </label>{" "}
      </div>{" "}
      <div className="at-grid">
        {" "}
        <div className="at-list" role="tablist" aria-label="Strategies">
          {" "}
          {AUTO_STRATS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={picked === s.id}
              className={`at-item${picked === s.id ? " active" : ""}`}
              onClick={() => setPicked(s.id)}
            >
              <span className="at-ico" aria-hidden="true">
                <StratIcon id={s.id} />
              </span>
              {s.name}
            </button>
          ))}{" "}
        </div>{" "}
        <div className={`at-main${!unified ? " lp-host" : ""}`}>
          {" "}
          {!unified && id === "xoxno" && xList.length > 1 && (
            <label className="at-xacct">
              XOXNO account
              <select value={xAcct ?? ""} onChange={(e) => setXAcct(e.target.value || null)} aria-label="XOXNO account">
                <option value="">Auto (first with debt)</option>
                {xList.map((x) => (
                  <option key={x.accountId} value={x.accountId}>
                    #{x.accountId} · spoke {x.spokeId}
                    {x.hasDebt ? " · borrowing" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!unified && id === "blend" && blendAuto.withPosition.length > 1 && (
            <label className="at-xacct">
              Pool
              <select value={blendPool ?? ""} onChange={(e) => setBPool(e.target.value || null)} aria-label="Blend pool">
                {blendAuto.withPosition.map((p) => (
                  <option key={p.address} value={p.address}>
                    {p.name} · {p.address.slice(0, 4)}…{p.address.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!unified && id === "blend" && (() => {
            const info = autoCfg?.blendPools?.find((p) => p.address === blendPool);
            const why = info ? blendStatusNote(info.status) : null;
            return why ? (
              <p className="at-status" role="note">
                <b>{info!.name}</b> · {why}
              </p>
            ) : null;
          })()}
          {!unified ? (
            <AutomationVenue venue={id} accountId={id === "xoxno" ? xAcct : null} pool={blendPool}>
            {picked === "lev" ? (
              <LeverageManagementPanel owner={owner ?? null} />
            ) : picked === "stop" || picked === "take" ? (
              <ClosePanel key={picked} owner={owner ?? null} mode={picked} />
            ) : picked === "boost" || picked === "repay" ? (
              <TargetPricePanel key={picked} owner={owner ?? null} mode={picked} />
            ) : picked === "switch" ? (
              <CollateralSwitchPanel owner={owner ?? null} />
            ) : (
              <LiquidationProtectionPanel owner={owner ?? null} />
            )}
            </AutomationVenue>
          ) : (
            <>
              {" "}
              <h3>Unified history</h3>{" "}
              {!owner && <p>Connect a wallet to see automation history.</p>}{" "}
              {owner && history.length === 0 && (
                <p>No automations yet for this wallet.</p>
              )}{" "}
              <ul className="at-history">
                {history.map((h) => (
                  <li key={String(h.id)}>
                    {" "}
                    <b>
                      {String(h.kind ?? "?")} #{String(h.id)}
                    </b>{" "}
                    <span>{String(h.status ?? "")}</span>{" "}
                    {h.last_note ? (
                      <small>{String(h.last_note).slice(0, 120)}</small>
                    ) : null}{" "}
                  </li>
                ))}
              </ul>{" "}
            </>
          )}{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}

/* Create: browse Stellar lending markets and open a position prefilled. */
type MarketRowLite = {
  protocol: string;
  protocolLabel: string;
  pool: string;
  poolName: string;
  poolSupplied: number | null;
  poolBorrowed: number | null;
  /** On-chain pool status (Blend): 0-1 active, 2-3 on-ice, 4-5 frozen, 6 setup. */
  poolStatus?: number | null;
  collateral: string;
  debt: string | null;
  supplyApy: number;
  borrowApy: number | null;
  maxLev: string;
  marketSizeUsd: number | null;
  available?: boolean;
  borrowPaused?: boolean;
};

/* One pool market: openable pair options sharing collateral/debt sets. */
type MarketGroup = {
  protocol: string;
  pool: string;
  label: string;
  addrs: string[];
  collaterals: string[];
  debts: string[];
  options: MarketRowLite[];
  tvl: number;
  borrowed: number;
  topApy: number;
  /** Best Blend status across the market's pools (null = XOXNO / unknown):
   *  2+ means no pool takes new borrows (on ice, frozen or still in setup). */
  status: number | null;
};

function fmtTvl(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
/* Asset-card number system: below 10k two decimals (100.00, 1434.23);
   10k–999,999 grouped ints; 1M+ two decimals + M, rolling M→B→T→P→E. */
function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const neg = v < 0;
  const a = Math.abs(v);
  const SCALES: [number, string][] = [
    [1e18, "E"],
    [1e15, "P"],
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
  ];
  for (const [th, s] of SCALES) {
    if (a >= th) return `${neg ? "-" : ""}${(a / th).toFixed(2)}${s}`;
  }
  if (a >= 10000)
    return `${neg ? "-" : ""}${Math.round(a).toLocaleString("en-US")}`;
  return `${neg ? "-" : ""}${a.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
/* Why a market can't open a new borrow position (null = it can). */
function createBlock(g: MarketGroup): string | null {
  if (g.status != null && g.status >= 2) {
    const st = poolStatusLabel(g.status) ?? "Paused";
    return `${g.label} is ${st.toLowerCase()} — it takes no new borrows, so no position can be opened here.`;
  }
  if (g.options.length === 0) return `${g.label} has no borrowable pair right now.`;
  return null;
}
/* Blend pool status labels: only restricted states are surfaced. */
function poolStatusLabel(s: number): string | null {
  if (s >= 6) return "Setup";
  if (s >= 4) return "Frozen";
  if (s >= 2) return "On-ice";
  return null;
}

/* Overlapping token stack with +N overflow (market rows). */
function IconStack({ codes, contracts }: { codes: string[]; contracts?: (string | undefined)[] }) {
  const show = codes.slice(0, 4);
  const extra = codes.length - show.length;
  return (
    <span className="mk-stack" aria-hidden="true">
      {" "}
      {show.map((c, i) => (
        <TokenIcon key={`${c}${i}`} symbol={c} size={22} contract={contracts?.[i]} />
      ))}{" "}
      {extra > 0 && <span className="mk-more">+{extra}</span>}{" "}
    </span>
  );
}

/* Cap/utilization ring for the expanded asset table. */
function CapRing({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct))
    return <span className="mk-na">N/A</span>;
  const sweep = Math.min(100, Math.max(0, pct));
  const hot = pct >= 90;
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span className={`mk-cap${hot ? " hot" : ""}`}>
      {pct.toFixed(2)}%
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        aria-hidden="true"
      >
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2.5"
        />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={hot ? "#e5484d" : "#4da3ff"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(sweep / 100) * c} ${c}`}
          transform="rotate(-90 9 9)"
        />
      </svg>
    </span>
  );
}

type PoolAssetLite = {
  pool: string;
  poolName: string;
  protocol: string;
  code: string;
  supplyApy: number | null;
  borrowApy: number | null;
  ltvPct: number | null;
  supFillPct: number | null;
  borFillPct: number | null;
  canCollateral: boolean;
  canBorrow: boolean;
  /** On-chain pool status (Blend), see MarketRow.poolStatus. */
  poolStatus?: number | null;
};

/* Open-position section (Create → per-pool Borrow / Leverage flow).
   Own design; content mirrors the proven borrow+leverage confirm flow:
   inputs with maxes, live summary, automation guard, intent confirm. */
function OpenPosition({
  protocol,
  group,
  assets,
  legs,
  address,
  initialColl,
  initialDebt,
  initialMode = "borrow",
  onBack,
  onParams,
}: {
  protocol: ProtocolId;
  group: MarketGroup;
  assets: PoolAssetLite[];
  legs: WalletLeg[];
  address: string | null;
  initialColl: string | null;
  initialDebt: string | null;
  initialMode?: "borrow" | "leverage";
  onBack: () => void;
  /** Called when a pick changes so the caller can mirror it into the URL. */
  onParams?: (p: {
    coll: string;
    debt: string;
    mode: "borrow" | "leverage";
  }) => void;
}) {
  const [mode, setMode] = useState<"borrow" | "leverage">(initialMode);
  const codes = useMemo(
    () => [...new Set([...group.collaterals, ...group.debts])],
    [group],
  );
  const [collCode, setCollCode] = useState(
    initialColl && codes.includes(initialColl)
      ? initialColl
      : codes.includes("XLM")
        ? "XLM"
        : (codes[0] ?? "XLM"),
  );
  const [debtCode, setDebtCode] = useState(
    initialDebt && codes.includes(initialDebt)
      ? initialDebt
      : codes.includes("USDC")
        ? "USDC"
        : (codes.find((c) => c !== collCode) ?? "USDC"),
  );
  const [collAmt, setCollAmt] = useState("");
  const [debtAmt, setDebtAmt] = useState("");
  const [lev, setLev] = useState(2);
  const [auto, setAuto] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmModel | null>(null);
  const [impact, setImpact] = useState<string | null>(null);
  const [liveRate, setLiveRate] = useState<string | null>(null);
  const { prices } = useTokenPrices(codes);
  const bals = useTokenBalances(address);
  const px = (code: string): number => {
    const p = prices[code.toUpperCase()];
    if (typeof p === "number" && p > 0) return p;
    if (STABLES.has(code.toUpperCase()) && code.toUpperCase() !== "EURC") return 1;
    return 0;
  };
  const signer = useWalletAddress() ?? address;
  const { smarts: openSmarts } = useSmartAccount();
  const openGate = signer && !isSmartAddress(address) ? smartGate(signer, openSmarts) : null;
  const [openTokens, setOpenTokens] = useState<SwapToken[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.tokens)) setOpenTokens(d.tokens as SwapToken[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const ltvOf = (code: string): number => {
    const hit = assets.find((a) => a.code === code);
    const ltv = Number(hit?.ltvPct);
    return Number.isFinite(ltv) && ltv > 0 ? ltv / 100 : 0.7;
  };
  const status: number | null =
    assets.find((a) => a.poolStatus != null)?.poolStatus ?? null;
  const exSup = legs.reduce((a, l) => a + l.suppliedUsd, 0);
  const exBor = legs.reduce((a, l) => a + l.borrowedUsd, 0);
  const fmtT = (v: number) =>
    v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const borrowMapLocal: Record<string, string> = {};
  for (const a of assets) {
    if ((a.borrowApy ?? 0) <= 0 && borrowMapLocal[a.code] == null) {
      borrowMapLocal[a.code] =
        status != null && status >= 2
          ? `Borrowing is suspended — ${group.label} is ${poolStatusLabel(status) ?? "restricted"}.`
          : `Cannot borrow ${a.code} in ${group.label}.`;
    }
  }
  const collNum = Number(collAmt) || 0;
  const debtNum = Number(debtAmt) || 0;
  const newSupUsd = collNum * px(collCode);
  const maxColl = Math.max(0, (bals[collCode] ?? 0) - (collCode === "XLM" ? 1 : 0));
  const maxLev = maxLeverageForLtv(
    (assets.find((a) => a.code === collCode)?.ltvPct ?? 70),
  ) ?? 3;
  const levClamped = Math.min(Math.max(lev, 1), maxLev);
  // Borrow mode: debt input capped by the pool limit; leverage mode derives
  // debt from collateral × (lev − 1), looped straight back in.
  const poolLimit =
    legs
      .filter((l) => l.suppliedUsd > 0.01)
      .reduce((a, l) => a + l.suppliedUsd * ltvOf(l.code), 0) +
    newSupUsd * (mode === "borrow" ? 1 : levClamped) * ltvOf(collCode);
  const debtUsd =
    mode === "borrow" ? debtNum * px(debtCode) : newSupUsd * (levClamped - 1);
  const debtTok = px(debtCode) > 0 ? debtUsd / px(debtCode) : 0;
  const collTotal = exSup + newSupUsd * (mode === "borrow" ? 1 : levClamped);
  const debtTotal = exBor + debtUsd;
  const maxDebtTok =
    px(debtCode) > 0 ? Math.max(0, poolLimit - exBor) / px(debtCode) : 0;
  const health = healthBps(collTotal, debtTotal);
  const avgSup =
    assets.length > 0
      ? assets.reduce((a, x) => a + (x.supplyApy ?? 0), 0) / assets.length
      : 0;
  const bRows = assets.filter((x) => x.borrowApy != null);
  const avgBor =
    bRows.length > 0
      ? bRows.reduce((a, x) => a + (x.borrowApy ?? 0), 0) / bRows.length
      : 0;
  const net =
    collTotal + debtTotal > 0
      ? netApy(collTotal, avgSup * 100, debtTotal, avgBor * 100) / 100
      : 0;
  const noBorrow = status != null && status >= 2;
  const noSupply = status != null && status >= 4;
  const blockReason =
    !address
      ? "Connect a wallet to open a position."
      : !(px(collCode) > 0) || !(px(debtCode) > 0)
        ? "Live price unavailable for this pair — try again shortly."
        : noBorrow
        ? `${group.label} is ${poolStatusLabel(status!) ?? "restricted"} — borrowing is suspended.`
        : noSupply
          ? `${group.label} is ${poolStatusLabel(status!) ?? "restricted"} — supplying is suspended.`
          : mode === "borrow" && !(collNum > 0)
            ? "Enter a collateral amount above 0."
            : mode === "borrow" && !(debtNum > 0)
              ? "Enter a debt amount above 0."
              : mode === "leverage" && !(collNum > 0)
                ? "Enter a collateral amount above 0."
                : debtTotal - exBor > Math.max(0, poolLimit - exBor) + 0.01
                  ? "Debt exceeds the pool borrow limit — lower it."
                  : null;
  const borrowCodes = [...new Set(assets.filter((a) => (a.borrowApy ?? 0) > 0).map((a) => a.code))];
  const borrowMap: Record<string, string> = {};
  for (const a of assets) {
    if ((a.borrowApy ?? 0) <= 0 && borrowMap[a.code] == null) {
      borrowMap[a.code] =
        noBorrow
          ? `Borrowing is suspended — ${group.label} is ${poolStatusLabel(status!) ?? "restricted"}.`
          : `Cannot borrow ${a.code} in ${group.label}.`;
    }
  }
  const impactReq = useRef(0);
  async function refreshImpact() {
    const id = ++impactReq.current;
    setImpact(null);
    setLiveRate(null);
    if (mode !== "leverage" || !(collNum > 0)) return;
    try {
      const r = await apiFetch("/api/swap/tokens", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (id !== impactReq.current) return;
      const toks = Array.isArray(d?.tokens) ? (d.tokens as SwapToken[]) : [];
      const tIn = toks.find((t) => t.code.toUpperCase() === debtCode.toUpperCase());
      const tOut = toks.find((t) => t.code.toUpperCase() === collCode.toUpperCase());
      if (!tIn || !tOut) return;
      const base = toBaseUnits(String(debtTok), tIn.decimals);
      if (base == null || BigInt(base) <= BigInt(0)) return;
      const q = await apiFetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIn: tIn.contract,
          assetOut: tOut.contract,
          amount: base,
          tradeType: "EXACT_IN",
          slippageBps: "50",
        }),
      });
      const qd = await q.json().catch(() => null);
      if (id !== impactReq.current) return;
      const qq = qd?.ok ? (qd.quote as Quote | null) : null;
      if (!qq) return;
      if (qq.priceImpactPct != null) setImpact(String(qq.priceImpactPct));
      const outBase = quoteOut(qq);
      if (outBase != null && debtTok > 0) {
        const outTok = outBase / 10 ** tOut.decimals;
        setLiveRate(
          `${(outTok / Math.max(debtTok, 1e-12)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${debtCode}/${collCode}`,
        );
      }
    } catch {
      /* impact stays unavailable */
    }
  }
  useEffect(() => {
    refreshImpact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, collCode, debtCode, collAmt, levClamped]);
  // Mirror the current picks into the URL (shareable open-position screen).
  useEffect(() => {
    onParams?.({ coll: collCode, debt: debtCode, mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collCode, debtCode, mode]);
  async function runConfirm() {
    if (blockReason || working || !address) return;
    setFatal(null);
    setWorking(true);
    try {
      const tnum = (v: number) => {
        const b = Math.round(v * 10_000_000);
        if (!(b > 0)) throw new Error("Amount rounds to zero — raise it.");
        return b;
      };
      let intent: unknown;
      let steps = "";
      let healthAfter: string | null = null;
      const legsOut: ConfirmLeg[] = [];
      let title = "";
      let confirmLabel = "";
      if (mode === "borrow") {
        const recipe = new Recipe()
          .supply(collCode, tnum(collNum))
          .borrow(debtCode, tnum(debtTok));
        intent = recipe.buildIntent(address);
        steps = `${intent instanceof Object && Array.isArray((intent as { actions?: unknown[] }).actions) ? ((intent as { actions?: unknown[] }).actions ?? []).length : 2} · Supply → Borrow`;
        const h = healthBps(collTotal, debtTotal);
        healthAfter = h == null ? "Debt-free" : (h / 10000).toFixed(2);
        legsOut.push(
          { label: "Supplying from account", usd: newSupUsd, code: collCode },
          { label: "Borrowing", usd: debtUsd, code: debtCode },
        );
        title = "Borrow";
        confirmLabel = "Borrow";
      } else {
        const stroops = Math.round(collNum * 10_000_000);
        const recipe = boostRecipe({
          debtAsset: debtCode,
          collateralAsset: collCode,
          flashAmount: Math.round(debtTok * 10_000_000),
          supplyAmount: stroops,
          borrowAmount: Math.round(debtTok * 10_000_000),
        });
        intent = recipe.buildIntent(address);
        const acts = (
          intent as { actions?: { kind?: string }[] }
        ).actions?.map((a) => String(a?.kind ?? "?")) ?? [];
        steps = `${acts.length} · ${acts.join(" → ")}`;
        const h = healthBps(collTotal, debtTotal);
        healthAfter = h == null ? "Debt-free" : (h / 10000).toFixed(2);
        legsOut.push(
          { label: "Supplying from account", usd: newSupUsd, code: collCode },
          { label: "Borrowing", usd: debtUsd, code: debtCode },
        );
        title = `Boost ${levClamped.toFixed(1)}x`;
        confirmLabel = "Boost";
      }
      const ctx: LendCtx = {
        protocol,
        address,
        signer: signer ?? address,
        poolAddrs: group.addrs,
        poolKey: group.pool,
        tokens: openTokens,
        held: (code, kind) =>
          legs
            .filter((l) => l.code === code)
            .reduce((s, l) => s + ((kind === "supply" ? l.supplyAmount : l.borrowAmount) ?? 0), 0),
      };
      const armAlert = async () => {
        if (!auto) return;
        try {
          await apiFetch("/api/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet: address, protocol, kind: "ratio", direction: "below", threshold: 120 }),
          });
        } catch {
          /* alert is best-effort; the position is already open */
        }
      };
      const execute = async (onSteps: (s: TxStep[]) => void) => {
        if (mode === "borrow") {
          await runActs(
            ctx,
            [
              { action: "supply", code: collCode, tokens: collNum },
              { action: "borrow", code: debtCode, tokens: debtTok },
            ],
            onSteps,
          );
        } else {
          await runChain(
            ctx,
            {
              first: [
                { action: "supply", code: collCode, tokens: collNum },
                { action: "borrow", code: debtCode, tokens: debtTok },
              ],
              swap: { from: debtCode, to: collCode, tokens: debtTok },
              then: "supply",
            },
            onSteps,
          );
        }
        await armAlert();
      };
      setConfirm({
        title,
        pool: group.label,
        legs: legsOut,
        rate:
          mode === "leverage"
            ? liveRate != null
              ? { text: `Buying at ${liveRate}`, out: "" }
              : null
            : null,
        flash: null,
        steps,
        health: healthAfter,
        route: "Automatic (Soroban AMMs)",
        slippage: "0.50% guard",
        sendTo: null,
        impact,
        warnings:
          mode === "borrow"
            ? ["Supply and borrow settle together in one transaction."]
            : [
                "Opens in steps: supply + borrow, swap, then supply the swap output.",
                "Each step is signed and confirmed before the next.",
              ],
        confirmLabel,
        execute,
        px: (c: string) => {
          const p = prices[c.toUpperCase()];
          return typeof p === "number" && p > 0 ? p : 0;
        },
      });
    } catch (e) {
      setFatal(e instanceof Error ? e.message.slice(0, 200) : "Build failed.");
    } finally {
      setWorking(false);
    }
  }
  /* Display helpers for the summary card. */
  const collDispTok = px(collCode) > 0 ? collTotal / px(collCode) : 0;
  const debtDispTok = px(debtCode) > 0 ? debtTotal / px(debtCode) : 0;
  const receivedTok = px(collCode) > 0 ? debtUsd / px(collCode) : 0;
  const collLtv = ltvOf(collCode);
  const liqPx =
    debtTotal > 0 && collDispTok > 0 && collLtv > 0
      ? debtTotal / (collDispTok * collLtv)
      : null;
  const ratioText =
    health != null
      ? `${(health / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
      : collTotal > 0
        ? "Debt-free"
        : "—";
  const ratioClass =
    health != null
      ? healthStatus(health) === "healthy"
        ? "good"
        : healthStatus(health) === "watch"
          ? "warn"
          : "bad"
      : collTotal > 0
        ? "good"
        : "";
  const fmtPx = (v: number): string =>
    v > 0
      ? `$${v.toLocaleString("en-US", { maximumFractionDigits: v >= 1 ? 2 : 6 })}`
      : "—";
  return (
    <div className="op-wrap">
      {" "}
      <div className="op-head">
        {" "}
        <button type="button" className="op-back" onClick={onBack}>
          {" "}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>{" "}
          Back to market selection{" "}
        </button>{" "}
        <div className="op-title">
          {" "}
          <h2>Open position</h2>{" "}
          <span className="op-pool">
            {group.label} · {PROTOCOL_META[protocol].name}
          </span>{" "}
        </div>{" "}
        <span className="op-head-rest" aria-hidden="true" />{" "}
      </div>{" "}
      {legs.length > 0 && (
        <p className="op-notice" role="note">
          {" "}
          <b>ⓘ</b> You already have a position in {group.label} — proceeding
          adds to this existing position.{" "}
        </p>
      )}{" "}
      <div className="op-modes" role="tablist" aria-label="Position mode">
        {" "}
        {(["borrow", "leverage"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`tab${mode === m ? " active" : ""}`}
            onClick={() => {
              setMode(m);
              setFatal(null);
              setConfirm(null);
            }}
          >
            {" "}
            {m === "borrow" ? "Borrow" : "Leverage"}{" "}
          </button>
        ))}{" "}
      </div>{" "}
      <div className="op-grid">
        {" "}
        <div className="op-form">
          {" "}
          <div className="op-field">
            {" "}
            <span className="op-label">
              {" "}
              <span>Collateral{mode === "borrow" ? "" : " (looped)"}</span>{" "}
              {maxColl > 0 && (
                <button
                  type="button"
                  className="mv-max"
                  onClick={() => setCollAmt(String(maxColl))}
                >
                  {" "}
                  max {fmtT(maxColl)}{" "}
                </button>
              )}{" "}
            </span>{" "}
            <div className="op-box">
              {" "}
              <div className="op-asset">
                {" "}
                <AssetSelect
                  value={collCode}
                  onChange={(c) => {
                    setCollCode(c);
                    setFatal(null);
                  }}
                  options={codes}
                  label="Collateral asset"
                  role={group.label}
                />{" "}
              </div>{" "}
              <label className="op-amount">
                {" "}
                <input
                  className="op-input"
                  value={collAmt}
                  onChange={(e) => setCollAmt(onlyNum(e.target.value))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Collateral amount"
                />{" "}
                <small>{collNum > 0 ? `$${fmtT(newSupUsd)}` : "$0"}</small>{" "}
              </label>{" "}
            </div>{" "}
          </div>{" "}
          <div className="op-field">
            {" "}
            <span className="op-label">
              {" "}
              <span>Debt{mode === "borrow" ? "" : " (auto-looped)"}</span>{" "}
              {mode === "borrow" && maxDebtTok > 0 && (
                <button
                  type="button"
                  className="mv-max"
                  onClick={() => setDebtAmt(String(maxDebtTok))}
                >
                  {" "}
                  max {fmtT(maxDebtTok)}{" "}
                </button>
              )}{" "}
            </span>{" "}
            <div className={`op-box${mode === "borrow" ? "" : " ro"}`}>
              {" "}
              <div className="op-asset">
                {" "}
                <AssetSelect
                  value={debtCode}
                  onChange={(c) => {
                    setDebtCode(c);
                    setFatal(null);
                  }}
                  options={codes}
                  label="Debt asset"
                  role={group.label}
                  disabledCodes={borrowMapLocal}
                />{" "}
              </div>{" "}
              <label className="op-amount">
                {" "}
                {mode === "borrow" ? (
                  <input
                    className="op-input"
                    value={debtAmt}
                    onChange={(e) => setDebtAmt(onlyNum(e.target.value))}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Debt amount"
                  />
                ) : (
                  <input
                    className="op-input ro"
                    value={collNum > 0 ? fmtT(debtTok) : ""}
                    readOnly
                    tabIndex={-1}
                    placeholder="0"
                    aria-label="Debt amount (auto-looped)"
                  />
                )}{" "}
                <small>{debtUsd > 0 ? `$${fmtT(debtUsd)}` : "$0"}</small>{" "}
              </label>{" "}
            </div>{" "}
          </div>{" "}
          {mode === "leverage" && (
            <div className="op-field">
              {" "}
              <span className="op-label">
                {" "}
                <span>
                  Leverage: <b>{levClamped.toFixed(1)}x</b>
                </span>{" "}
                <span className="op-lev-max">{maxLev.toFixed(1)}x max</span>{" "}
              </span>{" "}
              <input
                type="range"
                className="lev-slider"
                min={1}
                max={maxLev}
                step={0.1}
                value={levClamped}
                onChange={(e) => setLev(Number(e.target.value))}
                aria-label="Leverage"
              />{" "}
            </div>
          )}{" "}
          <div className="lev-auto">
            {" "}
            <div className="lev-autorow">
              {" "}
              <span className="lev-autotag">Seidar Automation</span>{" "}
              <button
                type="button"
                className="lev-learn"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("seidar:goto-view", { detail: "automate" }),
                  );
                }}
              >
                Learn more ›
              </button>{" "}
            </div>{" "}
            <p>
              Avoid liquidation during downturns — arms a ratio alert below
              120% on Create.
            </p>{" "}
            <div className="lev-autorow">
              {" "}
              <button
                type="button"
                role="switch"
                aria-checked={auto}
                className={`lev-switch${auto ? " on" : ""}`}
                onClick={() => setAuto((a) => !a)}
                aria-label="Seidar Automation"
              >
                <i aria-hidden="true" />
              </button>{" "}
              <span>Protective alert below 120%</span>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        <aside className="op-sum" aria-label="Position summary">
          {" "}
          <div className="op-sumrow">
            <span>Collateral:</span>
            <b>
              <TokenIcon symbol={collCode} size={16} />{" "}
              {collTotal > 0 ? `${fmtT(collDispTok)} ${collCode}` : "—"}
            </b>
          </div>{" "}
          <div className="op-sumrow">
            <span>Debt:</span>
            <b>
              <TokenIcon symbol={debtCode} size={16} />{" "}
              {debtTotal > 0 ? `${fmtT(debtDispTok)} ${debtCode}` : "—"}
            </b>
          </div>{" "}
          {mode === "leverage" && (
            <div className="op-sumrow">
              <span>Received (est.):</span>
              <b>
                <TokenIcon symbol={collCode} size={16} />{" "}
                {debtUsd > 0 ? `${fmtT(receivedTok)} ${collCode}` : "—"}
              </b>
            </div>
          )}{" "}
          <div className="op-sumrow">
            <span>Safety ratio:</span>
            <b className={ratioClass}>{ratioText}</b>
          </div>{" "}
          <div className="op-sumrow">
            <span>Net APY:</span>
            <b>{net != null ? `${net >= 0 ? "" : "−"}${Math.abs(net).toFixed(2)}%` : "—"}</b>
          </div>{" "}
          <div className="op-sumdiv" aria-hidden="true" />{" "}
          <div className="op-inforow">
            <span className="op-ii" aria-hidden="true">
              i
            </span>{" "}
            Current price ({collCode}) <b>{fmtPx(px(collCode))}</b>
          </div>{" "}
          <div className="op-inforow">
            <span className="op-ii" aria-hidden="true">
              i
            </span>{" "}
            Liquidation price ({collCode}){" "}
            <b>{liqPx != null ? fmtPx(liqPx) : "—"}</b>
          </div>{" "}
          <div className="op-inforow">
            <span className="op-ii" aria-hidden="true">
              i
            </span>{" "}
            Borrow limit used{" "}
            <b>{poolLimit > 0 ? `${Math.min(100, (debtTotal / poolLimit) * 100).toFixed(1)}%` : "—"}</b>
          </div>{" "}
          {mode === "leverage" && liveRate != null && (
            <div className="op-inforow">
              <span className="op-ii" aria-hidden="true">
                i
              </span>{" "}
              Swap rate <b>{liveRate}</b>
            </div>
          )}{" "}
        </aside>{" "}
      </div>{" "}
      {openGate && (
        <p className="op-info">
          {" "}
          <b>ⓘ</b> Seidar executes positions from Smart Accounts — that is
          what enables one-transaction borrows, leverage and automation.{" "}
        </p>
      )}{" "}
      <div className="op-foot">
        {" "}
        <span className="op-foot-msg">
          {" "}
          {fatal ? (
            <span className="lev-error" role="alert">
              {fatal}
            </span>
          ) : blockReason && address ? (
            <span className="lev-warn">{blockReason}</span>
          ) : !address ? (
            <span className="lev-warn">
              Connect a wallet to open a position.
            </span>
          ) : null}{" "}
        </span>{" "}
        <button
          type="button"
          className="op-create"
          disabled={openGate ? false : working || blockReason != null}
          title={openGate ? undefined : (blockReason ?? undefined)}
          onClick={openGate ? openGate.run : runConfirm}
        >
          {openGate ? openGate.label : working ? "Working…" : mode === "borrow" ? "Create position" : "Open leveraged position"}
        </button>{" "}
      </div>{" "}
      <QuoteModal model={confirm} onClose={() => setConfirm(null)} />{" "}
    </div>
  );
}

/* Open-position URL state: /markets/<proto>/create?pool=<label>&coll=<code>
   &debt=<code>&mode=<borrow|leverage>. The open-position screen is
   shareable and survives a refresh; no params = the market selection. */
type CreateUrlSeed = {
  pool: string | null;
  coll: string | null;
  debt: string | null;
  mode: "borrow" | "leverage";
  /** The open-position screen is showing (?open=1); ?pool= alone is
   *  only the market scope. */
  open?: boolean;
};

function readCreateUrl(): CreateUrlSeed {
  try {
    const sp = new URLSearchParams(window.location.search);
    return {
      pool: sp.get("pool"),
      coll: sp.get("coll"),
      debt: sp.get("debt"),
      mode: sp.get("mode") === "leverage" ? "leverage" : "borrow",
      open: sp.get("open") === "1",
    };
  } catch {
    return { pool: null, coll: null, debt: null, mode: "borrow" };
  }
}

function syncCreateUrl(seed: CreateUrlSeed | null): void {
  try {
    const url = new URL(window.location.href);
    if (!seed) {
      // Back to the market list: the ?pool= market scope stays.
      for (const k of ["coll", "debt", "mode", "open"])
        url.searchParams.delete(k);
    } else {
      url.searchParams.set("open", "1");
      if (seed.pool) url.searchParams.set("pool", seed.pool);
      else url.searchParams.delete("pool");
      if (seed.coll) url.searchParams.set("coll", seed.coll);
      else url.searchParams.delete("coll");
      if (seed.debt) url.searchParams.set("debt", seed.debt);
      else url.searchParams.delete("debt");
      if (seed.mode === "leverage") url.searchParams.set("mode", "leverage");
      else url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* the screen still works without the URL sync */
  }
}

function CreateSection({ id }: { id: ProtocolId }) {
  const { owner, active, data } = useSectionPositions();
  const router = useRouter();
  const [markets, setMarkets] = useState<MarketRowLite[]>([]);
  const [poolAssets, setPoolAssets] = useState<PoolAssetLite[]>([]);
  const [feed, setFeed] = useState<"loading" | "live" | "error">("loading");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [sort, setSort] = useState<"tvl" | "apy">("tvl");
  /* undefined = untouched: the scoped market's card starts expanded. */
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [assetCat, setAssetCat] = useState<"all" | "stable" | "volatile">("all");
  const scope = useMarketScope();
  const [picks, setPicks] = useState<{
    pool: string | null;
    coll: string | null;
    debt: string | null;
  }>({ pool: null, coll: null, debt: null });
  /* Open-position section: pool label being created (null = browser). The
     URL mirrors it (?pool/coll/debt/mode) so the screen is shareable. */
  const [openPool, setOpenPool] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<"borrow" | "leverage">("borrow");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/pools", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && Array.isArray(d.rows)) {
          setMarkets(d.rows as MarketRowLite[]);
          setPoolAssets(
            Array.isArray(d.assets) ? (d.assets as PoolAssetLite[]) : [],
          );
          setFeed("live");
        } else {
          setFeed("error");
        }
      })
      .catch(() => {
        if (!cancelled) setFeed("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link: ?pool/coll/debt/mode= restores the open-position screen
  // (the pool resolves here once the market feed lands).
  useEffect(() => {
    const seed = readCreateUrl();
    if (seed.pool && (seed.open || seed.coll || seed.debt)) setOpenPool(seed.pool);
    if (seed.coll || seed.debt)
      setPicks({ pool: seed.pool, coll: seed.coll, debt: seed.debt });
    setOpenMode(seed.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const l of data?.legs ?? []) {
      if (l.suppliedUsd > 0.01) set.add(l.code);
    }
    return set;
  }, [data]);

  /* Group openable pairs by pool name (DeFi Saver style: Fixed, YieldBlox…),
     scoped to this protocol. Same-name pools at several addresses (two
     YieldBlox pools) merge into one card; TVL sums each distinct pool
     address once — never per pair row, since every row of a pool stamps
     the same pool total. Pools with no openable pairs still render (0
     options) so empty markets stay visible instead of vanishing. */
  const groups = useMemo(() => {
    type Bucket = {
      opts: MarketRowLite[];
      rep: MarketRowLite | null;
      totals: Map<string, number>;
      borTotals: Map<string, number>;
      addrs: Set<string>;
      status: number | null;
    };
    const byPool = new Map<string, Bucket>();
    for (const m of markets) {
      if (m.protocol !== id) continue;
      if (m.available === false) continue;
      const key = m.poolName || m.pool;
      let b = byPool.get(key);
      if (!b) {
        b = { opts: [], rep: null, totals: new Map(), borTotals: new Map(), addrs: new Set(), status: null };
        byPool.set(key, b);
      }
      if (m.poolStatus != null && !b.addrs.has(m.pool))
        b.status = b.status == null ? m.poolStatus : Math.min(b.status, m.poolStatus);
      if (!b.rep) b.rep = m;
      b.addrs.add(m.pool);
      if (!b.totals.has(m.pool)) {
        b.totals.set(m.pool, m.poolSupplied ?? 0);
        b.borTotals.set(m.pool, m.poolBorrowed ?? 0);
      }
      if (!m.debt || m.borrowPaused) continue;
      if (ownedOnly && !ownedCodes.has(m.collateral)) continue;
      b.opts.push(m);
    }
    const out: MarketGroup[] = [...byPool.entries()].map(
      ([label, b]) => {
        const protocol = b.rep?.protocol ?? id;
        const pool = b.rep?.pool ?? label;
        const assets = poolAssets.filter((a) => b.addrs.has(a.pool));
        const collaterals = [
          ...new Set(
            assets.filter((a) => a.canCollateral).map((a) => a.code),
          ),
        ].sort();
        const debts = [
          ...new Set(
            assets.filter((a) => a.canBorrow).map((a) => a.code),
          ),
        ].sort();
        const tvl = [...b.totals.values()].reduce((a, v) => a + v, 0);
        const borrowed = [...b.borTotals.values()].reduce((a, v) => a + v, 0);
        const sorted = [...b.opts].sort(
          (a, o) => (o.marketSizeUsd ?? 0) - (a.marketSizeUsd ?? 0),
        );
        const topApy = Math.max(
          ...sorted.map((o) => o.borrowApy ?? o.supplyApy ?? 0),
          0,
        );
        return {
          protocol,
          pool,
          label,
          addrs: [...b.addrs],
          collaterals,
          debts,
          options: sorted,
          tvl,
          borrowed,
          topApy,
          status: b.status,
        };
      },
    );
    out.sort((a, b) =>
      sort === "tvl" ? b.tvl - a.tvl : b.topApy - a.topApy,
    );
    // Fixed to the page's market: only that market is listed.
    const scoped = scope ? out.filter((g) => g.label === scope) : [];
    return scoped.length > 0 ? scoped : out;
  }, [markets, ownedOnly, ownedCodes, sort, id, poolAssets, scope]);
  const scopedOnly = !!scope && groups.length === 1 && groups[0].label === scope;

  const optionCount = groups.reduce((a, g) => a + g.options.length, 0);

  function togglePick(groupLabel: string, code: string, side: "coll" | "debt") {
    setPicks((p) => {
      const samePool = p.pool === groupLabel;
      if (side === "coll") {
        const next = samePool && p.coll === code ? null : code;
        return { pool: groupLabel, coll: next, debt: samePool ? p.debt : null };
      }
      const next = samePool && p.debt === code ? null : code;
      return { pool: groupLabel, coll: samePool ? p.coll : null, debt: next };
    });
  }
  /* Pool Create opens the dedicated open-position section (picks seed
     the collateral/debt pair; the URL mirrors it for sharing). */
  function createFor(g: MarketGroup) {
    if (createBlock(g)) return;
    const coll = picks.pool === g.label ? picks.coll : null;
    const debt = picks.pool === g.label ? picks.debt : null;
    setOpenPool(g.label);
    setOpenMode("borrow");
    syncCreateUrl({ pool: g.label, coll, debt, mode: "borrow" });
  }

  if (openPool) {
    const g = groups.find((x) => x.label === openPool);
    // A deep link into a paused market lands on its card, which says why.
    if (g && !createBlock(g)) {
      const addrs = new Set(g.addrs);
      const codes = new Set([...g.collaterals, ...g.debts]);
      return (
        <OpenPosition
          protocol={id}
          group={g}
          assets={poolAssets.filter((a) => addrs.has(a.pool))}
          legs={(data?.legs ?? []).filter(
            (l) =>
              (l.protocol as string) === (id as string) &&
              (l.pool
                ? addrs.has(l.pool)
                : codes.has(l.code) &&
                  (l.suppliedUsd > 0.01 || l.borrowedUsd > 0.01)),
          )}
          address={active ?? owner ?? null}
          initialColl={picks.pool === g.label ? picks.coll : null}
          initialDebt={picks.pool === g.label ? picks.debt : null}
          initialMode={openMode}
          onParams={(p) =>
            syncCreateUrl({
              pool: g.label,
              coll: p.coll,
              debt: p.debt,
              mode: p.mode,
            })
          }
          onBack={() => {
            setOpenPool(null);
            setOpenMode("borrow");
            syncCreateUrl(null);
          }}
        />
      );
    }
  }

  return (
    <div className="cr-wrap">
      {" "}
      <SectionTabs id={id} section="create" />{" "}
      <p className="mk-count">
        Showing <b>{optionCount}</b> option{optionCount === 1 ? "" : "s"}{" "}
        {scopedOnly ? (
          <>
            in <b>{groups[0].label}</b>
          </>
        ) : (
          <>
            across <b>{groups.length}</b> market{groups.length === 1 ? "" : "s"}{" "}
            in <b>{PROTOCOL_META[id].name}</b>
          </>
        )}
        {owner || active ? "" : " — connect a wallet to open positions"}
      </p>{" "}
      <div className="mk-controls">
        {" "}
        <label className="cr-owned">
          {" "}
          <button
            type="button"
            role="switch"
            aria-checked={ownedOnly}
            className={`x-switch${ownedOnly ? " on" : ""}`}
            onClick={() => setOwnedOnly((o) => !o)}
          >
            <i aria-hidden="true" />
          </button>{" "}
          Owned asset only{" "}
        </label>{" "}
        <span className="mk-group">
          Group by: <b>Market</b>
        </span>{" "}
        {!scopedOnly && (
        <span className="mk-sort">
          Sort:{" "}
          <span className="nt-seg" role="group" aria-label="Sort markets">
            {" "}
            <button
              type="button"
              aria-pressed={sort === "tvl"}
              className={sort === "tvl" ? "active" : ""}
              onClick={() => setSort("tvl")}
            >
              Highest TVL
            </button>{" "}
            <button
              type="button"
              aria-pressed={sort === "apy"}
              className={sort === "apy" ? "active" : ""}
              onClick={() => setSort("apy")}
            >
              Highest APY
            </button>{" "}
          </span>{" "}
        </span>
        )}
      </div>{" "}
      {feed === "loading" && (
        <p className="pf-empty load-row">
          <LoadingMark size={16} /> Loading live markets…
        </p>
      )}{" "}
      {feed === "error" && (
        <p className="proto-warn">Market feed unreachable — retry in a bit.</p>
      )}{" "}
      {scopedOnly && createBlock(groups[0]) && (
        <p className="proto-warn">{createBlock(groups[0])}</p>
      )}{" "}
      {groups.map((g) => {
        const open = expanded === undefined ? scopedOnly : expanded === g.pool;
        const assetCount = new Set([...g.collaterals, ...g.debts]).size;
        return (
          <div key={g.pool} className="mk-card">
            {" "}
            <div className="mk-row">
              {" "}
              <button
                type="button"
                className={`mk-chev${open ? " open" : ""}`}
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${g.label} options`}
                onClick={() => setExpanded(open ? null : g.pool)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>{" "}
              </button>{" "}
              <span className="mk-name">
                {" "}
                {(() => {
                  const legs = data?.legs ?? [];
                  const hasActive = legs.some(
                    (l) =>
                      (l.suppliedUsd > 0.01 || l.borrowedUsd > 0.01) &&
                      (l.pool
                        ? g.addrs.includes(l.pool)
                        : g.collaterals.includes(l.code) ||
                          g.debts.includes(l.code)),
                  );
                  return hasActive ? (
                    <span className="mk-live">ACTIVE POSITION</span>
                  ) : null;
                })()}{" "}
                <ProtoIcon protocol={g.protocol} size={26} />{" "}
                <span>
                  <b>{g.label}</b>{" "}
                  <small>
                    {assetCount} assets · {g.options.length} option
                    {g.options.length === 1 ? "" : "s"} · TVL:{" "}
                    {fmtTvl(g.tvl)}
                    {g.borrowed > 0 ? ` · Borrowed ${fmtTvl(g.borrowed)}` : ""}
                  </small>{" "}
                </span>{" "}
              </span>{" "}
              <span className="mk-assets">
                {" "}
                <IconStack codes={g.collaterals} />{" "}
                <small>Collateral assets</small>{" "}
              </span>{" "}
              <span className="mk-assets">
                {" "}
                <IconStack codes={g.debts} />{" "}
                <small>Debt assets</small>{" "}
              </span>{" "}
              {(() => {
                const why = createBlock(g);
                const st = g.status != null && g.status >= 2 ? poolStatusLabel(g.status) : null;
                return (
                  <span className="mk-create-wrap">
                    {st && <span className="mk-status">{st}</span>}
                    <button
                      type="button"
                      className="btn mk-create"
                      onClick={() => createFor(g)}
                      disabled={!!why}
                      title={why ?? undefined}
                    >
                      Create
                    </button>
                  </span>
                );
              })()}{" "}
            </div>{" "}
            {open &&
              (() => {
                const addrs = new Set(g.addrs);
                const assets = poolAssets.filter((a) => addrs.has(a.pool));
                const shownAssets = assets.filter(
                  (a) =>
                    assetCat === "all" ||
                    (assetCat === "stable"
                      ? STABLES.has(a.code)
                      : !STABLES.has(a.code)),
                );
                return (
                  <div className="mk-assets-wrap">
                    {" "}
                    <div className="mk-arow mk-ahead" aria-hidden="true">
                      {" "}
                      <span>Asset</span> <span>Lend</span>{" "}
                      <span>C. factor</span> <span>S. APY</span>{" "}
                      <span>S. cap</span> <span>B. APY</span>{" "}
                      <span>B. cap</span> <span>Coll.</span> <span>Debt</span>{" "}
                    </div>{" "}
                    {shownAssets.map((a) => {
                      const collOn =
                        picks.pool === g.label && picks.coll === a.code;
                      const debtOn =
                        picks.pool === g.label && picks.debt === a.code;
                      return (
                        <div key={`${a.pool}:${a.code}`} className="mk-arow">
                          {" "}
                          <span className="mk-acode">
                            {" "}
                            <TokenIcon symbol={a.code} size={20} />{" "}
                            <b>{a.code}</b>{" "}
                          </span>{" "}
                          <span>
                            {a.supplyApy != null && a.supplyApy > 0 ? (
                              <Tip
                                tip={
                                  <>
                                    Lend at {a.supplyApy.toFixed(2)}%
                                  </>
                                }
                              >
                                {" "}
                                <button
                                  type="button"
                                  className="mk-lendbtn"
                                  aria-label={`Lend ${a.code}`}
                                  onClick={() =>
                                    router.push(`/markets/${a.protocol}/lend`)
                                  }
                                >
                                  <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M15 3h6v6" />
                                    <path d="M10 14L21 3" />
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  </svg>{" "}
                                </button>{" "}
                              </Tip>
                            ) : null}
                          </span>{" "}
                          <span
                            className={a.ltvPct == null ? "mk-zero" : undefined}
                          >
                            {a.ltvPct == null
                              ? "0%"
                              : `${a.ltvPct.toFixed(2)}%`}
                          </span>{" "}
                          <span>
                            {a.supplyApy == null
                              ? "—"
                              : `${a.supplyApy.toFixed(2)}%`}
                          </span>{" "}
                          <span>
                            <CapRing pct={a.supFillPct} />
                          </span>{" "}
                          <span className={!a.canBorrow ? "mk-zero" : undefined}>
                            {!a.canBorrow
                              ? "0%"
                              : a.borrowApy == null
                                ? "—"
                                : `${a.borrowApy.toFixed(2)}%`}
                          </span>{" "}
                          <span>
                            <CapRing
                              pct={!a.canBorrow ? null : a.borFillPct}
                            />
                          </span>{" "}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={collOn}
                            aria-label={`Use ${a.code} as collateral`}
                            className={`mk-pick${collOn ? " on" : ""}`}
                            disabled={!a.canCollateral}
                            onClick={() => togglePick(g.label, a.code, "coll")}
                          >
                            {" "}
                            <span className="mk-box">
                              {collOn && (
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>{" "}
                            Coll.{" "}
                          </button>{" "}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={debtOn}
                            aria-label={`Use ${a.code} as debt`}
                            className={`mk-pick${debtOn ? " on" : ""}`}
                            disabled={!a.canBorrow}
                            onClick={() => togglePick(g.label, a.code, "debt")}
                          >
                            {" "}
                            <span className="mk-box">
                              {debtOn && (
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>{" "}
                            Debt{" "}
                          </button>{" "}
                        </div>
                      );
                    })}{" "}
                    <div className="mk-afoot">
                      {" "}
                      <span>{shownAssets.length} assets</span>{" "}
                      <span
                        className="nt-seg"
                        role="group"
                        aria-label="Filter assets"
                      >
                        {" "}
                        {(
                          ["all", "stable", "volatile"] as const
                        ).map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={assetCat === c}
                            className={assetCat === c ? "active" : ""}
                            onClick={() => setAssetCat(c)}
                          >
                            {c === "all"
                              ? "All"
                              : c === "stable"
                                ? "Stable"
                                : "Volatile"}
                          </button>
                        ))}{" "}
                      </span>{" "}
                    </div>{" "}
                  </div>
                );
              })()}{" "}
          </div>
        );
      })}{" "}
      {feed === "live" && groups.length === 0 && (
        <p className="pf-empty">No markets match these filters.</p>
      )}{" "}
    </div>
  );
}

/* Shared section tab bar (manage + subsections). Rendered by every
   protocol section so navigation never disappears. */
/* Shared transaction-account switcher (main wallet + smart accounts).
   One instance lives in the board topbar and one in every section tab
   row, so refresh + account switching exist on all sections. */
/** Pool / vault page top bar: back to the Markets section, the page's
 *  sections (Manage, Automate, History) as tabs, account switcher. */
export type VenueSection = "manage" | "automate" | "history";
/* Page header for a market / pool / vault page: the way back first, then
   the logo tile, the name and a line of key facts (the first one bold). */
export type HeroFact = { text: ReactNode; icon?: ReactNode; strong?: boolean };
export function PageHero({
  back,
  logo,
  title,
  facts,
  status,
}: {
  back: { href: string; label: string };
  logo: ReactNode;
  title: ReactNode;
  facts: HeroFact[];
  /** Market status (Blend pool status) shown as a pill beside the title. */
  status?: number | null;
}) {
  const router = useRouter();
  return (
    <header className="ph">
      <button type="button" className="ph-back" onClick={() => router.push(back.href)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        {back.label}
      </button>
      <div className="ph-id">
        <div className="ph-logo">{logo}</div>
        <div className="ph-text">
          <div className="ph-title">
            <h1>{title}</h1>
            <MarketStatusPill status={status} />
          </div>
          {facts.length > 0 && (
            <div className="ph-facts">
              {facts.map((f, i) => (
                <span key={i} className={f.strong ? "ph-strong" : undefined}>
                  {f.icon}
                  {f.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function VenueTopbar({
  back,
  base,
  section,
  sections,
  hero,
}: {
  back: { href: string; label: string };
  base: string;
  section: VenueSection;
  sections: VenueSection[];
  /** The page header above the tabs (logo, name, facts). */
  hero: { logo: ReactNode; title: ReactNode; facts: HeroFact[] };
}) {
  const router = useRouter();
  const label = (s: VenueSection) => (s === "manage" ? "Manage" : s === "automate" ? "Automate" : "History");
  return (
    <>
    <PageHero back={back} {...hero} />
    <div className="proto-topbar vt-bar" role="navigation">
      <div className="proto-tabs" role="tablist" aria-label="Sections">
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            className={`proto-tab${section === s ? " active" : ""}`}
            onClick={() => section !== s && router.push(s === "manage" ? base : `${base}/${s}`)}
          >
            {label(s)}
          </button>
        ))}
      </div>
      <div className="proto-tools">
        <AccountSwitcher />
      </div>
    </div>
    </>
  );
}

function AccountSwitcher() {
  const owner = useWalletAddress();
  const activeAcct = useTxActive(owner);
  const { smarts: acctSmarts } = useShellSmarts(owner);
  const [open, setOpen] = useState(false);
  const address = activeAcct ?? owner;
  const hasWallet = !!owner;
  const isSmartActive = !!address && /^C[A-Z2-7]{55}$/.test(address);
  function pickAccount(addr: string) {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("seidar:set-active-account", { detail: addr }),
    );
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="proto-acct-wrap">
      {" "}
      <button
        type="button"
        className="proto-wallet"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={address ?? "Connect a wallet"}
      >
        {" "}
        {address ? (
          <DiceAvatar address={address} size={22} />
        ) : (
          <span
            className={`proto-wdot${hasWallet ? " on" : ""}`}
            aria-hidden="true"
          />
        )}{" "}
        <span className="proto-wlabel">
          {" "}
          <b>
            {hasWallet && address ? shortAddr(address) : "No wallet"}
          </b>{" "}
          <small>
            {isSmartActive ? "Smart wallet" : "Main wallet"}
          </small>{" "}
        </span>{" "}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && (
        <>
          {" "}
          <div
            className="proto-acct-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />{" "}
          <div
            className="proto-acct-menu"
            role="menu"
            aria-label="Transaction account"
          >
            {" "}
            <button
              type="button"
              className={`proto-acct-row${!isSmartActive ? " active" : ""}`}
              onClick={() => owner && pickAccount(owner)}
              disabled={!owner}
              role="menuitemradio"
              aria-checked={!isSmartActive}
            >
              {" "}
              {owner ? <DiceAvatar address={owner} size={22} /> : null}{" "}
              <span className="proto-acct-addr">
                {owner ? shortAddr(owner) : "No wallet"}
              </span>{" "}
              <span className="proto-acct-tag">Main</span>{" "}
              {!isSmartActive && owner ? (
                <span className="proto-acct-check" aria-hidden="true">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              ) : null}{" "}
            </button>{" "}
            {acctSmarts.map((s) => (
              <button
                key={s}
                type="button"
                className={`proto-acct-row${address === s ? " active" : ""}`}
                onClick={() => pickAccount(s)}
                role="menuitemradio"
                aria-checked={address === s}
              >
                {" "}
                <DiceAvatar address={s} size={22} />{" "}
                <AccountTag address={s} className="proto-acct-addr" />{" "}
                {address === s ? (
                  <span className="proto-acct-check" aria-hidden="true">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : null}{" "}
              </button>
            ))}{" "}
            {acctSmarts.length === 0 && (
              <p className="proto-acct-note">
                No automation account yet - create one from the top-bar
                wallet menu to unlock hands-off execution.
              </p>
            )}{" "}
            <p className="proto-acct-note">
              The active account signs every transaction on this board.
            </p>{" "}
          </div>{" "}
        </>
      )}{" "}
    </div>
  );
}

function SectionTabs({
  id,
  section,
}: {
  id: ProtocolId;
  section: ProtocolSection;
}) {
  const router = useRouter();
  const [spin, setSpin] = useState(false);
  function go(s: ProtocolSection) {
    if (s === section) return;
    router.push(sectionHref(id, s));
  }
  function refresh() {
    if (spin) return;
    setSpin(true);
    window.dispatchEvent(new Event("seidar:refresh"));
    setTimeout(() => setSpin(false), 600);
  }
  return (
    <>
    <MarketHero id={id} />
    <div
      className="proto-topbar"
      role="navigation"
      aria-label={`${PROTOCOL_META[id].name} actions`}
    >
      {" "}
      <div className="proto-tabs" role="tablist" aria-label="Board sections">
        {" "}
        {SECTION_TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            className={`proto-tab${section === s ? " active" : ""}`}
            onClick={() => go(s)}
          >
            {" "}
            {sectionLabel(s)}{" "}
          </button>
        ))}{" "}
      </div>{" "}
      <div className="proto-tools">
        {" "}
        <button
          type="button"
          className={`icon-btn${spin ? " spinning" : ""}`}
          onClick={refresh}
          disabled={spin}
          aria-label="Refresh"
          title="Refresh live positions and markets"
        >
          {" "}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>{" "}
        </button>{" "}
        <AccountSwitcher />{" "}
      </div>
    </div>
    </>
  );
}

/* Standalone section page: tab bar only, blank content, zero side
   effects. The full board (data, quotes, notifications) mounts solely
   on Manage. */
function ProtocolBlank({
  id,
  section,
}: {
  id: ProtocolId;
  section: ProtocolSection;
}) {
  return (
    <div className="proto-board">
      {" "}
      <SectionTabs id={id} section={section} />{" "}
      <div className="proto-blankpage" aria-label={`${sectionLabel(section)} coming soon`} />
      {" "}
    </div>
  );
}

/* Shared position summary header for protocol sections (notify /
   automate / create read the same live data as the board). */
function useSectionAccount() {
  const owner = useWalletAddress();
  const pick = useTxActive(owner);
  const active = pick ?? owner;
  return { owner, active };
}

function useSectionPositions() {
  const { owner, active } = useSectionAccount();
  const { data, loading } = useWalletPositions(active);
  return { owner, active, data, loading };
}

function PositionHeader({
  id,
  compact,
}: {
  id: ProtocolId;
  compact?: boolean;
}) {
  const { data } = useSectionPositions();
  const live = data?.perProtocol[id];
  const supplying = live?.supplied ?? 0;
  const borrowing = live?.borrowed ?? 0;
  const health = live?.healthFactor ?? null;
  const netApy = live?.netApy ?? 0;
  const safety = health != null && health > 0 ? health * 100 : null;
  const cell = (label: string, value: string, tone?: string) => (
    <div className="ph-cell" key={label}>
      {" "}
      <span className="ph-label">{label}</span>{" "}
      <b className={tone ? `ph-${tone}` : undefined}>{value}</b>{" "}
    </div>
  );
  return (
    <div className="pf-card ph-card">
      {" "}
      <div className="ph-cell ph-safe" key="Safety ratio">
        {" "}
        <ProtoIcon protocol={id} size={40} />{" "}
        <span className="ph-safe-body">
          <span
            className="ph-label"
            title="Live safety buffer from your borrow limit — higher is safer."
          >
            Safety ratio
          </span>{" "}
          <b>{safety != null ? `${Math.round(safety)}%` : "—"}</b>{" "}
        </span>{" "}
      </div>
      {cell(
        "Balance:",
        `$${Math.round(supplying - borrowing).toLocaleString()}`,
      )}
      {cell("Collateral:", `$${Math.round(supplying).toLocaleString()}`)}
      {cell(
        "Debt:",
        `$${Math.round(borrowing).toLocaleString()}`,
        borrowing > 0.01 ? "neg" : undefined,
      )}
      {!compact &&
        cell(
          "Net APY:",
          `${(netApy >= 0 ? "+" : "")}${(netApy * 100).toFixed(2)}%`,
        )}{" "}
    </div>
  );
}

type AlertRule = {
  id: number;
  wallet: string;
  protocol: string;
  kind: string;
  direction: string;
  threshold: number;
  asset: string;
  active: boolean;
  fired: boolean;
  last_note: string;
};

type ChannelState = {
  on: boolean;
  handle: string;
};

function readChannels(owner: string | null): Record<string, ChannelState> {
  const fallback: Record<string, ChannelState> = {
    telegram: { on: false, handle: "" },
    mail: { on: false, handle: "" },
    blockscan: { on: false, handle: "" },
    discord: { on: false, handle: "" },
  };
  if (!owner) return fallback;
  try {
    const raw = window.localStorage.getItem(`seidar.alertChannels.${owner}`);
    if (!raw) return fallback;
    const s = JSON.parse(raw);
    for (const k of Object.keys(fallback)) {
      if (s?.[k] && typeof s[k] === "object") {
        fallback[k] = {
          on: s[k].on === true,
          handle: typeof s[k].handle === "string" ? s[k].handle : "",
        };
      }
    }
  } catch {
    /* defaults */
  }
  return fallback;
}

/* Notify: position alerts (ratio monitors that fire into the bell) +
   delivery channel preferences. Fully working, no external keys. */
function NotifySection({ id }: { id: ProtocolId }) {
  const { owner, active, data } = useSectionPositions();
  const live = data?.perProtocol[id];
  const health = live?.healthFactor ?? null;
  const safety = health != null && health > 0 ? health * 100 : null;
  const [tab, setTab] = useState<"ratio" | "supply-cap">("ratio");
  const [direction, setDirection] = useState<"above" | "below">("below");
  const [threshold, setThreshold] = useState("120");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<Record<string, ChannelState>>(() =>
    readChannels(null),
  );
  /* Supply-cap watch: asset universe + on-chain caps per asset (Blend
     reserves; other protocols report untracked until a cap feed lands). */
  const [poolCodes, setPoolCodes] = useState<string[]>([]);
  const [poolCaps, setPoolCaps] = useState<Record<string, number>>({});
  const [poolsNote, setPoolsNote] = useState<string | null>(null);
  const [capAsset, setCapAsset] = useState("");
  const [capBusy, setCapBusy] = useState(false);
  const [capMsg, setCapMsg] = useState<string | null>(null);

  async function loadPoolCaps(): Promise<Record<string, number>> {
    try {
      const d = await apiFetch("/api/pools", { cache: "no-store" }).then((r) =>
        r.json(),
      );
      const rows: {
        protocol?: unknown;
        collateral?: unknown;
        debt?: unknown;
        supplyCap?: unknown;
      }[] = d?.ok && Array.isArray(d.rows) ? d.rows : [];
      const codes = new Set<string>();
      const caps: Record<string, number> = {};
      for (const r of rows) {
        if (r.protocol !== id) continue;
        for (const c of [r.collateral, r.debt]) {
          if (typeof c === "string" && c) codes.add(c.toUpperCase());
        }
        const code =
          typeof r.collateral === "string" ? r.collateral.toUpperCase() : "";
        const cap = typeof r.supplyCap === "number" ? r.supplyCap : null;
        if (code && cap != null && cap > 0) {
          caps[code] = Math.max(caps[code] ?? 0, cap);
        }
      }
      const sorted = [...codes].sort();
      setPoolCodes(sorted);
      setPoolCaps(caps);
      if (sorted.length === 0) setPoolsNote("Pool data unavailable right now.");
      else setPoolsNote(null);
      return caps;
    } catch {
      setPoolsNote("Pool data unavailable right now.");
      return {};
    }
  }

  async function loadAlerts(own: string | null) {
    if (!own) {
      setAlerts([]);
      return;
    }
    try {
      const d = await apiFetch(`/api/alerts?wallet=${own}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (d?.ok && Array.isArray(d.alerts))
        setAlerts(
          (d.alerts as AlertRule[]).filter((a) => a.protocol === id),
        );
    } catch {
      /* keep last */
    }
  }

  useEffect(() => {
    setChannels(readChannels(owner));
    loadAlerts(owner);
    loadPoolCaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, id]);

  function saveChannels(next: Record<string, ChannelState>) {
    setChannels(next);
    try {
      if (owner)
        window.localStorage.setItem(
          `seidar.alertChannels.${owner}`,
          JSON.stringify(next),
        );
    } catch {
      /* ignore */
    }
  }

  async function addAlert() {
    if (busy) return;
    setMsg(null);
    if (!owner) {
      setMsg("Connect a wallet to set alerts.");
      return;
    }
    const t = Number(String(threshold).replace(/[^0-9.]/g, ""));
    if (!(t > 0)) {
      setMsg("Enter a threshold above 0 (percent).");
      return;
    }
    setBusy(true);
    try {
      const d = await apiFetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: owner,
          protocol: id,
          kind: "ratio",
          direction,
          threshold: t,
        }),
      }).then((r) => r.json());
      if (!d?.ok) throw new Error("Alert store failed.");
      setMsg(`Alert armed: notify when safety ratio is ${direction} ${t}%.`);
      loadAlerts(owner);
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e).slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  async function addCapAlert() {
    if (capBusy) return;
    setCapMsg(null);
    if (!owner) {
      setCapMsg("Connect a wallet to set alerts.");
      return;
    }
    const code = capAsset.toUpperCase();
    if (!code) {
      setCapMsg("Pick an asset to watch.");
      return;
    }
    setCapBusy(true);
    try {
      const caps =
        Object.keys(poolCaps).length > 0 ? poolCaps : await loadPoolCaps();
      const baseline = caps[code];
      if (!(baseline != null && baseline > 0)) {
        setCapMsg(
          `Supply caps aren't tracked for ${code} on ${id} yet — try another asset.`,
        );
        return;
      }
      const d = await apiFetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: owner,
          protocol: id,
          kind: "supply-cap",
          direction: "above",
          threshold: baseline,
          asset: code,
        }),
      }).then((r) => r.json());
      if (!d?.ok) throw new Error("Alert store failed.");
      setCapMsg(
        `Watching ${code} — alerts when its supply cap rises above ${Math.round(baseline).toLocaleString()}.`,
      );
      loadAlerts(owner);
    } catch (e) {
      setCapMsg(String(e instanceof Error ? e.message : e).slice(0, 160));
    } finally {
      setCapBusy(false);
    }
  }

  async function removeAlert(alertId: number) {
    if (!owner) return;
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await apiFetch("/api/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: owner, id: alertId }),
      });
    } catch {
      /* optimistic stands */
    }
  }

  /* Monitor: ratio rules + automation status, every 60s while open. */
  const monRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function evaluate() {
      if (monRef.current || cancelled || !owner) return;
      monRef.current = true;
      try {
        // Ratio + supply-cap alerts fire server-side (services/api
        // alerts-watch.ts) whether or not this page is open; re-read them
        // so fired / re-armed states show here.
        if (alerts.some((a) => a.active)) loadAlerts(owner);
        // Automation alerts: keeper strategy fills/failures for this wallet.
        // Always on - no switch. The first sighting of a strategy only
        // baselines it; later transitions to executed/completed/failed
        // notify into the bell.
        {
          try {
            const d = await apiFetch(`/api/strategies?wallet=${owner}`, {
              cache: "no-store",
            }).then((r) => r.json());
            const list: { id: unknown; status: unknown; kind: unknown; last_note: unknown }[] =
              d?.ok && Array.isArray(d.strategies) ? d.strategies : [];
            let seen: Record<string, string> = {};
            try {
              seen = JSON.parse(
                window.localStorage.getItem(`seidar.autoSeen.${owner}`) ?? "{}",
              );
            } catch {
              seen = {};
            }
            let touched = false;
            for (const s of list) {
              const key = String(s.id);
              const st = String(s.status ?? "");
              if (seen[key] === undefined) {
                seen[key] = st;
                touched = true;
                continue;
              }
              if (
                seen[key] !== st &&
                (st === "executed" || st === "completed" || st === "failed")
              ) {
                seen[key] = st;
                touched = true;
                try {
                  await apiFetch("/api/notifications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      wallet: owner,
                      text: `Automation update: ${String(s.kind ?? "strategy")} #${key} ${st}${s.last_note ? ` - ${String(s.last_note).slice(0, 120)}` : ""}`,
                    }),
                  });
                  window.dispatchEvent(new Event("seidar:refresh-notes"));
                } catch {
                  /* next strategy */
                }
              }
            }
            if (touched) {
              try {
                window.localStorage.setItem(
                  `seidar.autoSeen.${owner}`,
                  JSON.stringify(seen),
                );
              } catch {
                /* ignore */
              }
            }
          } catch {
            /* next round */
          }
        }
      } finally {
        monRef.current = false;
      }
    }
    evaluate();
    const t = setInterval(evaluate, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, alerts, safety]);

  /* Supply-cap watch: compares live per-asset caps against armed baselines
     every few minutes (pools data is server-cached, so this stays cheap).
     One-shot like ratio alerts: fires on increase, then marks fired. */
  const capMonRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function evaluateCaps() {
      if (capMonRef.current || cancelled || !owner) return;
      const liveCaps = alerts.filter(
        (a) => a.active && !a.fired && a.kind === "supply-cap",
      );
      if (liveCaps.length === 0) return;
      capMonRef.current = true;
      try {
        const caps = await loadPoolCaps();
        for (const a of liveCaps) {
          if (cancelled) return;
          const code = (a.asset ?? "").toUpperCase();
          const now = caps[code];
          if (!(now != null && now > 0)) continue;
          if (now <= a.threshold) continue;
          try {
            await apiFetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                wallet: owner,
                text: `Supply cap for ${code} rose to ${Math.round(now).toLocaleString()} (was ${Math.round(a.threshold).toLocaleString()}) on ${id}.`,
              }),
            });
            await apiFetch("/api/alerts", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                wallet: owner,
                id: a.id,
                fired: true,
                last_note: `Fired at ${Math.round(now).toLocaleString()}.`,
              }),
            });
            window.dispatchEvent(new Event("seidar:refresh-notes"));
          } catch {
            /* next rule */
          }
        }
        loadAlerts(owner);
      } finally {
        capMonRef.current = false;
      }
    }
    evaluateCaps();
    const t = setInterval(evaluateCaps, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, alerts, id]);

  const channelsMeta: {
    id: string;
    name: string;
    desc: string;
    cta: string;
    handleLabel: string | null;
  }[] = [
    {
      id: "telegram",
      name: "Telegram",
      desc: "Receive alerts directly through Telegram after connecting your account.",
      cta: "Set up",
      handleLabel: "Bot handle",
    },
    {
      id: "mail",
      name: "Mail",
      desc: "Receive alerts in your inbox after verifying your email address.",
      cta: "Set up",
      handleLabel: "Email",
    },
    {
      id: "blockscan",
      name: "Blockscan",
      desc: "Receive alerts in your blockscan after connecting your account.",
      cta: "Activate",
      handleLabel: null,
    },
    {
      id: "discord",
      name: "Discord",
      desc: "Receive alerts in your Discord server after connecting a webhook.",
      cta: "Set up",
      handleLabel: "Webhook name",
    },
  ];

  function mineList(kind: string) {
    const mine = alerts.filter((a) => a.kind === kind);
    if (mine.length === 0) return null;
    return (
      <ul className="nt-mine">
        {mine.map((a) => (
          <li key={a.id}>
            {" "}
            <span>
              {kind === "supply-cap"
                ? `${a.asset} cap ↑ ${Math.round(a.threshold).toLocaleString()}`
                : `${a.direction} ${a.threshold}%`}{" "}
              · {a.fired ? "fired" : a.active ? "armed" : "off"}
              {a.last_note ? ` · ${a.last_note}` : ""}
            </span>{" "}
            <button type="button" onClick={() => removeAlert(a.id)}>
              Remove
            </button>{" "}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="nt-wrap">
      {" "}
      <SectionTabs id={id} section="notify" />{" "}
      <PositionHeader id={id} />{" "}
      {!owner && (
        <div className="nt-connect">
          {" "}
          <span className="nt-bell" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          </span>{" "}
          <p>Connect your wallet to see and set alerts for this position.</p>{" "}
          <button
            type="button"
            className="btn"
            onClick={() => window.dispatchEvent(new Event("seidar:open-wallets"))}
          >
            Connect wallet
          </button>{" "}
        </div>
      )}{" "}
      <h2 className="nt-h">Available alerts</h2>{" "}
      <div className="nt-grid">
        {" "}
        <div className="nt-list" role="tablist" aria-label="Alert types">
          {" "}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ratio"}
            className={`nt-item${tab === "ratio" ? " active" : ""}`}
            onClick={() => setTab("ratio")}
          >
            {" "}
            <span className="nt-ico" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </span>{" "}
            Ratio alert{" "}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>{" "}
          </button>{" "}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "supply-cap"}
            className={`nt-item${tab === "supply-cap" ? " active" : ""}`}
            onClick={() => setTab("supply-cap")}
          >
            {" "}
            <span className="nt-ico" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </span>{" "}
            Supply cap increase{" "}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>{" "}
          </button>{" "}
        </div>{" "}
        <div className="nt-main">
          {" "}
          {tab === "ratio" ? (
            <>
              {" "}
              <h3>Add new ratio monitor</h3>{" "}
              <p>
                Receive notification when your position&apos;s ratio rises
                above or falls below a certain threshold.
              </p>{" "}
              <div className="nt-line">
                {" "}
                <span>Current safety ratio</span>{" "}
                <b>{safety != null ? `${Math.round(safety)}%` : "—"}</b>{" "}
              </div>{" "}
              <div className="nt-line">
                {" "}
                <span>Alert once ratio is:</span>{" "}
                <span className="nt-seg" role="group" aria-label="Direction">
                  {" "}
                  {(["above", "below"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={direction === d}
                      className={direction === d ? "active" : ""}
                      onClick={() => setDirection(d)}
                    >
                      {d === "above" ? "Above" : "Below"}
                    </button>
                  ))}{" "}
                </span>{" "}
              </div>{" "}
              <span className="nt-threshold-wrap">
                <input
                  className="nt-threshold"
                  value={threshold}
                  onChange={(e) =>
                    setThreshold(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  inputMode="decimal"
                  aria-label="Threshold percent"
                />{" "}
                <span className="nt-pct" aria-hidden="true">
                  %
                </span>
              </span>{" "}
              <button
                type="button"
                className="btn primary nt-go"
                disabled={busy}
                onClick={addAlert}
              >
                {busy ? "Working…" : "Add alert"}
              </button>{" "}
              {msg && <p className="mv-note">{msg}</p>}{" "}
              {mineList("ratio")}{" "}
            </>
          ) : (
            <>
              {" "}
              <h3>Supply cap increase</h3>{" "}
              <p>
                Receive notification when the supply cap for an asset is
                updated.
              </p>{" "}
              <CapAssetSelect
                value={capAsset}
                onChange={(v) => {
                  setCapAsset(v);
                  setCapMsg(null);
                }}
                options={poolCodes}
                caps={poolCaps}
                disabled={poolCodes.length === 0}
              />{" "}
              <div className="nt-add">
                {" "}
                <button
                  type="button"
                  className="btn primary nt-go"
                  disabled={capBusy}
                  onClick={addCapAlert}
                >
                  {capBusy ? "Working…" : "Add alert"}
                </button>{" "}
              </div>{" "}
              {capMsg && <p className="mv-note">{capMsg}</p>}{" "}
              {poolsNote && <p className="mv-note">{poolsNote}</p>}{" "}
              {mineList("supply-cap")}{" "}
            </>
          )}{" "}
        </div>{" "}
        <div className="nt-side">
          {" "}
          <span className="nt-bigbell" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          </span>{" "}
          <h3>
            Get timely alerts
            <br />
            and stay ahead
          </h3>{" "}
          <p>
            Seidar watches your position around the clock and notifies you
            the moment your ratio crosses the level you set.
          </p>{" "}
        </div>{" "}
      </div>{" "}
      <div className="nt-delivery-head">
        {" "}
        <h2 className="nt-h">Delivery Channels</h2>{" "}
        <p>Monitors will deliver a notification via all active channels.</p>{" "}
      </div>{" "}
      <div className="nt-channels">
        {" "}
        {channelsMeta.map((c) => {
          const st = channels[c.id] ?? { on: false, handle: "" };
          return (
            <div key={c.id} className="nt-channel">
              {" "}
              <h3>{c.name}</h3>{" "}
              <p>{c.desc}</p>{" "}
              {c.handleLabel && (
                <input
                  value={st.handle}
                  onChange={(e) => {
                    const next = {
                      ...channels,
                      [c.id]: { ...st, handle: e.target.value.slice(0, 120) },
                    };
                    saveChannels(next);
                  }}
                  placeholder={c.handleLabel}
                  aria-label={c.handleLabel}
                  disabled={!owner}
                />
              )}{" "}
              <button
                type="button"
                className={`btn${st.on ? " primary" : ""}`}
                disabled={!owner}
                onClick={() => {
                  const next = {
                    ...channels,
                    [c.id]: { ...st, on: !st.on },
                  };
                  saveChannels(next);
                }}
              >
                {st.on ? "Active" : c.cta}
              </button>{" "}
              {c.id !== "blockscan" && (
                <small className="nt-soon">External delivery landing soon — in-app alerts work now.</small>
              )}{" "}
            </div>
          );
        })}{" "}
      </div>{" "}
    </div>
  );
}

function ProtocolsView({
  active,
  section = "manage",
}: {
  active: AppView;
  section?: ProtocolSection;
}) {
  const selected =
    active === "blend" || active === "xoxno"
      ? active
      : null;
  return (
    <div className="protocols-page">
      {" "}
      <div className="protocols-body">
        {" "}
        {selected == null ? (
          <div
            className="pf-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {" "}
            {Object.values(PROTOCOL_META).map((p) => (
              <div className="pf-card" key={p.name}>
                {" "}
                <div className="pf-head">
                  {" "}
                  <span className="pf-title">{p.name}</span>{" "}
                </div>{" "}
                <p
                  style={{
                    color: "#8a8a91",
                    fontSize: 12.5,
                    marginTop: 10,
                    lineHeight: 1.55,
                  }}
                >
                  {p.desc}
                </p>{" "}
                <p style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>
                  {p.ltv}
                </p>{" "}
                <div className="actions-row" style={{ marginTop: 12 }}>
                  {" "}
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => goto(p.view)}
                  >
                    {" "}
                    Open {p.name}{" "}
                  </button>{" "}
                </div>{" "}
              </div>
            ))}{" "}
          </div>
        ) : section === "lend" ? (
          <div className="at-wrap">
            <SectionTabs id={selected} section="lend" />
            <LendSection id={selected} />
          </div>
        ) : section === "manage" ? (
          <ProtocolBoard id={selected} section={section} />
        ) : section === "history" ? (
          <HistorySection id={selected} />
        ) : section === "automate" ? (
          <AutomateSection id={selected} />
        ) : section === "notify" ? (
          <NotifySection id={selected} />
        ) : section === "create" ? (
          <CreateSection id={selected} />
        ) : (
          <ProtocolBlank id={selected} section={section} />
        )}{" "}
      </div>{" "}
    </div>
  );
}
function ProtocolBoard({
  id,
  section = "manage",
}: {
  id: ProtocolId;
  section?: ProtocolSection;
}) {
  const router = useRouter();
  const meta = PROTOCOL_META[id];
  const spec = PROTOCOL_SPECS[id];
  const goSection = (s: ProtocolSection) => {
    if (s !== section) router.push(sectionHref(id, s, poolSel));
  };
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [feed, setFeed] = useState<"loading" | "live" | "error" | "pending">(
    "loading",
  );
  /* Market scope: the page is fixed to one pool group (?pool=, from the
     Lend & Borrow Manage button); every Manage calculation reads it. */
  const [poolSel, setPoolSel] = useState<string | null>(null);
  const [ratio, setRatio] = useState<"collateral" | "safety" | "health">(
    "safety",
  );
  const [detailTab, setDetailTab] = useState<
    "details" | "automations" | "rewards"
  >(
    section === "automate" || section === "history" ? "automations" : "details",
  );
  const [actionTab, setActionTab] = useState<"leverage" | "supply" | "move">(
    // Add / Remove first: the everyday action (Leverage is one tab away).
    "supply",
  );
  const [side, setSide] = useState<"boost" | "repay">("boost");
  const [amount, setAmount] = useState("");
  const [collAsset, setCollAsset] = useState("XLM");
  const [debtAsset, setDebtAsset] = useState("USDC");
  /* Add/Remove tab runs its own asset pair so the two tabs never steer
     each other; previews below follow the active tab via effColl/effDebt. */
  const [subColl, setSubColl] = useState("XLM");
  const [subDebt, setSubDebt] = useState("USDC");
  const [assetFilter, setAssetFilter] = useState<"all" | "used" | "owned">(
    "all",
  );
  const [quote, setQuote] = useState<null | {
    kind: "boost" | "repay";
    flash: number;
    fee: number;
    feeBps: number;
    steps: number;
    healthBps: number | null;
    /** Live swap-leg data (Soroswap quote, fail-soft). */
    swapImpact: string | null;
    swapRoute: string | null;
    swapOutTok: number | null;
    swapOutCode: string | null;
    intent: {
      user: string;
      actions: { kind: string; asset: string; amount: number }[];
    };
    warnings: string[];
  }>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteSub, setQuoteSub] = useState<typeof quote>(null);
  const [quoteSubError, setQuoteSubError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  /* Board refresh mirrors the home refresh exactly: same icon-button,
     same 600ms minimum spin, same refresh event for all live loaders. */
  const [boardSpinning, setBoardSpinning] = useState(false);
  const [combine, setCombine] = useState<
    null | "supply" | "payback" | "withdraw" | "borrow"
  >(null);
  const [combineAmount, setCombineAmount] = useState("");
  const [subSide, setSubSide] = useState<
    "supply" | "withdraw" | "borrow" | "payback"
  >("supply");
  const [subAmount, setSubAmount] = useState("");
  const [subCombine, setSubCombine] = useState(false);
  const [subCombineAmount, setSubCombineAmount] = useState("");
  /* Move tab (position switcher): kind, USD amount, target asset/protocol. */
  const [moveKind, setMoveKind] = useState<
    "collateral" | "debt" | "flip" | "shifter"
  >("collateral");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveTo, setMoveTo] = useState("USDC");
  const [moveQuote, setMoveQuote] = useState<null | {
    steps: string[];
    warnings: string[];
    route: RouteChoice;
    slippageBps: number;
    intent: unknown;
  }>(null);
  /* Quote confirmation modal (replaces the inline quote blocks). */
  const [confirmKind, setConfirmKind] = useState<null | "main" | "sub">(
    null,
  );
  const [moveError, setMoveError] = useState<string | null>(null);
  /* Switcher modals: which dialog, from-asset, route choice, slippage. */
  const [moveModal, setMoveModal] = useState<
    null | "collateral" | "debt" | "flip"
  >(null);
  const [flipDebt, setFlipDebt] = useState("");
  const [swFrom, setSwFrom] = useState(collAsset);
  const [swRoute, setSwRoute] = useState<RouteChoice>([]);
  const [swSlip, setSwSlip] = useState<"0.05" | "0.2" | "0.5" | "custom">(
    "0.2",
  );
  const [swCustom, setSwCustom] = useState("");
  /* Move quotes confirm inside their own switcher dialog (mv-result),
     so the shared modal only takes main + sub quotes. */
  useEffect(() => {
    if (quote) setConfirmKind("main");
    else if (quoteSub) setConfirmKind("sub");
  }, [quote, quoteSub]);
  /* Swap-token registry for live swap-leg quotes (price impact + route). */
  const [swapTokens, setSwapTokens] = useState<SwapToken[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.tokens))
          setSwapTokens(d.tokens as SwapToken[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  /* Live Soroswap quote for a board swap leg (fail-soft: the intent stands
     without impact/route when routing is unreachable). */
  async function attachSwapImpact(
    inCode: string,
    outCode: string,
    tokens: number,
    intent: unknown,
  ) {
    try {
      const tIn = swapTokens.find(
        (t) => t.code.toUpperCase() === inCode.toUpperCase(),
      );
      const tOut = swapTokens.find(
        (t) => t.code.toUpperCase() === outCode.toUpperCase(),
      );
      if (!tIn || !tOut || !(tokens > 0)) return;
      const base = toBaseUnits(String(tokens), tIn.decimals);
      if (base == null || BigInt(base) <= BigInt(0)) return;
      const r = await apiFetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIn: tIn.contract,
          assetOut: tOut.contract,
          amount: base,
          tradeType: "EXACT_IN",
          slippageBps: "50",
        }),
      });
      const d = await r.json().catch(() => null);
      const q = d?.ok ? (d.quote as Quote | null) : null;
      if (!q) return;
      const impact =
        q.priceImpactPct != null ? String(q.priceImpactPct) : null;
      const routes = quoteRoutes(q);
      const outBase = quoteOut(q);
      const outTok =
        outBase != null ? outBase / 10 ** tOut.decimals : null;
      setQuote((prev) =>
        prev && prev.intent === intent
          ? {
              ...prev,
              swapImpact: impact,
              swapRoute: routes.length > 0 ? routes.join(" · ") : null,
              swapOutTok: outTok,
              swapOutCode: outCode,
            }
          : prev,
      );
    } catch {
      /* impact stays unavailable */
    }
  }
  useEffect(() => {
    if (!moveModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoveModal(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [moveModal]);
  const [sendCombine, setSendCombine] = useState(false);
  const [sendAddress, setSendAddress] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  /* Market Info hover popup: open asset code + icon rect for placement. */
  const [miOpen, setMiOpen] = useState<string | null>(null);
  const [miRect, setMiRect] = useState<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null>(null);
  const miCloseTimer = useRef<number | null>(null);
  function miShow(code: string, el: HTMLElement) {
    if (miCloseTimer.current) {
      window.clearTimeout(miCloseTimer.current);
      miCloseTimer.current = null;
    }
    const r = el.getBoundingClientRect();
    setMiRect({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    setMiOpen(code);
  }
  function miKeep() {
    if (miCloseTimer.current) {
      window.clearTimeout(miCloseTimer.current);
      miCloseTimer.current = null;
    }
  }
  function miHideSoon() {
    if (miCloseTimer.current) window.clearTimeout(miCloseTimer.current);
    miCloseTimer.current = window.setTimeout(() => {
      setMiOpen(null);
      miCloseTimer.current = null;
    }, 140);
  }
  useEffect(() => {
    if (!miOpen) return;
    const close = () => setMiOpen(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMiOpen(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [miOpen]);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/pools")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && Array.isArray(d.rows)) {
          setMarkets((d.rows as MarketRow[]).filter((m) => m.protocol === id));
          setFeed("live");
        } else {
          setFeed("error");
        }
      })
      .catch(() => {
        if (!cancelled) setFeed("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);
  /* Pool scope resets when navigating protocols; ?pool=<name> (the
     Lend & Borrow "Manage" buttons) picks it. */
  useEffect(() => {
    let fromUrl: string | null = null;
    try {
      fromUrl = new URLSearchParams(window.location.search).get("pool");
    } catch {
      /* SSR */
    }
    setPoolSel(fromUrl);
  }, [id]);
  /* Keep ?pool= in step with the picked pool so the view is shareable. */
  useEffect(() => {
    if (!poolSel) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("pool") === poolSel) return;
      url.searchParams.set("pool", poolSel);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
  }, [poolSel]);
  /* Pool groups of this protocol (same-name pools merge, TVL deduped by
     address — same merge as the Create browser). */
  const poolGroups = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string;
        label: string;
        addrs: string[];
        tvl: number | null;
        status: number | null;
      }
    >();
    for (const m of markets) {
      const key = m.poolName || m.pool;
      let g = byKey.get(key);
      if (!g) {
        g = { key, label: key, addrs: [], tvl: null, status: null };
        byKey.set(key, g);
      }
      if (!g.addrs.includes(m.pool)) {
        g.addrs.push(m.pool);
        if (m.poolSupplied != null) g.tvl = (g.tvl ?? 0) + m.poolSupplied;
      }
      if (g.status == null && m.poolStatus != null) g.status = m.poolStatus;
    }
    return [...byKey.values()].sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));
  }, [markets]);
  const selAddrs = poolSel
    ? (poolGroups.find((g) => g.key === poolSel)?.addrs ?? null)
    : null;
  /* A pool is mandatory: default to Fixed v2.1 (then New Fixed, then
     top TVL) on load, and re-pin if the feed changes under us. */
  useEffect(() => {
    if (poolGroups.length === 0) return;
    if (!poolSel || !poolGroups.some((g) => g.key === poolSel))
      setPoolSel(
        poolGroups.find((g) => g.key === "Fixed v2.1")?.key ??
          poolGroups.find((g) => g.key === "New Fixed")?.key ??
          poolGroups[0].key,
      );
  }, [poolSel, poolGroups]);
  /* Pool-scoped market rows: every calculation below reads marketsF. */
  const marketsF = useMemo(
    () =>
      selAddrs ? markets.filter((m) => selAddrs.includes(m.pool)) : markets,
    [markets, selAddrs],
  );
  /* Pool-scoped effective collateral (Blend): supplied legs × pool LTV. */
  const poolEffColl = (legs: WalletLeg[]) =>
    legs.reduce((a, l) => {
      if (l.suppliedUsd <= 0) return a;
      const row = marketsF.find((m) => m.collateral === l.code);
      const cf = row?.ltv ?? spec.ltvBps / 10000;
      return a + l.suppliedUsd * cf;
    }, 0);
  const owner = useWalletAddress();
  /* Active transaction account: main wallet by default, smart account once
     picked in the header dropdown (shell broadcasts seidar:active-account).
     Positions, quotes and intents all follow the pick. */
  const activeAcct = useTxActive(owner);
  const { smarts: acctSmarts, loaded: smartsLoaded } = useShellSmarts(owner);
  /* Smart-gate UI state: hovering a gated quote button previews the way
     forward (Switch/Create morph), clicking it opens the chooser modal. */
  const [gateOpen, setGateOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  /* Market prefill from the Create browser: event for live boards plus
     a storage mirror for fresh mounts after navigation (consumed once). */
  useEffect(() => {
    function applyPrefill(detail: unknown) {
      const p = detail as { collateral?: unknown; debt?: unknown };
      if (typeof p?.collateral === "string" && p.collateral) {
        setCollAsset(p.collateral);
        setSubColl(p.collateral);
      }
      if (typeof p?.debt === "string" && p.debt) {
        setDebtAsset(p.debt);
        setSubDebt(p.debt);
      }
    }
    function onPrefill(e: Event) {
      applyPrefill((e as CustomEvent).detail);
    }
    window.addEventListener("seidar:prefill-market", onPrefill);
    try {
      const raw = window.localStorage.getItem("seidar.prefillMarket");
      if (raw) {
        applyPrefill(JSON.parse(raw));
        window.localStorage.removeItem("seidar.prefillMarket");
      }
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("seidar:prefill-market", onPrefill);
  }, []);
  const {
    address,
    data: walletData,
    loading: walletLoading,
  } = useWalletPositions(owner ? activeAcct : null);
  // Smart accounts are contract (C...) addresses; the wallet itself is G.
  const isSmartActive = !!address && /^C[A-Z2-7]{55}$/.test(address);
  /* Every action runs from a smart account (the wallet only creates and
     funds one). With the main wallet active, each action button morphs to
     Switch (smarts on file) / Create and opens the chooser instead. */
  void smartsLoaded;
  const needsSmart = !!owner && !isSmartActive;
  const hasSmarts = acctSmarts.length > 0;
  const gateWord = hasSmarts ? "Switch" : "Create";
  function gated(key: string, fn: () => void) {
    return () => {
      if (poolBlock) return;
      if (!needsSmart) {
        fn();
        return;
      }
      setHoverKey(null);
      setGateOpen(true);
    };
  }
  function hoverProps(key: string) {
    return {
      onMouseEnter: () => {
        if (needsSmart) setHoverKey(key);
      },
      onMouseLeave: () => setHoverKey(null),
    };
  }
  /* Selected-pool gate: on-ice/frozen pools refuse new borrows, frozen
     pools refuse new supplies. Withdraw/payback/move always pass. */
  const selPoolStatus: number | null =
    poolSel != null
      ? (poolGroups.find((g) => g.key === poolSel)?.status ?? null)
      : null;
  const poolBlock: string | null = (() => {
    if (selPoolStatus == null || selPoolStatus < 2 || !poolSel) return null;
    const word =
      selPoolStatus >= 6
        ? "in setup"
        : selPoolStatus >= 4
          ? "frozen"
          : "on ice";
    const wantsBorrow =
      (actionTab === "supply" &&
        (subSide === "borrow" || combine === "borrow")) ||
      (actionTab === "leverage" &&
        (side === "boost" || combine === "borrow"));
    const wantsSupply =
      (actionTab === "supply" &&
        (subSide === "supply" || combine === "supply")) ||
      (actionTab === "leverage" &&
        (side === "boost" || combine === "supply"));
    if (wantsBorrow)
      return `${poolSel} is ${word} — borrowing is suspended. Withdraw or repay instead.`;
    if (wantsSupply && selPoolStatus >= 4)
      return `${poolSel} is ${word} — supplying is suspended. Withdraw or repay instead.`;
    return null;
  })();
  const live = walletData?.perProtocol[id];
  const liveHealth = (live?.healthFactor ?? null) as number | null;
  const liveDrop = (live?.dropToLiquidationPct ?? null) as number | null;
  const liveLegs = useMemo(() => {
    const legs = (walletData?.legs ?? []).filter((l) => l.protocol === id);
    if (!poolSel || !selAddrs) return legs;
    // Legs without pool attribution stay only when the pool is unambiguous.
    const sole = poolGroups.length <= 1;
    return legs.filter((l) => (l.pool ? selAddrs.includes(l.pool) : sole));
  }, [walletData, id, poolSel, selAddrs, poolGroups.length]);
  /* Live prices: inputs are token amounts, projections need real USD.
     Polled every 45s + on board refresh; unknown codes fall back to 1.0. */
  const priceCodes = useMemo(
    () =>
      Array.from(
        new Set([
          ...marketsF.map((m) => m.collateral),
          ...marketsF.flatMap((m) => (m.debt ? [m.debt] : [])),
          collAsset,
          debtAsset,
          subColl,
          subDebt,
        ]),
      ),
    [marketsF, collAsset, debtAsset],
  );
  const { prices: tokenPrices } = useTokenPrices(priceCodes);
  const px = (code: string): number => {
    const p = tokenPrices[code.toUpperCase()];
    if (typeof p === "number" && p > 0) return p;
    if (code.toUpperCase() === "EURC") return 1.08;
    if (STABLES.has(code.toUpperCase())) return 1;
    return 1;
  };
  const pxLive = (code: string): boolean => {
    const p = tokenPrices[code.toUpperCase()];
    return typeof p === "number" && (p as number) > 0;
  };
  /* True when an involved, non-stable asset has no live price (1.0 used). */
  const pxEstimated =
    (!STABLES.has(collAsset.toUpperCase()) && !pxLive(collAsset)) ||
    (!STABLES.has(debtAsset.toUpperCase()) && !pxLive(debtAsset)) ||
    (!STABLES.has(subColl.toUpperCase()) && !pxLive(subColl)) ||
    (!STABLES.has(subDebt.toUpperCase()) && !pxLive(subDebt));
  /* Pool-scoped totals come straight from the filtered legs; the
     aggregate stands while all pools are in scope. */
  const supplying = poolSel
    ? liveLegs.reduce((a, l) => a + l.suppliedUsd, 0)
    : (live?.supplied ?? 0);
  const borrowing = poolSel
    ? liveLegs.reduce((a, l) => a + l.borrowedUsd, 0)
    : (live?.borrowed ?? 0);
  const hasWallet = address != null;
  const balance = supplying - borrowing;
  /* White marker = borrow limit. Blend docs define it as Σ(CF×CV) and
     exceeding it is exactly what makes an account delinquent, so live
     effective collateral doubles as the limit when a position exists.
     XOXNO uses its live collateral factors per code for the same reason. */
  const liveCf = live?.collateralFactorsBps ?? {};
  const borrowLimit =
    id === "xoxno" &&
          liveLegs.length > 0 &&
          Object.keys(liveCf).length > 0
        ? Math.floor(
            liveLegs.reduce(
              (a, l) =>
                a + (l.suppliedUsd * (liveCf[l.code] ?? spec.ltvBps)) / 10000,
              0,
            ),
          )
        : id === "blend" &&
            supplying > 0 &&
            (poolSel != null || live?.effectiveCollateral != null)
          ? Math.floor(
              poolSel
                ? poolEffColl(liveLegs)
                : (live?.effectiveCollateral as number),
            )
          : Math.floor((supplying * spec.ltvBps) / 10000);
  const health = healthBps(supplying, borrowing);
  const powerUsed =
    borrowLimit > 0 ? Math.min(100, (borrowing / borrowLimit) * 100) : 0;
  const leftToBorrow = Math.max(0, borrowLimit - borrowing);
  /* Red marker = liquidation limit. XOXNO publishes live liquidation
     thresholds just above its collateral factors (e.g. 7500 -> 7800), so
     the white->red buffer is real there. Blend liquidates the moment the
     borrow limit is exceeded, so red coincides
     with white there (never inverted by construction). */
  const liveThr = live?.liquidationThresholdsBps ?? {};
  const liqLimit =
    id === "xoxno" &&
    supplying > 0 &&
    Object.keys(liveThr).length > 0 &&
    (live?.effectiveCollateral ?? 0) > 0
      ? Math.max(
          Math.floor(live?.effectiveCollateral as number),
          borrowLimit,
        )
      : borrowLimit;
  const fmtUsd = (v: number) => Math.round(v).toLocaleString();
  /* Token-qty line with live-price guard: without a live price the qty would
     just echo the USD value, so show USD + a price note instead. */
  const qtyLine = (usdV: number, code: string): { big: string; small: string } => {
    if (pxLive(code)) {
      const qty = fmtNum(usdV / px(code));
      return { big: `${qty} ${code}`, small: `($${fmtNum(usdV)} USD)` };
    }
    return { big: `$${fmtNum(usdV)} ${code}`, small: "(price unavailable)" };
  };
  /* Per-asset slices for the stacked base bars (live legs only). Legs arrive
     per-pool (same code in many pools), so aggregate by code — one segment
     per asset keeps React keys unique and the bar readable. */
  const sumSlices = (legs: { code: string; usd: number }[]) => {
    const m = new Map<string, number>();
    for (const l of legs) m.set(l.code, (m.get(l.code) ?? 0) + l.usd);
    return [...m].map(([code, usd]) => ({ code, usd }));
  };
  const supplySlices = sumSlices(
    liveLegs
      .filter((l) => l.suppliedUsd > 0.01)
      .map((l) => ({ code: l.code, usd: l.suppliedUsd })),
  );
  const borrowSlices = sumSlices(
    liveLegs
      .filter((l) => l.borrowedUsd > 0.01)
      .map((l) => ({ code: l.code, usd: l.borrowedUsd })),
  );
  /* Pool-scoped health/drop recompute from pool numbers; the live
     aggregate stands while all pools are in scope. */
  const dispHealth =
    poolSel || liveHealth == null
      ? health != null
        ? health / 10000
        : null
      : liveHealth;
  const dispDrop =
    poolSel || liveDrop == null
      ? borrowLimit > 0 && borrowing > 0
        ? Math.max(0, (1 - borrowing / borrowLimit) * 100)
        : null
      : liveDrop;
  const ratioPct =
    ratio === "health"
      ? health == null
        ? 0
        : Math.min(100, (health / 30000) * 100)
      : ratio === "collateral"
        ? borrowLimit > 0
          ? Math.min(100, (supplying / (borrowLimit || 1)) * 100)
          : 0
        : powerUsed;
  const avgSupply = marketsF.length
    ? marketsF.reduce((a, m) => a + m.supplyApy, 0) / marketsF.length
    : 0;
  const borrowRows = marketsF.filter((m) => m.borrowApy != null);
  const avgBorrow = borrowRows.length
    ? borrowRows.reduce((a, m) => a + (m.borrowApy ?? 0), 0) / borrowRows.length
    : 0;
  const net =
    supplying + borrowing > 0
      ? netApy(supplying, avgSupply * 100, borrowing, avgBorrow * 100) / 100
      : 0;
  const amtNum = Number(String(amount).replace(/[^0-9.]/g, "")) || 0;
  const combNum = Number(String(combineAmount).replace(/[^0-9.]/g, "")) || 0;
  const subNum = Number(String(subAmount).replace(/[^0-9.]/g, "")) || 0;
  const subCombNum =
    Number(String(subCombineAmount).replace(/[^0-9.]/g, "")) || 0;
  /* Inputs are token amounts — convert to USD through live prices. Primary
     leg first (borrow-then-supply for boost, withdraw-then-repay for repay);
     swap legs preserve USD 1:1. Chain intents keep raw token stroops. */
  const effColl = actionTab === "supply" ? subColl : collAsset;
  const effDebt = actionTab === "supply" ? subDebt : debtAsset;
  const usdAmt = amtNum * px(side === "boost" ? debtAsset : collAsset);
  const usdComb =
    combNum *
    px(combine === "supply" || combine === "withdraw" ? collAsset : debtAsset);
  const usdSub =
    subNum *
    px(subSide === "supply" || subSide === "withdraw" ? subColl : subDebt);
  const usdSubComb =
    subCombNum *
    px(subSide === "supply" || subSide === "withdraw" ? subDebt : subColl);
  const estHealth = healthBps(
    supplying + (side === "boost" ? usdAmt : 0),
    borrowing + (side === "boost" ? usdAmt : Math.max(0, borrowing - usdAmt)),
  );
  /* Live simulation preview (DeFiSaver-style): typing an amount lights up   * Overview + Assets with purple after-values. USD 1:1 swap assumption. */ const hasPreview =
    actionTab === "supply"
      ? subNum > 0 || (subCombine && subCombNum > 0)
      : amtNum > 0 || (combine != null && combNum > 0);
  const prevDelta = (() => {
    let dS = 0;
    let dD = 0;
    if (actionTab === "supply") {
      if (subSide === "supply") {
        dS += usdSub;
        if (subCombine) dD += usdSubComb;
      } else if (subSide === "withdraw") {
        dS -= usdSub;
        if (subCombine) dD -= usdSubComb;
      } else if (subSide === "borrow") {
        dD += usdSub;
        if (subCombine) dS += usdSubComb;
      } else {
        dD -= usdSub;
        if (subCombine) dS -= usdSubComb;
      }
      return { dS, dD };
    }
    if (side === "boost") {
      dS += usdAmt;
      dD += usdAmt;
      if (combine === "supply") dS += usdComb;
      if (combine === "payback") dD -= usdComb;
    } else {
      dS -= usdAmt;
      dD -= usdAmt;
      if (combine === "withdraw") dS -= usdComb;
      if (combine === "borrow") dD += usdComb;
    }
    return { dS, dD };
  })();
  const prevS = Math.max(0, supplying + prevDelta.dS);
  const prevD = Math.max(0, borrowing + prevDelta.dD);
  /* Preview rates: scale the live limit/threshold forward with the supply
     delta (identical to prevS×LTV when no live data exists). XOXNO prices
     the new leg at its own live CF/threshold, so its red marker renders
     even before a position exists. */
  const wRate =
    supplying > 0 && borrowLimit > 0
      ? borrowLimit / supplying
      : spec.ltvBps / 10000;
  const xCfRate =
    id === "xoxno" ? (liveCf[effColl] ?? spec.ltvBps) / 10000 : wRate;
  const xThrRate =
    id === "xoxno"
      ? (liveThr[effColl] ?? liveCf[effColl] ?? spec.ltvBps) / 10000
      : wRate;
  const prevLimit =
    id === "xoxno"
      ? Math.max(0, Math.floor(borrowLimit + prevDelta.dS * xCfRate))
      : Math.max(0, Math.floor(borrowLimit + prevDelta.dS * wRate));
  const prevHealth = healthBps(prevS, prevD);
  const prevPower =
    prevLimit > 0 ? Math.min(100, (prevD / prevLimit) * 100) : 0;
  const prevLeft = Math.max(0, prevLimit - prevD);
  const prevLiqLimit =
    id === "xoxno"
      ? Math.max(
          prevLimit,
          Math.max(0, Math.floor(liqLimit + prevDelta.dS * xThrRate)),
        )
      : prevLimit;
  const prevBalance = prevS - prevD;
  /* Max boost borrow: limit from supplied (+ combine supply leg, which runs
     first) minus debt (net of combine payback leg, also first). Same-tx
     legs already reflected, so the ceiling matches what the quote allows. */
  const boostMax = (() => {
    const addSupply = combine === "supply" ? usdComb : 0;
    const payDown =
      combine === "payback" ? Math.min(usdComb, borrowing) : 0;
    return Math.max(
      0,
      Math.floor(((supplying + addSupply) * spec.ltvBps) / 10000) -
        Math.max(0, borrowing - payDown),
    );
  })();
  /* Wallet balances for the active account: supply ceilings read from
     here (borrow ceilings come from the position instead). */
  const bals = useTokenBalances(address);
  const balOf = (code: string) => bals[code.toUpperCase()] ?? 0;
  const fmtBal = (v: number) =>
    v >= 100
      ? Math.round(v).toLocaleString()
      : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const prevNet =
    prevS + prevD > 0
      ? netApy(prevS, avgSupply * 100, prevD, avgBorrow * 100) / 100
      : 0;
  const prevRatio =
    ratio === "health"
      ? prevHealth == null
        ? 0
        : Math.min(100, (prevHealth / 30000) * 100)
      : ratio === "collateral"
        ? prevLimit > 0
          ? Math.min(100, (prevS / (prevLimit || 1)) * 100)
          : 0
        : prevPower;
  /* Per-asset after-values for the involved legs. */ const prevAsset = (
    code: string,
  ) => {
    const mine = liveLegs.find((l) => l.code === code);
    let s = mine?.suppliedUsd ?? 0;
    let d = mine?.borrowedUsd ?? 0;
    if (actionTab === "supply") {
      if (code === subColl) {
        if (subSide === "supply") s += usdSub;
        if (subSide === "withdraw") s -= usdSub;
        if (subCombine && subSide === "borrow") s += usdSubComb;
        if (subCombine && subSide === "payback") s -= usdSubComb;
      }
      if (code === subDebt) {
        if (subSide === "borrow") d += usdSub;
        if (subSide === "payback") d -= usdSub;
        if (subCombine && subSide === "supply") d += usdSubComb;
        if (subCombine && subSide === "withdraw") d -= usdSubComb;
      }
      return { s: Math.max(0, s), d: Math.max(0, d) };
    }
    if (code === collAsset) {
      s += side === "boost" ? usdAmt : -usdAmt;
      if (combine === "supply") s += usdComb;
      if (combine === "withdraw") s -= usdComb;
    }
    if (code === debtAsset) {
      d += side === "boost" ? usdAmt : -usdAmt;
      if (combine === "payback") d -= usdComb;
      if (combine === "borrow") d += usdComb;
    }
    return { s: Math.max(0, s), d: Math.max(0, d) };
  };
  const assets = useMemo(() => {
    const map = new Map<
      string,
      {
        code: string;
        supplyApy: number;
        borrowApy: number | null;
        ltv: number | null;
        size: number | null;
        liq: number | null;
        apyUnknown: boolean;
      }
    >();
    for (const m of marketsF) {
      const cur = map.get(m.collateral) ?? {
        code: m.collateral,
        supplyApy: 0,
        borrowApy: null,
        ltv: null,
        size: null,
        liq: null,
        apyUnknown: false,
      };
      cur.supplyApy = Math.max(cur.supplyApy, m.supplyApy);
      cur.apyUnknown = cur.apyUnknown || m.apyUnknown === true;
      if (m.ltv != null) cur.ltv = Math.max(cur.ltv ?? 0, m.ltv);
      if (m.marketSizeUsd != null)
        cur.size = Math.max(cur.size ?? 0, m.marketSizeUsd);
      if (m.withdrawableUsd != null)
        cur.liq = Math.max(cur.liq ?? 0, m.withdrawableUsd);
      map.set(m.collateral, cur);
      if (m.debt) {
        const d = map.get(m.debt) ?? {
          code: m.debt,
          supplyApy: 0,
          borrowApy: null,
          ltv: null,
          size: null,
          liq: null,
          apyUnknown: false,
        };
        if (m.borrowApy != null)
          d.borrowApy =
            d.borrowApy == null
              ? m.borrowApy
              : Math.min(d.borrowApy, m.borrowApy);
        if (m.apyUnknown) d.apyUnknown = true;
        map.set(m.debt, d);
      }
    }
    return [...map.values()].sort((a, b) => b.supplyApy - a.supplyApy);
  }, [marketsF]);
  const ownedSet = useMemo(
    () => new Set(liveLegs.map((l) => l.code)),
    [liveLegs],
  );
  const positionCount = liveLegs.length;
  /* Dropdown options come from this protocol's live markets, never a stale list.
     Assets arrive per-pool (same code in many pools), so dedupe to keep
     React keys unique. */ const assetCodes =
    useMemo(
      () =>
        assets.length > 0
          ? [...new Set(assets.map((a) => a.code))]
          : ["XLM", "USDC", "EURC", "AQUA"],
      [assets],
    );
  /* Borrowed assets actually held as debt — drives the payback dropdown. */ const borrowedCodes =
    useMemo(
      () => [
        ...new Set(
          liveLegs
            .filter((l) => l.borrowedUsd > 0.01)
            .map((l) => l.code),
        ),
      ],
      [liveLegs],
    );
  /* Supplied assets actually held as collateral — drives withdraw dropdowns. */ const suppliedCodes =
    useMemo(
      () => [
        ...new Set(
          liveLegs
            .filter((l) => l.suppliedUsd > 0.01)
            .map((l) => l.code),
        ),
      ],
      [liveLegs],
    );
  /* Action availability per selected pool: unavailable actions blur with a
     brief reason on hover instead of failing at submit time. */
  const poolWord =
    selPoolStatus != null && selPoolStatus >= 2
      ? selPoolStatus >= 6
        ? "in setup"
        : selPoolStatus >= 4
          ? "frozen"
          : "on ice"
      : null;
  const poolLabel = poolSel ?? "This pool";
  const borrowableInPool = marketsF.some(
    (m) => m.debt != null && m.borrowApy != null,
  );
  function sideOff(
    kind: "supply" | "withdraw" | "borrow" | "payback" | "boost" | "repay",
  ): string | null {
    switch (kind) {
      case "supply":
        return selPoolStatus != null && selPoolStatus >= 4
          ? `Supplying is suspended — ${poolLabel} is ${poolWord}.`
          : null;
      case "withdraw":
        return suppliedCodes.length === 0
          ? "No supplied collateral — supply assets first."
          : null;
      case "borrow":
      case "boost":
        if (selPoolStatus != null && selPoolStatus >= 2)
          return `Borrowing is suspended — ${poolLabel} is ${poolWord}.`;
        if (!borrowableInPool) return `Nothing borrowable in ${poolLabel}.`;
        return null;
      case "payback":
        return borrowedCodes.length === 0
          ? "No debt — nothing to pay back."
          : null;
      case "repay":
        if (suppliedCodes.length === 0)
          return "No supplied collateral — supply assets first.";
        if (borrowedCodes.length === 0)
          return "No debt — nothing to pay back.";
        return null;
    }
  }
  /* Per-asset borrow/supply availability for dropdown options. */
  const borrowBlockedMap: Record<string, string> = {};
  const supplyBlockedMap: Record<string, string> = {};
  if (selPoolStatus != null && selPoolStatus >= 2) {
    for (const m of marketsF) {
      if (m.debt) {
        borrowBlockedMap[m.debt] =
          `Borrowing is suspended — ${poolLabel} is ${poolWord}.`;
      }
    }
  }
  if (selPoolStatus != null && selPoolStatus >= 4) {
    for (const m of marketsF) {
      supplyBlockedMap[m.collateral] =
        `Supplying is suspended — ${poolLabel} is ${poolWord}.`;
    }
  }
  for (const m of marketsF) {
    if (
      m.debt != null &&
      !(m.borrowApy != null) &&
      borrowBlockedMap[m.debt] == null
    ) {
      borrowBlockedMap[m.debt] = `Cannot borrow ${m.debt} in ${poolLabel}.`;
    }
  }
  /* Keep the payback selector pinned to an actual debt when debts load/change. */ useEffect(() => {
    if (
      (combine === "payback" || combine === "borrow") &&
      borrowedCodes.length > 0 &&
      !borrowedCodes.includes(debtAsset)
    ) {
      setDebtAsset(borrowedCodes[0]);
    }
  }, [combine, borrowedCodes, debtAsset]);
  /* Keep leverage repay legs pinned to real holdings. */ useEffect(() => {
    if (
      side === "repay" &&
      suppliedCodes.length > 0 &&
      !suppliedCodes.includes(collAsset)
    ) {
      setCollAsset(suppliedCodes[0]);
    }
  }, [side, suppliedCodes, collAsset]);
  useEffect(() => {
    if (
      side === "repay" &&
      borrowedCodes.length > 0 &&
      !borrowedCodes.includes(debtAsset)
    ) {
      setDebtAsset(borrowedCodes[0]);
    }
  }, [side, borrowedCodes, debtAsset]);
  /* Keep withdraw pinned to real collateral, payback pinned to real debt. */ useEffect(() => {
    if (
      subSide === "withdraw" &&
      suppliedCodes.length > 0 &&
      !suppliedCodes.includes(subColl)
    ) {
      setSubColl(suppliedCodes[0]);
    }
  }, [subSide, suppliedCodes, subColl]);
  useEffect(() => {
    if (
      subSide === "payback" &&
      borrowedCodes.length > 0 &&
      !borrowedCodes.includes(subDebt)
    ) {
      setSubDebt(borrowedCodes[0]);
    }
  }, [subSide, borrowedCodes, subDebt]);
  /* Keep the switcher From asset inside actual holdings. */
  useEffect(() => {
    if (moveModal === "collateral" && suppliedCodes.length > 0) {
      if (!suppliedCodes.includes(swFrom)) setSwFrom(suppliedCodes[0]);
    }
    if (moveModal === "debt" && borrowedCodes.length > 0) {
      if (!borrowedCodes.includes(swFrom)) setSwFrom(borrowedCodes[0]);
    }
  }, [moveModal, suppliedCodes, borrowedCodes, swFrom]);
  const shownAssets = assets.filter((a) => {
    if (assetFilter === "all") return true;
    if (assetFilter === "owned") return ownedSet.has(a.code);
    return ownedSet.has(a.code) || a.supplyApy > 0;
  });
  /* Projected After state: while an action input is non-zero, the involved
     collateral asset (first) + debt asset move to the top, each with an
     After row beneath showing projected values. Cleared input → original
     order, no leftovers (derived every render, nothing persisted). */
  const affectedCodes = hasPreview
    ? [effColl, effDebt].filter(
        (c, i, arr) =>
          arr.indexOf(c) === i && shownAssets.some((a) => a.code === c),
      )
    : [];
  const orderedAssets =
    affectedCodes.length > 0
      ? [
          ...affectedCodes.flatMap((c) =>
            shownAssets.filter((a) => a.code === c),
          ),
          ...shownAssets.filter((a) => !affectedCodes.includes(a.code)),
        ]
      : shownAssets;
  /* Market Info popup: full market row lookup + viewport-aware placement.
     Pool size/liquidity come from the supply single; borrow data comes from
     the borrow pairs (singles carry no borrow leg — hence the old dashes).
     Borrow APY follows the table convention: minimum across pairs. */
  const miRow = miOpen
    ? (marketsF.find((m) => m.collateral === miOpen && m.debt == null) ??
      marketsF.find((m) => m.collateral === miOpen) ??
      null)
    : null;
  const miPairRow = miOpen
    ? (marketsF.find((m) => m.collateral === miOpen && m.debt != null) ??
      null)
    : null;
  const miBorrowApy =
    miOpen && miRow && !miRow.apyUnknown
      ? (() => {
          const apys = marketsF
            .filter(
              (m) =>
                m.collateral === miOpen &&
                m.debt != null &&
                m.borrowApy != null,
            )
            .map((m) => m.borrowApy as number);
          return apys.length > 0 ? Math.min(...apys) : null;
        })()
      : null;
  const miStyle =
    miRect != null
      ? (() => {
          const w = 300;
          const estH = 380;
          const pad = 12;
          const left = Math.max(
            pad,
            Math.min(miRect.right - w, window.innerWidth - w - pad),
          );
          const below = miRect.bottom + 8;
          const top =
            below + estH > window.innerHeight - pad
              ? Math.max(pad, miRect.top - estH - 8)
              : below;
          return { top, left } as const;
        })()
      : undefined;
  async function buildQuote() {
    setQuoteError(null);
    setQuote(null);
    if (!hasWallet || !address) {
      setQuoteError(
        "Connect a wallet — quotes are built for your address as unsigned intents.",
      );
      return;
    }
    const usd = amtNum;
    if (side === "repay" && suppliedCodes.length === 0) {
      setQuoteError("No supplied collateral to withdraw.");
      return;
    }
    if (side === "repay" && borrowedCodes.length === 0) {
      setQuoteError("No borrowed assets to pay back — borrow first.");
      return;
    }
    if (!(usd > 0)) {
      setQuoteError("Enter an amount above 0 to quote.");
      return;
    }
    try {
      const stroops = Math.round(usd * 10_000_000);
      const isStable = STABLES.has(collAsset) && STABLES.has(debtAsset);
      const feeBps = feeTierBps({ stable: isStable });
      const minHealth = 13000;
      const combUsd =
        Number(String(combineAmount).replace(/[^0-9.]/g, "")) || 0;
      const combStroops = Math.round(combUsd * 10_000_000);
      // Token inputs -> USD for health/limit math (intents keep stroops).
      const usdV = usd * px(side === "boost" ? debtAsset : collAsset);
      const combUsdV =
        combUsd *
        px(
          combine === "supply" || combine === "withdraw"
            ? collAsset
            : debtAsset,
        );
      if (combine === "payback" && borrowedCodes.length === 0) {
        setQuoteError("No borrowed assets to pay back — borrow first.");
        return;
      }
      if (combine === "withdraw" && suppliedCodes.length === 0) {
        setQuoteError("No supplied collateral to withdraw.");
        return;
      }
      if (combine && !(combUsd > 0)) {
        const need =
          combine === "supply"
            ? "supply"
            : combine === "payback"
              ? "pay back"
              : combine === "withdraw"
                ? "withdraw"
                : "borrow";
        setQuoteError(
          `Enter a ${need} amount above 0, or remove the combined action.`,
        );
        return;
      }
      if (side === "boost") {
        const lev = supplying > 0 ? (supplying + usdV) / supplying : 2;
        if (lev > 3) {
          setQuoteError(
            `Leverage ${lev.toFixed(2)}x exceeds the 3x agent rail — lower the amount.`,
          );
          return;
        }
        const recipe =
          combine === "supply"
            ? new Recipe()
                .flashLoan(debtAsset, stroops)
                .supply(collAsset, combStroops)
                .swap(collAsset, stroops)
                .supply(collAsset, stroops)
                .borrow(debtAsset, stroops)
            : combine === "payback"
              ? new Recipe()
                  .flashLoan(debtAsset, stroops)
                  .repay(debtAsset, combStroops)
                  .swap(collAsset, stroops)
                  .supply(collAsset, stroops)
                  .borrow(debtAsset, stroops)
              : boostRecipe({
                  debtAsset,
                  collateralAsset: collAsset,
                  flashAmount: stroops,
                  supplyAmount: stroops,
                  borrowAmount: stroops,
                });
        const intent = recipe.buildIntent(address);
        const h = healthBps(
          supplying + usdV + (combine === "supply" ? combUsdV : 0),
          borrowing +
            usdV -
            (combine === "payback" ? Math.min(combUsdV, borrowing) : 0),
        );
        if (h != null && h < minHealth) {
          setQuoteError(
            `Resulting health ${(h / 10000).toFixed(2)} is below the ${(minHealth / 10000).toFixed(2)} minimum — lower the amount.`,
          );
          return;
        }
        setQuote({
          kind: "boost",
          flash: usd,
          fee: quoteFee(stroops, feeBps) / 10_000_000,
          feeBps,
          steps: intent.actions.length,
          healthBps: h,
          swapImpact: null,
          swapRoute: null,
          swapOutTok: null,
          swapOutCode: null,
          intent,
          warnings: [
            "You approve each step in your wallet.",
            "Swap routes across Soroswap, Aqua, Phoenix and SDEX.",
            "Mainnet liquidity may differ.",
          ],
        });
        void attachSwapImpact(debtAsset, collAsset, usd, intent);
      } else {
        const base = repayRecipe({
          collateralAsset: collAsset,
          debtAsset,
          withdrawAmount: stroops,
          repayAmount: stroops,
        });
        const recipe =
          combine === "withdraw"
            ? new Recipe()
                .withdraw(collAsset, combStroops)
                .withdraw(collAsset, stroops)
                .swap(debtAsset, stroops)
                .repay(debtAsset, stroops)
            : combine === "borrow"
              ? new Recipe()
                  .borrow(debtAsset, combStroops)
                  .withdraw(collAsset, stroops)
                  .swap(debtAsset, stroops)
                  .repay(debtAsset, stroops)
              : base;
        const intent = recipe.buildIntent(address);
        const extraOut = combine === "withdraw" ? combUsdV : 0;
        const extraDebt = combine === "borrow" ? combUsdV : 0;
        const h = healthBps(
          supplying - extraOut,
          Math.max(0, borrowing - usdV + extraDebt),
        );
        setQuote({
          kind: "repay",
          flash: usd,
          fee: quoteFee(stroops, feeBps) / 10_000_000,
          feeBps,
          steps: intent.actions.length,
          healthBps: h,
          swapImpact: null,
          swapRoute: null,
          swapOutTok: null,
          swapOutCode: null,
          intent,
          warnings: [
            "You approve each step in your wallet.",
            "Runs as three confirmed steps: withdraw, swap, repay.",
          ],
        });
        void attachSwapImpact(collAsset, debtAsset, usd, intent);
      }
    } catch (e) {
      setQuoteError(String(e).slice(0, 160));
    }
  }
  /** Add/Remove single-leg quotes (DeFiSaver-style): one action, optionally   * combined with its complement. Real SDK intents, same rails. */ function buildSubQuote(
    useCombine: boolean,
  ) {
    setQuoteSubError(null);
    setQuoteSub(null);
    if (!hasWallet || !address) {
      setQuoteSubError(
        "Connect a wallet — quotes are built for your address as unsigned intents.",
      );
      return;
    }
    if (
      subSide === "withdraw" &&
      suppliedCodes.length === 0
    ) {
      setQuoteSubError("No supplied collateral to withdraw.");
      return;
    }
    if (subSide === "payback" && borrowedCodes.length === 0) {
      setQuoteSubError("No borrowed assets to pay back — borrow first.");
      return;
    }
    if (
      subSide === "withdraw" &&
      subCombine &&
      useCombine &&
      borrowedCodes.length === 0
    ) {
      setQuoteSubError("No borrowed assets to pay back — remove it or borrow first.");
      return;
    }
    if (
      subSide === "payback" &&
      subCombine &&
      useCombine &&
      suppliedCodes.length === 0
    ) {
      setQuoteSubError("No supplied collateral to withdraw.");
      return;
    }
    if (!(subNum > 0)) {
      setQuoteSubError("Enter an amount above 0 to quote.");
      return;
    }
    if (subSide === "supply" && subNum - balOf(subColl) > 1e-9) {
      setQuoteSubError(
        `Exceeds wallet balance (${fmtBal(balOf(subColl))} ${subColl}) — lower the amount or fund the active account.`,
      );
      return;
    }
    if (
      subSide === "borrow" &&
      subCombine &&
      useCombine &&
      subCombNum - balOf(subColl) > 1e-9
    ) {
      setQuoteSubError(
        `Combined supply exceeds wallet balance (${fmtBal(balOf(subColl))} ${subColl}) — lower it or fund the active account.`,
      );
      return;
    }
    try {
      const stroops = Math.round(subNum * 10_000_000);
      const isStable = STABLES.has(subColl) && STABLES.has(subDebt);
      const feeBps = feeTierBps({ stable: isStable });
      const minHealth = 13000;
      const combStroops = Math.round(subCombNum * 10_000_000);
      const withComb = subCombine && useCombine;
      if (subCombine && useCombine && !(subCombNum > 0)) {
        setQuoteSubError("Enter a combined amount above 0, or remove it.");
        return;
      }
      const recipe = new Recipe();
      if (subSide === "supply") {
        recipe.supply(subColl, stroops);
        if (withComb) recipe.borrow(subDebt, combStroops);
      } else if (subSide === "withdraw") {
        recipe.withdraw(subColl, stroops);
        if (withComb) recipe.repay(subDebt, combStroops);
      } else if (subSide === "borrow") {
        recipe.borrow(subDebt, stroops);
        if (withComb) recipe.supply(subColl, combStroops);
      } else {
        recipe.repay(subDebt, stroops);
        if (withComb) recipe.withdraw(subColl, combStroops);
      }
      const intent = recipe.buildIntent(address);
      const h = healthBps(prevS, prevD);
      if (h != null && h < minHealth && (prevD > 0 || subSide === "borrow")) {
        setQuoteSubError(
          `Resulting health ${(h / 10000).toFixed(2)} is below the ${(minHealth / 10000).toFixed(2)} minimum — lower the amount.`,
        );
        return;
      }
      const label =
        subSide === "supply"
          ? withComb
            ? "Supply + Borrow"
            : "Supply"
          : subSide === "withdraw"
            ? withComb
              ? "Withdraw + Pay back"
              : "Withdraw"
            : subSide === "borrow"
              ? withComb
                ? "Borrow + Supply"
                : "Borrow"
              : withComb
                ? "Pay back + Withdraw"
                : "Pay back";
      setQuoteSub({
        kind: subSide === "borrow" || subSide === "supply" ? "boost" : "repay",
        flash: 0,
        fee: quoteFee(stroops, feeBps) / 10_000_000,
        feeBps,
        steps: intent.actions.length,
        healthBps: h,
        swapImpact: null,
        swapRoute: null,
        swapOutTok: null,
        swapOutCode: null,
        intent,
        warnings: [
          "You approve each step in your wallet.",
          id === "blend" ? `${label} settles in one transaction.` : `${label} runs as consecutive transactions.`,
        ],
      });
    } catch (e) {
      setQuoteSubError(String(e).slice(0, 160));
    }
  }
  /** Withdraw/Borrow + Send: amount comes from the paired main input. */ function buildSendQuote() {
    setSendError(null);
    setQuoteSubError(null);
    if (!hasWallet || !address) {
      setSendError("Connect a wallet — quotes are built for your address.");
      return;
    }
    if (subSide !== "withdraw" && subSide !== "borrow") {
      setSendError("Send pairs with Withdraw or Borrow.");
      return;
    }
    if (subSide === "withdraw" && suppliedCodes.length === 0) {
      setSendError("No supplied collateral to withdraw and send.");
      return;
    }
    const amt = subNum;
    if (!(amt > 0)) {
      setSendError(
        subSide === "withdraw"
          ? "Enter a Withdraw amount above to send."
          : "Enter a Borrow amount above to send.",
      );
      return;
    }
    const dest = sendAddress.trim();
    if (!/^G[A-Z2-7]{55}$/.test(dest)) {
      setSendError("Enter a valid Stellar destination (G… address).");
      return;
    }
    try {
      const stroops = Math.round(amt * 10_000_000);
      const asset = subSide === "withdraw" ? subColl : subDebt;
      const recipe =
        subSide === "withdraw"
          ? new Recipe().withdraw(asset, stroops)
          : new Recipe().borrow(asset, stroops);
      const intent = recipe.buildIntent(address);
      const h = healthBps(prevS, prevD);
      const verb = subSide === "withdraw" ? "Withdraw" : "Borrow";
      setQuoteSub({
        kind: subSide === "borrow" ? "boost" : "repay",
        flash: 0,
        fee: 0,
        feeBps: 0,
        steps: intent.actions.length + 1,
        healthBps: h,
        swapImpact: null,
        swapRoute: null,
        swapOutTok: null,
        swapOutCode: null,
        intent,
        warnings: [
          "You approve each step in your wallet.",
          `${verb} ${asset} then send to ${dest.slice(0, 8)}…${dest.slice(-6)} in one flow.`,
        ],
      });
    } catch (e) {
      setSendError(String(e).slice(0, 160));
    }
  }
  /** Tabs keep their own combine state: entering a tab clears the other
     tab's open combine + stale quote so the grid never splits empty. */
  function switchActionTab(t: "leverage" | "supply" | "move") {
    setActionTab(t);
    if (t === "supply") {
      setCombine(null);
      setCombineAmount("");
      setQuote(null);
      setQuoteError(null);
    } else {
      setSubCombine(false);
      setSendCombine(false);
      setSendError(null);
      setSubCombineAmount("");
      setQuoteSub(null);
      setQuoteSubError(null);
      if (t === "move") {
        setCombine(null);
        setCombineAmount("");
        setQuote(null);
        setQuoteError(null);
        setMoveQuote(null);
        setMoveError(null);
      }
    }
  }
  /** Move-tab switch intents: withdraw/swap/supply-style legs composed with
     @seidar/sdk Recipe and shown unsigned for wallet signing. The swap
     leg routes through Exchange (Soroswap) at execution. Amounts are USD
     values converted per leg through live prices. */
  function buildMoveQuote() {
    setMoveError(null);
    setMoveQuote(null);
    if (!hasWallet || !address) {
      setMoveError(
        "Connect a wallet — intents are built for your address as unsigned recipes.",
      );
      return;
    }
    /* Modal open wins over the tab kind (avoids stale-state mismatch). */
    const kind = moveModal ?? moveKind;
    const moveSlipBps =
      swSlip === "custom"
        ? Math.max(0, Math.round((Number(swCustom) || 0) * 100))
        : Math.round(Number(swSlip) * 100);
    try {
      const usd = Number(String(moveAmount).replace(/[^0-9.]/g, "")) || 0;
      const toUnits = (code: string, v: number) =>
        Math.round((v / px(code)) * 10_000_000);
      if (!(usd > 0) && kind !== "flip") {
        setMoveError("Enter an amount above 0 to quote.");
        return;
      }
      const recipe = new Recipe();
      if (kind === "collateral") {
        if (moveTo === swFrom) {
          setMoveError("Pick a different asset to switch into.");
          return;
        }
        recipe
          .withdraw(swFrom, toUnits(swFrom, usd))
          .swap(moveTo, toUnits(moveTo, usd))
          .supply(moveTo, toUnits(moveTo, usd));
        setMoveQuote({
          steps: recipe.buildIntent(address).actions.map((a) => a.kind),
          route: swRoute,
          slippageBps: moveSlipBps,
          intent: {
            user: address,
            actions: recipe.buildIntent(address).actions,
            route: swRoute,
            slippageBps: moveSlipBps,
          },
          warnings: [
            "You approve each step in your wallet.",
            `Withdraw ${swFrom} → swap → supply ${moveTo} as three confirmed steps; the swap routes automatically.`,
          ],
        });
      } else if (kind === "debt") {
        if (moveTo === swFrom) {
          setMoveError("Pick a different asset to switch into.");
          return;
        }
        recipe
          .borrow(moveTo, toUnits(moveTo, usd))
          .swap(swFrom, toUnits(swFrom, usd))
          .repay(swFrom, toUnits(swFrom, usd));
        setMoveQuote({
          steps: recipe.buildIntent(address).actions.map((a) => a.kind),
          route: swRoute,
          slippageBps: moveSlipBps,
          intent: {
            user: address,
            actions: recipe.buildIntent(address).actions,
            route: swRoute,
            slippageBps: moveSlipBps,
          },
          warnings: [
            "You approve each step in your wallet.",
            `Borrow ${moveTo} → swap → repay ${swFrom} as three confirmed steps; the swap routes automatically.`,
          ],
        });
      } else {
        const debtUsd =
          Number(String(flipDebt).replace(/[^0-9.]/g, "")) || 0;
        if (!(usd > 0) && !(debtUsd > 0)) {
          setMoveError("Enter an amount above 0 to quote.");
          return;
        }
        // Flip inverts exposure — gate the resulting health before quoting.
        const minHealth = 13000;
        const flipS = Math.max(0, supplying - usd + debtUsd);
        const flipD = Math.max(0, borrowing - Math.min(debtUsd, borrowing) + usd);
        const flipH = healthBps(flipS, flipD);
        if (flipH != null && flipH < minHealth) {
          setMoveError(
            `Resulting health ${(flipH / 10000).toFixed(2)} is below the ${(minHealth / 10000).toFixed(2)} minimum — lower the amount.`,
          );
          return;
        }
        recipe
          .withdraw(collAsset, toUnits(collAsset, usd))
          .repay(debtAsset, toUnits(debtAsset, debtUsd))
          .supply(debtAsset, toUnits(debtAsset, debtUsd))
          .borrow(collAsset, toUnits(collAsset, usd));
        setMoveQuote({
          steps: recipe.buildIntent(address).actions.map((a) => a.kind),
          route: swRoute,
          slippageBps: moveSlipBps,
          intent: {
            user: address,
            actions: recipe.buildIntent(address).actions,
            route: swRoute,
            slippageBps: moveSlipBps,
          },
          warnings: [
            "You approve each step in your wallet.",
            `Close (${collAsset} out, ${debtAsset} repaid) then reopen mirrored — review health before signing, exposure inverts.`,
          ],
        });
      }
    } catch (e) {
      setMoveError(String(e).slice(0, 160));
    }
  }
  function refreshBoard() {
    if (boardSpinning) return;
    setBoardSpinning(true);
    const done = () => setBoardSpinning(false);
    const minSpin = new Promise((res) => setTimeout(res, 600));
    setRefreshTick((t) => t + 1);
    window.dispatchEvent(new Event("seidar:refresh"));
    minSpin.then(done, done);
  }
  const actionsRef = useRef<HTMLDivElement>(null);
  /* Borrowing bar with borrow-limit (white) + liquidation-limit (red) markers.
     Scale covers borrow + both limits. Segments + markers carry their own
     hover/focus tooltips; markers are buttons so tap focuses them too. Once
     the borrow limit is crossed nothing more can be borrowed — only price
     moves toward liquidation — so the gap reads "left to borrow" plus
     "left to be liquidated" (or how far past liquidation when breached). */
  function borrowBar(
    bor: number,
    lim: number,
    liq: number,
    slices?: { code: string; usd: number }[],
  ) {
    const mx = Math.max(bor, lim, liq, 1);
    const safe = Math.min(bor, lim);
    const mid = Math.max(0, Math.min(bor, liq) - lim);
    const over = Math.max(0, bor - Math.max(lim, liq));
    const rest = Math.max(0, mx - bor);
    const leftB = Math.max(0, lim - bor);
    const leftL = liq - bor;
    const hasBuffer = liq - lim > 0;
    const pct = (v: number) => `${(v / mx) * 100}%`;
    /* Safe zone subdivided per borrowed asset (pro-rata); falls back to a
       single debt-asset slice when leg detail is missing. */
    const parts = (
      slices && slices.length > 0
        ? slices
        : [{ code: debtAsset, usd: bor }]
    ).filter((s) => s.usd > 0.01);
    const partsTotal = parts.reduce((a, s) => a + s.usd, 0) || 1;
    return (
      <>
        {" "}
        {safe > 0 &&
          parts.map((s) => {
            const q = qtyLine(s.usd, s.code);
            return (
              <i
                key={s.code}
                className="seg"
                tabIndex={0}
                style={{
                  width: `${(s.usd / partsTotal) * (safe / mx) * 100}%`,
                  background: segColor(s.code),
                }}
              >
                {" "}
                <span className="seg-tip" aria-hidden="true">
                  {" "}
                  <b>{q.big}</b> <span>{q.small}</span>{" "}
                </span>{" "}
              </i>
            );
          })}{" "}
        {mid > 0 && (
          <i className="over-mid seg" tabIndex={0} style={{ width: pct(mid) }}>
            {" "}
            <span className="seg-tip" aria-hidden="true">
              {" "}
              <b>
                ${fmtUsd(bor)} {debtAsset}
              </b>{" "}
              <span>(${fmtUsd(bor)} USD)</span>{" "}
              <span>Over borrow limit: ${fmtUsd(bor - lim)}</span>{" "}
            </span>{" "}
          </i>
        )}{" "}
        {over > 0 && (
          <i className="over seg" tabIndex={0} style={{ width: pct(over) }}>
            {" "}
            <span className="seg-tip" aria-hidden="true">
              {" "}
              <b>
                ${fmtUsd(bor)} {debtAsset}
              </b>{" "}
              <span>(${fmtUsd(bor)} USD)</span>{" "}
              <span>
                Over the liquidation limit: ${fmtUsd(bor - liq)}
              </span>{" "}
            </span>{" "}
          </i>
        )}{" "}
        {rest > 0 && (
          <i className="rest seg" tabIndex={0} style={{ width: pct(rest) }}>
            {" "}
            <span className="seg-tip" aria-hidden="true">
              {" "}
              <b>{bor > 0.01 ? "Left to borrow" : "No borrowed assets"}</b>{" "}
              {bor > 0.01 ? (
                <span>${fmtUsd(leftB)}</span>
              ) : lim > 0 ? (
                <span>Left to borrow ${fmtUsd(leftB)}</span>
              ) : (
                <span>Supply collateral to borrow</span>
              )}{" "}
              {(hasBuffer || bor > lim) && bor > 0.01 && (
                <span>
                  {leftL >= 0
                    ? `Left to be liquidated $${fmtUsd(leftL)}`
                    : `−$${fmtUsd(-leftL)} past liquidation`}
                </span>
              )}{" "}
            </span>{" "}
          </i>
        )}{" "}
        {lim > 0 && (
          <button
            type="button"
            className="marker white"
            style={{ left: pct(lim) }}
            aria-label={`Borrow limit $${fmtUsd(lim)}`}
          >
            {" "}
            <span className="seg-tip" aria-hidden="true">
              {" "}
              <b>Borrow limit</b> <span>${fmtUsd(lim)}</span>{" "}
              {bor > lim && (
                <span>
                  −${fmtUsd(bor - lim)} over — repay to avoid liquidation
                </span>
              )}{" "}
            </span>{" "}
          </button>
        )}{" "}
        {liq - lim > 0 && (
          <button
            type="button"
            className="marker red"
            style={{ left: pct(liq) }}
            aria-label={`Liquidation limit $${fmtUsd(liq)}`}
          >
            {" "}
            <span className="seg-tip" aria-hidden="true">
              {" "}
              <b>Liquidation limit</b> <span>${fmtUsd(liq)}</span>{" "}
            </span>{" "}
          </button>
        )}{" "}
      </>
    );
  }
  /* ---------- Real execution (replaces "copy intent") ----------
     Amounts are token units in the board inputs; they convert to base units
     with the token's real decimals. Withdraw/repay at (or above) the live
     position switch to "max" so dust never strands. The active account is
     the tx source; the connected wallet (owner) signs. */
  const lendCtx = (): LendCtx => {
    if (!address) throw new Error("Connect a wallet first.");
    return {
      protocol: id,
      address,
      signer: owner ?? address,
      poolAddrs: selAddrs ?? [],
      poolKey: poolSel,
      tokens: swapTokens,
      held: (code, kind) =>
        liveLegs
          .filter((l) => l.code === code)
          .reduce((s, l) => s + ((kind === "supply" ? l.supplyAmount : l.borrowAmount) ?? 0), 0),
    };
  };
  const execLending = (acts: LendAct[], onSteps: (s: TxStep[]) => void) =>
    runActs(lendCtx(), acts, onSteps);
  const execChain = (
    opts: { first: LendAct[]; swap: { from: string; to: string; tokens: number }; then: LendAct["action"] },
    onSteps: (s: TxStep[]) => void,
  ) => runChain(lendCtx(), opts, onSteps);
  /* Boost: borrow debt -> swap -> supply collateral. Repay: withdraw
     collateral -> swap -> repay debt. Combined action rides the first leg. */
  async function execLeverage(onSteps: (s: TxStep[]) => void) {
    const boost = side === "boost";
    const inCode = boost ? debtAsset : collAsset;
    const outCode = boost ? collAsset : debtAsset;
    const first: LendAct[] = [{ action: boost ? "borrow" : "withdraw", code: inCode, tokens: amtNum }];
    const comb = Number(combineAmount) || 0;
    if (comb > 0) {
      if (combine === "supply") first.unshift({ action: "supply", code: collAsset, tokens: comb });
      if (combine === "payback") first.unshift({ action: "repay", code: debtAsset, tokens: comb });
      if (combine === "withdraw") first.push({ action: "withdraw", code: collAsset, tokens: comb });
      if (combine === "borrow") first.push({ action: "borrow", code: debtAsset, tokens: comb });
    }
    await execChain({ first, swap: { from: inCode, to: outCode, tokens: amtNum }, then: boost ? "supply" : "repay" }, onSteps);
  }
  /* Move tab: collateral switch (withdraw A -> swap -> supply B) and debt
     switch (borrow B -> swap -> repay A). Amount input is USD. */
  const [moveSteps, setMoveSteps] = useState<TxStep[]>([]);
  const [moveRunning, setMoveRunning] = useState(false);
  const [moveDone, setMoveDone] = useState(false);
  useEffect(() => {
    setMoveSteps([]);
    setMoveDone(false);
  }, [moveModal]);
  async function execMove() {
    const kind = moveModal ?? moveKind;
    const usd = Number(String(moveAmount).replace(/[^0-9.]/g, "")) || 0;
    if (kind === "flip") {
      setMoveError("Flip is not executable yet — close and reopen the position manually.");
      return;
    }
    if (!(usd > 0)) {
      setMoveError("Enter an amount above 0.");
      return;
    }
    if (moveTo === swFrom) {
      setMoveError("Pick a different asset to switch into.");
      return;
    }
    const pFrom = px(swFrom);
    const pTo = px(moveTo);
    if (!(pFrom > 0) || !(pTo > 0)) {
      setMoveError("Live prices unavailable for this pair.");
      return;
    }
    setMoveError(null);
    setMoveDone(false);
    setMoveRunning(true);
    try {
      if (kind === "collateral") {
        const tok = usd / pFrom;
        await execChain(
          { first: [{ action: "withdraw", code: swFrom, tokens: tok }], swap: { from: swFrom, to: moveTo, tokens: tok }, then: "supply" },
          setMoveSteps,
        );
      } else {
        // Borrow 1% extra of the new debt so slippage never leaves old debt.
        const tok = (usd / pTo) * 1.01;
        await execChain(
          { first: [{ action: "borrow", code: moveTo, tokens: tok }], swap: { from: moveTo, to: swFrom, tokens: tok }, then: "repay" },
          setMoveSteps,
        );
      }
      setMoveDone(true);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setMoveRunning(false);
    }
  }
  /* Quote confirmation model for the modal (replaces inline blocks). */
  const showKind =
    confirmKind === "main" && quote
      ? "main"
      : confirmKind === "sub" && quoteSub
        ? "sub"
        : null;
  function closeConfirm() {
    setConfirmKind(null);
    setQuote(null);
    setQuoteSub(null);
  }
  const sideLabel: Record<string, string> = {
    supply: "Supply",
    withdraw: "Withdraw",
    borrow: "Borrow",
    payback: "Pay back",
  };
  const healthText = (h: number | null) =>
    h == null ? "Debt-free" : (h / 10000).toFixed(2);
  const confirmModel: ConfirmModel | null = (() => {
    /* Main-tab USD legs mirror buildQuote's math (intents keep stroops). */
    const mainUsdV = amtNum * px(side === "boost" ? debtAsset : collAsset);
    const mainCombUsdV =
      combNum *
      px(combine === "supply" || combine === "withdraw" ? collAsset : debtAsset);
    if (showKind === "main" && quote) {
      const isBoost = quote.kind === "boost";
      const legs: ConfirmLeg[] = isBoost
        ? [
            { label: "Supplying from account", usd: mainUsdV, code: collAsset },
            { label: "Borrowing", usd: mainUsdV, code: debtAsset },
            ...(combine === "supply"
              ? [{ label: "Supplying", usd: mainCombUsdV, code: collAsset }]
              : combine === "payback"
                ? [{ label: "Repaying", usd: mainCombUsdV, code: debtAsset }]
                : []),
          ]
        : [
            { label: "Withdrawing", usd: mainUsdV, code: collAsset },
            { label: "Repaying", usd: mainUsdV, code: debtAsset },
            ...(combine === "withdraw"
              ? [{ label: "Withdrawing", usd: mainCombUsdV, code: collAsset }]
              : combine === "borrow"
                ? [{ label: "Borrowing", usd: mainCombUsdV, code: debtAsset }]
                : []),
          ];
      const liveOut =
        quote.swapOutTok != null &&
        quote.swapOutCode != null &&
        amtNum > 0
          ? {
              rate: quote.swapOutTok / amtNum,
              out: `${quote.swapOutTok.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${quote.swapOutCode}`,
            }
          : null;
      const rate =
        liveOut != null
          ? isBoost
            ? {
                text: `Buying at ${liveOut.rate.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${debtAsset}/${collAsset}`,
                out: liveOut.out,
              }
            : {
                text: `Swapping at ${liveOut.rate.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${collAsset}/${debtAsset}`,
                out: liveOut.out,
              }
          : px(collAsset) > 0 && px(debtAsset) > 0
            ? isBoost
              ? {
                  text: `Buying at ${(px(debtAsset) / px(collAsset)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${debtAsset}/${collAsset}`,
                  out: `${(mainUsdV / px(collAsset)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${collAsset}`,
                }
              : {
                  text: `Swapping at ${(px(collAsset) / px(debtAsset)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${collAsset}/${debtAsset}`,
                  out: `${(mainUsdV / px(debtAsset)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${debtAsset}`,
                }
            : null;
      const title = isBoost
        ? `Boost${combine ? ` + ${combine === "supply" ? "Supply" : "Pay back"}` : ""}`
        : `Repay${combine ? ` + ${combine === "withdraw" ? "Withdraw" : "Borrow"}` : ""}`;
      return {
        title,
        pool: poolSel,
        legs,
        rate,
        flash: isBoost
          ? { tok: amtNum, code: debtAsset, fee: quote.fee, feeBps: quote.feeBps }
          : null,
        steps: `${quote.steps} · ${quote.intent.actions.map((a) => a.kind).join(" → ")}`,
        health: healthText(quote.healthBps),
        route: quote.swapRoute ?? "Automatic (Soroban AMMs)",
        slippage: "0.50% guard",
        sendTo: null,
        impact: quote.swapImpact,
        warnings: quote.warnings,
        confirmLabel: isBoost ? "Boost" : "Repay",
        px,
        execute: execLeverage,
      };
    }
    if (showKind === "sub" && quoteSub) {
      const legs: ConfirmLeg[] = [];
      const push = (label: string, usd: number, code: string) => {
        if (usd > 0) legs.push({ label, usd, code });
      };
      if (subSide === "supply") {
        push("Supplying from account", usdSub, subColl);
        if (subCombine) push("Borrowing", usdSubComb, subDebt);
      } else if (subSide === "withdraw") {
        push("Withdrawing", usdSub, subColl);
        if (subCombine) push("Repaying", usdSubComb, subDebt);
      } else if (subSide === "borrow") {
        push("Borrowing", usdSub, subDebt);
        if (subCombine) push("Supplying", usdSubComb, subColl);
      } else {
        push("Repaying", usdSub, subDebt);
        if (subCombine) push("Withdrawing", usdSubComb, subColl);
      }
      const second =
        subSide === "supply"
          ? "Borrow"
          : subSide === "withdraw"
            ? "Pay back"
            : subSide === "borrow"
              ? "Supply"
              : "Withdraw";
      const title = `${sideLabel[subSide]}${subCombine ? ` + ${second}` : ""}${sendCombine ? " + Send" : ""}`;
      return {
        title,
        pool: poolSel,
        legs,
        rate: null,
        flash: null,
        steps: `${quoteSub.steps} · ${quoteSub.intent.actions.map((a) => a.kind).join(" → ")}`,
        health: healthText(quoteSub.healthBps),
        route: "Automatic (Soroban AMMs)",
        slippage: null,
        sendTo: sendCombine ? sendAddress.trim() : null,
        impact: null,
        warnings: quoteSub.warnings,
        confirmLabel: sideLabel[subSide] ?? "Confirm",
        px,
        execute: sendCombine
          ? undefined
          : (onSteps) => {
              const comb = subCombine ? subCombNum : 0;
              const acts: { action: "supply" | "withdraw" | "borrow" | "repay"; code: string; tokens: number }[] =
                subSide === "supply"
                  ? [{ action: "supply", code: subColl, tokens: subNum }, ...(comb > 0 ? [{ action: "borrow" as const, code: subDebt, tokens: comb }] : [])]
                  : subSide === "withdraw"
                    ? [{ action: "withdraw", code: subColl, tokens: subNum }, ...(comb > 0 ? [{ action: "repay" as const, code: subDebt, tokens: comb }] : [])]
                    : subSide === "borrow"
                      ? [...(comb > 0 ? [{ action: "supply" as const, code: subColl, tokens: comb }] : []), { action: "borrow", code: subDebt, tokens: subNum }]
                      : [{ action: "repay", code: subDebt, tokens: subNum }, ...(comb > 0 ? [{ action: "withdraw" as const, code: subColl, tokens: comb }] : [])];
              return execLending(acts, onSteps);
            },
      };
    }
    return null;
  })();
  return (
    <div className="proto-board">
      {" "}
      <QuoteModal model={confirmModel} onClose={closeConfirm} />{" "}
      <MarketHero id={id} />
     <div
        className="proto-topbar"
        role="navigation"
        aria-label={`${meta.name} actions`}
      >
        {" "}
        <div className="proto-tabs" role="tablist" aria-label="Board sections">
          {" "}
          {(
            [
              "manage",
              "automate",
              "notify",
              "history",
              "create",
              "lend",
            ] as const
          ).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              className={`proto-tab${section === s ? " active" : ""}`}
              onClick={() => goSection(s)}
            >
              {" "}
              {s === "manage"
                ? "Manage"
                : s === "automate"
                  ? "Automate"
                  : s === "notify"
                    ? "Notify"
                    : s === "history"
                      ? "History"
                      : s === "create"
                        ? "Create"
                        : "Lend"}{" "}
            </button>
          ))}{" "}
        </div>{" "}
        <div className="proto-tools">
          {" "}
          <button
            type="button"
            className={`icon-btn${boardSpinning ? " spinning" : ""}`}
            onClick={refreshBoard}
            disabled={boardSpinning}
            aria-label="Refresh"
            title="Refresh live positions, markets and automation"
          >
            {" "}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>{" "}
          </button>{" "}
          <AccountSwitcher />{" "}
            <SmartGateModal
              open={gateOpen}
              smarts={acctSmarts}
              onPick={(a) => {
                setGateOpen(false);
                window.dispatchEvent(
                  new CustomEvent("seidar:set-active-account", { detail: a }),
                );
              }}
              onCreate={() => {
                setGateOpen(false);
                window.dispatchEvent(new Event("seidar:open-smart-account"));
              }}
              onClose={() => setGateOpen(false)}
            />{" "}
        </div>{" "}
      </div>{" "}
      <div className="proto-grid">
        {" "}
        <div className="pf-card proto-overview">
          {" "}
          <small className="proto-kicker">OVERVIEW</small>{" "}
          <div className="proto-ratio-row">
            {" "}
            <span className="proto-ratio-label">ⓘ Ratio:</span>{" "}
            <div className="tabs" role="tablist" aria-label="Ratio mode">
              {" "}
              {(["collateral", "safety", "health"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={ratio === r}
                  className={`tab${ratio === r ? " active" : ""}`}
                  onClick={() => setRatio(r)}
                >
                  {" "}
                  {r === "collateral"
                    ? "Collateral"
                    : r === "safety"
                      ? "Safety"
                      : "Health"}{" "}
                </button>
              ))}{" "}
            </div>{" "}
            <b className="proto-big">
              {" "}
              {ratioPct.toFixed(0)}%{" "}
              {hasPreview && (
                <span className="proto-after"> → {prevRatio.toFixed(0)}%</span>
              )}{" "}
            </b>{" "}
          </div>{" "}
          <div className="proto-amount-row">
            {" "}
            <span>ⓘ Supplying</span>{" "}
            <b
              className={
                hasWallet && supplying > 0.01 ? "mine-supply" : undefined
              }
            >
              {" "}
              ${fmtNum(supplying)}{" "}
              {hasPreview && (
                <span className="proto-after"> → ${fmtNum(prevS)}</span>
              )}{" "}
            </b>{" "}
          </div>{" "}
          <div className="proto-barwrap" tabIndex={0}>
            {" "}
            <div className="proto-bar">
              {" "}
              {supplySlices.length > 0
                ? supplySlices.map((s) => {
                    const q = qtyLine(s.usd, s.code);
                    const tot = supplySlices.reduce((a, x) => a + x.usd, 0);
                    return (
                      <i
                        key={s.code}
                        className="seg"
                        tabIndex={0}
                        style={{
                          width: `${(s.usd / Math.max(tot, 1)) * 100}%`,
                          background: segColor(s.code),
                        }}
                      >
                        {" "}
                        <span className="seg-tip" aria-hidden="true">
                          {" "}
                          <b>{q.big}</b> <span>{q.small}</span>{" "}
                        </span>{" "}
                      </i>
                    );
                  })
                : supplying > 0.01 && (
                    <i style={{ width: "100%" }} />
                  )}{" "}
            </div>{" "}
            {supplying <= 0.01 && (
              <span className="proto-bartip" aria-hidden="true">
                {" "}
                <b>No supplied assets</b>{" "}
              </span>
            )}{" "}
          </div>{" "}
          {hasPreview && (
            <div className="proto-bar preview" tabIndex={0}>
              {" "}
              {(() => {
                const mx = Math.max(supplying, prevS, 1);
                const growing = prevS >= supplying;
                const baseV = growing ? supplying : prevS;
                const deltaW =
                  (Math.max(0, Math.abs(prevS - supplying)) / mx) * 100;
                const q = qtyLine(prevS, effColl);
                return (
                  <>
                    {" "}
                    <i
                      style={{ width: `${(baseV / mx) * 100}%` }}
                      title={`$${Math.round(baseV).toLocaleString()} supplying`}
                    />{" "}
                    {deltaW > 0 && (
                      <i
                        className={growing ? "delta-sup" : "delta-cut"}
                        style={{ width: `${deltaW}%` }}
                        title={
                          growing
                            ? `+$${Math.round(prevS - supplying).toLocaleString()} supplying via ${effColl}`
                            : `−$${Math.round(supplying - prevS).toLocaleString()} supplying out to ${effDebt}`
                        }
                      />
                    )}{" "}
                    <span className="seg-tip" aria-hidden="true">
                      {" "}
                      <b>{q.big}</b> <span>{q.small}</span>{" "}
                    </span>{" "}
                  </>
                );
              })()}{" "}
            </div>
          )}{" "}
          <div className="proto-amount-row proto-borrow-row">
            {" "}
            <span>ⓘ Borrowing</span>{" "}
            <b
              className={
                hasWallet && borrowing > 0.01 ? "mine-borrow" : undefined
              }
            >
              {" "}
              ${fmtNum(borrowing)}{" "}
              {hasPreview && (
                <span className="proto-after"> → ${fmtNum(prevD)}</span>
              )}{" "}
            </b>{" "}
          </div>{" "}
          <div className="proto-barwrap">
            {" "}
            <div className="proto-bar lim">
              {" "}
              {borrowBar(borrowing, borrowLimit, liqLimit, borrowSlices)}{" "}
            </div>{" "}
          </div>{" "}
          {hasPreview && (
            <div className="proto-bar preview lim">
              {" "}
              {borrowBar(
                prevD,
                prevLimit,
                prevLiqLimit,
                [...new Set([...liveLegs.map((l) => l.code), effDebt])]
                  .map((code) => ({
                    code,
                    usd: prevAsset(code).d,
                  }))
                  .filter((s) => s.usd > 0.01),
              )}{" "}
            </div>
          )}{" "}
          <p className="proto-model">
            {spec.model} · {spec.caps} ·{" "}
            <span
              title={
                pxEstimated
                  ? "A token price is unavailable — projections use a $1 estimate for it."
                  : "Token prices are live — projections track the market."
              }
            >
              prices {pxEstimated ? "est" : "live"}
            </span>
          </p>{" "}
        </div>{" "}
        <div className="pf-card proto-side">
          {" "}
          <div className="proto-bal-row">
            {" "}
            <span>ⓘ Balance:</span>{" "}
            <b>
              {" "}
              ${fmtNum(balance)}{" "}
              {hasPreview && (
                <span className="proto-after">
                  {" "}
                  → ${fmtNum(prevBalance)}
                </span>
              )}{" "}
            </b>{" "}
          </div>{" "}
          <div className="proto-bal-row">
            {" "}
            <span>ⓘ Net APY:</span>{" "}
            <b>
              {" "}
              {net.toFixed(2)}%{" "}
              {hasPreview && (
                <span className="proto-after"> → {prevNet.toFixed(2)}%</span>
              )}{" "}
              <small>
                {" "}
                ${fmtNum((balance * net) / 100)} YoY{" "}
                {hasPreview && (
                  <span className="proto-after">
                    {" "}
                    → ${fmtNum((prevBalance * prevNet) / 100)}
                  </span>
                )}{" "}
              </small>{" "}
            </b>{" "}
          </div>{" "}
          <div
            className="tabs proto-detail-tabs"
            role="tablist"
            aria-label="Position details"
          >
            {" "}
            {(["details", "automations", "rewards"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={detailTab === t}
                className={`tab${detailTab === t ? " active" : ""}`}
                onClick={() => setDetailTab(t)}
              >
                {" "}
                {t === "details"
                  ? "Details"
                  : t === "automations"
                    ? "Automations"
                    : "Rewards"}{" "}
              </button>
            ))}{" "}
          </div>{" "}
          {detailTab === "details" ? (
            <div className="proto-kv">
              {" "}
              <div>
                {" "}
                <span>ⓘ Liquidation:</span>{" "}
                <b>
                  {" "}
                  {!hasWallet
                    ? "Connect wallet"
                    : positionCount === 0
                      ? "No position"
                      : borrowing <= 0
                        ? "Debt-free"
                        : dispHealth == null
                          ? (
                            <>
                              <LoadingMark size={12} /> Loading…
                            </>
                          )
                          : `Health ${dispHealth.toFixed(2)} · −${dispDrop != null ? dispDrop.toFixed(1) : "0.0"}% to liquidation`}{" "}
                  {hasPreview && positionCount > 0 && (
                    <span className="proto-after">
                      {" "}
                      →{" "}
                      {prevD <= 0
                        ? "Debt-free"
                        : prevHealth == null
                          ? "…"
                          : `Health ${(prevHealth / 10000).toFixed(2)}`}{" "}
                    </span>
                  )}{" "}
                </b>{" "}
              </div>{" "}
              <div>
                <span>ⓘ Exposure:</span>
                <b>
                  {positionCount
                    ? `${positionCount} market${positionCount > 1 ? "s" : ""}`
                    : "N/A"}
                </b>
              </div>{" "}
              <div>
                {" "}
                <span>ⓘ Borrow power used:</span>{" "}
                <b>
                  {" "}
                  {powerUsed.toFixed(0)}%{" "}
                  {hasPreview && (
                    <span className="proto-after">
                      {" "}
                      → {prevPower.toFixed(0)}%
                    </span>
                  )}{" "}
                </b>{" "}
              </div>{" "}
              <div>
                {" "}
                <span>ⓘ Left to borrow:</span>{" "}
                <b>
                  {" "}
                  ${Math.round(leftToBorrow).toLocaleString()}{" "}
                  {hasPreview && (
                    <span className="proto-after">
                      {" "}
                      → ${Math.round(prevLeft).toLocaleString()}
                    </span>
                  )}{" "}
                </b>{" "}
              </div>{" "}
            </div>
          ) : detailTab === "automations" ? (
            id === "blend" ? (
              <AutomationSummary owner={owner ?? null} onSetup={() => goto("automate")} />
            ) : (
              <ProtoEmpty
                letter="A"
                sub="Liquidation protection runs on Blend for now."
                action="Set up Automation"
                onAction={() => goto("automate")}
              />
            )
          ) : (
            <ProtoEmpty
              letter="R"
              sub="Supply incentives and boosted yields will appear here."
              action="Explore Markets"
              onAction={() => goto("earn")}
            />
          )}{" "}
        </div>{" "}
      </div>{" "}
      <div className="pf-card proto-actions" ref={actionsRef}>
        {" "}
        <div className="proto-actions-head">
          {" "}
          <small className="proto-kicker">ACTIONS</small>{" "}
          <div className="tabs" role="tablist" aria-label="Action groups">
            {" "}
            {(["leverage", "supply", "move"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={actionTab === t}
                className={`tab${actionTab === t ? " active" : ""}`}
                onClick={() => switchActionTab(t)}
              >
                {" "}
                {t === "leverage"
                  ? "Leverage"
                  : t === "supply"
                    ? "Add / Remove"
                    : "Move"}{" "}
              </button>
            ))}{" "}
          </div>{" "}
        </div>{" "}
        {poolBlock && (
          <p className="proto-warn" role="alert" style={{ margin: "0 0 10px" }}>
            {" "}
            {poolBlock}{" "}
          </p>
        )}{" "}
        <div
          className={`proto-actions-grid${combine || subCombine || sendCombine ? " combined" : ""}${subCombine && sendCombine ? " combined-double" : ""}`}
        >
          {" "}
          {actionTab === "supply" ? (
            <>
              {" "}
              <div
                className="proto-side-list"
                role="tablist"
                aria-label="Add or remove"
              >
                {" "}
                {(
                  [
                    {
                      k: "supply",
                      t: "Supply",
                      d: "Add collateral to position.",
                      icon: (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="12" y1="15" x2="12" y2="4" />
                          <polyline points="6 10 12 4 18 10" />
                          <line x1="5" y1="21" x2="19" y2="21" />
                        </svg>
                      ),
                    },
                    {
                      k: "withdraw",
                      t: "Withdraw",
                      d: "Remove supplied assets.",
                      icon: (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="12" y1="4" x2="12" y2="15" />
                          <polyline points="6 10 12 16 18 10" />
                          <line x1="5" y1="3" x2="19" y2="3" />
                        </svg>
                      ),
                    },
                    {
                      k: "borrow",
                      t: "Borrow",
                      d: "Generate debt against collateral.",
                      icon: (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
                          <polyline points="10 17 15 12 10 7" />
                          <line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                      ),
                    },
                    {
                      k: "payback",
                      t: "Pay back",
                      d: "Pay back debt from wallet.",
                      icon: (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      ),
                    },
                  ] as const
                ).map((s) => {
                  return (
                  <button
                    key={s.k}
                    type="button"
                    role="tab"
                    aria-selected={subSide === s.k}
                    className={`proto-side-btn sub${subSide === s.k ? " active" : ""}`}
                    onClick={() => {
                      setSubSide(s.k);
                      setSubCombine(false);
                      setSendCombine(false);
                      setSendError(null);
                      setSubAmount("");
                      setSubCombineAmount("");
                      setQuoteSub(null);
                      setQuoteSubError(null);
                    }}
                  >
                    {" "}
                    <b>
                      {s.icon}
                      {s.t}
                    </b>{" "}
                  </button>
                  );
                })}{" "}
              </div>{" "}
              <div className="proto-main-action">
                {" "}
                <h3>
                  {subSide === "supply"
                    ? "Supply"
                    : subSide === "withdraw"
                      ? "Withdraw"
                      : subSide === "borrow"
                        ? "Borrow"
                        : "Pay back"}
                </h3>{" "}
                <p>
                  {" "}
                  {subSide === "supply"
                    ? "Add collateral to position."
                    : subSide === "withdraw"
                      ? "Remove supplied assets."
                      : subSide === "borrow"
                        ? "Generate debt against collateral."
                        : "Pay back debt from wallet."}{" "}
                </p>{" "}
                <p className="proto-path">
                  {" "}
                  <span />{" "}
                  <span className="proto-max">
                    {" "}
                    (max{" "}
                    {subSide === "supply"
                      ? fmtBal(balOf(subColl))
                      : subSide === "withdraw"
                        ? Math.round(supplying / px(subColl)).toLocaleString()
                        : subSide === "borrow"
                          ? Math.round(leftToBorrow / px(subDebt)).toLocaleString()
                          : Math.round(borrowing / px(subDebt)).toLocaleString()}{" "}
                    {subSide === "supply" || subSide === "withdraw"
                      ? subColl
                      : subDebt}
                    ){" "}
                  </span>{" "}
                </p>{" "}
                <div className="proto-dfs-box">
                  {" "}
                  <span className="proto-accent" aria-hidden="true" />{" "}
                  <input
                    className="proto-amt"
                    value={subAmount}
                    onChange={(e) => setSubAmount(onlyNum(e.target.value))}
                    inputMode="decimal"
                    disabled={
                      (subSide === "withdraw" &&
                        suppliedCodes.length === 0) ||
                      (subSide === "payback" &&
                        borrowedCodes.length === 0)
                    }
                    aria-label="Amount"
                    placeholder={
                      (subSide === "withdraw" &&
                        suppliedCodes.length === 0) ||
                      (subSide === "payback" &&
                        borrowedCodes.length === 0)
                        ? "—"
                        : "0"
                    }
                  />{" "}
                  <div className="proto-cell">
                    {" "}
                    {subSide === "supply" ? (
                      <AssetSelect
                        value={subColl}
                        onChange={setSubColl}
                        options={assetCodes}
                        label="Asset"
                        role="Supply"
                        disabledCodes={supplyBlockedMap}
                      />
                    ) : subSide === "withdraw" ? (
                      suppliedCodes.length === 0 ? (
                        <EmptyToken
                          label="Withdraw"
                          tip="No collateral — supply assets first to enable withdraw."
                        />
                      ) : (
                        <AssetSelect
                          value={
                            suppliedCodes.includes(subColl)
                              ? subColl
                              : suppliedCodes[0]
                          }
                          onChange={setSubColl}
                          options={suppliedCodes}
                          label="Asset"
                          role="Withdraw"
                        />
                      )
                    ) : subSide === "borrow" ? (
                      <AssetSelect
                        value={subDebt}
                        onChange={setSubDebt}
                        options={assetCodes}
                        label="Asset"
                        role="Borrow"
                        disabledCodes={borrowBlockedMap}
                      />
                    ) : borrowedCodes.length === 0 ? (
                      <EmptyToken
                        label="Pay back"
                        tip="No debt — you have no borrowed assets to pay back."
                      />
                    ) : (
                      <AssetSelect
                        value={
                          borrowedCodes.includes(subDebt)
                            ? subDebt
                            : borrowedCodes[0]
                        }
                        onChange={setSubDebt}
                        options={borrowedCodes}
                        label="Asset"
                        role="Pay back"
                      />
                    )}{" "}
                  </div>{" "}
                </div>{" "}
                <button
                  type="button"
                  className={`btn primary proto-boost${hoverKey === "supply" && needsSmart ? " armed" : ""}`}
                  disabled={poolBlock != null || sideOff(subSide) != null}
                  title={poolBlock ?? sideOff(subSide) ?? undefined}
                  onClick={gated("supply", () => buildSubQuote(false))}
                  {...hoverProps("supply")}
                >
                  {gateLabel(
                    hoverKey === "supply" && needsSmart,
                    <>
                      {" "}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <path d="M12 8v6" />
                        <path d="M9 11h6" />
                      </svg>{" "}
                      {subSide === "supply"
                        ? "Supply"
                        : subSide === "withdraw"
                          ? "Withdraw"
                          : subSide === "borrow"
                            ? "Borrow"
                            : "Pay back"}{" "}
                    </>,
                    gateWord,
                  )}
                </button>{" "}
                {quoteSubError && (
                  <p className="proto-warn">{quoteSubError}</p>
                )}{" "}

                <p className="proto-combine">
                  {" "}
                  <span>Combine with another action:</span>{" "}
                  {subSide === "withdraw" || subSide === "borrow" ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className={`proto-combine-btn${subCombine ? " active" : ""}`}
                        onClick={() => {
                          const next = !subCombine;
                          setSubCombine(next);
                          if (next) {
                            setSendCombine(false);
                            setSendError(null);
                            setSubCombineAmount("");
                          }
                          setQuoteSub(null);
                          setQuoteSubError(null);
                        }}
                      >
                        {" "}
                        {subSide === "withdraw"
                          ? "Pay back"
                          : "Supply"}{" "}
                      </button>{" "}
                      <button
                        type="button"
                        className={`proto-combine-btn${sendCombine ? " active" : ""}`}
                        onClick={() => {
                          const next = !sendCombine;
                          setSendCombine(next);
                          setSendError(null);
                          if (next) setSubCombine(false);
                          setQuoteSub(null);
                          setQuoteSubError(null);
                        }}
                      >
                        {" "}
                        Send{" "}
                      </button>{" "}
                    </>
                  ) : (
                    <button
                      type="button"
                      className={`proto-combine-btn${subCombine ? " active" : ""}`}
                      onClick={() => {
                        const next = !subCombine;
                        setSubCombine(next);
                        if (next) setSubCombineAmount("");
                        setQuoteSub(null);
                        setQuoteSubError(null);
                      }}
                    >
                      {" "}
                      {subSide === "supply"
                        ? "Borrow"
                        : "Withdraw"}{" "}
                    </button>
                  )}{" "}
                </p>{" "}
              </div>{" "}
              {subCombine && (
                <div className="proto-combined">
                  {" "}
                  <div className="proto-combined-head">
                    {" "}
                    <h3>
                      {subSide === "supply"
                        ? "Borrow"
                        : subSide === "withdraw"
                          ? "Pay back"
                          : subSide === "borrow"
                            ? "Supply"
                            : "Withdraw"}
                    </h3>{" "}
                    <button
                      type="button"
                      className="proto-remove"
                      onClick={() => {
                        setSubCombine(false);
                        setQuoteSub(null);
                        setQuoteSubError(null);
                      }}
                      aria-label="Remove combined action"
                      title="Remove"
                    >
                      {" "}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>{" "}
                    </button>{" "}
                  </div>{" "}
                  <p>
                    {" "}
                    {subSide === "supply"
                      ? `Borrow ${subDebt} against the new collateral in the same transaction.`
                      : subSide === "withdraw"
                        ? `Repay ${subDebt} debt alongside the withdrawal.`
                        : subSide === "borrow"
                          ? `Supply ${subColl} as collateral for the new debt.`
                          : `Pull ${subColl} out while repaying.`}{" "}
                  </p>{" "}
                  <p className="proto-path">
                    {" "}
                    <span />{" "}
                    <span className="proto-max">
                      {" "}
                      (max{" "}
                      {subSide === "supply"
                        ? Math.round(leftToBorrow / px(subDebt)).toLocaleString()
                        : subSide === "withdraw"
                          ? Math.round(borrowing / px(subDebt)).toLocaleString()
                          : subSide === "borrow"
                            ? fmtBal(balOf(subColl))
                            : Math.round(supplying / px(subColl)).toLocaleString()}{" "}
                      {subSide === "supply" || subSide === "withdraw"
                        ? subDebt
                        : subColl}
                      ){" "}
                    </span>{" "}
                  </p>{" "}
                  <div className="proto-dfs-box">
                    {" "}
                    <span className="proto-accent" aria-hidden="true" />{" "}
                    <input
                      className="proto-amt"
                      value={subCombineAmount}
                      onChange={(e) =>
                        setSubCombineAmount(onlyNum(e.target.value))
                      }
                      inputMode="decimal"
                      disabled={
                        (subSide === "withdraw" &&
                          borrowedCodes.length === 0) ||
                        (subSide === "payback" &&
                          suppliedCodes.length === 0)
                      }
                      aria-label="Combined amount"
                      placeholder={
                        (subSide === "withdraw" &&
                          borrowedCodes.length === 0) ||
                        (subSide === "payback" &&
                          suppliedCodes.length === 0)
                          ? "—"
                          : "0"
                      }
                    />{" "}
                    <div className="proto-cell">
                      {" "}
                      {subSide === "supply" ? (
                        <AssetSelect
                          value={subDebt}
                          onChange={setSubDebt}
                          options={assetCodes}
                          label="Borrow asset"
                          role="Borrow"
                          disabledCodes={borrowBlockedMap}
                        />
                      ) : subSide === "withdraw" ? (
                        borrowedCodes.length === 0 ? (
                          <EmptyToken
                            label="Pay back"
                            tip="No debt — you have no borrowed assets to pay back."
                          />
                        ) : (
                          <AssetSelect
                            value={
                              borrowedCodes.includes(subDebt)
                                ? subDebt
                                : borrowedCodes[0]
                            }
                            onChange={setSubDebt}
                            options={borrowedCodes}
                            label="Pay back asset"
                            role="Pay back"
                          />
                        )
                      ) : subSide === "borrow" ? (
                        <AssetSelect
                          value={subColl}
                          onChange={setSubColl}
                          options={assetCodes}
                          label="Supply asset"
                          role="Supply"
                          disabledCodes={supplyBlockedMap}
                        />
                      ) : suppliedCodes.length === 0 ? (
                        <EmptyToken
                          label="Withdraw"
                          tip="No collateral — supply assets first to enable withdraw."
                        />
                      ) : (
                        <AssetSelect
                          value={
                            suppliedCodes.includes(subColl)
                              ? subColl
                              : suppliedCodes[0]
                          }
                          onChange={setSubColl}
                          options={suppliedCodes}
                          label="Withdraw asset"
                          role="Withdraw"
                        />
                      )}{" "}
                    </div>{" "}
                  </div>{" "}
                  <button
                    type="button"
                    className={`btn primary proto-boost${hoverKey === "supply-combine" && needsSmart ? " armed" : ""}`}
                    disabled={poolBlock != null || sideOff(subSide) != null}
                    title={poolBlock ?? sideOff(subSide) ?? undefined}
                    onClick={gated("supply-combine", () => buildSubQuote(true))}
                    {...hoverProps("supply-combine")}
                  >
                    {gateLabel(
                      hoverKey === "supply-combine" && needsSmart,
                      <>
                        {" "}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <path d="M12 8v6" />
                          <path d="M9 11h6" />
                        </svg>{" "}
                        {subSide === "supply"
                          ? "Supply + Borrow"
                          : subSide === "withdraw"
                            ? "Withdraw + Pay back"
                            : subSide === "borrow"
                              ? "Borrow + Supply"
                              : "Pay back + Withdraw"}{" "}
                      </>,
                      gateWord,
                    )}
                  </button>{" "}
                </div>
              )}{" "}
              {(subSide === "withdraw" || subSide === "borrow") &&
                sendCombine && (
                <div className="proto-combined proto-send">
                  {" "}
                  <div className="proto-combined-head">
                    {" "}
                    <h3>Send</h3>{" "}
                    <button
                      type="button"
                      className="proto-remove"
                      onClick={() => {
                        setSendCombine(false);
                        setSendError(null);
                        setQuoteSub(null);
                        setQuoteSubError(null);
                      }}
                      aria-label="Remove send action"
                      title="Remove"
                    >
                      {" "}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>{" "}
                    </button>{" "}
                  </div>{" "}
                  <p>
                    {subSide === "withdraw"
                      ? `Withdraw ${subColl} collateral and send it to another account`
                      : `Send the borrowed ${subDebt} to another account`}
                  </p>{" "}
                  <input
                    className="proto-addr"
                    value={sendAddress}
                    onChange={(e) => setSendAddress(e.target.value.trim())}
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Destination wallet"
                    placeholder="G… destination"
                  />{" "}
                  {sendError && (
                    <p className="proto-warn">{sendError}</p>
                  )}{" "}
                  <button
                    type="button"
                    className={`btn primary proto-boost${hoverKey === "send" && needsSmart ? " armed" : ""}`}
                    disabled={
                      poolBlock != null ||
                      (subSide === "withdraw" &&
                        suppliedCodes.length === 0) ||
                      !(subNum > 0) ||
                      sendAddress.trim().length === 0
                    }
                    onClick={gated("send", buildSendQuote)}
                    {...hoverProps("send")}
                  >
                    {gateLabel(
                      hoverKey === "send" && needsSmart,
                      <>
                        {" "}
                        {subSide === "withdraw"
                          ? "Withdraw + Send"
                          : "Borrow + Send"}{" "}
                      </>,
                      gateWord,
                    )}
                  </button>{" "}
                </div>
              )}{" "}
            </>
          ) : actionTab === "leverage" ? (
            <>
              {" "}
              <div
                className="proto-side-list"
                role="tablist"
                aria-label="Boost or repay"
              >
                {" "}
                {(["boost", "repay"] as const).map((s) => {
                  // Tabs always stay navigable: availability gating (pool
                  // status, holdings) disables the action buttons below,
                  // never the section. Switching sides clears a combined
                  // action (it belongs to the side it was added on).
                  return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={side === s}
                    className={`proto-side-btn inline${side === s ? " active" : ""}`}
                    onClick={() => {
                      setSide(s);
                      setCombine(null);
                      setAmount("");
                      setCombineAmount("");
                      setQuote(null);
                      setQuoteError(null);
                    }}
                  >
                    {" "}
                    <b>
                      {" "}
                      {s === "boost" ? (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="5 13 12 6 19 13" />
                          <polyline points="5 19 12 12 19 19" />
                        </svg>
                      ) : (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="5 11 12 18 19 11" />
                          <polyline points="5 5 12 12 19 5" />
                        </svg>
                      )}{" "}
                      {s === "boost" ? "Boost" : "Repay"}{" "}
                    </b>{" "}
                  </button>
                  );
                })}{" "}
              </div>{" "}
              <div className="proto-main-action">
                {" "}
                <h3>{side === "boost" ? "Boost" : "Repay"}</h3>{" "}
                <p>
                  {side === "boost"
                    ? "Increase leverage by borrowing, swapping to collateral and depositing in one tx."
                    : "Unwind leverage in one atomic recipe — withdraw, swap to debt, repay."}
                </p>{" "}
                <p className="proto-path">
                  {" "}
                  <span>
                    {side === "boost"
                      ? `Borrow ${subDebt} → Swap → Supply ${subColl}`
                      : `Withdraw ${subColl} → Swap → Pay back ${subDebt}`}
                  </span>{" "}
                  <span className="proto-max">
                    (max{" "}
                    {side === "boost"
                      ? Math.round(boostMax / px(subDebt)).toLocaleString()
                      : Math.round(borrowing / px(subDebt)).toLocaleString()}{" "}
                    {subDebt}){" "}
                  </span>{" "}
                </p>{" "}
                <div className="proto-dfs-box">
                  {" "}
                  <span className="proto-accent" aria-hidden="true" />{" "}
                  <input
                    className="proto-amt"
                    value={amount}
                    onChange={(e) => setAmount(onlyNum(e.target.value))}
                    inputMode="decimal"
                    disabled={
                      side === "repay" &&
                      (suppliedCodes.length === 0 ||
                        borrowedCodes.length === 0)
                    }
                    aria-label="Amount"
                    placeholder={
                      side === "repay" &&
                      (suppliedCodes.length === 0 ||
                        borrowedCodes.length === 0)
                        ? "—"
                        : "0"
                    }
                  />{" "}
                  {side === "boost" ? (
                    <>
                      {" "}
                      <div className="proto-cell">
                        {" "}
                        <AssetSelect
                          value={subDebt}
                          onChange={setSubDebt}
                          options={assetCodes}
                          label="Debt asset"
                          role="Borrow"
                        />{" "}
                      </div>{" "}
                      <div className="proto-cell">
                        {" "}
                        <AssetSelect
                          value={subColl}
                          onChange={setSubColl}
                          options={assetCodes}
                          label="Collateral asset"
                          role="Supply"
                        />{" "}
                      </div>{" "}
                    </>
                  ) : (
                    <>
                      {" "}
                      <div className="proto-cell">
                        {" "}
                        {suppliedCodes.length === 0 ? (
                          <EmptyToken
                            label="Withdraw"
                            tip="No collateral — supply assets first to enable withdraw."
                          />
                        ) : (
                          <AssetSelect
                            value={
                              suppliedCodes.includes(subColl)
                                ? subColl
                                : suppliedCodes[0]
                            }
                            onChange={setSubColl}
                            options={suppliedCodes}
                            label="Collateral asset"
                            role="Withdraw"
                          />
                        )}{" "}
                      </div>{" "}
                      <div className="proto-cell">
                        {" "}
                        {borrowedCodes.length === 0 ? (
                          <EmptyToken
                            label="Pay back"
                            tip="No debt — you have no borrowed assets to pay back."
                          />
                        ) : (
                          <AssetSelect
                            value={
                              borrowedCodes.includes(subDebt)
                                ? subDebt
                                : borrowedCodes[0]
                            }
                            onChange={setSubDebt}
                            options={borrowedCodes}
                            label="Debt asset"
                            role="Pay back"
                          />
                        )}{" "}
                      </div>{" "}
                    </>
                  )}{" "}
                </div>{" "}
                <button
                  type="button"
                  className={`btn primary proto-boost${hoverKey === "boost" && needsSmart ? " armed" : ""}`}
                  // A combined action runs from its own button below
                  // (e.g. "Supply + Boost"), which covers both steps.
                  disabled={combine != null || poolBlock != null || sideOff(side) != null}
                  title={
                    combine != null
                      ? "The combined action below runs both steps."
                      : (poolBlock ?? sideOff(side) ?? undefined)
                  }
                  onClick={gated("boost", buildQuote)}
                  {...hoverProps("boost")}
                >
                  {gateLabel(
                    hoverKey === "boost" && needsSmart,
                    <>
                      {" "}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <path d="M12 8v6" />
                        <path d="M9 11h6" />
                      </svg>{" "}
                      {side === "boost" ? "Boost" : "Repay"}
                      {estHealth != null
                        ? ` · ${(estHealth / 10000).toFixed(2)}`
                        : ""}{" "}
                    </>,
                    gateWord,
                  )}
                </button>{" "}
                {quoteError && <p className="proto-warn">{quoteError}</p>}{" "}

                <p className="proto-combine">
                  {" "}
                  <span>Combine with another action:</span>{" "}
                  {side === "boost" ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className={`proto-combine-btn${combine === "supply" ? " active" : ""}`}
                        onClick={() => {
                          setCombine((c) => (c === "supply" ? null : "supply"));
                          setCombineAmount("");
                          setQuote(null);
                          setQuoteError(null);
                        }}
                      >
                        {" "}
                        Supply{" "}
                      </button>{" "}
                      <button
                        type="button"
                        className={`proto-combine-btn${combine === "payback" ? " active" : ""}`}
                        onClick={() => {
                          setCombine((c) =>
                            c === "payback" ? null : "payback",
                          );
                          setCombineAmount("");
                          setQuote(null);
                          setQuoteError(null);
                        }}
                      >
                        {" "}
                        Pay back{" "}
                      </button>{" "}
                    </>
                  ) : (
                    <>
                      {" "}
                      <button
                        type="button"
                        className={`proto-combine-btn${combine === "withdraw" ? " active" : ""}`}
                        onClick={() => {
                          setCombine((c) =>
                            c === "withdraw" ? null : "withdraw",
                          );
                          setCombineAmount("");
                          setQuote(null);
                          setQuoteError(null);
                        }}
                      >
                        {" "}
                        Withdraw{" "}
                      </button>{" "}
                      <button
                        type="button"
                        className={`proto-combine-btn${combine === "borrow" ? " active" : ""}`}
                        onClick={() => {
                          setCombine((c) => (c === "borrow" ? null : "borrow"));
                          setCombineAmount("");
                          setQuote(null);
                          setQuoteError(null);
                        }}
                      >
                        {" "}
                        Borrow{" "}
                      </button>{" "}
                    </>
                  )}{" "}
                </p>{" "}
              </div>{" "}
              {combine && (
                <div className="proto-combined">
                  {" "}
                  <div className="proto-combined-head">
                    {" "}
                    <h3>
                      {" "}
                      {combine === "supply"
                        ? "Supply"
                        : combine === "payback"
                          ? "Pay back"
                          : combine === "withdraw"
                            ? "Withdraw"
                            : "Borrow"}{" "}
                    </h3>{" "}
                    <button
                      type="button"
                      className="proto-remove"
                      onClick={() => {
                        setCombine(null);
                        setQuote(null);
                        setQuoteError(null);
                      }}
                      aria-label="Remove combined action"
                      title="Remove"
                    >
                      {" "}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>{" "}
                    </button>{" "}
                  </div>{" "}
                  <p>
                    {" "}
                    {combine === "supply"
                      ? "Add collateral from your account to make the position safer, then generate debt to buy more collateral and add it to your position."
                      : combine === "payback"
                        ? "Pay back debt from your account, then generate debt to buy more collateral and add it to your position."
                        : combine === "withdraw"
                          ? "Pull extra collateral out to your account alongside the unwind, then repay the remaining debt in one transaction."
                          : "Borrow extra against the position first, then unwind — withdraw, swap and repay in one transaction."}{" "}
                  </p>{" "}
                  <p className="proto-path">
                    {" "}
                    <span />{" "}
                    <span className="proto-max">
                      {" "}
                      (max{" "}
                      {fmtBal(
                        combine === "supply"
                          ? balOf(collAsset)
                          : combine === "payback" || combine === "borrow"
                            ? borrowing / px(debtAsset)
                            : supplying / px(collAsset),
                      )}{" "}
                      {combine === "supply"
                        ? collAsset
                        : combine === "payback" || combine === "borrow"
                          ? debtAsset
                          : collAsset}
                      ){" "}
                    </span>{" "}
                  </p>{" "}
                  <div
                    className={`proto-dfs-box${combine !== "supply" ? " warn" : ""}`}
                  >
                    {" "}
                    <span className="proto-accent" aria-hidden="true" />{" "}
                    <input
                      className="proto-amt"
                      value={combineAmount}
                      onChange={(e) =>
                        setCombineAmount(onlyNum(e.target.value))
                      }
                      inputMode="decimal"
                      disabled={
                        (combine === "payback" &&
                          borrowedCodes.length === 0) ||
                        (combine === "withdraw" &&
                          suppliedCodes.length === 0)
                      }
                      aria-label={
                        combine === "supply"
                          ? "Supply amount"
                          : combine === "payback"
                            ? "Pay back amount"
                            : combine === "withdraw"
                              ? "Withdraw amount"
                              : "Borrow amount"
                      }
                      placeholder={
                        (combine === "payback" &&
                          borrowedCodes.length === 0) ||
                        (combine === "withdraw" &&
                          suppliedCodes.length === 0)
                          ? "—"
                          : "0"
                      }
                    />{" "}
                    <div className="proto-cell">
                      {" "}
                      {combine === "supply" ? (
                        <AssetSelect
                          value={collAsset}
                          onChange={setCollAsset}
                          options={assetCodes}
                          label="Supply asset"
                          role="Supply"
                        />
                      ) : combine === "payback" ? (
                        borrowedCodes.length === 0 ? (
                          <EmptyToken
                            label="Pay back"
                            tip="No debt — you have no borrowed assets to pay back."
                          />
                        ) : (
                          <AssetSelect
                            value={
                              borrowedCodes.includes(debtAsset)
                                ? debtAsset
                                : borrowedCodes[0]
                            }
                            onChange={setDebtAsset}
                            options={borrowedCodes}
                            label="Pay back asset"
                            role="Pay back"
                          />
                        )
                      ) : combine === "withdraw" ? (
                        suppliedCodes.length === 0 ? (
                          <EmptyToken
                            label="Withdraw"
                            tip="No collateral — supply assets first to enable withdraw."
                          />
                        ) : (
                          <AssetSelect
                            value={
                              suppliedCodes.includes(collAsset)
                                ? collAsset
                                : suppliedCodes[0]
                            }
                            onChange={setCollAsset}
                            options={suppliedCodes}
                            label="Withdraw asset"
                            role="Withdraw"
                          />
                        )
                      ) : (
                        <AssetSelect
                          value={debtAsset}
                          onChange={setDebtAsset}
                          options={assetCodes}
                          label="Borrow asset"
                          role="Borrow"
                        />
                      )}{" "}
                    </div>{" "}
                  </div>{" "}
                  <button
                    type="button"
                    className={`btn primary proto-boost${hoverKey === "boost-combine" && needsSmart ? " armed" : ""}`}
                    disabled={poolBlock != null || sideOff(side) != null}
                    title={poolBlock ?? sideOff(side) ?? undefined}
                    onClick={gated("boost-combine", buildQuote)}
                    {...hoverProps("boost-combine")}
                  >
                    {gateLabel(
                      hoverKey === "boost-combine" && needsSmart,
                      <>
                        {" "}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <path d="M12 8v6" />
                          <path d="M9 11h6" />
                        </svg>{" "}
                        {combine === "supply"
                          ? "Supply + Boost"
                          : combine === "payback"
                            ? "Pay back + Boost"
                            : combine === "withdraw"
                              ? "Withdraw + Repay"
                              : "Borrow + Repay"}{" "}
                      </>,
                      gateWord,
                    )}
                  </button>{" "}
                </div>
              )}{" "}
            </>
          ) : (
            <>
              {" "}
              <div
                className="proto-side-list"
                role="tablist"
                aria-label="Switch position"
              >
                {" "}
                {(
                  [
                    { k: "collateral", t: "Collateral Switch" },
                    { k: "debt", t: "Debt Switch" },
                    { k: "flip", t: "Position Flip" },
                    { k: "shifter", t: "Refinance" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    role="tab"
                    aria-selected={moveKind === s.k}
                    className={`proto-side-btn sub move${moveKind === s.k ? " active" : ""}`}
                    onClick={() => {
                      setMoveKind(s.k);
                      setMoveQuote(null);
                      setMoveError(null);
                    }}
                  >
                    {" "}
                    <b>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {s.k === "flip" ? (
                          <>
                            <polyline points="17 1 21 5 17 9" />
                            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                            <polyline points="7 23 3 19 7 15" />
                            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                          </>
                        ) : s.k === "shifter" ? (
                          <>
                            <rect x="3" y="3" width="7" height="7" rx="1.5" />
                            <rect x="14" y="14" width="7" height="7" rx="1.5" />
                            <path d="M10 6.5h5.5V11" />
                            <path d="M14 17.5H8.5V13" />
                          </>
                        ) : (
                          <>
                            <path d="M8 3L4 7l4 4" />
                            <path d="M4 7h16" />
                            <path d="M16 21l4-4-4-4" />
                            <path d="M20 17H4" />
                          </>
                        )}
                      </svg>
                      {s.t}
                    </b>{" "}
                  </button>
                ))}{" "}
              </div>{" "}
              <div className="proto-main-action">
                {" "}
                <h3>
                  {moveKind === "collateral"
                    ? "Collateral Switch"
                    : moveKind === "debt"
                      ? "Debt Switch"
                      : moveKind === "flip"
                        ? "Position Flip"
                        : "Refinance"}
                </h3>{" "}
                <p>
                  {" "}
                  {moveKind === "collateral"
                    ? "Trade your position's collateral for a different asset in one transaction — flash-funded, routed for the best rate across aggregators."
                    : moveKind === "debt"
                      ? "Trade your position's debt for a different asset in one transaction — fresh debt funds the swap that repays the old."
                      : moveKind === "flip"
                        ? "Exchange collateral and debt in a single transaction to reverse which way your position leans."
                        : `Refinance your whole position into another protocol — a cheaper borrow rate, richer yield, or assets out of reach here.`}{" "}
                </p>{" "}
                {" "}
                <button
                  type="button"
                  className={`btn primary proto-boost${hoverKey === "move-open" && needsSmart ? " armed" : ""}`}
                  onClick={gated("move-open", () => {
                    if (moveKind === "shifter") {
                      goto("refinance");
                    } else {
                      setMoveQuote(null);
                      setMoveError(null);
                      if (moveKind !== "flip") {
                        setSwFrom(
                          moveKind === "collateral" ? collAsset : debtAsset,
                        );
                      }
                      setMoveModal(moveKind);
                    }
                  })}
                  {...hoverProps("move-open")}
                >
                  {gateLabel(
                    hoverKey === "move-open" && needsSmart,
                    <>
                      {" "}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <path d="M12 8v6" />
                        <path d="M9 11h6" />
                      </svg>{" "}
                      {moveKind === "collateral"
                        ? "Open Collateral Switcher"
                        : moveKind === "debt"
                          ? "Open Debt Switcher"
                          : moveKind === "flip"
                            ? "Open Position Flip"
                            : "Open Refinance"}{" "}
                    </>,
                    gateWord,
                  )}
                </button>{" "}
                {moveKind === "flip" && moveError && <p className="proto-warn">{moveError}</p>}{" "}

              </div>{" "}
            </>
          )}{" "}
        </div>{" "}
      </div>{" "}
      {moveModal && (
        <div
          className="mv-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMoveModal(null);
          }}
        >
          {" "}
          <div
            className="mv-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              moveModal === "collateral"
                ? "Switch Collateral Asset"
                : moveModal === "debt"
                  ? "Switch Debt Asset"
                  : "Position Flip"
            }
          >
            {" "}
            <div className="mv-head">
              {" "}
              <h3>
                {moveModal === "collateral"
                  ? "Switch Collateral Asset"
                  : moveModal === "debt"
                    ? "Switch Debt Asset"
                    : "Position Flip"}
              </h3>{" "}
              <button
                type="button"
                className="mv-x"
                onClick={() => setMoveModal(null)}
                aria-label="Close"
              >
                {" "}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>{" "}
              </button>{" "}
            </div>{" "}
            {(() => {
              const fromCode = swFrom;
              const holdLeg = liveLegs.find((l) => l.code === fromCode);
              const holdingUsd =
                moveModal === "collateral"
                  ? (holdLeg?.suppliedUsd ?? 0)
                  : (holdLeg?.borrowedUsd ?? 0);
              const heldCodes =
                moveModal === "collateral" ? suppliedCodes : borrowedCodes;
              const usd = Number(String(moveAmount).replace(/[^0-9.]/g, "")) || 0;
              const slipBps =
                swSlip === "custom"
                  ? Math.max(
                      0,
                      Math.round((Number(swCustom) || 0) * 100),
                    )
                  : Math.round(Number(swSlip) * 100);
              const estTokens = usd / px(moveTo);
              const minRecv = estTokens * (1 - slipBps / 10000);
              const feePct = (
                feeTierBps({
                  stable:
                    STABLES.has(fromCode) && STABLES.has(moveTo),
                }) / 100
              ).toFixed(2);
              const blocker = !hasWallet
                ? "Connect a wallet to switch assets."
                : holdingUsd <= 0.01
                  ? `No ${moveModal === "collateral" ? "supplied collateral" : "borrowed debt"} to switch.`
                  : moveTo === fromCode
                    ? "Pick a different asset to switch into."
                    : usd > holdingUsd + 0.005
                      ? `Amount exceeds your holding ($${fmtUsd(holdingUsd)}).`
                      : null;
              const canSwitch =
                hasWallet &&
                holdingUsd > 0.01 &&
                moveTo !== fromCode &&
                usd > 0 &&
                usd <= holdingUsd + 0.005;
              /* Position Flip legs (two-sided close + mirrored reopen). */
              const collLeg = liveLegs.find((l) => l.code === collAsset);
              const debtLeg = liveLegs.find((l) => l.code === debtAsset);
              const collHold = collLeg?.suppliedUsd ?? 0;
              const debtHold = debtLeg?.borrowedUsd ?? 0;
              const collUsd =
                Number(String(moveAmount).replace(/[^0-9.]/g, "")) || 0;
              const debtUsd =
                Number(String(flipDebt).replace(/[^0-9.]/g, "")) || 0;
              const flipBlocker = !hasWallet
                ? "Connect a wallet to flip the position."
                : collHold <= 0.01 && debtHold <= 0.01
                  ? "No position to flip."
                  : collUsd > collHold + 0.005
                    ? `Collateral exceeds your holding ($${fmtUsd(collHold)}).`
                    : debtUsd > debtHold + 0.005
                      ? `Debt exceeds your borrowing ($${fmtUsd(debtHold)}).`
                      : null;
              const canFlip =
                hasWallet &&
                (collHold > 0.01 || debtHold > 0.01) &&
                (collUsd > 0 || debtUsd > 0) &&
                collUsd <= collHold + 0.005 &&
                debtUsd <= debtHold + 0.005;
              const note =
                moveError ?? (moveModal === "flip" ? flipBlocker : blocker);
              const canDo = moveModal === "flip" ? canFlip : canSwitch;
              return (
                <div className="mv-grid">
                  {" "}
                  <div className="mv-left">
                    {" "}
                    {moveModal === "flip" ? (
                      <>
                        {" "}
                        <p className="mv-label">
                          Collateral asset:{" "}
                          <button
                            type="button"
                            className="mv-max"
                            title="Use full holding"
                            onClick={() =>
                              setMoveAmount(
                                String(Math.floor(collHold * 100) / 100),
                              )
                            }
                          >
                            (max ${fmtUsd(collHold)})
                          </button>{" "}
                        </p>{" "}
                        <div className="mv-box">
                          {" "}
                          <input
                            className="mv-amt"
                            value={moveAmount}
                            onChange={(e) =>
                              setMoveAmount(onlyNum(e.target.value))
                            }
                            inputMode="decimal"
                            disabled={collHold <= 0.01}
                            placeholder={collHold <= 0.01 ? "—" : "0"}
                            aria-label="Collateral amount in USD"
                          />{" "}
                          <span className="mv-locked">
                            {" "}
                            <TokenIcon symbol={collAsset} size={22} />{" "}
                            <b>{collAsset}</b>{" "}
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <line x1="5" y1="5" x2="19" y2="19" />
                            </svg>{" "}
                          </span>{" "}
                        </div>{" "}
                        <p className="mv-label">
                          Debt asset:{" "}
                          <button
                            type="button"
                            className="mv-max"
                            title="Use full borrowing"
                            onClick={() =>
                              setFlipDebt(
                                String(Math.floor(debtHold * 100) / 100),
                              )
                            }
                          >
                            (max ${fmtUsd(debtHold)})
                          </button>{" "}
                        </p>{" "}
                        <div className="mv-box">
                          {" "}
                          <input
                            className="mv-amt"
                            value={flipDebt}
                            onChange={(e) =>
                              setFlipDebt(onlyNum(e.target.value))
                            }
                            inputMode="decimal"
                            disabled={debtHold <= 0.01}
                            placeholder={debtHold <= 0.01 ? "—" : "0"}
                            aria-label="Debt amount in USD"
                          />{" "}
                          <span className="mv-locked">
                            {" "}
                            <TokenIcon symbol={debtAsset} size={22} />{" "}
                            <b>{debtAsset}</b>{" "}
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <line x1="5" y1="5" x2="19" y2="19" />
                            </svg>{" "}
                          </span>{" "}
                        </div>{" "}
                        <div className="mv-stats">
                          {" "}
                          <div>
                            <span>Collateral balance:</span>
                            <b>${fmtUsd(collHold)}</b>
                          </div>{" "}
                          <div>
                            <span>Debt balance:</span>
                            <b>${fmtUsd(debtHold)}</b>
                          </div>{" "}
                          <div>
                            <span>Safety ratio:</span>
                            <b>
                              {borrowing > 0
                                ? `${Math.round((supplying / borrowing) * 100)}%`
                                : "—"}
                            </b>
                          </div>{" "}
                          <div>
                            <span>Net APY:</span>
                            <b>{net.toFixed(2)}%</b>
                          </div>{" "}
                        </div>{" "}
                      </>
                    ) : (
                      <>
                        {" "}
                    <p className="mv-label">
                      From {moveModal} asset:{" "}
                      <button
                        type="button"
                        className="mv-max"
                        title="Use full holding"
                        onClick={() =>
                          setMoveAmount(
                            String(Math.floor(holdingUsd * 100) / 100),
                          )
                        }
                      >
                        (max ${fmtUsd(holdingUsd)})
                      </button>{" "}
                    </p>{" "}
                    <div className="mv-box">
                      {" "}
                      <input
                        className="mv-amt"
                        value={moveAmount}
                        onChange={(e) =>
                          setMoveAmount(onlyNum(e.target.value))
                        }
                        inputMode="decimal"
                        disabled={holdingUsd <= 0.01}
                        placeholder={holdingUsd <= 0.01 ? "—" : "0"}
                        aria-label="Switch amount in USD"
                      />{" "}
                      {holdingUsd <= 0.01 ? (
                        moveModal === "collateral" ? (
                          <div className="mv-cell">
                            {" "}
                            <EmptyToken
                              label="Supply"
                              tip="No supplied collateral to switch."
                            />{" "}
                          </div>
                        ) : (
                          <span className="mv-locked">
                            {" "}
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <line x1="5" y1="5" x2="19" y2="19" />
                            </svg>{" "}
                            <small>Pay back</small>{" "}
                          </span>
                        )
                      ) : heldCodes.length <= 1 ? (
                        <span className="mv-locked">
                          {" "}
                          <TokenIcon symbol={fromCode} size={22} />{" "}
                          <b>{fromCode}</b>{" "}
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <line x1="5" y1="5" x2="19" y2="19" />
                          </svg>{" "}
                        </span>
                      ) : (
                        <div className="mv-cell">
                          {" "}
                          <AssetSelect
                            value={
                              heldCodes.includes(fromCode)
                                ? fromCode
                                : heldCodes[0]
                            }
                            onChange={setSwFrom}
                            options={heldCodes}
                            label="Switch from"
                            role={
                              moveModal === "collateral"
                                ? "Supply"
                                : "Pay back"
                            }
                          />{" "}
                        </div>
                      )}{" "}
                    </div>{" "}
                    <p className="mv-label">To {moveModal} asset:</p>{" "}
                    <div className="mv-box">
                      {" "}
                      <span className="mv-est">
                        {usd > 0
                          ? estTokens.toLocaleString("en-US", {
                              maximumFractionDigits: 4,
                            })
                          : "0"}
                      </span>{" "}
                      <div className="mv-cell">
                        {" "}
                        <AssetSelect
                          value={moveTo}
                          onChange={(c) => {
                            setMoveTo(c);
                            setMoveQuote(null);
                            setMoveError(null);
                          }}
                          options={assetCodes.filter((c) => c !== fromCode)}
                          label="Switch into"
                          role={moveModal === "collateral" ? "Supply" : "Borrow"}
                        />{" "}
                      </div>{" "}
                    </div>{" "}
                    {usd > 0 && (
                      <p className="mv-min">
                        Min. receive ≈{" "}
                        {minRecv.toLocaleString("en-US", {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {moveTo} ({(slipBps / 100).toFixed(2)}% slippage)
                      </p>
                    )}{" "}
                    <div className="mv-stats">
                      {" "}
                      <div>
                        <span>
                          {moveModal === "collateral" ? "Collateral" : "Debt"}{" "}
                          balance:
                        </span>
                        <b>${fmtUsd(holdingUsd)}</b>
                      </div>{" "}
                      <div>
                        <span>Safety ratio:</span>
                        <b>
                          {borrowing > 0
                            ? `${Math.round((supplying / borrowing) * 100)}%`
                            : "—"}
                        </b>
                      </div>{" "}
                      <div>
                        <span>Net APY:</span>
                        <b>{net.toFixed(2)}%</b>
                      </div>{" "}
                    </div>{" "}
                      </>
                    )}{" "}
                  </div>{" "}
                  <div className="mv-right">
                    {" "}
                    <p className="mv-label">
                      Slippage limit and liquidity sources
                    </p>{" "}
                    <div className="mv-rowline">
                      {" "}
                      <span>Swap route:</span>{" "}
                      <XRouteSelect value={swRoute} onChange={setSwRoute} />{" "}
                    </div>{" "}
                    <p className="mv-label">
                      Limit additional price slippage:
                    </p>{" "}
                    <div className="mv-pills">
                      {" "}
                      {(["0.05", "0.2", "0.5", "custom"] as const).map(
                        (s) => (
                          <button
                            key={s}
                            type="button"
                            className={`mv-pill${swSlip === s ? " active" : ""}`}
                            onClick={() => setSwSlip(s)}
                          >
                            {s === "custom" ? "Custom" : `${s}%`}
                          </button>
                        ),
                      )}{" "}
                    </div>{" "}
                    {swSlip === "custom" && (
                      <input
                        className="mv-addr"
                        value={swCustom}
                        onChange={(e) =>
                          setSwCustom(e.target.value.replace(/[^0-9.]/g, ""))
                        }
                        inputMode="decimal"
                        placeholder="Custom slippage %"
                        aria-label="Custom slippage percent"
                      />
                    )}{" "}
                    <p className="mv-info">
                      {" "}
                      ⓘ Swapping with: {routeLabel(swRoute)}{" "}
                    </p>{" "}
                    <p className="mv-info">
                      Slippage guard: {(slipBps / 100).toFixed(2)}% worst case on the swap leg
                    </p>{" "}
                    {!moveQuote && note && (
                      <p className="mv-note" role="alert">
                        {note}
                      </p>
                    )}{" "}
                    {moveSteps.length > 0 && <TxSteps steps={moveSteps} />}
                    {moveDone && (
                      <p className="qm-done" role="status">
                        Done — confirmed on-chain.
                      </p>
                    )}
                    <button
                      type="button"
                      className={`btn primary mv-go${hoverKey === "move-confirm" && needsSmart ? " armed" : ""}`}
                      disabled={!canDo || moveRunning || moveModal === "flip"}
                      title={moveModal === "flip" ? "Flip is not executable yet" : undefined}
                      onClick={gated("move-confirm", execMove)}
                      {...hoverProps("move-confirm")}
                    >
                      {gateLabel(
                        hoverKey === "move-confirm" && needsSmart,
                        <>
                          {" "}
                          {moveModal === "flip" ? "Flip" : "Switch"}{" "}
                        </>,
                        gateWord,
                      )}
                    </button>{" "}
                  </div>{" "}
                </div>
              );
            })()}{" "}
          </div>{" "}
        </div>
      )}{" "}
      <div className="pf-card proto-assets">
        {" "}
        <div className="proto-assets-head">
          {" "}
          <small className="proto-kicker">ASSETS</small>{" "}
          <div className="tabs" role="tablist" aria-label="Asset filter">
            {" "}
            {(["all", "used", "owned"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={assetFilter === f}
                className={`tab${assetFilter === f ? " active" : ""}`}
                onClick={() => setAssetFilter(f)}
              >
                {" "}
                {f === "all" ? "All" : f === "used" ? "Used" : "Owned"}{" "}
              </button>
            ))}{" "}
          </div>{" "}
          <span className="proto-count">{`${shownAssets.length} assets · ${feed}`}</span>{" "}
        </div>{" "}
        {shownAssets.length === 0 ? (
          <p className="pf-empty">
            {feed === "live"
              ? "No assets match this filter."
              : feed === "error"
                ? "Market feed unreachable — check connection and retry."
                : (
                  <span className="load-row">
                    <LoadingMark size={14} /> Loading live markets…
                  </span>
                )}
          </p>
        ) : (
          <>
            {" "}
            <div className="proto-tablewrap">
              {" "}
              <div className="proto-thead">
                <span>Asset</span>
                <span>Your supply</span>
                <span>Supp. APY</span>
                <span>Coll. Fac.</span>
                <span>Liq. Fac.</span>
                <span>Your borrow</span>
                <span>Borr. APY</span>
                <span>Market Info</span>
              </div>{" "}
              {orderedAssets.map((a) => {
                const mine = liveLegs.find((l) => l.code === a.code);
                const isColl = a.code === collAsset;
                const isDebt = a.code === debtAsset;
                const isAffected =
                  affectedCodes.length > 0 &&
                  (isColl || isDebt);
                const mineSup =
                  mine != null && mine.suppliedUsd > 0.01
                    ? mine.suppliedUsd
                    : null;
                const mineBor =
                  mine != null && mine.borrowedUsd > 0.01
                    ? mine.borrowedUsd
                    : null;
                const supplyCell = !hasWallet
                  ? "Connect"
                  : mineSup != null
                    ? `$${fmtNum(mineSup)}`
                    : "—";
                const borrowCell = !hasWallet
                  ? "Connect"
                  : mineBor != null
                    ? `$${fmtNum(mineBor)}`
                    : "—";
                const supplyApyCell = a.apyUnknown
                  ? "—"
                  : `${a.supplyApy.toFixed(2)}%`;
                const borrowApyCell =
                  a.apyUnknown || a.borrowApy == null
                    ? "—"
                    : `${a.borrowApy.toFixed(2)}%`;
                const normalRow = (
                  <div className="proto-trow">
                    {" "}
                    <span className="dv-asset">
                      <TokenIcon symbol={a.code} size={22} /> {a.code}
                    </span>{" "}
                    <span
                      className={mineSup != null ? "mine-supply" : undefined}
                    >
                      {supplyCell}
                    </span>{" "}
                    <span>{supplyApyCell}</span>{" "}
                    <span>
                      {a.ltv != null
                        ? `${(a.ltv * 100).toFixed(2)}%`
                        : `${(spec.ltvBps / 100).toFixed(0)}%`}
                    </span>{" "}
                    <span>{`${(spec.liqBps / 100).toFixed(0)}%`}</span>{" "}
                    <span
                      className={mineBor != null ? "mine-borrow" : undefined}
                    >
                      {borrowCell}
                    </span>{" "}
                    <span>{borrowApyCell}</span>{" "}
                    <span className="proto-market mi-cell">
                      <span>
                        {a.size != null
                          ? `M.Size $${fmtNum(a.size)}`
                          : "—"}
                        {a.liq != null
                          ? ` Util. ${a.size ? Math.min(99, Math.round(((a.size - a.liq) / a.size) * 100)) : 0}%`
                          : ""}
                      </span>{" "}
                      <button
                        type="button"
                        className="mi-icon"
                        aria-label={`${a.code} market details`}
                        onMouseEnter={(e) => miShow(a.code, e.currentTarget)}
                        onMouseLeave={miHideSoon}
                        onFocus={(e) => miShow(a.code, e.currentTarget)}
                        onBlur={miHideSoon}
                        onClick={(e) =>
                          miOpen === a.code
                            ? setMiOpen(null)
                            : miShow(a.code, e.currentTarget)
                        }
                      >
                        {" "}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <line x1="4" y1="7" x2="20" y2="7" />
                          <line x1="4" y1="12" x2="20" y2="12" />
                          <line x1="4" y1="17" x2="20" y2="17" />
                        </svg>{" "}
                      </button>
                    </span>{" "}
                  </div>
                );
                if (!isAffected) {
                  return (
                    <div key={a.code} style={{ display: "contents" }}>
                      {normalRow}
                    </div>
                  );
                }
                const after = prevAsset(a.code);
                return (
                  <div className="proto-trow-group" key={a.code}>
                    {normalRow}
                    <div className="proto-trow after">
                      {" "}
                      <span className="after-tint after-label">
                        <Tip tip="Projected values if this action is executed — not applied yet.">
                          <span className="after-label-inner">
                            After{" "}
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <line x1="12" y1="11" x2="12" y2="16" />
                              <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                            </svg>
                          </span>
                        </Tip>
                      </span>{" "}
                      {isColl
                        ? (() => {
                            const q = qtyLine(after.s, a.code);
                            return (
                              <span className="after-tint after-supply">
                                <b>{q.big}</b>
                                <small className="after-delta">
                                  {q.small}
                                </small>
                              </span>
                            );
                          })()
                        : (
                        <span
                          className={
                            mineSup != null ? "mine-supply" : undefined
                          }
                        >
                          {supplyCell}
                        </span>
                      )}{" "}
                      <span className="after-tint">{supplyApyCell}</span>{" "}
                      <span />
                      <span />
                      {isDebt
                        ? (() => {
                            const q = qtyLine(after.d, a.code);
                            return (
                              <span className="after-tint after-borrow">
                                <b>{q.big}</b>
                                <small className="after-delta">
                                  {q.small}
                                </small>
                              </span>
                            );
                          })()
                        : (
                        <span
                          className={
                            mineBor != null ? "mine-borrow" : undefined
                          }
                        >
                          {borrowCell}
                        </span>
                      )}{" "}
                      <span className="after-tint">{borrowApyCell}</span>{" "}
                      <span />
                      {" "}
                    </div>
                  </div>
                );
              })}{" "}
            </div>{" "}
            {miRow && miStyle && (
              <div
                className="mi-pop"
                style={miStyle}
                role="dialog"
                aria-label={`${miRow.collateral} market details`}
                onMouseEnter={miKeep}
                onMouseLeave={miHideSoon}
              >
                {" "}
                <div className="mi-pop-head">
                  <TokenIcon symbol={miRow.collateral} size={20} />{" "}
                  {miRow.collateral}{" "}
                  <small>{miRow.protocolLabel}</small>{" "}
                </div>{" "}
                {(() => {
                  const size = miRow.marketSizeUsd;
                  const liq = miRow.withdrawableUsd;
                  const borrowed =
                    size != null && liq != null ? size - liq : null;
                  const util =
                    size != null && size > 0 && liq != null
                      ? Math.max(0, Math.min(1, (size - liq) / size))
                      : null;
                  return (
                    <>
                      {" "}
                      <div className="mi-kv">
                        <span>Market size</span>
                        <b>{size != null ? fmtCompactUsd(size) : "—"}</b>
                      </div>{" "}
                      <div className="mi-kv">
                        <span>Total borrowed</span>
                        <b>
                          {borrowed != null ? fmtCompactUsd(borrowed) : "—"}
                        </b>
                      </div>{" "}
                      <div className="mi-kv">
                        <span>Available liquidity</span>
                        <b>{liq != null ? fmtCompactUsd(liq) : "—"}</b>
                      </div>{" "}
                      <div className="mi-ring-row">
                        <span>Utilized supply</span> <UtilRing frac={util ?? 0} />{" "}
                        <b>{util != null ? `${(util * 100).toFixed(2)}%` : "—"}</b>{" "}
                      </div>{" "}
                      <div className="mi-kv">
                        <span>Supply APY</span>
                        <b>
                          {miRow.apyUnknown
                            ? "—"
                            : `${miRow.supplyApy.toFixed(2)}%`}
                        </b>
                      </div>{" "}
                      <div className="mi-kv">
                        <span>Borrow APY</span>
                        <b>
                          {miBorrowApy == null
                            ? "—"
                            : `${miBorrowApy.toFixed(2)}%`}
                        </b>
                      </div>{" "}
                      <div className="mi-kv">
                        <span>Coll. factor</span>
                        <b>
                          {`${(((miPairRow?.ltv ?? miRow.ltv ?? spec.ltvBps / 10000)) * 100).toFixed(2)}%`}
                        </b>
                      </div>{" "}
                      <div className="mi-kv">
                        <span>Max leverage</span>
                        <b>{miPairRow?.maxLev ?? miRow.maxLev}</b>
                      </div>{" "}
                      {miRow.borrowPaused && (
                        <p className="mi-warn">
                          Borrowing paused — supply and withdraw stay open.
                        </p>
                      )}{" "}
                    </>
                  );
                })()}{" "}
              </div>
            )}{" "}
          </>
        )}{" "}
      </div>{" "}
    </div>
  );
}
type MarketCat = "leverage" | "yield" | "passive";
type MarketRow = {
  collateral: string;
  debt: string | null;
  supplyApy: number;
  borrowApy: number | null;
  maxLev: string;
  ltv: number | null;
  marketSizeUsd: number | null;
  withdrawableUsd: number | null;
  protocol: "blend" | "xoxno";
  protocolLabel: string;
  pool: string;
  poolName: string;
  poolSupplied: number | null;
  poolBorrowed: number | null;
  /** On-chain pool status (Blend): 0-1 active, 2-3 on-ice, 4-5 frozen, 6 setup. */
  poolStatus?: number | null;
  cats: MarketCat[];
  available: boolean;
  apyUnknown?: boolean;
  borrowPaused?: boolean;
};
/** Custom dark tooltip (hover/focus). */ function Tip({
  tip,
  children,
}: {
  tip: React.ReactNode;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="tip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {" "}
      {children} {show && <span className="tip-bubble">{tip}</span>}{" "}
    </span>
  );
}
const DV_CATS = [
  { id: "browse", label: "Browse All" },
  { id: "leverage", label: "Leveraged Borrowing" },
  { id: "yield", label: "Yield Farming" },
  { id: "passive", label: "Passive Yield" },
] as const;
type DvCat = (typeof DV_CATS)[number]["id"];
/** Multi-select token dropdown: search + checkboxes + logos, caret pinned right. */ function TokenMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (updater: (prev: string[]) => string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const shown = options.filter((o) =>
    o.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const title =
    selected.length === 0
      ? `All ${label} tokens`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} tokens`;
  function toggle(code: string) {
    onChange((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code],
    );
  }
  return (
    <div className="dv-select" ref={ref}>
      {" "}
      <button
        type="button"
        className="dv-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {" "}
        <span>{title}</span>{" "}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && (
        <div className="dv-drop" role="listbox" aria-label={label}>
          {" "}
          <div className="dv-search">
            {" "}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>{" "}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label} tokens…`}
              aria-label={`Search ${label} tokens`}
            />{" "}
          </div>{" "}
          <div className="dv-options">
            {" "}
            {shown.map((code) => {
              const checked = selected.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className="dv-option"
                  onClick={() => toggle(code)}
                >
                  {" "}
                  <TokenIcon symbol={code} size={20} /> <span>{code}</span>{" "}
                  <span
                    className={`dv-check${checked ? " on" : ""}`}
                    aria-hidden="true"
                  >
                    {" "}
                    {checked && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}{" "}
                  </span>{" "}
                </button>
              );
            })}{" "}
            {shown.length === 0 && (
              <p className="dv-noopt">No tokens match “{q}”.</p>
            )}{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
/** Single-select protocol dropdown with logos. */ function ProtocolSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="dv-select" ref={ref}>
      {" "}
      <button
        type="button"
        className="dv-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {" "}
        <span>{value === "all" ? "All protocols" : value}</span>{" "}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && (
        <div className="dv-drop" role="listbox" aria-label="Protocols">
          {" "}
          <div className="dv-options">
            {" "}
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className="dv-option"
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              {" "}
              <span>All protocols</span>{" "}
              <span
                className={`dv-check${value === "all" ? " on" : ""}`}
                aria-hidden="true"
              />{" "}
            </button>{" "}
            {options.map((p) => (
              <button
                key={p}
                type="button"
                role="option"
                aria-selected={value === p}
                className="dv-option"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
              >
                {" "}
                <ProtoIcon
                  protocol={
                    PROTOCOL_META[p.toLowerCase()]?.view ?? p.toLowerCase()
                  }
                />{" "}
                <span>{p}</span>{" "}
                <span
                  className={`dv-check${value === p ? " on" : ""}`}
                  aria-hidden="true"
                />{" "}
              </button>
            ))}{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
/* Protocol/market picker with icons (native selects can't render them).
   Same dv-* dropdown language as AssetSelect/XRouteSelect. */
function ProtoPick({
  value,
  options,
  onChange,
  label,
  placeholder,
  disabled,
  emptyText,
  emptyLoading,
}: {
  value: string | null;
  options: { key: string; label: string; sub?: string; icon: string }[];
  onChange: (k: string) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
  emptyText?: string;
  emptyLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.sub ?? "").toLowerCase().includes(q),
      )
    : options;
  const picked = options.find((o) => o.key === value) ?? null;
  return (
    <div className="dv-select mv-pick" ref={ref}>
      {" "}
      <button
        type="button"
        className="mv-pickbtn"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setQuery("");
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
      >
        {" "}
        {picked ? <ProtoIcon protocol={picked.icon} size={20} /> : null}{" "}
        <span className={picked ? "mv-pickname" : "mv-pickplaceholder"}>
          {picked ? picked.label : placeholder}
        </span>{" "}
        {picked?.sub ? <span className="mv-picksub">{picked.sub}</span> : null}{" "}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && !disabled && (
        <div className="dv-drop" role="listbox" aria-label={label}>
          {" "}
          <div className="dv-search">
            {" "}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label}`}
            />{" "}
          </div>{" "}
          <div className="dv-options">
            {" "}
            {shown.length === 0 && (
              <p className="mv-note" style={{ padding: "8px 10px", textAlign: "center" }}>
                {emptyLoading ? (
                  <span className="load-row" style={{ display: "flex", justifyContent: "center" }}>
                    <LoadingMark size={14} /> {emptyText ?? "Loading…"}
                  </span>
                ) : (
                  (emptyText ?? "No matches.")
                )}
              </p>
            )}{" "}
            {shown.map((o) => (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={value === o.key}
                className={`dv-option${value === o.key ? " selected" : ""}`}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
              >
                {" "}
                <ProtoIcon protocol={o.icon} size={20} /> <span>{o.label}</span>{" "}
                {o.sub ? <span className="mv-picksub">{o.sub}</span> : null}{" "}
                {value === o.key && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ marginLeft: "auto" }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}{" "}
              </button>
            ))}{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
/* Unavailable-asset slot: the reference ∅ mark for legs with no asset. */
function NoAsset({ label }: { label: string }) {
  return (
    <span className="mv-locked" title={label} aria-label={label}>
      {" "}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="5" y1="5" x2="19" y2="19" />
      </svg>{" "}
      <small>—</small>{" "}
    </span>
  );
}
/* ---------------- Markets sections: hero cards ---------------------------
   Lend & Borrow / Pools / Vaults are the new Markets sections; their pages
   are deliberately blank apart from an Opportunities-style card (the
   `dc-hero` + `dc-pulse` pattern from components/earn-feed.tsx), and
   Refinance reuses the same hero. */
type SectionCell = { label: string; value: string; small?: string };

function SectionHero({
  title,
  blurb,
  cells,
}: {
  title: string;
  blurb: string;
  cells: SectionCell[];
}) {
  return (
    <header className="dc-hero mh-hero">
      {" "}
      <div>
        {" "}
        <h1>{title}</h1>{" "}
        <p>{blurb}</p>{" "}
      </div>{" "}
      <div className="dc-pulse">
        {" "}
        {cells.map((c) => (
          <div key={c.label}>
            {" "}
            <span>{c.label}</span>{" "}
            <b>{c.value}</b>{" "}
            {c.small ? <small>{c.small}</small> : null}{" "}
          </div>
        ))}{" "}
      </div>{" "}
    </header>
  );
}

const CATEGORY_META: Record<
  "lend-borrow" | "pools",
  { title: string; blurb: string; cells: SectionCell[] }
> = {
  "lend-borrow": {
    title: "Lend & Borrow",
    blurb:
      "Supply assets, borrow against them and manage every position across Stellar's lending markets — each action settles in one signature from your Smart Account.",
    cells: [
      { label: "Lending markets", value: "Blend V2 · XOXNO" },
      { label: "Opening a position", value: "One signature" },
      {
        label: "Price feeds",
        value: "On-chain oracles",
        small: "Reflector · dual-oracle guard",
      },
      {
        label: "Automation",
        value: "Built in",
        small: "Guard-bounded keeper, live",
      },
    ],
  },
  pools: {
    title: "Pools",
    blurb:
      "Provide liquidity to Stellar's AMMs and track depth, volume and swap fees across venues in one board.",
    cells: [
      {
        label: "Venues",
        value: "4 AMMs",
        small: "Soroswap · Aqua · Phoenix · Sushi",
      },
      {
        label: "Routing",
        value: "Best price",
        small: "Quoted per swap across venues",
      },
      {
        label: "Depth",
        value: "Live reserves",
        small: "Read straight from the pools",
      },
      {
        label: "Your LP positions",
        value: "Tracked",
        small: "Every pool, every wallet you own",
      },
    ],
  },
};

function MarketsSection({ kind }: { kind: "vaults" }) {
  if (kind === "vaults") {
    return (
      <div className="dc">
        <VaultsHub />
      </div>
    );
  }
}

/* ------------------------------ Refinance -------------------------------
   Full cross-protocol moves: withdraw + repay legs close the source
   position, supply + borrow legs open it on the target, all in one
   unsigned executor intent for wallet signing. */
/* Refinance: lending positions (whole-position moves, below), vault
   deposits and liquidity positions (components/refinance-moves.tsx).
   ?kind=vaults|pools picks the mode. */
function RefinanceView() {
  const [kind, setKind] = useState<"lending" | "vaults" | "pools">("lending");
  useEffect(() => {
    try {
      const k = new URLSearchParams(window.location.search).get("kind");
      if (k === "vaults" || k === "pools") setKind(k);
    } catch {
      /* SSR */
    }
  }, []);
  function pick(k: "lending" | "vaults" | "pools") {
    setKind(k);
    try {
      const url = new URL(window.location.href);
      if (k === "lending") url.searchParams.delete("kind");
      else url.searchParams.set("kind", k);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
  }
  return (
    <>
      <div className="tabs rf-kinds" role="tablist" aria-label="What to refinance">
        {(
          [
            ["lending", "Lending"],
            ["vaults", "Vaults"],
            ["pools", "Pools"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`tab${kind === k ? " active" : ""}`} onClick={() => pick(k)}>
            {label}
          </button>
        ))}
      </div>
      {kind === "lending" ? (
        <RefinanceLending />
      ) : (
        <div className="proto-board">
          <SectionHero
            title={kind === "vaults" ? "Move vault deposits" : "Move liquidity"}
            blurb={
              kind === "vaults"
                ? "Shift a deposit to a vault with a better rate — across DeFindex and Upshift, swapping the asset when the target vault takes a different one."
                : "Shift liquidity between Soroswap, Aqua and Phoenix pools — Seidar removes it, swaps into the target pair, balances both sides by value and adds it."
            }
            cells={[
              { label: "Scope", value: "Any share", small: "25% to all of it" },
              { label: "Signatures", value: "One per step", small: "Each confirmed before the next" },
              { label: "Amounts", value: "As received", small: "Read on-chain after each step" },
              { label: "Safety", value: "Funds stay put", small: "In your smart account between steps" },
            ]}
          />
          <div className="pf-card rm-card-host">{kind === "vaults" ? <VaultMove /> : <PoolMove />}</div>
        </div>
      )}
    </>
  );
}

function RefinanceLending() {
  const owner = useWalletAddress();
  const active = useTxActive(owner) ?? owner;
  /* Same smart-gate as the board, keyed off the ACTIVE account: quoting
     needs a smart account transacting, so the gate is on whenever the
     active account is not one of the wallet's smarts. Hovering previews
     the way forward (Switch/Create morph); clicking opens the chooser
     modal (switch list/dropdown, or create). */
  const { smarts: refSmarts, loaded: refSmartsLoaded } =
    useShellSmarts(owner);
  const [refGateOpen, setRefGateOpen] = useState(false);
  const [refHover, setRefHover] = useState(false);
  const refIsSmart = isSmartAddress(active);
  void refSmartsLoaded;
  const refNeedsSmart = !!owner && !refIsSmart;
  const refHasSmarts = refSmarts.length > 0;
  const refGateWord = refHasSmarts ? "Switch" : "Create";
  function refPick(addr: string) {
    setRefGateOpen(false);
    window.dispatchEvent(
      new CustomEvent("seidar:set-active-account", { detail: addr }),
    );
  }
  const { data } = useWalletPositions(active);
  const legs = useMemo(() => data?.legs ?? [], [data]);
  const codes = useMemo(
    () => Array.from(new Set(legs.map((l) => l.code))),
    [legs],
  );
  const { prices } = useTokenPrices(codes);
  const px = (code: string): number => {
    const p = prices[code.toUpperCase()];
    if (typeof p === "number" && p > 0) return p;
    if (STABLES.has(code.toUpperCase())) return 1;
    return 1;
  };
  type Proto = "blend" | "xoxno";
  interface PoolRowLite {
    protocol: Proto;
    pool: string;
    poolName: string;
    collateral: string;
    debt: string | null;
    ltv: number | null;
    supplyApy: number;
    borrowApy: number | null;
    withdrawableUsd: number | null;
    borrowPaused?: boolean;
    apyUnknown?: boolean;
  }
  /* From entries come from LIVE legs only — one entry per protocol that
     actually holds supplied or borrowed value. Token amounts come from
     the legs' own human units (supplyAmount/borrowAmount), never
     reverse-engineered through prices. */
  const fromEntries = useMemo(
    () =>
      (["blend", "xoxno"] as const)
        .map((p) => {
          const pls = legs.filter((l) => l.protocol === p);
          const sup = pls.reduce((a, l) => a + l.suppliedUsd, 0);
          const bor = pls.reduce((a, l) => a + l.borrowedUsd, 0);
          const supTok = pls.reduce((a, l) => a + (l.supplyAmount ?? 0), 0);
          const borTok = pls.reduce((a, l) => a + (l.borrowAmount ?? 0), 0);
          const coll =
            [...pls].sort((a, b) => b.suppliedUsd - a.suppliedUsd)[0]?.code ??
            "XLM";
          const debt =
            [...pls].sort((a, b) => b.borrowedUsd - a.borrowedUsd)[0]?.code ??
            "USDC";
          return { key: p, sup, bor, supTok, borTok, coll, debt, has: sup > 0.01 || bor > 0.01 };
        })
        .filter((e) => e.has),
    [legs],
  );
  /* Live target markets from /api/pools (server-cached 10 min): real
     pool/hub/vault identities, per-pair LTV, APYs, borrowable
     liquidity and paused flags. This fetch is the loader's real work. */
  const [poolRows, setPoolRows] = useState<PoolRowLite[] | null>(null);
  const [poolsError, setPoolsError] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    function load() {
      apiFetch("/api/pools", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (d?.ok && Array.isArray(d.rows)) {
            setPoolRows(d.rows as PoolRowLite[]);
            setPoolsError(null);
          } else setPoolsError("Market feed unreachable — check connection and retry.");
        })
        .catch(() => {
          if (!dead) setPoolsError("Market feed unreachable — check connection and retry.");
        });
    }
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      dead = true;
      window.removeEventListener("seidar:refresh", load);
    };
  }, []);
  const [fromKey, setFromKey] = useState<Proto | null>(null);
  const [toKey, setToKey] = useState<Proto | null>(null);
  const [collCode, setCollCode] = useState("XLM");
  const [debtCode, setDebtCode] = useState("USDC");
  const [collAmt, setCollAmt] = useState("");
  const [debtAmt, setDebtAmt] = useState("");
  /* Swaps are automatic: route = all venues, 0.2% slippage guard. No
     picker UI — defaults ride in the intent (route [], slippageBps 20). */
  const route: RouteChoice = [];
  const slipBpsDefault = 20;
  const [quote, setQuote] = useState<null | {
    steps: string[];
    warnings: string[];
    healthBps: number | null;
    intent: unknown;
    slipBps: number;
    pool: string;
    poolName: string;
    supplyApy: number | null;
    borrowApy: number | null;
    fromUsd: { coll: number; debt: number; limit: number; health: number | null };
    toUsd: { coll: number; debt: number; limit: number; fee: number };
    collTok: number;
    debtTok: number;
    toColl: string;
    toDebt: string | null;
    toCollTok: number;
    toDebtTok: number;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copiedMove, setCopiedMove] = useState(false);
  const [done, setDone] = useState<null | {
    fromKey: Proto;
    toKey: Proto;
    poolName: string;
    collTok: number;
    collCode: string;
    debtTok: number;
    debtCode: string;
    toColl: string;
    toDebt: string | null;
    intent: unknown;
  }>(null);
  const fromEntry = fromEntries.find((e) => e.key === fromKey) ?? null;
  /* Live per-protocol risk facts (LTV-weighted effective collateral,
     health factor ratio) straight from /api/positions. */
  const perProto = fromKey ? data?.perProtocol?.[fromKey] ?? null : null;
  /* Target market picker: every live pool/hub/vault across all
     protocols in one list (Blend pools, XOXNO hubs).
     The pair row inside the chosen market carries its own LTV, APYs,
     borrowable liquidity and paused flag. */
  const [toPool, setToPool] = useState<string | null>(null);
  const toPools = useMemo(() => {
    if (!poolRows) return [];
    const seen = new Map<string, { poolName: string; protocol: Proto; colls: Set<string>; debts: Set<string> }>();
    for (const r of poolRows) {
      if (!seen.has(r.pool)) seen.set(r.pool, { poolName: r.poolName, protocol: r.protocol, colls: new Set(), debts: new Set() });
      const m = seen.get(r.pool)!;
      m.colls.add(r.collateral);
      if (r.debt != null) {
        m.colls.add(r.collateral);
        m.debts.add(r.debt);
      }
    }
    const nameCount = new Map<string, number>();
    for (const m of seen.values()) nameCount.set(m.poolName, (nameCount.get(m.poolName) ?? 0) + 1);
    return [...seen].map(([pool, m]) => ({
      pool,
      // On-chain names repeat across distinct pools — disambiguate those.
      poolName: (nameCount.get(m.poolName) ?? 0) > 1 ? `${m.poolName} · ${pool.slice(0, 4)}…` : m.poolName,
      protocol: m.protocol,
      collaterals: [...m.colls],
      debts: [...m.debts],
    }));
  }, [poolRows]);
  /* Target pair, chosen inside the picked market. Defaults track the
     source assets when the market lists them; changing them adds real
     swap legs to the recipe (see computeMove). */
  const [toCollCode, setToCollCode] = useState<string | null>(null);
  const [toDebtCode, setToDebtCode] = useState<string | null>(null);
  function pickMarket(pool: string | null) {
    setToPool(pool);
    const row = toPools.find((m) => m.pool === pool);
    setToKey(row ? row.protocol : null);
    // Default the target pair to the source assets when the market
    // lists them, else its first listed assets. Changing them later
    // adds swap legs instead of failing.
    if (row) {
      setToCollCode(row.collaterals.includes(collCode) ? collCode : (row.collaterals[0] ?? null));
      const wantDebt = debtCode;
      setToDebtCode(
        (Number(debtAmt) || 0) > 0
          ? row.debts.includes(wantDebt)
            ? wantDebt
            : (row.debts[0] ?? null)
          : null,
      );
    } else {
      setToCollCode(null);
      setToDebtCode(null);
    }
    setQuote(null);
    setError(null);
    setDone(null);
  }
  function fmtTok(n: number) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 7 });
  }
  /* Selecting a source prefills both legs at max — the DeFi Saver
     shifter behavior. Users can only move less, never more. */
  function pickFrom(k: Proto | null) {
    setFromKey(k);
    setQuote(null);
    setError(null);
    setDone(null);
    if (!k) {
      setCollAmt("");
      setDebtAmt("");
      return;
    }
    const e = fromEntries.find((x) => x.key === k);
    if (!e) return;
    setCollCode(e.coll);
    setDebtCode(e.debt);
    setCollAmt(e.supTok > 0 ? String(e.supTok) : "");
    setDebtAmt(e.borTok > 0 ? String(e.borTok) : "");
    setToPool(null);
  }
  /* Pure quote over the selected pair. Amounts are human token units
     from the legs themselves; USD runs through live prices. Target
     terms (LTV, APYs, liquidity, paused flags) come from the live
     /api/pools rows for the chosen market. Throws with a human reason. */
  function computeMove() {
    if (!active) throw new Error("Connect a wallet - intents are built for the active account.");
    if (!fromEntry || !fromKey) throw new Error("Select the position to move first.");
    if (!toKey) throw new Error("Select the market to move into.");
    if (!poolRows) throw new Error("Loading live markets…");
    const collNum = Number(collAmt) || 0;
    const debtNum = Number(debtAmt) || 0;
    if (!(collNum > 0)) throw new Error("Enter a collateral amount above 0.");
    if (collNum - fromEntry.supTok > 1e-9)
      throw new Error(`Collateral exceeds the position max (${fmtTok(fromEntry.supTok)} ${collCode}).`);
    if (debtNum - fromEntry.borTok > 1e-9)
      throw new Error(`Debt exceeds the position max (${fmtTok(fromEntry.borTok)} ${debtCode}).`);
    // Target pair inside the chosen market, using the target-side asset
    // pair (which may differ from the source pair — then swap legs bridge
    // them). Supply-only moves match supply rows.
    const tColl = toCollCode ?? collCode;
    const tDebt = debtNum > 0 ? (toDebtCode ?? debtCode) : null;
    const cands = poolRows.filter(
      (r) => r.protocol === toKey && r.collateral === tColl && (tDebt != null ? r.debt === tDebt : r.debt == null),
    );
    let pairRow: PoolRowLite | undefined;
    if (toPool) {
      pairRow = cands.find((r) => r.pool === toPool);
      if (!pairRow) {
        const pname = toPools.find((p) => p.pool === toPool)?.poolName ?? "That market";
        throw new Error(`${pname} doesn't list ${tColl}${tDebt != null ? `→${tDebt}` : ""} — pick another market or pair.`);
      }
    } else {
      pairRow = [...cands].sort((a, b) => (a.borrowApy ?? 999) - (b.borrowApy ?? 999))[0];
    }
    if (!pairRow) throw new Error(`No ${PROTOCOL_META[toKey].name} market lists ${tColl}${tDebt != null ? `→${tDebt}` : ""} right now.`);
    if (pairRow.borrowPaused) throw new Error(`${pairRow.poolName} has borrowing paused (utilization at cap) — moves in are blocked, supply and withdraw stay open.`);
    const slipBps = slipBpsDefault;
    const collUsd = collNum * px(collCode);
    const debtUsd = debtNum * px(debtCode);
    const isStable = STABLES.has(collCode) && STABLES.has(debtCode);
    const feeBps = feeTierBps({ stable: isStable });
    const feeUsd = quoteFee(Math.round(collUsd * 10_000_000), feeBps) / 10_000_000;
    // Target token amounts convert through live prices (estimate).
    const toCollNum = tColl === collCode || !(px(tColl) > 0) ? collNum : (collUsd / px(tColl));
    const toDebtNum = tDebt == null || tDebt === debtCode || !(px(tDebt) > 0) ? debtNum : debtUsd / px(tDebt);
    // Executor fee lands on the debt leg (same as the reference shifter).
    const toCollUsd = toCollNum * px(tColl);
    const toDebtUsd = toDebtNum * px(tDebt ?? debtCode) + feeUsd;
    // Target borrowable liquidity must cover the incoming debt.
    if (tDebt != null && pairRow.withdrawableUsd != null && toDebtUsd - pairRow.withdrawableUsd > 0.01) {
      throw new Error(`${pairRow.poolName} holds only ${fmtUsd(pairRow.withdrawableUsd)} borrowable — move less debt or pick another market.`);
    }
    const toLtv = pairRow.ltv != null && pairRow.ltv > 0 ? pairRow.ltv : PROTOCOL_SPECS[toKey].ltvBps / 10000;
    // From side uses live LTV-weighted values when the feed served them.
    const fromLimit = perProto?.effectiveCollateral ?? (collUsd * PROTOCOL_SPECS[fromKey].ltvBps) / 10000;
    const fromHealth = perProto?.healthFactor ?? (healthBps(collUsd, debtUsd) == null ? null : (healthBps(collUsd, debtUsd) as number) / 10000);
    const toLimit = toCollUsd * toLtv;
    const h = healthBps(toCollUsd, toDebtUsd);
    if (h != null && h < 13000) {
      throw new Error(
        `Target health ${(h / 10000).toFixed(2)} is below the 1.30 minimum in ${pairRow.poolName} - move less debt.`,
      );
    }
    const recipe = new Recipe();
    const collUnits = Math.round(collNum * 10_000_000);
    const debtUnits = Math.round(debtNum * 10_000_000);
    recipe.withdraw(collCode, collUnits);
    if (tColl !== collCode) {
      const swapIdx = recipe.actions.length;
      recipe.swap(tColl, collUnits);
      recipe.supply(tColl, 0, swapIdx);
    } else {
      recipe.supply(collCode, collUnits);
    }
    if (debtUnits > 0 && tDebt != null) {
      const tDebtUnits = Math.round(toDebtNum * 10_000_000);
      if (tDebt !== debtCode) {
        const swapIdx = recipe.actions.length;
        recipe.borrow(tDebt, tDebtUnits);
        recipe.swap(debtCode, tDebtUnits, swapIdx);
        recipe.repay(debtCode, debtUnits);
      } else {
        recipe.repay(debtCode, debtUnits);
        recipe.borrow(debtCode, debtUnits);
      }
    } else if (debtUnits > 0) {
      recipe.repay(debtCode, debtUnits);
    }
    const intent = recipe.buildIntent(active);
    const swapped = tColl !== collCode || (tDebt != null && tDebt !== debtCode);
    return {
      steps: intent.actions.map((a) => a.kind),
      warnings: [
        "You approve each step in your wallet.",
        `Withdraw${debtUnits > 0 ? " + repay" : ""} closes ${PROTOCOL_META[fromKey].name}; supply${debtUnits > 0 ? " + borrow" : ""} reopens in ${pairRow.poolName} in the same executor call.`,
        ...(swapped
          ? [`Cross-asset legs convert at live prices (estimate) via automatic routing.`]
          : fromKey === toKey
            ? [`Same-protocol move rebalances across ${PROTOCOL_META[toKey].name} markets.`]
            : [`Cross-protocol move into ${PROTOCOL_META[toKey].name} market caps apply at execution.`]),
        `Swap legs (if any) route via automatic with a ${slipBps / 100}% slippage guard.`,
      ],
      healthBps: h,
      intent: {
        user: intent.user,
        actions: intent.actions,
        route,
        slippageBps: slipBps,
        fromProtocol: fromKey,
        toProtocol: toKey,
        toPool: pairRow.pool,
      },
      slipBps,
      pool: pairRow.pool,
      poolName: toPools.find((p) => p.pool === pairRow.pool)?.poolName ?? pairRow.poolName,
      supplyApy: pairRow.apyUnknown ? null : pairRow.supplyApy,
      borrowApy: pairRow.apyUnknown ? null : pairRow.borrowApy,
      fromUsd: { coll: collUsd, debt: debtUsd, limit: fromLimit, health: fromHealth },
      toUsd: { coll: toCollUsd, debt: toDebtUsd, limit: toLimit, fee: feeUsd },
      collTok: collNum,
      debtTok: debtNum,
      toColl: tColl,
      toDebt: tDebt,
      toCollTok: toCollNum,
      toDebtTok: tDebt == null ? 0 : toDebtNum + feeUsd / px(tDebt),
    };
  }
  /* Recompute on every input. The loader is real work: it stays up while
     the live market feed is in flight, plus a short debounce so typing
     doesn't thrash validation. */
  useEffect(() => {
    if (!fromKey || !toKey) {
      setQuote(null);
      setError(null);
      setQuoting(false);
      return;
    }
    if (!poolRows && !poolsError) {
      setQuoting(true);
      return;
    }
    if (poolsError && !poolRows) {
      setQuote(null);
      setError(poolsError);
      setQuoting(false);
      return;
    }
    setQuoting(true);
    let dead = false;
    const t = setTimeout(() => {
      if (dead) return;
      try {
        const q = computeMove();
        setQuote(q);
        setError(null);
      } catch (e) {
        setQuote(null);
        setError(String(e instanceof Error ? e.message : e).slice(0, 220));
      } finally {
        if (!dead) setQuoting(false);
      }
    }, 250);
    return () => {
      dead = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, toPool, toCollCode, toDebtCode, collAmt, debtAmt, collCode, debtCode, active, poolRows]);
  function buildFullQuoteGated() {
    if (!refNeedsSmart) {
      setConfirmOpen(true);
      return;
    }
    setRefHover(false);
    setRefGateOpen(true);
  }
  /* Real execution. Strategy per move:
       1. Blend -> XOXNO, same assets, full collateral: XOXNO's atomic
          migrate_from_blend (one tx, collateral + debt, approved pools).
       2. No debt: withdraw -> (swap if the asset changes) -> supply.
       3. With debt: the wallet must hold the debt amount; repay + withdraw
          on the source, supply (+ swap) and re-borrow on the target.
     Every step is a confirmed tx; nothing is recorded as done otherwise. */
  const refSigner = owner ?? active;
  const [refTokens, setRefTokens] = useState<SwapToken[]>([]);
  useEffect(() => {
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.tokens)) setRefTokens(d.tokens as SwapToken[]);
      })
      .catch(() => {});
  }, []);
  const refBals = useTokenBalances(active);
  const [moveSteps, setMoveSteps] = useState<TxStep[]>([]);
  const [moveRunning, setMoveRunning] = useState(false);
  const [moveErr, setMoveErr] = useState<string | null>(null);
  useEffect(() => {
    if (confirmOpen) {
      setMoveSteps([]);
      setMoveErr(null);
    }
  }, [confirmOpen]);
  const tokOf = (code: string) => refTokens.find((t) => t.code.toUpperCase() === code.toUpperCase()) ?? null;
  const heldFor = (proto: Proto) => (code: string, kind: "supply" | "borrow") =>
    legs
      .filter((l) => l.protocol === proto && l.code === code)
      .reduce((s, l) => s + ((kind === "supply" ? l.supplyAmount : l.borrowAmount) ?? 0), 0);
  async function runMove(onSteps: (s: TxStep[]) => void) {
    if (!quote || !fromKey || !toKey || !active || !refSigner) throw new Error("Pick a position and a target first.");
    const collNum = Number(collAmt) || 0;
    const debtNum = Number(debtAmt) || 0;
    const srcLegs = legs.filter((l) => l.protocol === fromKey);
    const srcPool = srcLegs.find((l) => l.code === collCode)?.pool ?? srcLegs.find((l) => l.pool)?.pool ?? null;
    const src: LendCtx = {
      protocol: fromKey,
      address: active,
      signer: refSigner,
      poolAddrs: srcPool ? [srcPool] : [],
      poolKey: srcPool,
      tokens: refTokens,
      held: heldFor(fromKey),
    };
    const dst: LendCtx = {
      protocol: toKey,
      address: active,
      signer: refSigner,
      poolAddrs: [quote.pool],
      poolKey: quote.pool,
      tokens: refTokens,
      held: heldFor(toKey),
    };
    const sameAssets = quote.toColl === collCode && (quote.toDebt == null || quote.toDebt === debtCode);
    const fullColl = collNum >= heldFor(fromKey)(collCode, "supply") * 0.999;
    const fullDebt = debtNum >= heldFor(fromKey)(debtCode, "borrow") * 0.999;
    // 1. Atomic Blend -> XOXNO migration.
    if (fromKey === "blend" && toKey === "xoxno" && sameAssets && fullColl && (debtNum === 0 || fullDebt) && srcPool) {
      const ct = tokOf(collCode);
      const dt = debtNum > 0 ? tokOf(debtCode) : null;
      if (!ct || (debtNum > 0 && !dt)) throw new Error("Token contracts unavailable for this pair.");
      const plan = await planFor(dst, [{ action: "supply", code: collCode, tokens: collNum }]);
      const step: TxStep = { key: "mig", label: "Move Blend position to XOXNO (one transaction)", status: "building" };
      onSteps([step]);
      const r = await apiFetch("/api/lending/migrate/blend-xoxno", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: active,
          signer: refSigner,
          blendPool: srcPool,
          collateral: [ct.contract],
          supply: [],
          debt: dt ? [{ token: dt.contract, amount: toBase(debtNum.toFixed(Math.min(dt.decimals, 9)), dt.decimals) ?? "0" }] : [],
          spokeId: plan.xoxno?.spokeId,
          hubId: plan.xoxno?.hubId,
          accountId: plan.xoxno?.accountId,
        }),
      }).then((x) => x.json());
      if (!r?.ok || !r.xdr) {
        step.status = "failed";
        step.error = r?.error ?? "Could not build the migration.";
        onSteps([step]);
        throw new Error(step.error ?? "");
      }
      try {
        const sent = await signAndSend(r.xdr, refSigner, (s) => {
          step.status = s;
          onSteps([{ ...step }]);
        });
        step.status = "done";
        step.hash = sent.hash;
        onSteps([{ ...step }]);
      } catch (e) {
        step.status = "failed";
        step.error = e instanceof Error ? e.message : String(e);
        onSteps([{ ...step }]);
        throw e;
      }
      window.dispatchEvent(new Event("seidar:refresh"));
      return;
    }
    const all: TxStep[] = [];
    const tag = (p: string) => (s: TxStep[]) => onSteps([...all, ...s.map((x) => ({ ...x, key: p + x.key }))]);
    const keep = async (p: string, fn: (cb: (s: TxStep[]) => void) => Promise<void>) => {
      let last: TxStep[] = [];
      await fn((s) => {
        last = s.map((x) => ({ ...x, key: p + x.key }));
        onSteps([...all, ...last]);
      });
      all.push(...last);
    };
    // 3. Debt: wallet funds the repay, target re-borrows.
    if (debtNum > 0) {
      const have = refBals[debtCode] ?? 0;
      if (have + 1e-9 < debtNum)
        throw new Error(
          `Moving debt needs ${fmtTok(debtNum)} ${debtCode} in the active account to repay the source first (holding ${fmtTok(have)}). Top up, move less debt, or use Blend → XOXNO with the full position (moves atomically).`,
        );
      await keep("src-", (cb) => runActs(src, [{ action: "repay", code: debtCode, tokens: debtNum }, { action: "withdraw", code: collCode, tokens: collNum }], cb));
    } else {
      // 2. Supply-only.
      await keep("src-", (cb) => runActs(src, [{ action: "withdraw", code: collCode, tokens: collNum }], cb));
    }
    let supplyTok = collNum;
    if (quote.toColl !== collCode) {
      const sellTok = tokOf(collCode);
      const buyTok = tokOf(quote.toColl);
      if (!sellTok || !buyTok) throw new Error("Token contracts unavailable for the collateral switch.");
      const sw: TxStep = { key: "swap", label: `Swap ${collCode} → ${quote.toColl}`, status: "building" };
      all.push(sw);
      onSteps([...all]);
      const r = await executeMarketSwap({
        sellTok,
        buyTok,
        amountTokens: collNum.toFixed(Math.min(sellTok.decimals, 9)),
        from: active,
        signer: refSigner,
        slippageBps: "50",
        onStatus: (m: string) => {
          sw.status = /wallet/i.test(m) ? "signing" : /Submitting/i.test(m) ? "sending" : "building";
          onSteps([...all]);
        },
      });
      sw.status = "done";
      sw.hash = r.hash;
      onSteps([...all]);
      supplyTok = (r.outTokens ?? 0) * 0.999;
      if (!(supplyTok > 0)) throw new Error("Swap returned no output.");
    }
    const dstActs: LendAct[] = [{ action: "supply", code: quote.toColl, tokens: supplyTok }];
    if (debtNum > 0 && quote.toDebt) dstActs.push({ action: "borrow", code: quote.toDebt, tokens: quote.toDebtTok });
    await runActs(dst, dstActs, tag("dst-"));
  }
  async function confirmMove() {
    if (!quote || !fromKey || !toKey || moveRunning) return;
    setMoveRunning(true);
    setMoveErr(null);
    try {
      await runMove(setMoveSteps);
      setDone({
        fromKey,
        toKey,
        poolName: quote.poolName,
        collTok: quote.collTok,
        collCode,
        debtTok: quote.debtTok,
        debtCode,
        toColl: quote.toColl,
        toDebt: quote.toDebt,
        intent: null,
      });
      setConfirmOpen(false);
      window.dispatchEvent(new Event("seidar:refresh"));
    } catch (e) {
      setMoveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMoveRunning(false);
    }
  }
  /* Display math for the before/after panel. Safety ratio is health
     expressed as a percent; borrow power used is debt over borrow limit. */
  const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const fromHealth = quote ? quote.fromUsd.health : null;
  const fromPow = quote && quote.fromUsd.limit > 0 ? (quote.fromUsd.debt / quote.fromUsd.limit) * 100 : 0;
  const toPow = quote && quote.toUsd.limit > 0 ? (quote.toUsd.debt / quote.toUsd.limit) * 100 : 0;
  const toMarket = toPool ? (toPools.find((m) => m.pool === toPool) ?? null) : null;
  /* The effective pool resolves the moment a market is picked (or a
     quote auto-resolves one). Token lists come straight from the loaded
     market rows, so there is no separate token fetch — slots spinner
     only while the market feed itself is still loading. */
  const effPool = toPool ?? quote?.pool ?? null;
  const supCodes = fromEntry
    ? Array.from(new Set(legs.filter((l) => l.protocol === fromKey && l.suppliedUsd > 0.01).map((l) => l.code)))
    : [];
  const borCodes = fromEntry
    ? Array.from(new Set(legs.filter((l) => l.protocol === fromKey && l.borrowedUsd > 0.01).map((l) => l.code)))
    : [];
  return (
    <div className="proto-board">
      {" "}
      <SectionHero
        title="Refinance"
        blurb="Move your whole position — collateral and debt together — to a pool with a cheaper rate or a healthier ratio. One quote up front, one signature to land it."
        cells={[
          {
            label: "Scope",
            value: "Whole position",
            small: "Collateral + debt move together",
          },
          { label: "Signatures", value: "One", small: "Quote first, then sign once" },
          {
            label: "Routes",
            value: "Blend ⇄ XOXNO",
            small: "Across and within protocols",
          },
          {
            label: "Health",
            value: "Live check",
            small: "Before / after on the quote",
          },
        ]}
      />{" "}
      <div className="pf-card">
        {" "}
        <div className="mv-duo">
          {" "}
          <div>
            {" "}
            <p className="mv-label">
              From position{" "}
              {fromKey && (
                <span style={{ marginLeft: 6, verticalAlign: "middle" }}>
                  <ProtoIcon protocol={fromKey} size={18} />
                </span>
              )}
            </p>{" "}
            <ProtoPick
              value={fromKey}
              label="From position"
              placeholder="Select position…"
              disabled={fromEntries.length === 0}
              emptyText="No positions found."
              options={fromEntries.map((e) => ({
                key: e.key,
                label: PROTOCOL_META[e.key].name,
                sub: `${fmtUsd(e.sup)} supplied · ${fmtUsd(e.bor)} borrowed`,
                icon: e.key,
              }))}
              onChange={(k) => pickFrom(k as "blend" | "xoxno")}
            />{" "}
            <p className="mv-label">
              Collateral:{" "}
              {fromEntry && (
                <button
                  type="button"
                  className="mv-max"
                  title="Use full holding"
                  onClick={() => setCollAmt(String(fromEntry.supTok))}
                >
                  (max {fmtTok(fromEntry.supTok)})
                </button>
              )}{" "}
            </p>{" "}
            <div className="mv-box">
              {" "}
              <input
                className="mv-amt"
                value={collAmt}
                onChange={(e) => {
                  setCollAmt(onlyNum(e.target.value));
                  setQuote(null);
                  setError(null);
                }}
                inputMode="decimal"
                aria-label="Collateral amount"
                placeholder="0"
                disabled={!fromEntry}
              />{" "}
              {!fromEntry ? (
                <NoAsset label="No collateral asset" />
              ) : supCodes.length > 1 ? (
                <div className="mv-cell">
                  {" "}
                  <AssetSelect
                    value={supCodes.includes(collCode) ? collCode : supCodes[0]}
                    onChange={(c) => {
                      setCollCode(c);
                      const leg = legs.find(
                        (l) => l.protocol === fromKey && l.code === c,
                      );
                      setCollAmt(leg && leg.supplyAmount ? String(leg.supplyAmount) : "");
                      setQuote(null);
                      setError(null);
                    }}
                    options={supCodes}
                    label="Collateral asset"
                    role="Collateral"
                  />{" "}
                </div>
              ) : (
                <span className="mv-locked">
                  {" "}
                  <TokenIcon symbol={collCode} size={22} />{" "}
                  <b>{collCode}</b>{" "}
                </span>
              )}{" "}
            </div>{" "}
            <p className="mv-label">
              Debt:{" "}
              {fromEntry && (
                <button
                  type="button"
                  className="mv-max"
                  title="Use full borrowing"
                  onClick={() => setDebtAmt(String(fromEntry.borTok))}
                >
                  (max {fmtTok(fromEntry.borTok)})
                </button>
              )}{" "}
            </p>{" "}
            <div className="mv-box">
              {" "}
              <input
                className="mv-amt"
                value={debtAmt}
                onChange={(e) => {
                  setDebtAmt(onlyNum(e.target.value));
                  setQuote(null);
                  setError(null);
                }}
                inputMode="decimal"
                aria-label="Debt amount"
                placeholder="0"
                disabled={!fromEntry}
              />{" "}
              {!fromEntry ? (
                <NoAsset label="No debt asset" />
              ) : borCodes.length > 1 ? (
                <div className="mv-cell">
                  {" "}
                  <AssetSelect
                    value={borCodes.includes(debtCode) ? debtCode : borCodes[0]}
                    onChange={(c) => {
                      setDebtCode(c);
                      const leg = legs.find(
                        (l) => l.protocol === fromKey && l.code === c,
                      );
                      setDebtAmt(leg && leg.borrowAmount ? String(leg.borrowAmount) : "");
                      setQuote(null);
                      setError(null);
                    }}
                    options={borCodes}
                    label="Debt asset"
                    role="Debt"
                  />{" "}
                </div>
              ) : (
                <span className="mv-locked">
                  {" "}
                  <TokenIcon symbol={debtCode} size={22} />{" "}
                  <b>{debtCode}</b>{" "}
                </span>
              )}{" "}
            </div>{" "}
            {!fromEntry && <p className="mv-note">No position selected.</p>}{" "}
            {fromEntry && (
              <div className="mv-stats">
                {" "}
                <div>
                  <span>Health factor:</span>
                  <b>
                    {perProto?.healthFactor == null
                      ? "Debt-free"
                      : perProto.healthFactor.toFixed(2)}
                  </b>
                </div>{" "}
                <div>
                  <span>Borrow limit:</span>
                  <b>
                    {fmtUsd(
                      perProto?.effectiveCollateral ??
                        fromEntry.sup * (PROTOCOL_SPECS[fromEntry.key].ltvBps / 10000),
                    )}
                  </b>
                </div>{" "}
              </div>
            )}{" "}
          </div>{" "}
          <div className="mv-mid" aria-hidden="true">
            →
          </div>{" "}
          <div>
            {" "}
            <p className="mv-label">To position</p>{" "}
            <ProtoPick
              value={toPool ?? quote?.pool ?? null}
              label="To position"
              placeholder="Select market…"
              emptyText={poolRows ? "No markets available." : "Loading live markets…"}
              emptyLoading={!poolRows}
              options={toPools.map((m) => ({
                key: m.pool,
                label: m.poolName,
                sub: PROTOCOL_META[m.protocol].name,
                icon: m.protocol,
              }))}
              onChange={(k) => pickMarket(k || null)}
            />{" "}
            <p className="mv-label">Collateral:</p>{" "}
            <div className="mv-box" style={{ opacity: quote ? 1 : 0.55 }}>
              {" "}
              <span className="mv-est">{quote && quote.pool === effPool ? fmtTok(quote.toCollTok) : "0"}</span>{" "}
              {!toMarket ? (
                <NoAsset label="No target collateral" />
              ) : (
                <div className="mv-cell">
                  {" "}
                  <AssetSelect
                    value={toCollCode ?? collCode}
                    onChange={(c) => {
                      setToCollCode(c);
                      setQuote(null);
                      setError(null);
                    }}
                    options={
                      toMarket.collaterals.includes(toCollCode ?? collCode)
                        ? toMarket.collaterals
                        : [...toMarket.collaterals, toCollCode ?? collCode]
                    }
                    label="Target collateral"
                    role="Target"
                  />{" "}
                </div>
              )}{" "}
            </div>{" "}
            <p className="mv-label">Debt:</p>{" "}
            <div className="mv-box" style={{ opacity: quote ? 1 : 0.55 }}>
              {" "}
              <span className="mv-est">{quote && quote.pool === effPool ? fmtTok(quote.toDebtTok) : "0"}</span>{" "}
              {!toMarket ? (
                <NoAsset label="No target debt" />
              ) : (
                <div className="mv-cell">
                  {" "}
                  <AssetSelect
                    value={toDebtCode ?? debtCode}
                    onChange={(c) => {
                      setToDebtCode(c);
                      setQuote(null);
                      setError(null);
                    }}
                    options={
                      toMarket.debts.includes(toDebtCode ?? debtCode)
                        ? toMarket.debts
                        : [...toMarket.debts, toDebtCode ?? debtCode]
                    }
                    label="Target debt"
                    role="Target"
                  />{" "}
                </div>
              )}{" "}
            </div>{" "}
            {!toPool && <p className="mv-note">No position selected.</p>}{" "}
            {toKey && fromKey === toKey && (
              <p className="mv-note">
                Same-protocol move — rebalances across {PROTOCOL_META[toKey].name}{" "}
                markets.
              </p>
            )}{" "}
            {quote && (
              <div className="mv-stats">
                {" "}
                <div>
                  <span>Target market:</span>
                  <b>{quote.poolName}</b>
                </div>{" "}
                <div>
                  <span>Supply APY:</span>
                  <b>{quote.supplyApy == null ? "—" : `${quote.supplyApy.toFixed(2)}%`}</b>
                </div>{" "}
                <div>
                  <span>Borrow APY:</span>
                  <b>{quote.borrowApy == null ? "—" : `${quote.borrowApy.toFixed(2)}%`}</b>
                </div>{" "}
                <div>
                  <span>Target health:</span>
                  <b>
                    {quote.healthBps == null
                      ? "Debt-free"
                      : (quote.healthBps / 10000).toFixed(2)}
                  </b>
                </div>{" "}
              </div>
            )}{" "}
          </div>{" "}
        </div>{" "}
        {quoting && (
          <p className="mv-note">
            <span className="load-row">
              <LoadingMark size={14} /> Loading live markets…
            </span>
          </p>
        )}{" "}
        {quote && !quoting && (
          <div className="mv-stats" style={{ marginTop: 4 }}>
            {" "}
            <div>
              <span>Collateral:</span>
              <b>
                {fmtUsd(quote.fromUsd.coll)} → $0&nbsp;&nbsp;·&nbsp;&nbsp;$0 →{" "}
                {fmtUsd(quote.toUsd.coll)}
              </b>
            </div>{" "}
            <div>
              <span>Borrow limit:</span>
              <b>
                {fmtUsd(quote.fromUsd.limit)} → $0&nbsp;&nbsp;·&nbsp;&nbsp;$0 →{" "}
                {fmtUsd(quote.toUsd.limit)}
              </b>
            </div>{" "}
            <div>
              <span>Debt:</span>
              <b>
                {fmtUsd(quote.fromUsd.debt)} → $0&nbsp;&nbsp;·&nbsp;&nbsp;$0 →{" "}
                {fmtUsd(quote.toUsd.debt)}
                {quote.toUsd.fee >= 0.5 && (
                  <> (+{fmtUsd(quote.toUsd.fee)} fee)</>
                )}
              </b>
            </div>{" "}
            <div>
              <span>Safety ratio:</span>
              <b>
                {fromHealth == null ? "Debt-free" : `${(fromHealth * 100).toFixed(2)}%`} → 0%
                &nbsp;&nbsp;·&nbsp;&nbsp;0% →{" "}
                {quote.healthBps == null
                  ? "Debt-free"
                  : `${(quote.healthBps / 100).toFixed(2)}%`}
              </b>
            </div>{" "}
            <div>
              <span>Borrow power used:</span>
              <b>
                {fromPow.toFixed(2)}% → 0%&nbsp;&nbsp;·&nbsp;&nbsp;0% → {toPow.toFixed(2)}%
              </b>
            </div>{" "}
          </div>
        )}{" "}
        <p className="mv-info">
          {" "}
          ⓘ Swaps automatic via best route with a 0.2% slippage guard.{" "}
          {quote && <>Pool swap fee: ~{fmtUsd(quote.toUsd.fee)} (lands on the debt leg)</>}{" "}
        </p>{" "}
        <button
          type="button"
          className={`btn primary mv-go${refHover && refNeedsSmart ? " armed" : ""}`}
          disabled={!active || !quote || quoting}
          onClick={buildFullQuoteGated}
          onMouseEnter={() => {
            if (refNeedsSmart) setRefHover(true);
          }}
          onMouseLeave={() => setRefHover(false)}
        >
          {gateLabel(
            refHover && refNeedsSmart,
            <>{quoting ? "Computing…" : "Move position"}</>,
            refGateWord,
          )}{" "}
        </button>{" "}
        <SmartGateModal
          open={refGateOpen}
          smarts={refSmarts}
          onPick={refPick}
          onCreate={() => {
            setRefGateOpen(false);
            window.dispatchEvent(new Event("seidar:open-smart-account"));
          }}
          onClose={() => setRefGateOpen(false)}
        />{" "}
        {error && (
          <p className="mv-note" role="alert">
            {error}
          </p>
        )}{" "}
      </div>{" "}
      {confirmOpen && quote && fromKey && toKey && (
        <div
          className="mv-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          {" "}
          <div className="mv-modal" role="dialog" aria-modal="true" aria-label="Confirm move">
            {" "}
            <div className="mv-head">
              {" "}
              <h3>Confirm move</h3>{" "}
              <button
                type="button"
                className="mv-x"
                onClick={() => setConfirmOpen(false)}
                aria-label="Close"
              >
                {" "}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>{" "}
              </button>{" "}
            </div>{" "}
            <div className="mv-grid">
              {" "}
              <div className="mv-left">
                {" "}
                <p className="mv-label">
                  {PROTOCOL_META[fromKey].name} → {quote.poolName}
                </p>{" "}
                <div className="mv-stats">
                  {" "}
                  <div>
                    <span>Collateral:</span>
                    <b>
                      {fmtTok(quote.collTok)} {collCode} → {fmtTok(quote.toCollTok)}{" "}
                      {quote.toColl}
                    </b>
                  </div>{" "}
                  <div>
                    <span>Debt:</span>
                    <b>
                      {fmtTok(quote.debtTok)} {debtCode}
                      {quote.toDebt != null &&
                        ` → ${fmtTok(quote.toDebtTok)} ${quote.toDebt}`}{" "}
                      (+{fmtUsd(quote.toUsd.fee)} fee)
                    </b>
                  </div>{" "}
                  <div>
                    <span>Legs:</span>
                    <b>{quote.steps.join(" → ")}</b>
                  </div>{" "}
                  <div>
                    <span>Target market:</span>
                    <b>{quote.poolName}</b>
                  </div>{" "}
                  <div>
                    <span>Supply APY:</span>
                    <b>{quote.supplyApy == null ? "—" : `${quote.supplyApy.toFixed(2)}%`}</b>
                  </div>{" "}
                  <div>
                    <span>Borrow APY:</span>
                    <b>{quote.borrowApy == null ? "—" : `${quote.borrowApy.toFixed(2)}%`}</b>
                  </div>{" "}
                </div>{" "}
              </div>{" "}
              <div className="mv-right">
                {" "}
                <div className="mv-stats">
                  {" "}
                  <div>
                    <span>Target health:</span>
                    <b>
                      {quote.healthBps == null
                        ? "Debt-free"
                        : (quote.healthBps / 10000).toFixed(2)}
                    </b>
                  </div>{" "}
                  <div>
                    <span>Route:</span>
                    <b>
                      Automatic (best) · {quote.slipBps / 100}% slippage guard
                    </b>
                  </div>{" "}
                </div>{" "}
                {quote.warnings.map((w) => (
                  <p className="mv-note" key={w}>
                    • {w}
                  </p>
                ))}{" "}
                {moveSteps.length > 0 && <TxSteps steps={moveSteps} />}
                {moveErr && (
                  <p className="qm-error" role="alert">
                    {moveErr}
                  </p>
                )}
                <div className="mv-rowbtns">
                  {" "}
                  <button type="button" className="btn" onClick={() => setConfirmOpen(false)} disabled={moveRunning}>
                    Cancel
                  </button>{" "}
                  <button type="button" className="btn primary" onClick={confirmMove} disabled={moveRunning}>
                    {moveRunning ? "Moving…" : moveErr ? "Try again" : "Confirm move"}
                  </button>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
      {done && (
        <div
          className="mv-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDone(null);
          }}
        >
          {" "}
          <div className="mv-modal" role="dialog" aria-modal="true" aria-label="Move complete">
            {" "}
            <div className="mv-done-band">
              {" "}
              <h3>Move complete</h3>{" "}
              <p>Every step confirmed on-chain. Your positions refresh automatically.</p>{" "}
            </div>{" "}
            <div className="mv-grid">
              {" "}
              <div className="mv-left">
                {" "}
                <p className="mv-label">From</p>{" "}
                <p>
                  <b>{PROTOCOL_META[done.fromKey].name}</b>
                </p>{" "}
                <div className="mv-stats">
                  {" "}
                  <div>
                    <span>Collateral:</span>
                    <b>
                      {fmtTok(done.collTok)} {done.collCode}
                    </b>
                  </div>{" "}
                  <div>
                    <span>Debt:</span>
                    <b>
                      {fmtTok(done.debtTok)} {done.debtCode}
                    </b>
                  </div>{" "}
                </div>{" "}
              </div>{" "}
              <div className="mv-right">
                {" "}
                <p className="mv-label">To</p>{" "}
                <p>
                  <b>{done.poolName}</b>
                </p>{" "}
                <div className="mv-stats">
                  {" "}
                  <div>
                    <span>Collateral:</span>
                    <b>
                      {fmtTok(done.collTok)} {done.collCode} → {done.toColl}
                    </b>
                  </div>{" "}
                  <div>
                    <span>Debt:</span>
                    <b>
                      {fmtTok(done.debtTok)} {done.debtCode}
                      {done.toDebt != null ? ` → ${done.toDebt}` : ""}
                    </b>
                  </div>{" "}
                </div>{" "}
                <div className="mv-rowbtns">
                  {" "}
                  <button type="button" className="btn" onClick={() => setDone(null)}>
                    Close
                  </button>{" "}
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setDone(null);
                      goto(done.toKey);
                    }}
                  >
                    Manage {PROTOCOL_META[done.toKey].name}
                  </button>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
/* DEX pool boards (Aqua / Phoenix): live rows from GET /dex/pools, never
   mocked. Text search + type filter + sort, 20/50/100 pagination with
   prev/next — the same board contract as the Earn vault browser. Volumes
   are raw indexer units (mixed-asset stroops), shown as-is with a note;
   only Phoenix TVL is real USD (reserves x live prices). */
type DexAsset = { contract: string; code: string };
type DexRow = {
  protocol: string;
  address: string;
  pair: string;
  assets: DexAsset[];
  poolType: string | null;
  feeBps: number | null;
  trades: number | null;
  volumeRaw: number | null;
  tvlUsd: number | null;
  reserves: { code: string; amount: number; decimals?: number }[] | null;
  apyPct?: number | null;
  feeApyPct?: number | null;
  rewardsApyPct?: number | null;
  volume24hUsd?: number | null;
  /** Soroswap / Phoenix / Sushi: the last 7 days of swaps (API dex-activity). */
  trades7d?: number;
  volume7dUsd?: number | null;
  /** The API's swap scan is still running (numbers land shortly). */
  activityPending?: boolean;
  updatedAt: number;
};
type DexSort = "tvl" | "trades" | "volume" | "pair" | "fee";
/* Board dropdown in app language (button + card menu, never a native
   select): label left, chevron with breathing room at the edge. */
function DxSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const cur = options.find((o) => o.value === value);
  return (
    <div className="dx-sel" ref={ref}>
      {" "}
      <button
        type="button"
        className="dx-sel-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
      >
        {" "}
        <span>{cur?.label ?? value}</span>{" "}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && (
        <div className="dx-sel-menu" role="listbox" aria-label={label}>
          {" "}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dx-sel-opt${o.value === value ? " active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}{" "}
        </div>
      )}{" "}
    </div>
  );
}
type DexId = "aqua" | "phoenix" | "soroswap" | "sushi";
function DexBoard({ id }: { id: DexId }) {
  const [rows, setRows] = useState<DexRow[]>([]);
  const [totals, setTotals] = useState<{
    tvlRaw: number | null;
    volumeRaw: number | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("");
  const [sort, setSort] = useState<DexSort>(id === "aqua" ? "trades" : "tvl");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [nonce, setNonce] = useState(0);
  const router = useRouter();
  useEffect(() => {
    let dead = false;
    setState("loading");
    apiFetch(`/api/dex/pools?protocol=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d || d.ok !== true || !Array.isArray(d.rows)) {
          setState("error");
          return;
        }
        setRows(d.rows as DexRow[]);
        setTotals(
          d.totals && typeof d.totals === "object"
            ? {
                tvlRaw:
                  typeof d.totals.tvlRaw === "number" ? d.totals.tvlRaw : null,
                volumeRaw:
                  typeof d.totals.volumeRaw === "number"
                    ? d.totals.volumeRaw
                    : null,
              }
            : null,
        );
        const src = d.sources && typeof d.sources === "object" ? d.sources[id] : "";
        setNote(typeof src === "string" ? src : "live");
        setState("ready");
      })
      .catch(() => {
        if (!dead) setState("error");
      });
    return () => {
      dead = true;
    };
  }, [id, nonce]);
  const types = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.poolType) s.add(r.poolType);
    return [...s].sort();
  }, [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (!typeF || r.poolType === typeF) &&
        (!needle ||
          r.pair.toLowerCase().includes(needle) ||
          r.address.toLowerCase().includes(needle)),
    );
    const num = (v: number | null) => (typeof v === "number" ? v : -1);
    out.sort((a, b) => {
      if (sort === "pair") return a.pair.localeCompare(b.pair);
      if (sort === "fee") return num(a.feeBps) - num(b.feeBps);
      if (sort === "trades") return num(b.trades) - num(a.trades);
      if (sort === "volume") return num(b.volumeRaw) - num(a.volumeRaw);
      return num(b.tvlUsd) - num(a.tvlUsd);
    });
    return out;
  }, [rows, q, typeF, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const tvlSum = useMemo(
    () => rows.reduce((a, r) => a + (typeof r.tvlUsd === "number" ? r.tvlUsd : 0), 0),
    [rows],
  );
  /* Same hero size as the Earn vault browser on every pool page, in the
     normal card colors — no protocol tinting. Rows are the classic pool
     table with separated rows; volumes stay raw honest units. */
  const META = {
    aqua: {
      label: "Aqua",
      eyebrow: "WELCOME TO AQUA POOLS",
      title: (
        <>
          Explore live <em>Aqua</em> liquidity pools on <em>Stellar</em>.
        </>
      ),
    },
    phoenix: {
      label: "Phoenix",
      eyebrow: "WELCOME TO PHOENIX POOLS",
      title: (
        <>
          Explore live <em>Phoenix</em> liquidity pools on{" "}
          <em>Stellar</em>.
        </>
      ),
    },
    soroswap: {
      label: "Soroswap",
      eyebrow: "WELCOME TO SOROSWAP POOLS",
      title: (
        <>
          Explore live <em>Soroswap</em> liquidity pools on{" "}
          <em>Stellar</em>.
        </>
      ),
    },
    sushi: {
      label: "Sushi",
      eyebrow: "WELCOME TO SUSHI POOLS",
      title: (
        <>
          Explore live <em>Sushi V3</em> concentrated-liquidity pools on{" "}
          <em>Stellar</em>.
        </>
      ),
    },
  } as const;
  const meta = META[id];
  return (
    <div className="ev-wrap">
      {" "}
      <div className="ev-hero dx-hero">
        {" "}
        <p className="ev-eyebrow">{meta.eyebrow}</p> <h1>{meta.title}</h1>{" "}
      </div>{" "}
      {state === "loading" && (
        <p className="pf-empty load-row">
          <LoadingMark /> Loading live pools…
        </p>
      )}{" "}
      {state === "error" && (
        <div className="pf-card dx-center">
          {" "}
          <p>Pool feed unreachable — retry, nothing is cached up here.</p>{" "}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setState("loading");
              setNonce((n) => n + 1);
            }}
          >
            Retry
          </button>{" "}
        </div>
      )}{" "}
      {state === "ready" && (
        <>
          {" "}
          <div className="ev-filters dx-filters">
            {" "}
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Filter pair or pool address…"
              aria-label="Filter pools by pair or address"
            />{" "}
            {types.length > 1 && (
              <DxSelect
                value={typeF}
                onChange={(v) => {
                  setTypeF(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All types" },
                  ...types.map((t) => ({ value: t, label: t })),
                ]}
                label="Filter by pool type"
              />
            )}{" "}
            <DxSelect
              value={sort}
              onChange={(v) => setSort(v as DexSort)}
              options={[
                { value: "tvl", label: "TVL ↓" },
                { value: "trades", label: "Trades ↓" },
                { value: "volume", label: "Volume ↓" },
                { value: "pair", label: "Pair A→Z" },
                { value: "fee", label: "Fee ↑" },
              ]}
              label="Sort pools"
            />{" "}
            <span className="dx-count">
              {filtered.length} of {rows.length}
            </span>{" "}
          </div>{" "}
          <p className="ev-count">
            Pools <span className="ev-count-n dx-n">{filtered.length}</span>{" "}
            <small>
              {id === "aqua"
                ? `${rows.length} indexed · TVL ${totals?.tvlRaw != null ? fmtNum(totals.tvlRaw) : "—"} units · vol ${totals?.volumeRaw != null ? fmtNum(totals.volumeRaw) : "—"}`
                : `${rows.length} on-chain · ${fmtTvl(tvlSum)} tracked TVL`}
              {" · "}
              {note || "live"}
            </small>
          </p>{" "}
          <div className="dx-scroll">
            {" "}
            <table className="dx-table dx-spaced">
              <thead>
                <tr>
                  <th>Pair</th><th>Pool</th><th>Type</th><th>Fee</th>
                  <th>Trades</th><th>Volume*</th><th>TVL</th>
                  <th className="dx-caret" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr
                    key={r.address}
                    className="dx-click"
                    onClick={() =>
                      router.push(`/markets/${id}/pool/${r.address}`)
                    }
                  >
                    <td>
                      {" "}
                      <span className="dx-pair">
                        {" "}
                        <IconStack codes={r.assets.map((a) => a.code)} contracts={r.assets.map((a) => a.contract)} /> {r.pair}{" "}
                      </span>{" "}
                    </td>
                    <td title={r.address}>{shortAddr(r.address)}</td>
                    <td>{r.poolType ?? "—"}</td>
                    <td>
                      {r.feeBps != null ? `${(r.feeBps / 100).toFixed(2)}%` : "—"}
                    </td>
                    <td>{r.trades != null ? fmtNum(r.trades) : "—"}</td>
                    <td title="Raw units as reported by the indexer">
                      {r.volumeRaw != null ? fmtNum(r.volumeRaw) : "—"}
                    </td>
                    <td>
                      {r.tvlUsd != null ? fmtTvl(r.tvlUsd) : "—"}
                    </td>
                    <td className="dx-caret">
                      {" "}
                      <button
                        type="button"
                        className="mk-chev"
                        aria-label={`Open ${r.pair} pool details`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/markets/${id}/pool/${r.address}`);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>{" "}
                      </button>{" "}
                    </td>
                  </tr>
                ))}
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={8} className="dx-center">
                      No pools match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>{" "}
          </div>{" "}
          <div className="ev-pager">
            {" "}
            <button
              type="button"
              className="btn"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>{" "}
            <span className="ev-page">
              Page {safePage} of {totalPages}
            </span>{" "}
            <button
              type="button"
              className="btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>{" "}
            <label className="ev-perpage">
              {" "}
              Show{" "}
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value) || 20);
                  setPage(1);
                }}
                aria-label="Rows per page"
              >
                {[20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>{" "}
            </label>{" "}
          </div>{" "}
          <p className="dx-note">
            * Volumes are raw indexer units (mixed-asset stroops), not USD.
            TVL prices on-chain reserves with live feeds — pools with no
            priced leg show —, never estimated.
          </p>{" "}
        </>
      )}{" "}
    </div>
  );
}
/* Pool details page: header (pair, address, network), stat band
   (liquidity, supply APY, type, issuer), Overview / Advanced / Activity
   tabs. Every number is live: reserves and TVL from the board feed,
   token prices from /prices. Supply APY, rate history and the trade feed
   have no source yet, so they show as pending — never mocked. */
const DEX_ISSUER: Record<string, { label: string; logo: string }> = {
  aqua: { label: "Aqua", logo: "/aqua-logo.png" },
  phoenix: { label: "Phoenix", logo: "/dex-phoenix.png" },
  soroswap: { label: "Soroswap", logo: "/dex-soroswap.png" },
  sushi: { label: "Sushi", logo: "/sushi-logo.png" },
};
function fmtReserve(amount: number, code: string, decimals = 7): string {
  const units = amount / 10 ** decimals;
  return `${fmtNum(units)} ${code}`;
}
function fmtUsdPx(px: number | null): string {
  if (px == null || !Number.isFinite(px) || px <= 0) return "—";
  return px >= 1
    ? `$${px.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${px.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}
function poolTypeLabel(t: string | null): string {
  if (t === "constant_product") return "Constant Product";
  if (t === "concentrated") return "Concentrated";
  if (t === "stable") return "Stable";
  if (t === "xyk") return "Constant Product";
  return t ?? "—";
}
export function PoolDetail({
  protocol,
  address,
  section = "manage",
}: {
  protocol: DexId;
  address: string;
  section?: VenueSection;
}) {
  const router = useRouter();
  const issuer = DEX_ISSUER[protocol];
  const [row, setRow] = useState<DexRow | null>(null);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [dtab, setDtab] = useState<"overview" | "charts" | "activity" | "range">("overview");
  const [imgOk, setImgOk] = useState(true);
  /* Side panel: deposit/withdraw mode, per-asset inputs, live balances of
     the active account (same account the switcher above selects). */
  const [pmode, setPmode] = useState<"deposit" | "withdraw">("deposit");
  const [amts, setAmts] = useState<Record<string, string>>({});
  const owner = useWalletAddress();
  const activeAcct = useTxActive(owner) ?? owner;
  const bals = useTokenBalances(activeAcct);
  const trimNum = (n: number) =>
    n.toFixed(7).replace(/\.?0+$/, "") || "0";
  /* LP position + execution (Soroswap / Aqua / Phoenix; Sushi V3 ranges
     stay on Sushi's app). Amounts follow pool token order. */
  // Concentrated Aqua pools take price ranges (pool-range.tsx), not shares.
  const isCl = protocol === "aqua" && row?.poolType === "concentrated";
  const isConc = row?.poolType === "concentrated";
  const clInfo = useClPool(address, isCl);
  const lpSupported = protocol !== "sushi" && !isCl;
  // Liquidity moves from the smart account; the main wallet only funds it.
  const { smarts: lpSmarts } = useSmartAccount();
  const lpGate = !isSmartAddress(activeAcct) ? smartGate(owner, lpSmarts) : null;
  const [lp, setLp] = useState<null | { shares: string; totalShares: string; underlying: string[]; rewards: string | null }>(null);
  const [lpBusy, setLpBusy] = useState(false);
  const [lpErr, setLpErr] = useState<string | null>(null);
  /** The position read for the current account has answered (or failed). */
  const [lpReady, setLpReady] = useState(false);
  const loadLp = useCallback(() => {
    if (!lpSupported || !activeAcct) {
      setLp(null);
      setLpReady(true);
      return;
    }
    apiFetch(`/api/dex/position?protocol=${protocol}&pool=${address}&address=${activeAcct}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        setLp(d?.ok ? { shares: d.shares, totalShares: d.totalShares, underlying: d.underlying, rewards: d.rewards ?? null } : null),
      )
      .catch(() => setLp(null))
      .finally(() => setLpReady(true));
  }, [lpSupported, activeAcct, protocol, address]);
  useEffect(() => setLpReady(false), [activeAcct, address]);
  const { positions: clPos } = useClPositions(address, activeAcct ?? null, isCl);
  useEffect(() => {
    loadLp();
    // The refresh button (and finished transactions) re-read the position.
    window.addEventListener("seidar:refresh", loadLp);
    return () => window.removeEventListener("seidar:refresh", loadLp);
  }, [loadLp]);
  const lpDec = (i: number) => row?.reserves?.[i]?.decimals ?? 7;
  const lpUnder = (i: number) => (lp ? Number(lp.underlying[i] ?? 0) / 10 ** lpDec(i) : 0);
  /** Typing one side fills the other at the live reserve ratio (deposit). */
  function setLpAmount(i: number, v: string) {
    if (!row) return;
    const next: Record<string, string> = { [row.assets[i].contract]: v };
    const res = row.reserves;
    if (pmode === "deposit" && row.assets.length === 2 && res && res[0].amount > 0 && res[1].amount > 0) {
      const j = 1 - i;
      const x = Number(v);
      if (x > 0) {
        const rI = res[i].amount / 10 ** lpDec(i);
        const rJ = res[j].amount / 10 ** lpDec(j);
        next[row.assets[j].contract] = trimNum((x * rJ) / rI);
      } else next[row.assets[j].contract] = "";
    }
    if (pmode === "withdraw" && row.assets.length === 2 && lp) {
      const j = 1 - i;
      const x = Number(v);
      const share = lpUnder(i) > 0 ? Math.min(1, x / lpUnder(i)) : 0;
      next[row.assets[j].contract] = x > 0 ? trimNum(lpUnder(j) * share) : "";
    }
    setAmts((prev) => ({ ...prev, ...next }));
  }
  /* Deposit / withdraw confirm + result through the shared popup. */
  const [lpConfirm, setLpConfirm] = useState<TxSpec | null>(null);
  function submitLp() {
    if (!row || !activeAcct || lpBusy) return;
    setLpErr(null);
    let body: Record<string, unknown>;
    const legs: string[] = [];
    try {
      if (pmode === "deposit") {
        const amounts = row.assets.map((a, i) => toBase(amts[a.contract] || "0", lpDec(i)) ?? "0");
        if (amounts.every((x) => x === "0")) throw new Error("Enter an amount to deposit.");
        row.assets.forEach((a) => legs.push(`${amts[a.contract] || "0"} ${a.code}`));
        body = { protocol, pool: address, from: activeAcct, signer: owner, action: "deposit", amounts };
      } else {
        if (!lp || BigInt(lp.shares) <= BigInt(0)) throw new Error("No liquidity in this pool to withdraw.");
        const want = Number(amts[row.assets[0].contract] || 0);
        const share = lpUnder(0) > 0 ? Math.min(1, want / lpUnder(0)) : 0;
        if (!(share > 0)) throw new Error("Enter an amount to withdraw.");
        const shares = share >= 0.999 ? lp.shares : ((BigInt(lp.shares) * BigInt(Math.floor(share * 1e6))) / BigInt(1e6)).toString();
        row.assets.forEach((a, i) => legs.push(`${trimNum(lpUnder(i) * share)} ${a.code}`));
        body = { protocol, pool: address, from: activeAcct, signer: owner, action: "withdraw", shares };
      }
    } catch (e) {
      setLpErr(e instanceof Error ? e.message : String(e));
      return;
    }
    const verb = pmode === "deposit" ? "Deposit" : "Withdraw";
    setLpConfirm({
      title: `${verb}: ${row.pair}`,
      code: row.assets[0]?.code,
      amount: legs.join(" + "),
      context: `${protocol[0].toUpperCase()}${protocol.slice(1)} pool`,
      rows: [
        ...legs.map((l, i) => ({ label: i === 0 ? verb : "", value: l })),
        { label: "Slippage guard", value: "1%", hint: "Minimum amounts are set from live reserves." },
        { label: "Signatures", value: "1" },
      ],
      notes:
        pmode === "deposit"
          ? ["Amounts follow the pool's live ratio; anything that doesn't match stays in your account."]
          : undefined,
      confirmLabel: verb,
      execute: async (onSteps) => {
        const step: TxStep = { key: "lp", label: `${verb} ${row.pair}`, status: "building" };
        onSteps([{ ...step }]);
        setLpBusy(true);
        try {
          const r = await apiFetch("/api/dex/liquidity/build", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }).then((x) => x.json());
          if (!r?.ok || !r.xdr) throw new Error(r?.error ?? "Could not build the transaction.");
          const sent = await signAndSend(r.xdr, owner ?? activeAcct, (st) => {
            step.status = st;
            onSteps([{ ...step }]);
          });
          step.status = "done";
          step.hash = sent.hash;
          onSteps([{ ...step }]);
          setAmts({});
          loadLp();
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          step.status = "failed";
          step.error = e instanceof Error ? e.message : String(e);
          step.hash = (e as { hash?: string | null })?.hash ?? null;
          onSteps([{ ...step }]);
          throw e;
        } finally {
          setLpBusy(false);
        }
      },
    });
  }
  /* Aqua publishes per-pool fee + reward APY; the other venues have no
     per-pool yield source, so they show — rather than a guess. */
  const [aquaApy, setAquaApy] = useState<{ total: number | null; fee: number | null; rewards: number | null } | null>(null);
  useEffect(() => {
    if (protocol !== "aqua") return;
    let dead = false;
    apiFetch(`/api/dex/aqua/pool?pool=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && d?.ok && setAquaApy({ total: d.totalApyPct ?? null, fee: d.feeApyPct ?? null, rewards: d.rewardsApyPct ?? null }))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [protocol, address]);
  /* Daily TVL / volume (Aqua publishes it) and the latest trades. */
  const [hist, setHist] = useState<{ t: number; tvlUsd: number | null; volumeUsd: number | null }[] | null>(null);
  const [trades, setTrades] = useState<
    { type: string; time: number | null; account: string | null; tx: string | null; legs: { code: string; amount: number }[]; signed: boolean }[] | null
  >(null);
  const [tradesErr, setTradesErr] = useState(false);
  useEffect(() => {
    let dead = false;
    apiFetch(`/api/dex/pool/history?protocol=${protocol}&pool=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && setHist(d?.ok ? d.points : []))
      .catch(() => !dead && setHist([]));
    return () => {
      dead = true;
    };
  }, [protocol, address]);
  const tokensKey = row?.assets.map((a) => a.contract).join(",") ?? "";
  useEffect(() => {
    if (dtab !== "activity" || !tokensKey) return;
    let dead = false;
    setTradesErr(false);
    const load = () =>
      apiFetch(`/api/dex/pool/trades?protocol=${protocol}&pool=${address}&tokens=${tokensKey}&limit=30`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (d?.ok) setTrades(d.trades);
          else setTradesErr(true);
        })
        .catch(() => !dead && setTradesErr(true));
    load();
    const id = setInterval(load, 30_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [dtab, protocol, address, tokensKey]);
  const rewardAqua = lp?.rewards != null ? Number(lp.rewards) / 1e7 : 0;
  /** Aqua: claim the pool's pending AQUA rewards to the active account. */
  function claimRewards() {
    if (!activeAcct || lpBusy || rewardAqua <= 0) return;
    setLpConfirm({
      title: `Claim ${trimNum(rewardAqua)} AQUA`,
      code: "AQUA",
      amount: trimNum(rewardAqua),
      context: `${row?.pair ?? "Aqua"} pool rewards`,
      rows: [
        { label: "Claim", value: `${trimNum(rewardAqua)} AQUA` },
        { label: "To", value: shortAddr(activeAcct) },
        { label: "Signatures", value: "1" },
      ],
      confirmLabel: "Claim",
      execute: async (onSteps) => {
        const step: TxStep = { key: "claim", label: "Claim AQUA rewards", status: "building" };
        onSteps([{ ...step }]);
        setLpBusy(true);
        try {
          const r = await apiFetch("/api/dex/liquidity/build", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ protocol, pool: address, from: activeAcct, signer: owner, action: "claim" }),
          }).then((x) => x.json());
          if (!r?.ok || !r.xdr) throw new Error(r?.error ?? "Could not build the transaction.");
          const sent = await signAndSend(r.xdr, owner ?? activeAcct, (st) => {
            step.status = st;
            onSteps([{ ...step }]);
          });
          step.status = "done";
          step.hash = sent.hash;
          onSteps([{ ...step }]);
          loadLp();
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          step.status = "failed";
          step.error = e instanceof Error ? e.message : String(e);
          step.hash = (e as { hash?: string | null })?.hash ?? null;
          onSteps([{ ...step }]);
          throw e;
        } finally {
          setLpBusy(false);
        }
      },
    });
  }
  useEffect(() => {
    let dead = false;
    apiFetch(`/api/dex/pools?protocol=${protocol}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        const hit = (
          Array.isArray(d?.rows) ? (d.rows as DexRow[]) : []
        ).find((r) => r.address === address);
        if (!hit) {
          setState("missing");
          return;
        }
        setRow(hit);
        setState("ready");
        const codes = [...new Set(hit.assets.map((a) => a.code))].join(",");
        if (codes) {
          apiFetch(`/api/prices?codes=${encodeURIComponent(codes)}`, {
            cache: "no-store",
          })
            .then((r) => r.json())
            .then((p) => {
              if (!dead && p && typeof p.prices === "object")
                setPrices(p.prices as Record<string, number | null>);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!dead) setState("missing");
      });
    return () => {
      dead = true;
    };
  }, [protocol, address]);
  return (
    <div className="ev-wrap">
      {" "}
      <VenueTopbar
        back={{ href: "/markets/pools", label: "Pools" }}
        base={`/markets/${protocol}/pool/${address}`}
        section={section}
        // The Aqua automations (compound / LP stop loss) work on share pools, not ranges.
        sections={protocol === "aqua" && !isConc ? ["manage", "automate", "history"] : ["manage", "history"]}
        hero={{
          logo: row ? <IconStack codes={row.assets.map((a) => a.code)} contracts={row.assets.map((a) => a.contract)} /> : <ProtoMark id={protocol} size={44} />,
          title: row ? row.pair.replace("/", " / ") : state === "missing" ? "Pool not found" : "Loading pool…",
          facts: row
            ? [
                ...((aquaApy?.total ?? row.apyPct) != null ? [{ text: `${fmtApy((aquaApy?.total ?? row.apyPct) as number)} APY`, strong: true }] : []),
                { icon: <ProtoMark id={protocol} size={18} />, text: `${issuer.label} pool` },
                { text: `TVL ${row.tvlUsd != null ? fmtTvl(row.tvlUsd) : "—"}` },
                ...(row.poolType ? [{ text: poolTypeLabel(row.poolType) }] : []),
                ...(row.feeBps != null ? [{ text: `${(row.feeBps / 100).toFixed(2)}% fee` }] : []),
                { text: <span title={row.address}>{shortAddr(row.address)}</span> },
              ]
            : [],
        }}
      />
      {state === "loading" && (
        <p className="pf-empty load-row">
          <LoadingMark /> Loading live pool…
        </p>
      )}{" "}
      {state === "missing" && (
        <div className="pf-card dx-center">
          {" "}
          <p>Pool not found in the live catalogue.</p>{" "}
        </div>
      )}{" "}
      {state === "ready" && row && section === "history" && (
        <div className="vt-hist">
          <ProtocolHistory protocol={protocol} address={activeAcct ?? null} owner={owner ?? null} contract={address} />
        </div>
      )}
      {state === "ready" && row && section === "automate" && protocol === "aqua" && !isConc && (
        <div className="vt-hist">
          <PoolAutomate pool={address} pair={row.pair} />
        </div>
      )}
      {state === "ready" && row && section === "manage" && (() => {
        const priced = row.assets.map((a, i) => {
          const r = row.reserves?.[i];
          const amount = r ? r.amount / 10 ** (r.decimals ?? 7) : 0;
          const px = prices[a.code];
          return { code: a.code, amount, usd: px != null && px > 0 ? amount * px : null };
        });
        // Pool's own price (reserves) vs the oracle ratio: a gap is arbitrage room.
        const two = row.assets.length === 2 && priced[0].amount > 0 && priced[1].amount > 0;
        const poolPx = isCl && clInfo ? clInfo.price : two && !isConc ? priced[1].amount / priced[0].amount : null;
        const oraclePx =
          two && prices[row.assets[0].code] && prices[row.assets[1].code]
            ? (prices[row.assets[0].code] as number) / (prices[row.assets[1].code] as number)
            : null;
        const gap = poolPx != null && oraclePx ? ((poolPx - oraclePx) / oraclePx) * 100 : null;
        const tvlPts = (hist ?? []).filter((p) => p.tvlUsd != null).map((p) => ({ t: p.t, v: p.tvlUsd as number }));
        const volPts = (hist ?? []).filter((p) => p.volumeUsd != null).map((p) => ({ t: p.t, v: p.volumeUsd as number }));
        const tabs: [typeof dtab, string][] = [
          ["overview", "Overview"],
          ...(isCl ? ([["range", "Range & rebalance"]] as [typeof dtab, string][]) : []),
          ["charts", "Charts"],
          ["activity", "Activity"],
        ];
        // The active account's liquidity here (shares pro rata, or Aqua ranges).
        const mineAmt = row.assets.map((_, i) =>
          isCl
            ? (clPos ?? []).reduce((t, p) => t + Number(p.amounts[i] ?? 0) / 10 ** (clInfo?.decimals[i] ?? lpDec(i)), 0)
            : lpUnder(i),
        );
        const mineLegs = row.assets.map((a, i) => {
          const px = prices[a.code];
          return { code: a.code, amount: mineAmt[i], usd: px != null && px > 0 ? mineAmt[i] * px : null };
        });
        const mineUsd = mineLegs.some((l) => l.amount > 0 && l.usd == null) ? null : mineLegs.reduce((t, l) => t + (l.usd ?? 0), 0);
        const sharePct =
          lp && BigInt(lp.totalShares || "0") > BigInt(0) ? (Number(lp.shares) / Number(lp.totalShares)) * 100 : null;
        const apy = aquaApy?.total ?? row.apyPct ?? null;
        const nRanges = clPos?.length ?? 0;
        const inRange = (clPos ?? []).filter((p) => p.inRange).length;
        const overviewStats: OverviewStat[] = [
          isCl
            ? {
                label: "Ranges",
                value: clPos ? String(nRanges) : "—",
                sub: nRanges ? `${inRange} in range` : "no ranges yet",
                tone: nRanges && inRange === nRanges ? "green" : undefined,
              }
            : {
                label: "Pool share",
                value: sharePct != null && sharePct > 0 ? `${sharePct < 0.0001 ? "<0.0001" : sharePct.toFixed(4)}%` : "0%",
                sub: row.tvlUsd != null ? `of ${fmtTvl(row.tvlUsd)}` : undefined,
              },
          {
            label: "APY",
            value: apy != null ? `${apy.toFixed(2)}%` : "—",
            sub: apy != null ? (aquaApy?.rewards ? `incl. ${aquaApy.rewards.toFixed(2)}% AQUA` : protocol === "aqua" ? "fees" : "fees, last 7 days") : row.activityPending ? "reading swaps…" : "no yield source",
            tone: apy != null ? "green" : undefined,
          },
          {
            label: "Est. yearly",
            value: apy != null && mineUsd != null ? fmtUsdShort((mineUsd * apy) / 100) : "—",
            sub: "at today's APY",
          },
          ...(protocol === "aqua" && !isCl
            ? [{ label: "AQUA rewards", value: `${fmtNum(rewardAqua)} AQUA`, sub: "pending" } as OverviewStat]
            : []),
        ];
        return (
        <div className="pd-layout">
          {" "}
          <div className="pd-col">
          <PositionOverview
            account={activeAcct ?? null}
            loading={isCl ? clPos == null && !!activeAcct : !lpReady}
            legs={mineLegs}
            valueUsd={mineUsd}
            stats={overviewStats}
            emptyHint={
              protocol === "sushi"
                ? "Sushi V3 ranges are held on Sushi, so they don't show here."
                : `Nothing in this pool yet. Deposit ${row.assets.map((a) => a.code).join(" + ")} on the right.`
            }
            action={
              protocol === "aqua" && !isCl && rewardAqua > 0 ? (
                <button
                  type="button"
                  className="btn pd-claim"
                  disabled={rewardAqua <= 0 || lpBusy || !!lpGate}
                  title={lpGate ? "Rewards are claimed from your smart account." : rewardAqua <= 0 ? "No rewards to claim yet." : undefined}
                  onClick={claimRewards}
                >
                  Claim {rewardAqua > 0 ? `${fmtNum(rewardAqua)} AQUA` : "rewards"}
                </button>
              ) : undefined
            }
          />
          <div className="pd-main pd-card">
            <div className="pd-stats">
              <div>
                <span>Total liquidity</span>
                <b>{row.tvlUsd != null ? fmtTvl(row.tvlUsd) : "—"}</b>
                <small>{row.reserves ? `${row.reserves.length} tokens, read on-chain` : "Reserves unreadable for this pool"}</small>
              </div>
              <div>
                <span>Pool APY</span>
                <b className={apy != null ? "pd-apy" : undefined}>{apy != null ? fmtApy(apy) : "—"}</b>
                <small>
                  {aquaApy
                    ? `Fees ${aquaApy.fee != null ? aquaApy.fee.toFixed(2) : "—"}% · AQUA ${aquaApy.rewards != null ? aquaApy.rewards.toFixed(2) : "—"}%`
                    : apy != null
                      ? "Swap fees earned over the last 7 days, annualised"
                      : row.activityPending
                        ? "Reading the last 7 days of swaps…"
                        : "No swaps priced in the last 7 days"}
                </small>
              </div>
              <div>
                <span>{row.volume24hUsd != null ? "24h volume" : "7d volume"}</span>
                <b>
                  {row.volume24hUsd != null
                    ? fmtUsdShort(row.volume24hUsd)
                    : row.volume7dUsd != null
                      ? fmtUsdShort(row.volume7dUsd)
                      : "—"}
                </b>
                <small>
                  {row.volume24hUsd != null && row.tvlUsd
                    ? `${((row.volume24hUsd / row.tvlUsd) * 100).toFixed(1)}% of liquidity traded`
                    : row.trades7d != null
                      ? `${fmtNum(row.trades7d)} swaps in 7 days`
                      : row.activityPending
                        ? "reading swaps…"
                        : "no volume source"}
                </small>
              </div>
              <div>
                <span>Swap fee</span>
                <b>{row.feeBps != null ? `${(row.feeBps / 100).toFixed(2)}%` : "—"}</b>
                <small>{poolTypeLabel(row.poolType)}</small>
              </div>
            </div>{" "}
            <div className="pd-tabs" role="tablist" aria-label="Pool details">
              {tabs.map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={dtab === k} className={`pd-tab${dtab === k ? " active" : ""}`} onClick={() => setDtab(k)}>
                  {t}
                </button>
              ))}
            </div>
            {dtab === "overview" && (
              <div className="pd-pane">
                <h3 className="pd-sec">Composition</h3>
                <CompositionBar legs={priced} />
                {poolPx != null && (
                  <div className="pd-price">
                    <div>
                      <span>Pool price</span>
                      <b>
                        1 {row.assets[0].code} = {fmtPx(poolPx)} {row.assets[1].code}
                      </b>
                    </div>
                    <div>
                      <span>Oracle price</span>
                      <b>{oraclePx ? `${fmtPx(oraclePx)} ${row.assets[1].code}` : "—"}</b>
                    </div>
                    <div>
                      <span>Gap</span>
                      <b className={gap != null && Math.abs(gap) > 1 ? "pd-gap-warn" : undefined}>
                        {gap != null ? `${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%` : "—"}
                      </b>
                    </div>
                  </div>
                )}
                {isConc && (
                  <p className="pd-note">
                    Concentrated pool: liquidity sits in price ranges and earns only while the price is inside them — ranges need
                    rebalancing when the price moves away.{isCl ? " See Range & rebalance." : ""}
                  </p>
                )}
                <h3 className="pd-sec">Market attributes</h3>
                <div className="pd-attrs">
                  {row.assets.map((a, i) => (
                    <div key={a.contract}>
                      <span>Token {i + 1}</span>
                      <b className="pd-tok">
                        <TokenIcon symbol={a.code} size={20} contract={a.contract} /> {a.code} <small className="pd-dim">{fmtUsdPx(prices[a.code] ?? null)}</small>
                      </b>
                    </div>
                  ))}
                  <div>
                    <span>Pool type</span>
                    <b>{poolTypeLabel(row.poolType)}</b>
                  </div>
                  <div>
                    <span>Swap fee</span>
                    <b>{row.feeBps != null ? `${(row.feeBps / 100).toFixed(2)}%` : "—"}</b>
                  </div>
                  <div>
                    <span>All-time trades</span>
                    <b>{row.trades != null ? fmtNum(row.trades) : "—"}</b>
                  </div>
                  <div>
                    <span>Venue</span>
                    <b className="pd-issuer">
                      {imgOk && <img loading="lazy" src={issuer.logo} alt="" width={20} height={20} onError={() => setImgOk(false)} style={{ borderRadius: 6 }} />}
                      {issuer.label}
                    </b>
                  </div>
                  <div>
                    <span>Contract</span>
                    <b>
                      <a href={`${explorerBase()}/contract/${row.address}`} target="_blank" rel="noreferrer">
                        {shortAddr(row.address)} ↗
                      </a>
                    </b>
                  </div>
                </div>
              </div>
            )}
            {dtab === "range" && isCl && (
              <div className="pd-pane">
                {clInfo ? (
                  <ClRanges pool={address} info={clInfo} account={activeAcct ?? null} owner={owner ?? null} />
                ) : (
                  <p className="pf-empty load-row">
                    <LoadingMark size={14} /> Reading the pool…
                  </p>
                )}
              </div>
            )}
            {dtab === "charts" && (
              <div className="pd-pane">
                {hist == null ? (
                  <p className="pf-empty load-row">
                    <LoadingMark size={14} /> Loading history…
                  </p>
                ) : tvlPts.length > 1 ? (
                  <div className="pd-charts">
                    <HistoryChart points={tvlPts} kind="area" label="Liquidity (TVL)" />
                    <HistoryChart points={volPts} kind="bars" label="Daily volume" />
                  </div>
                ) : (
                  <p className="pd-empty-pane">
                    {issuer.label} publishes no per-pool history, so there is no chart to draw — live reserves, composition and
                    trades are on the other tabs.
                  </p>
                )}
              </div>
            )}
            {dtab === "activity" && (
              <div className="pd-pane">
                {trades == null && !tradesErr ? (
                  <p className="pf-empty load-row">
                    <LoadingMark size={14} /> Loading trades…
                  </p>
                ) : tradesErr ? (
                  <p className="pd-empty-pane">Couldn&apos;t read this pool&apos;s trades right now — it retries every 30 seconds.</p>
                ) : trades && trades.length === 0 ? (
                  <p className="pd-empty-pane">
                    No trades in the recent window{protocol === "aqua" ? "" : " the network keeps (about a day)"}.
                  </p>
                ) : (
                  <div className="pd-trades">
                    <div className="pd-trow pd-thead">
                      <span>Time</span>
                      <span>Action</span>
                      <span>Amounts</span>
                      <span>Tx</span>
                    </div>
                    {(trades ?? []).map((t, i) => {
                      const sold = t.signed ? t.legs.filter((l) => l.amount < 0) : [];
                      const got = t.signed ? t.legs.filter((l) => l.amount > 0) : [];
                      const n = (v: number) => Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 100 ? 2 : 4 });
                      return (
                        <div key={`${t.tx}-${i}`} className="pd-trow">
                          <span className="pd-dim">{t.time ? agoText(t.time) : "—"}</span>
                          <span className={`pd-type t-${t.type.replace(/[^a-z_]/g, "")}`}>{t.type.replace(/_/g, " ")}</span>
                          <span className="pd-legs">
                            {t.signed && sold.length && got.length ? (
                              <>
                                {sold.map((l) => `${n(l.amount)} ${l.code}`).join(" + ")} <i>→</i> {got.map((l) => `${n(l.amount)} ${l.code}`).join(" + ")}
                              </>
                            ) : t.legs.length ? (
                              t.legs.map((l) => `${n(l.amount)} ${l.code}`).join(" · ")
                            ) : (
                              "—"
                            )}
                          </span>
                          <span>
                            {t.tx ? (
                              <a href={`${explorerBase()}/tx/${t.tx}`} target="_blank" rel="noreferrer">
                                {t.tx.slice(0, 6)}… ↗
                              </a>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>{" "}
          </div>
          <aside className="pd-side" aria-label="Pool position">
            {" "}
            {isCl ? (
              clInfo ? (
                <>
                  <h4 className="pd-side-title">Add a range</h4>
                  <ClDeposit pool={address} info={clInfo} account={activeAcct ?? null} owner={owner ?? null} bals={bals} />
                  <button type="button" className="linkbtn pd-side-link" onClick={() => setDtab("range")}>
                    Withdraw or rebalance your ranges →
                  </button>
                </>
              ) : (
                <p className="pf-empty load-row">
                  <LoadingMark size={14} /> Reading the pool…
                </p>
              )
            ) : (
            <>
            <ModeSwitch
              label="Deposit or withdraw"
              value={pmode}
              options={[
                ["deposit", "Deposit"],
                ["withdraw", "Withdraw"],
              ]}
              onChange={(m) => {
                setPmode(m);
                setAmts({});
                setLpErr(null);
              }}
            />{" "}
            {row.assets.map((a) => {
              const bal = bals[a.code] ?? 0;
              return (
                <div key={a.contract} className="pd-box">
                  {" "}
                  <div className="pd-box-top">
                    {" "}
                    <span className="pd-tok">
                      <TokenIcon symbol={a.code} size={22} contract={a.contract} /> {a.code}
                    </span>{" "}
                    <span className="pd-bal">
                      {fmtNum(bal)} {a.code}{" "}
                      <button
                        type="button"
                        className="pd-max"
                        disabled={pmode === "withdraw" ? !(lpUnder(row.assets.indexOf(a)) > 0) : !(bal > 0)}
                        onClick={() =>
                          setLpAmount(
                            row.assets.indexOf(a),
                            trimNum(pmode === "withdraw" ? lpUnder(row.assets.indexOf(a)) : bal),
                          )
                        }
                      >
                        MAX
                      </button>
                    </span>{" "}
                  </div>{" "}
                  <input
                    className="pd-amt"
                    value={amts[a.contract] ?? ""}
                    onChange={(e) => setLpAmount(row.assets.indexOf(a), onlyNum(e.target.value))}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`${a.code} amount`}
                  />{" "}
                </div>
              );
            })}{" "}
            <div className="pd-meta">
              {" "}
              <div>
                <span>Network</span>
                <b>Stellar</b>
              </div>{" "}
              <div>
                <span>Supplied ({row.pair})</span>
                <b>
                  {lp && BigInt(lp.shares) > BigInt(0)
                    ? row.assets.map((a, i) => `${fmtNum(lpUnder(i))} ${a.code}`).join(" + ")
                    : "—"}
                </b>
              </div>{" "}
            </div>{" "}
            {lpErr && <p className="qm-error">{lpErr}</p>}
            <TxModal spec={lpConfirm} onClose={() => setLpConfirm(null)} />
            {lpSupported ? (
              <button
                type="button"
                className="btn primary pd-submit"
                disabled={lpGate ? false : !activeAcct || lpBusy}
                onClick={lpGate ? lpGate.run : submitLp}
              >
                {lpGate ? lpGate.label : lpBusy ? "Working…" : pmode === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            ) : (
              <>
                <p className="pd-note">
                  Sushi V3 positions are NFTs with their own price range — Seidar can&apos;t hold or rebalance them yet, so they are
                  opened and moved on Sushi.
                </p>
                <a className="btn primary pd-submit" href="https://www.sushi.com/stellar/pool" target="_blank" rel="noreferrer">
                  Manage range on Sushi ↗
                </a>
              </>
            )}{" "}
            </>
            )}
          </aside>{" "}
        </div>
        );
      })()}{" "}
    </div>
  );
}

/** APY %, with tiny non-zero yields shown as "<0.01%". */
function fmtApy(v: number): string {
  return v > 0 && v < 0.01 ? "<0.01%" : `${v.toFixed(2)}%`;
}

/** "3m ago" style relative time for feeds. */
function agoText(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* Honest placeholders (Soroswap / Sushi): the same ev-hero size as every
   other protocol page, tinted with the protocol card color, plus the
   reason there is no board — Soroswap exposes quotes only, Sushi has no
   verified Stellar pool source. No numbers, nothing mocked. */
export function Views({ view }: { view: AppView }) {
  // Re-render on smart-account renames (names replace C… addresses).
  useAccountNames();
  if (view === "portfolio") return <Portfolio />;
  // Vaults + RWA only: every retired lending / pool view lands on the hub.
  if (
    view === "markets" ||
    view === "blend" ||
    view === "xoxno" ||
    view === "aqua" ||
    view === "phoenix" ||
    view === "soroswap" ||
    view === "sushi" ||
    view === "lend-borrow" ||
    view === "pools" ||
    view === "automate"
  )
    return <RedirectTo href="/vaults" />;
  if (view === "defindex") return <EarnView only="defindex" />;
  if (view === "upshift") return <EarnView only="upshift" />;
  // Earn = the live opportunity feed only (vault browsers live on the
  // DeFindex / Upshift protocol pages; Getting Started is on the home page).
  if (view === "earn") return <EarnFeed />;
  if (view === "refinance") return <RefinanceView />;
  if (view === "vaults") return <MarketsSection kind="vaults" />;
  if (view === "recipes") return <StrategyBuilder />;
  if (view === "exchange") return <ExchangeView />;
  return <RedirectTo href="/" />;
}
/* History tab: section chrome + the account's decoded protocol txs. */
function HistorySection({ id }: { id: ProtocolId }) {
  const { active, owner } = useSectionAccount();
  return (
    <div className="at-wrap">
      <SectionTabs id={id} section="history" />
      <PositionHeader id={id} compact />
      <ProtocolHistory protocol={id} address={active ?? null} owner={owner ?? null} />
    </div>
  );
}
/* Client-side redirect for retired views. */
function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return null;
}
