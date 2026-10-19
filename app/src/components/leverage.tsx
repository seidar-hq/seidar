"use client";
import { explorerBase, networkPassphrase } from "@/lib/network";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { healthBps } from "@seidar/positions-sdk";
import { TokenIcon } from "./token-icon";
import { LoadingMark } from "./loading";
import {
  executeMarketSwap,
  quoteOutBase,
  quoteRoutes,
  toBaseUnits,
  txHashOf,
  type RouteChoice,
  type SwapToken,
} from "./exchange";
import { apiFetch } from "@/lib/api";
import { runLending } from "@/lib/tx";
import { pct, useFees } from "@/lib/fees";
import { smartGate, useSmartAccount } from "./smart-gate";
import { RatioBar } from "./automate-kit";

/* ------------------------------------------------------------------ */
/* Leverage: Long / Short XLM — leveraged position composer on live Blend   */
/* markets. Long = supply XLM, borrow stables, swap to XLM, supply.    */
/* Short = supply stables, borrow XLM, swap to stables, supply. Every  */
/* number is live (pools, Reflector prices, Soroswap quotes, wallet    */
/* balances) or explicitly marked estimated. Non-custodial: each step  */
/* is wallet-signed by the user. Mainnet.                              */
/* ------------------------------------------------------------------ */

export type LeverageDirection = "long" | "short";

type PoolAsset = {
  pool: string;
  poolName: string;
  protocol: string;
  code: string;
  supplyApy: number | null;
  borrowApy: number | null;
  ltvPct: number | null;
  canCollateral: boolean;
  canBorrow: boolean;
  /** On-chain pool status (Blend): 0-1 active, 2-3 on-ice (no borrows),
      4-5 frozen (no supply/borrow), 6 setup. Null when unreadable. */
  poolStatus?: number | null;
};

type AggQuote = {
  amountOut?: unknown;
  otherAmountThreshold?: unknown;
  priceImpactPct?: unknown;
  rawTrade?: { amountOut?: unknown; amountOutMin?: unknown; distribution?: { protocol_id?: unknown }[] };
  distribution?: { protocol_id?: unknown }[];
  routePlan?: unknown;
  [k: string]: unknown;
} | null;

const PASS = networkPassphrase();

/** Live max recursive leverage from an LTV percent (geometric series
 *  1/(1−LTV), floored to 0.1, capped at 5x). Null when LTV is unknown —
 *  callers show a loading mark, never a stale static figure. */
export function maxLeverageForLtv(ltvPct: number | null): number | null {
  if (ltvPct == null || !Number.isFinite(ltvPct) || ltvPct <= 0 || ltvPct >= 100) return null;
  // Quoted at the 1.30 health floor every leveraged action enforces (same as
  // the API's maxLev), not at the liquidation edge 1 / (1 - ltv).
  const lev = 1 / (1 - ltvPct / 100 / 1.3);
  return lev > 1 ? Math.min(Math.floor(lev * 10) / 10, 5) : null;
}
const STABLES = ["USDC", "EURC", "PYUSD", "USDT0", "USDGLO"];

/* Leverage loops. One Blend submit can't borrow the whole loop debt up
   front (health ~ ltv / (lev - 1) would be below 1), so the position is
   built in rounds: each submit supplies what the last swap returned and
   borrows only what keeps health >= LOOP_MIN_HEALTH (sized on-chain by
   /lending/borrow-capacity). */
const LOOP_MIN_HEALTH = 1.1;
const LOOP_MAX_ROUNDS = 8;
/** Planned borrow per round, as multiples of the initial collateral value. */
function planLoop(ltv: number, lev: number): number[] {
  const out: number[] = [];
  let coll = 1;
  let debt = 0;
  const target = lev - 1;
  while (debt < target - 1e-6 && out.length < LOOP_MAX_ROUNDS) {
    const cap = (coll * ltv) / LOOP_MIN_HEALTH - debt;
    if (cap <= 1e-6) break;
    const b = Math.min(target - debt, cap);
    out.push(b);
    debt += b;
    coll += b;
  }
  return out;
}
const FROM_CODES = ["XLM", "USDC", "EURC"];
const VENUE_FEE_BPS = 0;
const RATIO_FLOOR = 120;

function numOnly(v: string) {
  const clean = v.replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  const num =
    dot === -1
      ? clean
      : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "");
  return num.replace(/^0+(?=\d)/, "");
}

function fmtUsd(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** Adaptive dollars: whole for big, cents near $1, 4dp below (an XLM liq
 *  price like $0.1356 must never round to "$0"). */
function fmtPx(v: number): string {
  if (v >= 100) return `$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 1) {
    return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  }
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 })}`;
}

function fmtTok(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Quote output in human token units. Uses the exact base-unit integer
 *  when the quote carries one — the float leg is unit-ambiguous across
 *  aggregator shapes and once inflated a $500 swap into billions. */
function outTokens(quote: AggQuote, decimals: number): number | null {
  if (!quote) return null;
  const base = quoteOutBase(quote);
  if (base != null) {
    try {
      const v = Number(BigInt(base)) / 10 ** decimals;
      return Number.isFinite(v) && v >= 0 ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}



async function postJson(path: string, body: unknown, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return r.json();
  } finally {
    clearTimeout(t);
  }
}

export function LeverageModal({
  open,
  onClose,
  asset,
  direction,
}: {
  open: boolean;
  onClose: () => void;
  asset: string;
  direction: LeverageDirection;
}) {
  // Positions open in the smart account (`wallet` below); the connected
  // owner wallet signs for it.
  const { owner: ownerWallet, account: wallet, smarts: levSmarts } = useSmartAccount();
  const levGate = ownerWallet && !wallet ? smartGate(ownerWallet, levSmarts) : null;
  // Balances of the active account (smart account), else the wallet.
  const balAddr = wallet ?? ownerWallet;
  const [balances, setBalances] = useState<Record<string, number>>({});
  const swapFeeBps = useFees()?.swapBps ?? null;
  const [balsLive, setBalsLive] = useState(false);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [poolAssets, setPoolAssets] = useState<PoolAsset[]>([]);
  const [poolsLive, setPoolsLive] = useState(false);
  const [tokens, setTokens] = useState<SwapToken[]>([]);
  // Form state
  const [fromCode, setFromCode] = useState("XLM");
  const [fromOpen, setFromOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [lev, setLev] = useState(2);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [pickCode, setPickCode] = useState<string | null>(null);
  const [slip, setSlip] = useState("20");
  const [slipCustom, setSlipCustom] = useState("");
  const [slipMode, setSlipMode] = useState<"20" | "50" | "5" | "custom">("20");
  // Auto routing (best live route); the picker was removed from this modal.
  const [route] = useState<RouteChoice>([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [auto, setAuto] = useState(true);
  /* Stop-loss / take-profit overrides set by dragging the chart lines.
     Until touched, sensible live defaults apply (liq-anchored when known,
     else spot-anchored) so the lines always exist and stay meaningful. */
  const [poolsError, setPoolsError] = useState(false);
  const [poolsRetry, setPoolsRetry] = useState(0);
  const [copied, setCopied] = useState(false);
  // Quotes (preview)
  const [quoteMain, setQuoteMain] = useState<AggQuote>(null);
  const [quotePre, setQuotePre] = useState<AggQuote>(null);
  const [quoteNote, setQuoteNote] = useState<string | null>(null);
  // Execution
  const [running, setRunning] = useState(false);
  const [stepStates, setStepStates] = useState<
    { key: string; label: string; status: string; hash: string | null }[]
  >([]);
  const [done, setDone] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [alertNote, setAlertNote] = useState<string | null>(null);

  const isLong = direction === "long";
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const prevOpen = useRef(false);

  /* Reset when the modal opens (transition only — never on re-renders). */
  useEffect(() => {
    if (open && !prevOpen.current) {
      setAmount("");
      setLev(2);
      setPoolId(null);
      setPickCode(null);
      setFromCode(isLong ? "XLM" : "USDC");
      setQuoteMain(null);
      setQuotePre(null);
      setQuoteNote(null);
      setRunning(false);
      setStepStates([]);
      setDone(false);
      setFatal(null);
      setAlertNote(null);
    }
    prevOpen.current = open;
  }, [open, isLong]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  /* Live feeds. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPoolsError(false);
    apiFetch("/api/pools?protocol=blend", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const arr = Array.isArray(d?.assets) ? d.assets : [];
        const rows: PoolAsset[] = [];
        for (const a of arr as Record<string, unknown>[]) {
          const code = String(a?.code ?? "").toUpperCase();
          const pool = String(a?.pool ?? "");
          if (!code || !/^C[A-Z2-7]{55}$/.test(pool)) continue;
          const sApy = Number(a?.supplyApy);
          const bApy = Number(a?.borrowApy);
          const ltv = Number(a?.ltvPct);
          rows.push({
            pool,
            poolName: String(a?.poolName ?? "Pool"),
            protocol: String(a?.protocol ?? "blend"),
            code,
            supplyApy: Number.isFinite(sApy) ? sApy : null,
            borrowApy: Number.isFinite(bApy) ? bApy : null,
            ltvPct: Number.isFinite(ltv) ? ltv : null,
            canCollateral: a?.canCollateral !== false,
            canBorrow: a?.canBorrow !== false,
            poolStatus:
              typeof a?.poolStatus === "number" ? a.poolStatus : null,
          });
        }
        setPoolAssets(rows);
        setPoolsLive(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPoolsLive(false);
          setPoolsError(true);
        }
      });
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.tokens)) setTokens(d.tokens);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, poolsRetry]);

  useEffect(() => {
    if (!open || !balAddr) {
      if (!balAddr) {
        setBalances({});
        setBalsLive(false);
      }
      return;
    }
    let cancelled = false;
    apiFetch(`/api/balances?address=${balAddr}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok || !Array.isArray(d.balances)) return;
        const m: Record<string, number> = {};
        for (const b of d.balances as { code?: unknown; balance?: unknown; listed?: unknown }[]) {
          if (b?.listed === false) continue; // another issuer's look-alike
          const code = typeof b?.code === "string" ? b.code.toUpperCase() : "";
          const n = Number(b?.balance);
          if (code && n > 0) m[code] = Math.max(m[code] ?? 0, n);
        }
        if (!cancelled) {
          setBalances(m);
          setBalsLive(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, balAddr]);
  /* Dropdowns close on outside click / Escape. */
  const [poolOpen, setPoolOpen] = useState(false);
  const poolWrapRef = useRef<HTMLDivElement>(null);
  const fromWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fromOpen && !poolOpen) return;
    function onDown(e: MouseEvent) {
      if (fromWrapRef.current && !fromWrapRef.current.contains(e.target as Node)) {
        setFromOpen(false);
      }
      if (poolWrapRef.current && !poolWrapRef.current.contains(e.target as Node)) {
        setPoolOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [fromOpen, poolOpen]);
  /* Single held deposit token snaps the From selector onto it. */
  useEffect(() => {
    if (!wallet) return;
    const held = FROM_CODES.filter((c) => (balances[c] ?? 0) > 0);
    if (held.length === 1 && fromCode !== held[0]) setFromCode(held[0]);
  }, [wallet, balances, fromCode]);
  /* "—" = no wallet / no data; "…" = loading; real zero shows 0.00. */
  const balText = (c: string) =>
    !balAddr ? "0" : !balsLive ? "…" : fmtTok(balances[c] ?? 0);

  /* Venue pools: collateral leg + debt leg must both exist in one pool. */
  const venues = useMemo(() => {
    const byPool = new Map<string, PoolAsset[]>();
    for (const a of poolAssets) {
      const l = byPool.get(a.pool) ?? [];
      l.push(a);
      byPool.set(a.pool, l);
    }
    const out: {
      pool: string;
      poolName: string;
      coll: PoolAsset;
      debts: PoolAsset[];
      colls: PoolAsset[];
    }[] = [];
    for (const [pool, assets] of byPool) {
      // Leverage always borrows and supplies: on-ice/frozen/setup pools
      // (status 2+) cannot serve it. Unknown status fails open.
      const pst = assets[0]?.poolStatus ?? null;
      if (pst != null && pst >= 2) continue;
      const xlm = assets.find((a) => a.code === "XLM");
      if (!xlm) continue;
      if (isLong && !xlm.canCollateral) continue;
      const stables = assets.filter((a) => STABLES.includes(a.code));
      if (isLong) {
        const debts = stables.filter((a) => a.canBorrow && a.borrowApy != null);
        if (debts.length === 0) continue;
        out.push({ pool, poolName: assets[0].poolName, coll: xlm, debts, colls: [] });
      } else {
        if (!xlm.canBorrow || xlm.borrowApy == null) continue;
        const colls = stables.filter((a) => a.canCollateral && a.supplyApy != null);
        if (colls.length === 0) continue;
        out.push({ pool, poolName: assets[0].poolName, coll: xlm, debts: [], colls });
      }
    }
    out.sort((a, b) => {
      const av = isLong
        ? (a.coll.supplyApy ?? -1)
        : Math.max(...a.colls.map((x) => x.supplyApy ?? -1));
      const bv = isLong
        ? (b.coll.supplyApy ?? -1)
        : Math.max(...b.colls.map((x) => x.supplyApy ?? -1));
      return bv - av;
    });
    return out;
  }, [poolAssets, isLong]);

  const venue = useMemo(() => {
    if (venues.length === 0) return null;
    if (poolId) return venues.find((v) => v.pool === poolId) ?? venues[0];
    return venues[0];
  }, [venues, poolId]);
  const effPoolId = venue?.pool ?? null;

  /* Picked variable leg: debt stable (long) or collateral stable (short). */
  const pickOptions = useMemo(() => {
    if (!venue) return [];
    if (isLong) {
      return [...venue.debts].sort((a, b) => (a.borrowApy ?? 1e9) - (b.borrowApy ?? 1e9));
    }
    return [...venue.colls].sort((a, b) => (b.supplyApy ?? -1) - (a.supplyApy ?? -1));
  }, [venue, isLong]);
  const picked =
    pickOptions.find((x) => x.code === pickCode) ??
    pickOptions.find((x) => (isLong ? x.code === "USDC" : x.code === "USDC")) ??
    pickOptions[0] ??
    null;

  const collCode = isLong ? "XLM" : (picked?.code ?? "USDC");
  const debtCode = isLong ? (picked?.code ?? "USDC") : "XLM";
  const collLtvPct = useMemo(() => {
    const hit = venue
      ? (isLong
          ? venue.coll.ltvPct
          : venue.colls.find((x) => x.code === collCode)?.ltvPct ?? null)
      : null;
    return hit;
  }, [venue, isLong, collCode]);
  const ltv = (collLtvPct ?? 70) / 100;
  // Same 1.30 health floor as the home card (maxLeverageForLtv), never the
  // liquidation edge 1 / (1 - ltv).
  const maxLev = maxLeverageForLtv(ltv * 100) ?? 1;
  const levClamped = Math.max(1, Math.min(lev, maxLev));
  const sApy = isLong
    ? (venue?.coll.supplyApy ?? null)
    : (venue?.colls.find((x) => x.code === collCode)?.supplyApy ?? null);
  const bApy = isLong
    ? (venue?.debts.find((x) => x.code === debtCode)?.borrowApy ?? null)
    : (venue?.coll.borrowApy ?? null);

  /* Prices for every involved code. */
  const priceCodes = useMemo(() => {
    const s = new Set(["XLM", "USDC", "EURC", fromCode, collCode, debtCode]);
    return [...s].join(",");
  }, [fromCode, collCode, debtCode]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await apiFetch(`/api/prices?codes=${encodeURIComponent(priceCodes)}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!cancelled && d?.ok) {
          setPrices(d.prices ?? {});
        }
      } catch {
        /* keep last */
      }
    }
    load();
    const t = setInterval(load, 45000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, priceCodes]);

  const tokenOf = (code: string) =>
    tokens.find((t) => t.code.toUpperCase() === code.toUpperCase()) ?? null;

  /* Principal + position math (USD). */
  const amtNum = amount.trim() === "" ? NaN : Number(amount);
  const pxFrom = prices[fromCode] ?? null;
  const pxC = prices[collCode] ?? null;
  const pxD = prices[debtCode] ?? null;
  const fromBal = balances[fromCode] ?? 0;
  const reserve = fromCode === "XLM" ? 1 : 0;
  const maxAmt = Math.max(0, fromBal - reserve);
  const principalUsd = Number.isFinite(amtNum) && amtNum > 0 && pxFrom ? amtNum * pxFrom : 0;

  const slipBps =
    slipMode === "custom"
      ? String(Math.max(1, Math.round(Number(slipCustom) * 100) || 0))
      : slip;
  const routeProtos = route.length === 0 ? undefined : [...route];

  /* Live quotes: pre-swap (from→coll) + main loop swap (debt→coll). */
  const quoteKey = useMemo(() => {
    if (!Number.isFinite(amtNum) || amtNum <= 0 || levClamped < 1) return "";
    return [
      fromCode,
      collCode,
      debtCode,
      amount,
      levClamped.toFixed(1),
      slipBps,
      route.join("+"),
      tokens.length,
      pxC ?? "?",
      pxD ?? "?",
      pxFrom ?? "?",
    ].join("|");
  }, [amtNum, amount, levClamped, fromCode, collCode, debtCode, slipBps, route, tokens.length, pxC, pxD, pxFrom]);
  useEffect(() => {
    if (!open || !quoteKey) {
      setQuoteMain(null);
      setQuotePre(null);
      setQuoteNote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const collT = tokenOf(collCode);
        const debtT = tokenOf(debtCode);
        const fromT = tokenOf(fromCode);
        if (!collT || !debtT || !pxC || !pxD) return;
        // Principal in collateral terms (pre-swap if needed).
        let collUsd = principalUsd;
        if (fromCode !== collCode && fromT && pxFrom) {
          const base0 = toBaseUnits(amount, fromT.decimals);
          if (base0 == null) return;
          const q0 = await postJson("/api/swap/quote", {
            assetIn: fromT.contract,
            assetOut: collT.contract,
            amount: base0,
            tradeType: "EXACT_IN",
            slippageBps: slipBps,
            ...(routeProtos ? { protocols: routeProtos } : {}),
          });
          if (cancelled) return;
          if (q0?.ok && q0.quote) {
            setQuotePre(q0.quote);
            const outTok = outTokens(q0.quote, collT.decimals);
            if (outTok != null && outTok > 0) collUsd = outTok * (pxC ?? 0);
          } else if (q0?.reason === "no-api-key") {
            setQuoteNote("Live routing needs a Soroswap API key — showing indicative prices.");
          }
        } else if (!cancelled) {
          setQuotePre(null);
        }
        const debtUsd = collUsd * (levClamped - 1);
        if (!debtT || debtUsd <= 0 || !pxD) {
          if (!cancelled) setQuoteMain(null);
          return;
        }
        const base1 = toBaseUnits(String(debtUsd / pxD), debtT.decimals);
        if (base1 == null) return;
        const q1 = await postJson("/api/swap/quote", {
          assetIn: debtT.contract,
          assetOut: collT.contract,
          amount: base1,
          tradeType: "EXACT_IN",
          slippageBps: slipBps,
          ...(routeProtos ? { protocols: routeProtos } : {}),
        });
        if (cancelled) return;
        if (q1?.ok && q1.quote) {
          setQuoteMain(q1.quote);
        } else if (q1?.reason === "no-api-key") {
          setQuoteNote("Live routing needs a Soroswap API key — showing indicative prices.");
        }
      } catch {
        /* keep last */
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteKey]);

  const quoteOutTok = quoteMain ? (outTokens(quoteMain, tokenOf(collCode)?.decimals ?? 7) ?? NaN) : NaN;
  const impact =
    quoteMain && (quoteMain as { priceImpactPct?: unknown }).priceImpactPct != null
      ? Number((quoteMain as { priceImpactPct?: unknown }).priceImpactPct)
      : null;
  const routes = quoteMain ? quoteRoutes(quoteMain) : [];
  const preOutTok = quotePre ? (outTokens(quotePre, tokenOf(collCode)?.decimals ?? 7) ?? NaN) : NaN;

  /* Resolved position (preview uses live quotes where present). */
  const pos = useMemo(() => {
    if (!(principalUsd > 0) || !pxC || !pxD) return null;
    let collUsd = principalUsd;
    if (fromCode !== collCode && Number.isFinite(preOutTok) && preOutTok > 0) {
      collUsd = preOutTok * pxC;
    }
    const debtUsd = collUsd * (levClamped - 1);
    let loopOutUsd: number | null = null;
    if (debtUsd > 0 && Number.isFinite(quoteOutTok) && quoteOutTok > 0) {
      loopOutUsd = quoteOutTok * pxC;
    }
    const collTok = collUsd / pxC;
    const debtTok = debtUsd / pxD;
    const totalCollTok = collTok + (loopOutUsd != null ? loopOutUsd / pxC : 0);
    const totalCollUsd = collUsd + (loopOutUsd ?? 0);
    const hb = debtUsd > 0 ? healthBps(totalCollUsd, debtUsd) : null;
    const ratio = hb != null ? hb / 100 : null;
    const liqPx =
      debtUsd > 0 && totalCollTok > 0
        ? isLong
          ? debtUsd / (totalCollTok * ltv)
          : (collTok * pxC * ltv) / Math.max(debtTok, 1e-12)
        : null;
    const away =
      liqPx != null && (isLong ? pxC : pxD)
        ? (((isLong ? pxC! : pxD!) - liqPx) / (isLong ? pxC! : pxD!)) * 100
        : null;
    return { collUsd, debtUsd, loopOutUsd, collTok, debtTok, totalCollTok, totalCollUsd, ratio, liqPx, away };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principalUsd, pxC, pxD, levClamped, preOutTok, quoteOutTok, fromCode, collCode, isLong, ltv]);
  /* Health factor after opening (collateral ratio x ltv; 1.0 = liquidation),
     the same scale as the automation panels' bar. */
  const healthAfter = pos?.ratio != null ? (pos.ratio / 100) * ltv : null;

  /* Net APY on deployed principal: supply earnings on the gross position
     minus borrow cost. */
  const netSimple =
    pos && sApy != null && bApy != null && pos.collUsd > 0
      ? (sApy * pos.totalCollUsd - bApy * pos.debtUsd) / pos.collUsd // APYs are already percents
      : null;
  const needsSwap = fromCode !== collCode || (pos != null && pos.debtUsd > 0);
  const noKeyBlock = quoteNote != null && needsSwap;

  const blockReason: string | null = (() => {
    if (!wallet)
      return ownerWallet ? "Leverage runs from your smart account." : "Connect a wallet from the top bar to continue.";
    if (!poolsLive) return "Loading live pools…";
    if (!venue) return "No Blend pool supports this pair right now.";
    if (!(pxC && pxD && pxFrom)) return "Waiting on live prices…";
    if (!(Number.isFinite(amtNum) && amtNum > 0)) return "Enter an amount above 0.";
    if (amtNum > maxAmt + 1e-9)
      return `Insufficient ${fromCode} balance (spendable ${fmtTok(maxAmt)}).`;
    if (tokenOf(collCode) == null || tokenOf(debtCode) == null)
      return "Token registry hasn't loaded this pair yet.";
    if (pos?.ratio != null && pos.ratio < RATIO_FLOOR)
      return `Ratio ${pos.ratio.toFixed(0)}% is below the ${RATIO_FLOOR}% safety floor — lower leverage.`;
    if (noKeyBlock) return "Swaps need a server Soroswap key — try 1x with no conversion.";
    return null;
  })();

  /* Step plan + execution. */
  type Step = { key: string; label: string; detail: string };
  const steps: Step[] = useMemo(() => {
    if (!pos || !venue || !wallet) return [];
    const s: Step[] = [];
    if (fromCode !== collCode) {
      s.push({
        key: "preswap",
        label: `Swap ${fromCode} → ${collCode}`,
        detail: `${fmtTok(amtNum)} ${fromCode} ≈ ${fmtUsd(principalUsd)}`,
      });
    }
    if (levClamped <= 1.001) {
      s.push({
        key: "supply",
        label: `Supply ${fmtTok(pos.collTok)} ${collCode}`,
        detail: `${venue.poolName} · ${fmtUsd(pos.collUsd)}`,
      });
      return s;
    }
    // Rounds (see planLoop): supply + borrow within the health floor, swap
    // the borrow back, repeat; the last submit supplies the final swap.
    const plan = planLoop(ltv, levClamped);
    const debtPerUnit = pxD ? pos.collUsd / pxD : 0;
    plan.forEach((m, i) => {
      s.push({
        key: `round${i}`,
        label:
          i === 0
            ? `Supply ${fmtTok(pos.collTok)} ${collCode} + borrow ≈${fmtTok(m * debtPerUnit)} ${debtCode}`
            : `Supply swapped ${collCode} + borrow ≈${fmtTok(m * debtPerUnit)} ${debtCode}`,
        detail: `${venue.poolName} · health stays ≥ ${LOOP_MIN_HEALTH.toFixed(2)}`,
      });
      s.push({ key: `swap${i}`, label: `Swap ${debtCode} → ${collCode}`, detail: "quoted at execution" });
    });
    s.push({ key: "final", label: `Supply swapped ${collCode}`, detail: `${venue.poolName} · last leg` });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, venue, wallet, fromCode, collCode, amtNum, principalUsd, levClamped, pxC, pxD, ltv]);

  async function runLeverage() {
    if (!wallet || !venue || !pos || blockReason) return;
    const collT = tokenOf(collCode)!;
    const debtT = tokenOf(debtCode)!;
    const fromT = tokenOf(fromCode)!;
    setRunning(true);
    setFatal(null);
    setDone(false);
    setAlertNote(null);
    const states: { key: string; label: string; status: string; hash: string | null }[] =
      steps.map((s) => ({ key: s.key, label: s.label, status: "queued", hash: null }));
    setStepStates(states);
    const setSt = (key: string, status: string, hash: string | null = null) =>
      setStepStates((prev) => prev.map((s) => (s.key === key ? { ...s, status, hash } : s)));
    try {
      const tstr = (v: number, dec: number) => {
        const b = toBaseUnits(v.toFixed(dec), dec);
        if (b == null || BigInt(b) <= BigInt(0)) throw new Error("Amount rounds to zero — raise it.");
        return b;
      };
      // Blend legs run from the smart account through the shared lending
      // runner; the owner wallet signs for it.
      const signSendBlend = async (
        key: string,
        requests: { type: string; asset: string; amount: string }[],
      ): Promise<string> => {
        setSt(key, "building");
        const { hashes } = await runLending(
          {
            protocol: "blend",
            from: wallet,
            pool: venue.pool,
            actions: requests.map((r) => ({ action: r.type as "supply" | "borrow", asset: r.asset, amount: r.amount })),
          },
          (st) => {
            const last = st[st.length - 1];
            if (last && last.status !== "done") setSt(key, last.status, last.hash ?? null);
          },
          ownerWallet!,
        );
        const hash = hashes[hashes.length - 1] ?? "";
        setSt(key, "done", hash);
        return hash;
      };
      // Step 0: fund in collateral when From differs.
      let collTotalTok = pos.collTok;
      if (fromCode !== collCode) {
        const r = await executeMarketSwap({
          sellTok: fromT,
          buyTok: collT,
          amountTokens: String(amtNum),
          from: wallet,
          signer: ownerWallet ?? undefined,
          slippageBps: slipBps,
          protocols: routeProtos,
          onStatus: (s) => setSt("preswap", s),
        });
        if (r.outTokens == null || r.outTokens <= 0) throw new Error("Funding swap returned nothing.");
        collTotalTok = r.outTokens;
        setSt("preswap", "done", r.hash);
      }
      if (levClamped <= 1.001) {
        await signSendBlend("supply", [
          { type: "supply", asset: collT.contract, amount: tstr(collTotalTok, collT.decimals) },
        ]);
      } else {
        // Rounds (planLoop): each submit supplies the last swap's output and
        // borrows what the pool allows at health >= LOOP_MIN_HEALTH, read
        // on-chain right before signing.
        const rounds = steps.filter((s) => s.key.startsWith("round")).length;
        const target = BigInt(tstr(pos.debtTok, debtT.decimals));
        let borrowed = BigInt(0);
        let toSupply = BigInt(tstr(collTotalTok, collT.decimals));
        let i = 0;
        for (; i < rounds; i++) {
          const remaining = target - borrowed;
          const capRes = await apiFetch(
            `/api/lending/borrow-capacity?pool=${venue.pool}&account=${wallet}&asset=${debtT.contract}` +
              `&minHealth=${LOOP_MIN_HEALTH}&addAsset=${collT.contract}&addAmount=${toSupply}`,
            { cache: "no-store" },
          ).then((r) => r.json());
          if (!capRes?.ok) throw new Error(String(capRes?.error ?? "Couldn't size the next borrow."));
          const cap = BigInt(String(capRes.amount));
          let b = remaining < cap ? remaining : cap;
          // A dust top-up isn't worth a round of signatures.
          if (b < remaining / BigInt(50) && borrowed > BigInt(0)) b = BigInt(0);
          if (b <= BigInt(0)) break;
          await signSendBlend(`round${i}`, [
            { type: "supply", asset: collT.contract, amount: toSupply.toString() },
            { type: "borrow", asset: debtT.contract, amount: b.toString() },
          ]);
          borrowed += b;
          const r = await executeMarketSwap({
            sellTok: debtT,
            buyTok: collT,
            amountTokens: (Number(b) / 10 ** debtT.decimals).toFixed(debtT.decimals),
            from: wallet,
            signer: ownerWallet ?? undefined,
            slippageBps: slipBps,
            protocols: routeProtos,
            onStatus: (s) => setSt(`swap${i}`, s),
          });
          if (r.outTokens == null || r.outTokens <= 0) throw new Error("Loop swap returned nothing.");
          setSt(`swap${i}`, "done", r.hash);
          toSupply = BigInt(tstr(r.outTokens, collT.decimals));
        }
        // Rounds the pool didn't need (or had no room for) are skipped.
        for (let k = i; k < rounds; k++) {
          setSt(`round${k}`, "skipped");
          setSt(`swap${k}`, "skipped");
        }
        await signSendBlend("final", [
          { type: "supply", asset: collT.contract, amount: toSupply.toString() },
        ]);
        if (borrowed < target - target / BigInt(50)) {
          setAlertNote((n) =>
            [n, `The pool had room for ${fmtTok(Number(borrowed) / 10 ** debtT.decimals)} of ${fmtTok(pos.debtTok)} ${debtCode} at a safe health, so leverage ends a bit lower than chosen.`].filter(Boolean).join(" "),
          );
        }
      }
      if (auto) {
        try {
          const a = await postJson("/api/alerts", {
            wallet: ownerWallet,
            protocol: "blend",
            kind: "ratio",
            direction: "below",
            threshold: 120,
          });
          const note = a?.ok
            ? "Seidar Automation armed — ratio alert below 120%."
            : "Alert not stored (set it up in Automate).";
          setAlertNote((n) => [note, n].filter(Boolean).join(" "));
        } catch {
          setAlertNote((n) => ["Alert not stored (set it up in Automate).", n].filter(Boolean).join(" "));
        }
      }
      setDone(true);
      try {
        window.dispatchEvent(new Event("seidar:refresh"));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message.slice(0, 220) : String(e).slice(0, 220));
    } finally {
      setRunning(false);
    }
  }

  if (!open) return null;
  const title = `${isLong ? "Long" : "Short"} ${asset}`;
  const fromOptions = FROM_CODES.filter((c) => c === collCode || (balances[c] ?? 0) > 0);
  /* Deposit token side: no held tokens → not-available icon; one held →
     static token; several held → token + dropdown. Disconnected behaves
     like the swap boxes (full list, plain dropdown). */
  const heldFrom = FROM_CODES.filter((c) => (balances[c] ?? 0) > 0);
  const dropList = wallet ? fromOptions.filter((c) => heldFrom.includes(c)) : fromOptions;
  const showFromNA = !!wallet && dropList.length === 0;
  const slipBpsNum = Math.max(1, Number(slipBps) || 20);
  const minOut = quoteMain ? quoteOutBase(quoteMain) : null;

  return (
    <div
      className="mv-overlay"
      onMouseDown={(e) => {
        if (!running && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mv-modal lev-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mv-head ed-head lev-head">
          <div>
            <h3>
              <TokenIcon symbol={asset} size={28} /> {title}
            </h3>
            <p className="ed-desc">
              {isLong
                ? `Supply ${asset}, borrow stablecoins and loop them back into ${asset}: your gains grow faster when ${asset} rises.`
                : `Supply stablecoins, borrow ${asset} and swap it to stables: you profit as ${asset} falls.`}
            </p>
          </div>
          <div className="lev-headbtns">
            <button
              type="button"
              className="mv-x"
              aria-label="Copy link"
              title="Copy link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* ignore */
                }
              }}
            >
              {copied ? "✓" : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="mv-x"
              aria-label="Close"
              onClick={() => {
                if (!running) onClose();
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div className="mv-grid">
          <div className="mv-left">
            <p className="lev-bal">
              Balance: <b>{balText(fromCode)}</b>
              {maxAmt > 0 && (
                <button type="button" onClick={() => setAmount(String(maxAmt))}>
                  MAX
                </button>
              )}
            </p>
            <div className="lev-box">
              <span className="lev-boxlabel">You deposit:</span>
              <div className="lev-mid">
                <input
                  className="lev-amt"
                  value={amount}
                  onChange={(e) => setAmount(numOnly(e.target.value))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Deposit amount"
                />
                <span className="lev-usd">
                  {principalUsd > 0 ? fmtPx(principalUsd) : "$0"}
                </span>
              </div>
              <div className="lev-cell">
                <div className="lev-dd" ref={fromWrapRef}>
                  <button
                    type="button"
                    className="lev-ddbtn"
                    aria-haspopup="listbox"
                    aria-expanded={fromOpen}
                    aria-label="From token"
                    disabled={dropList.length <= 1}
                    onClick={() => setFromOpen((o) => !o)}
                  >
                    {showFromNA ? (
                      <span className="lev-na" title="No tokens in wallet" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><line x1="5.5" y1="5.5" x2="18.5" y2="18.5" /></svg>
                      </span>
                    ) : (
                      <TokenIcon symbol={fromCode} size={20} />
                    )}
                    <b>{showFromNA ? "—" : fromCode}</b>
                    {dropList.length > 1 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                    )}
                  </button>
                  {fromOpen && dropList.length > 1 && (
                    <div className="lev-ddlist" role="listbox" aria-label="From token">
                      {dropList.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="option"
                          aria-selected={fromCode === c}
                          className="lev-ddopt"
                          onClick={() => {
                            setFromCode(c);
                            setFromOpen(false);
                          }}
                        >
                          <TokenIcon symbol={c} size={18} /> <b>{c}</b>
                          <small>{balText(c)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mv-stats lev-stats">
              <div>
                <span>Collateral:</span>
                <b>
                  {pos ? (
                    <>
                      <TokenIcon symbol={collCode} size={16} /> {fmtTok(pos.totalCollTok)} {collCode}
                    </>
                  ) : (
                    "—"
                  )}
                </b>
              </div>
              <div>
                <span>Debt:</span>
                <b>
                  {pos && pos.debtUsd > 0 ? (
                    <>
                      <TokenIcon symbol={debtCode} size={16} /> {fmtTok(pos.debtTok)} {debtCode}
                    </>
                  ) : (
                    "—"
                  )}
                </b>
              </div>
              <div>
                <span>Ratio:</span>
                <b className={pos?.ratio != null && pos.ratio < 150 ? "neg" : undefined}>
                  {pos?.ratio != null ? `${pos.ratio.toFixed(2)}%` : "—"}
                </b>
              </div>
              <div>
                <span>Net APY:</span>
                <b>{netSimple != null ? `${netSimple >= 0 ? "" : "−"}${Math.abs(netSimple).toFixed(2)}%` : "—"}</b>
              </div>
              <div>
                <span>Liq. price:</span>
                <b>
                  {pos?.liqPx != null
                    ? `${fmtPx(pos.liqPx)}${pos.away != null ? ` (${pos.away >= 0 ? "−" : "+"}${Math.abs(pos.away).toFixed(1)}%)` : ""}`
                    : "—"}
                </b>
              </div>
            </div>
            <p className="mv-label lev-levlabel">
              Leverage: <b>{levClamped.toFixed(1)}x</b>
            </p>
            <input
              type="range"
              className="lev-slider"
              min={1}
              max={maxLev}
              step={0.1}
              value={levClamped}
              onChange={(e) => setLev(Number(e.target.value))}
              aria-label="Leverage"
              style={
                {
                  "--lev-fill": `linear-gradient(to right, var(--green) 0%, var(--green) ${
                    maxLev > 1 ? ((levClamped - 1) / (maxLev - 1)) * 100 : 0
                  }%, #2c2c2c ${
                    maxLev > 1 ? ((levClamped - 1) / (maxLev - 1)) * 100 : 0
                  }%, #2c2c2c 100%)`,
                } as CSSProperties
              }
            />
            <p className="lev-range">
              <span>1x</span>
              <span>{maxLev.toFixed(1)}x max</span>
            </p>
            <p className="mv-label lev-picklabel">
              {isLong ? "Choose debt asset:" : "Choose collateral asset:"}
            </p>
            <div className="lev-grid2">
              {(isLong
                ? pickOptions.map((a) => ({ code: a.code, rate: a.borrowApy, kind: "Borrow" as const }))
                : pickOptions.map((a) => ({ code: a.code, rate: a.supplyApy, kind: "Supply" as const }))
              ).map((o) => (
                <button
                  key={o.code}
                  type="button"
                  className={`lev-pick${(isLong ? debtCode : collCode) === o.code ? " sel" : ""}`}
                  onClick={() => setPickCode(o.code)}
                >
                  <TokenIcon symbol={o.code} size={22} />
                  <span className="lev-pickmain">
                    <b>{o.code}</b>
                    <small>
                      {o.kind} rate: {o.rate != null ? `${o.rate.toFixed(2)}%` : "—"}
                    </small>
                  </span>
                  {(isLong ? debtCode : collCode) === o.code && (
                    <span className="lev-check" aria-hidden="true">✓</span>
                  )}
                </button>
              ))}
            </div>
            {pickOptions.length === 0 && !poolsLive && !poolsError && (
              <p className="lev-sub">Loading markets…</p>
            )}
            {poolsError && (
              <p className="lev-sub">
                Markets failed to load.{" "}
                <button
                  type="button"
                  className="lev-retry"
                  onClick={() => setPoolsRetry((k) => k + 1)}
                >
                  Retry
                </button>
              </p>
            )}
            {poolsLive && !poolsError && pickOptions.length === 0 && (
              <p className="lev-sub">No markets for {asset} right now.</p>
            )}
          </div>
          <div className="mv-right">
            <div className="lev-proto">
              <span className="lev-protobadge">
                {!poolsLive ? (
                  <LoadingMark size={16} />
                ) : (
                  <img loading="lazy" src="/protocol-blend.png" alt="" width={22} height={22} />
                )}
                Blend · {venue?.poolName ?? "—"}
              </span>
              {venues.length > 1 && (
                <div className="lev-dd lev-pooldd" ref={poolWrapRef}>
                  <button
                    type="button"
                    className="lev-ddbtn lev-poolbtn"
                    aria-haspopup="listbox"
                    aria-expanded={poolOpen}
                    aria-label="Blend pool"
                    onClick={() => setPoolOpen((o) => !o)}
                  >
                    <img loading="lazy" src="/protocol-blend.png" alt="" width={16} height={16} />
                    <span>{venue?.poolName ?? "—"}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {poolOpen && (
                    <div className="lev-ddlist" role="listbox" aria-label="Blend pool">
                      {venues.map((v) => (
                        <button
                          key={v.pool}
                          type="button"
                          role="option"
                          aria-selected={effPoolId === v.pool}
                          className="lev-ddopt"
                          onClick={() => {
                            setPoolId(v.pool);
                            setPoolOpen(false);
                          }}
                        >
                          <img loading="lazy" src="/protocol-blend.png" alt="" width={16} height={16} />
                          <span className="lev-poolopt">
                            <b>{v.poolName}</b>
                            <small>
                              {v.pool.slice(0, 4)}…{v.pool.slice(-4)}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="lev-ratio">
              <div className="lev-ratio-head">
                <span>Health after opening</span>
                <b className={healthAfter != null && healthAfter < 1.3 ? "neg" : undefined}>
                  {healthAfter != null ? `${(healthAfter * 100).toFixed(0)}%` : levClamped <= 1.001 ? "No debt" : "—"}
                </b>
              </div>
              <RatioBar
                current={healthAfter}
                marks={auto ? [{ value: RATIO_FLOOR / 100, tone: "trigger", label: "Alert" }] : []}
              />
              <p className="lev-ratio-note">
                Liquidation at 100%{auto ? ` · Seidar alerts you below ${RATIO_FLOOR}%` : ""}
              </p>
            </div>
            <div className="lev-auto">
              <div className="lev-autorow">
                <span className="lev-autotag">Seidar Automation</span>
                <button
                  type="button"
                  className="lev-learn"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent("seidar:goto-view", { detail: "automate" }));
                  }}
                >
                  Learn more ›
                </button>
              </div>
              <p>Avoid liquidation during downturns — arms a ratio alert below 120% on Create.</p>
              <div className="lev-autorow lev-autotoggle">
                <span>Protective alert below 120%.</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={auto}
                  className={`lev-switch${auto ? " on" : ""}`}
                  onClick={() => setAuto((a) => !a)}
                  aria-label="Seidar Automation"
                >
                  <i aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className={`ed-slip lev-slipcard${slipOpen ? " open" : ""}`}>
              <button type="button" className="ed-slip-head" aria-expanded={slipOpen} onClick={() => setSlipOpen((v) => !v)}>
                <span>
                  <b>Slippage limit: {(slipBpsNum / 100).toFixed(slipBpsNum % 100 === 0 ? 0 : 2)}%</b>
                  <small>Configure swap parameters</small>
                </span>
                <svg
                  className="ed-caret"
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
                </svg>
              </button>
              {slipOpen && (
                <div className="lev-sliprow ed-sliprow">
                  {[
                    { label: "0.05%", bps: "5" },
                    { label: "0.2%", bps: "20" },
                    { label: "0.5%", bps: "50" },
                  ].map((o) => (
                    <button
                      key={o.bps}
                      type="button"
                      className={`lev-slip${slipMode === o.bps ? " sel" : ""}`}
                      onClick={() => {
                        setSlip(o.bps);
                        setSlipMode(o.bps as "20" | "50" | "5");
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                  <input
                    className={slipMode === "custom" ? "sel" : ""}
                    value={slipMode === "custom" ? slipCustom : ""}
                    onFocus={() => setSlipMode("custom")}
                    onChange={(e) => {
                      setSlipCustom(numOnly(e.target.value));
                      setSlipMode("custom");
                    }}
                    placeholder="Custom %"
                    inputMode="decimal"
                    aria-label="Custom slippage percent"
                  />
                </div>
              )}
            </div>
            <p className="lev-line">
              Rate:{" "}
              {pos && quoteOutTok > 0
                ? `${fmtTok(pos.debtTok / Math.max(quoteOutTok, 1e-12))} ${debtCode} = 1.00 ${collCode}`
                : pxD && pxC
                  ? `≈ ${fmtTok(pxC / pxD)} ${debtCode} = 1.00 ${collCode} (indicative)`
                  : "—"}
            </p>
            <p className="lev-line">
              Trade size price impact: {impact != null ? `${impact.toFixed(2)}%` : "—"}
            </p>
            <p className="lev-line">
              Route: {routes.length > 0 ? routes.join(" · ") : quoteNote ?? "—"}
            </p>
            {minOut != null && (
              <p className="lev-line">Min. received: {minOut} base units</p>
            )}
            <p className="lev-line">
              Seidar service fee:{" "}
              {swapFeeBps == null ? "…" : swapFeeBps > 0 ? `${pct(swapFeeBps)} of each swap's output` : "none"}
            </p>
            {quoteNote && <p className="lev-warn">{quoteNote}</p>}
            {fatal && (
              <p className="lev-error" role="alert">
                {fatal}
              </p>
            )}
            {stepStates.length > 0 && (
              <ol className="lev-progress">
                {stepStates.map((s) => (
                  <li key={s.key} className={`st-${s.status}`}>
                    {s.status === "done" ? "✓" : s.status === "queued" ? "○" : "◌"} {s.label}
                    <small>{s.status === "done" && s.hash ? s.hash.slice(0, 8) + "…" : s.status}</small>
                    {s.hash && (
                      <a
                        href={`${explorerBase()}/tx/${s.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {done && (
              <p className="lev-done" role="status">
                Position open. {alertNote}
              </p>
            )}
            <button
              type="button"
              className="lev-create"
              disabled={levGate ? false : running || blockReason != null}
              title={levGate ? undefined : (blockReason ?? undefined)}
              onClick={levGate ? levGate.run : runLeverage}
            >
              {levGate ? levGate.label : running ? "Working…" : "Create"}
            </button>
            {blockReason && wallet && <p className="lev-warn">{blockReason}</p>}
            {!ownerWallet && <p className="lev-warn">Connect a wallet from the top bar to continue.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
