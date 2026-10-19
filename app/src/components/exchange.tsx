"use client";
import { explorerBase, isTestnetMode, networkPassphrase } from "@/lib/network";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TokenIcon } from "./token-icon";
import { useTxActive, useOwnerSmarts } from "./shell";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";
import { apiFetch } from "@/lib/api";
import { signAndSend, type TxStep } from "@/lib/tx";
import { TxModal, type TxSpec } from "./tx-modal";
import { feeText, pct, useFees } from "@/lib/fees";
import {
  kitGetAddress,
  kitGetNetwork,
  kitOpenAuthModal,
  rememberWalletKind,
  walletKindFor,
} from "@/lib/wallets";
import { AkCheck, disableAutomation, enableAutomation, useAutomation, type Automation } from "./automate-kit";

/* ------------------------------------------------------------------ */
/* Exchange: Swap (Soroswap aggregated routing) + Limit Order (Stellar */
/* Classic DEX offers) + DCA (browser-kept plans, signed per run).     */
/* Non-custodial throughout: quotes/builds are unsigned until the user */
/* signs in their wallet. Mainnet.                                     */
/* ------------------------------------------------------------------ */

export type SwapToken = {
  code: string;
  contract: string;
  decimals: number;
  name: string | null;
  issuer: string | null;
};

type Bal = { code: string; issuer: string | null; balance: number };

export type Quote = {
  amountOut?: unknown;
  priceImpactPct?: unknown;
  rawTrade?: { distribution?: { protocol_id?: unknown }[] };
  distribution?: { protocol_id?: unknown }[];
  [k: string]: unknown;
};

function numOnly(v: string) {
  const clean = v.replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  const num =
    dot === -1
      ? clean
      : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "");
  return num.replace(/^0+(?=\d)/, "");
}

/** ExpandJS exponential notation ("2.67e+23") into plain digits (floored). */
function expandExponential(s: string): string | null {
  const m = s.match(/^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) return null;
  const digits = m[1] + (m[2] ?? "");
  const point = m[1].length + parseInt(m[3], 10);
  if (point <= 0) return null;
  if (point >= digits.length)
    return digits + "0".repeat(point - digits.length);
  return digits.slice(0, point);
}

/** Token amount -> base-unit integer string, exact (never exponential).
 * Truncates (floors) beyond `decimals` so EXACT_IN never overspends. */
export function toBaseUnits(amount: string, decimals: number): string | null {
  const clean = amount.trim();
  const plain = /^\d+(\.\d+)?$/.test(clean)
    ? clean
    : expandExponential(clean);
  if (plain == null) return null;
  const [i, f = ""] = plain.split(".");
  if (!/^\d+$/.test(i) || !/^\d*$/.test(f)) return null;
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const s = ((i.replace(/^0+/, "") || "0") + frac).replace(/^0+(?=\d)/, "");
  if (s === "" || !/^\d+$/.test(s)) return null;
  return s;
}

/** Compact amount formatting (trims trailing zeros, caps decimals). */
function fmtAmt(v: number): string {
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Session wallet: restores like the shell, stays in sync through events. */
function useXWallet() {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    function onWallet(e: Event) {
      setAddress((e as CustomEvent<string | null>).detail ?? null);
    }
    window.addEventListener("seidar:wallet", onWallet);
    let stored: string | null = null;
    try {
      const raw = window.localStorage.getItem("seidar.wallet");
      stored = raw ? (JSON.parse(raw) as string) : null;
      if (stored) setAddress(stored);
    } catch {
      /* ignore */
    }
    kitGetAddress(walletKindFor(stored)).then(
      (addr) => {
        if (addr) setAddress(addr);
      },
      () => {},
    );
    return () => window.removeEventListener("seidar:wallet", onWallet);
  }, []);
  async function connect() {
    const c = await kitOpenAuthModal();
    const addr = c?.address ?? null;
    if (addr && c) {
      rememberWalletKind(addr, c.walletId);
      setAddress(addr);
      try {
        window.localStorage.setItem("seidar.wallet", JSON.stringify(addr));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("seidar:wallet", { detail: addr }),
      );
    }
    return addr;
  }
  return { address, connect };
}

function useSwapTokens() {
  const [tokens, setTokens] = useState<SwapToken[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.tokens))
          setTokens(d.tokens as SwapToken[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return tokens;
}

function useBalances(address: string | null) {
  const [bals, setBals] = useState<Bal[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  useEffect(() => {
    if (!address) {
      setBals([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    function load() {
      apiFetch(`/api/balances?address=${address}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d?.ok && Array.isArray(d.balances)) {
            // Look-alikes from unlisted issuers (a fake "USDC") never count.
            setBals((d.balances as (Bal & { listed?: boolean })[]).filter((b) => b.listed !== false));
            setStatus("ready");
          } else if (!cancelled) {
            setStatus("error");
          }
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }
    load();
    const t = setInterval(load, 60000);
    window.addEventListener("seidar:refresh", load);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("seidar:refresh", load);
    };
  }, [address]);
  return { bals, status };
}

export type Strategy = {
  id: number | string;
  wallet: string;
  kind: "limit" | "dca";
  status: string;
  params: Record<string, unknown>;
  attempts: number;
  last_note: string;
  created_at: string;
  updated_at: string;
};

const LS_STRAT = "seidar.strategies";

function readLocalStrat(): Strategy[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(LS_STRAT);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Strategy[]) : [];
  } catch {
    return [];
  }
}

/** Strategies live in Postgres; localStorage mirrors when the DB is down. */
function useStrategies(wallet: string | null) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [dbMode, setDbMode] = useState(true);
  useEffect(() => {
    if (!wallet) {
      setStrategies([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/strategies?wallet=${wallet}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && Array.isArray(d.strategies)) {
          setDbMode(true);
          setStrategies(d.strategies as Strategy[]);
        } else {
          setDbMode(false);
          setStrategies(
            readLocalStrat().filter((s) => s.wallet === wallet),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDbMode(false);
          setStrategies(readLocalStrat().filter((s) => s.wallet === wallet));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  function saveLocal(next: Strategy[]) {
    try {
      const others = readLocalStrat().filter((s) => s.wallet !== wallet);
      window.localStorage.setItem(
        LS_STRAT,
        JSON.stringify([...next, ...others]),
      );
    } catch {
      /* ignore */
    }
  }

  async function refresh() {
    if (!wallet) return;
    try {
      const d = await apiFetch(`/api/strategies?wallet=${wallet}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (d?.ok && Array.isArray(d.strategies)) {
        setDbMode(true);
        setStrategies(d.strategies as Strategy[]);
        return;
      }
    } catch {
      /* fall through */
    }
    setDbMode(false);
  }

  async function create(
    kind: "limit" | "dca",
    params: Record<string, unknown>,
  ): Promise<Strategy | null> {
    if (!wallet) return null;
    try {
      const d = await postJson("/api/strategies", { wallet, kind, params });
      if (d?.ok && d.strategy) {
        setStrategies((prev) => [d.strategy as Strategy, ...prev]);
        return d.strategy as Strategy;
      }
    } catch {
      /* fall through to local */
    }
    const local: Strategy = {
      id: `local-${Date.now()}`,
      wallet,
      kind,
      status: "active",
      params,
      attempts: 0,
      last_note: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setStrategies((prev) => {
      const next = [local, ...prev];
      saveLocal(next);
      return next;
    });
    setDbMode(false);
    return local;
  }

  async function patch(
    id: number | string,
    upd: Partial<
      Pick<Strategy, "status" | "params" | "attempts" | "last_note">
    >,
  ) {
    if (!wallet) return;
    setStrategies((prev) => {
      const next = prev.map((s) =>
        String(s.id) === String(id) ? { ...s, ...upd } : s,
      );
      saveLocal(next);
      return next;
    });
    if (typeof id === "number") {
      try {
        const r = await apiFetch("/api/strategies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet, id, ...upd }),
        });
        const d = await r.json();
        if (d?.ok && d.strategy) {
          setStrategies((prev) =>
            prev.map((s) =>
              String(s.id) === String(id) ? (d.strategy as Strategy) : s,
            ),
          );
        }
      } catch {
        /* optimistic state stands */
      }
    }
  }

  return { strategies, dbMode, refresh, create, patch };
}

/** Indicative USD for display (live prices, polled). */
function usePairPrices(a: string | null, b: string | null) {
  const key = [a, b]
    .filter(Boolean)
    .map((c) => (c as string).toUpperCase())
    .sort()
    .join(",");
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    function load() {
      apiFetch(`/api/prices?codes=${encodeURIComponent(key)}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d?.ok) setPrices(d.prices ?? {});
        })
        .catch(() => {});
    }
    load();
    const t = setInterval(load, 45000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [key]);
  const px = (code: string | null): number | null => {
    if (!code) return null;
    const p = prices[code.toUpperCase()];
    return typeof p === "number" && p > 0 ? p : null;
  };
  return px;
}

/** Token dropdown with logos (swap variant). */
export function SwapSelect({
  value,
  onChange,
  options,
  label,
  floating = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SwapToken[];
  label: string;
  /** Position the list against the viewport so a scrolling parent (a
   *  modal body) neither clips it nor grows a scrollbar for it. */
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!open || !floating || !ref.current) return;
    // Align with the token cell, like the in-flow list does.
    const cell = (ref.current.parentElement ?? ref.current).getBoundingClientRect();
    setPos({ top: cell.bottom + 8, right: window.innerWidth - cell.right });
    // A scroll elsewhere would leave the list behind: close it.
    function onScroll(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, floating]);
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
  }, [open ]);
  const shown = options.filter((o) =>
    `${o.code} ${o.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="x-select" ref={ref}>
      {" "}
      <button
        type="button"
        className="x-select-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
      >
        {" "}
        <TokenIcon symbol={value} size={26} />{" "}
        <b>{value}</b>{" "}
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
        <div
          className="x-drop"
          role="listbox"
          aria-label={label}
          style={floating && pos ? { position: "fixed", top: pos.top, right: pos.right, zIndex: 90 } : undefined}
        >
          {" "}
          <input
            className="x-drop-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tokens"
            aria-label="Search tokens"
          />{" "}
          <div className="x-drop-list">
            {" "}
            {shown.slice(0, 60).map((o) => (
              <button
                key={o.code}
                type="button"
                role="option"
                aria-selected={o.code === value}
                className={`x-drop-option${o.code === value ? " selected" : ""}`}
                onClick={() => {
                  onChange(o.code);
                  setOpen(false);
                  setQ("");
                }}
              >
                {" "}
                <TokenIcon symbol={o.code} size={22} />{" "}
                <span>
                  <b>{o.code}</b>{" "}
                  {o.name && <small>{o.name}</small>}{" "}
                </span>{" "}
              </button>
            ))}{" "}
            {shown.length === 0 && (
              <p className="x-drop-empty">No tokens match.</p>
            )}{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}

/** Numeric strings coerce (Soroswap returns base-unit bigints as strings). */
function num(v: unknown): number | null {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Seidar's fee on a smart-account quote (bps; null when none applies). */
export function quoteFeeBps(quote: Quote | null): number | null {
  const s = (quote as { seidar?: { feeBps?: unknown } } | null)?.seidar;
  return s ? num(s.feeBps) : null;
}

/** What the account receives after Seidar's fee, when the quote carries one. */
function quoteNet(quote: Quote): unknown {
  return (quote as { seidar?: { amountOutNet?: unknown } }).seidar?.amountOutNet;
}

export function quoteOut(quote: Quote | null): number | null {
  if (!quote) return null;
  const net = num(quoteNet(quote));
  if (net != null) return net;
  const direct =
    num(quote.amountOut) ?? num(quote.otherAmountThreshold) ?? null;
  if (direct != null) return direct;
  const raw = quote.rawTrade;
  if (raw && typeof raw === "object") {
    const nested =
      num((raw as { amountOut?: unknown }).amountOut) ??
      num((raw as { amountOutMin?: unknown }).amountOutMin);
    if (nested != null) return nested;
  }
  return null;
}

/** Exact integer-string output (base units) for min-out guards — avoids
 * float precision loss on large amounts. Falls back to null when the
 * quote carries only fractional/indicative values. */
export function quoteOutBase(quote: Quote | null): string | null {
  if (!quote) return null;
  const raw: unknown[] = [
    quoteNet(quote),
    quote.amountOut,
    quote.otherAmountThreshold,
    (quote.rawTrade as { amountOut?: unknown } | undefined)?.amountOut,
    (quote.rawTrade as { amountOutMin?: unknown } | undefined)?.amountOutMin,
  ];
  for (const v of raw) {
    if (typeof v === "string" && /^\d+$/.test(v.trim())) return v.trim();
    if (typeof v === "number" && Number.isFinite(v) && v >= 0)
      return String(Math.floor(v));
  }
  return null;
}

export function quoteRoutes(quote: Quote | null): string[] {
  if (!quote) return [];
  const dist =
    (Array.isArray(quote.rawTrade?.distribution)
      ? quote.rawTrade?.distribution
      : Array.isArray(quote.distribution)
        ? quote.distribution
        : []) ?? [];
  const names = dist
    .map((d) => String(d?.protocol_id ?? "").toLowerCase())
    .filter(Boolean);
  // Some quotes carry only routePlan legs (no distribution split).
  if (names.length === 0) {
    const plan = (quote as { routePlan?: unknown }).routePlan;
    if (Array.isArray(plan)) {
      for (const leg of plan) {
        const p = (leg as { swapInfo?: { protocol?: unknown } })?.swapInfo
          ?.protocol;
        if (typeof p === "string" && p) names.push(p.toLowerCase());
      }
    }
  }
  return [...new Set(names)];
}

export function txHashOf(res: unknown): string | null {
  try {
    const m = JSON.stringify(res).match(/\b[0-9a-f]{64}\b/i);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

async function postJson(path: string, body: unknown, ms = 25000) {
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

/** Shared market-swap execution: quote -> min-out guard -> build -> sign -> send.
 * minOutBase (buy-side base units) is the execution constraint for automated
 * strategies: if a fresh quote no longer satisfies it, nothing executes. */
export async function executeMarketSwap(args: {
  sellTok: SwapToken;
  buyTok: SwapToken;
  amountTokens: string;
  from: string;
  /** Wallet key that signs; defaults to `from` (differs for sub-accounts). */
  signer?: string;
  to?: string;
  minOutBase?: string;
  slippageBps?: string;
  feeBps?: number;
  protocols?: string[];
  onStatus: (s: string) => void;
}): Promise<{ hash: string | null; outTokens: number | null }> {
  const {
    sellTok,
    buyTok,
    amountTokens,
    from,
    signer,
    to,
    minOutBase,
    slippageBps,
    feeBps,
    protocols,
    onStatus,
  } = args;
  const base = toBaseUnits(amountTokens, sellTok.decimals);
  if (base == null || BigInt(base) <= BigInt(0))
    throw new Error("Enter an amount above 0.");
  // Smart accounts (C...) route via Soroswap · Aqua only; the owner wallet
  // signs. A destination other than the account is a second, owner-signed
  // transfer of the swap's executed output.
  const smart = /^C[A-Z2-7]{55}$/.test(from);
  if (smart && !signer) throw new Error("Connect the wallet that owns this smart account.");
  onStatus(smart ? "Quoting across Soroswap · Aqua…" : "Quoting across Soroswap · Phoenix · Aqua · SDEX · Sushi…");
  const q = await postJson("/api/swap/quote", {
    assetIn: sellTok.contract,
    assetOut: buyTok.contract,
    amount: base,
    tradeType: "EXACT_IN",
    slippageBps: slippageBps ?? "50",
    ...(feeBps ? { feeBps } : {}),
    ...(protocols && protocols.length > 0 ? { protocols } : {}),
    ...(smart ? { smart: true } : {}),
  });
  if (!q?.ok || q.quote == null) {
    const raw = String((q as { error?: unknown })?.error ?? "");
    const friendly =
      (q as { reason?: unknown })?.reason === "no-api-key"
        ? "Live routing needs a Soroswap API key (see note below)."
        : /not.?found/i.test(raw)
          ? "No route found for this pair/amount from the active account."
          : raw || "No route found for this pair/amount.";
    throw new Error(friendly);
  }
  const quote = q.quote as Quote;
  if (minOutBase != null) {
    const outStr = quoteOutBase(quote);
    let guardOk = false;
    try {
      if (outStr != null) guardOk = BigInt(outStr) >= BigInt(minOutBase);
    } catch {
      guardOk = false;
    }
    if (outStr == null) {
      // No exact integer on the quote — fall back to float comparison.
      const outBase = quoteOut(quote);
      guardOk =
        outBase != null && BigInt(Math.round(outBase)) >= BigInt(minOutBase);
    }
    if (!guardOk) {
      const err = new Error(
        "Fresh quote below minimum output — strategy stays active for another attempt.",
      ) as Error & { minOutViolated?: boolean };
      err.minOutViolated = true;
      throw err;
    }
  }
  onStatus("Building unsigned transaction…");
  const b = await postJson("/api/swap/build", {
    quote,
    from,
    ...(smart ? { signer } : {}),
    ...(to && !smart ? { to } : {}),
  });
  if (!b?.ok || typeof b.xdr !== "string") {
    const raw = String((b as { error?: unknown })?.error ?? "");
    throw new Error(
      /not.?found/i.test(raw) || !raw
        ? "Build failed - is the active account funded with the sell asset?"
        : raw,
    );
  }
  // Connected wallet signs (any kit wallet, not only Freighter); the API
  // submits and waits for the ledger verdict, so success means SUCCESS.
  const sent = await signAndSend(b.xdr, signer ?? from, (st) =>
    onStatus(st === "signing" ? "Approve the swap in your wallet…" : "Submitting to Stellar…"),
  );
  // Prefer the executed amount from the router's return value (last hop
  // out); fall back to the quote when the router returns nothing numeric.
  let outBase: number | null = null;
  const rv = sent.returnValue;
  const last = Array.isArray(rv) ? rv[rv.length - 1] : rv;
  if (typeof last === "bigint" || typeof last === "number" || (typeof last === "string" && /^\d+$/.test(last)))
    outBase = Number(last);
  const executed =
    typeof last === "bigint" ? last : typeof last === "number" || typeof last === "string" ? BigInt(String(last)) : null;
  if (outBase == null || !(outBase > 0)) outBase = quoteOut(quote);
  if (smart && to && to !== from) {
    // Only the amount the swap actually returned is forwarded.
    if (executed == null || executed <= BigInt(0))
      throw new Error("Swap done, but its output amount wasn't reported — send it from your smart account drawer.");
    onStatus("Approve sending the output in your wallet…");
    const t = await postJson("/api/automation/account/transfer", {
      owner: signer,
      account: from,
      token: buyTok.contract,
      amount: executed.toString(),
      direction: "out",
      to,
    });
    if (!t?.ok || typeof t.xdr !== "string")
      throw new Error(String(t?.error ?? "Swap done, but the transfer couldn't be built — send it from your smart account drawer."));
    await signAndSend(t.xdr, signer!, (st) =>
      onStatus(st === "signing" ? "Approve sending the output in your wallet…" : "Submitting to Stellar…"),
    );
  }
  return {
    hash: sent.hash,
    outTokens: outBase != null ? outBase / 10 ** buyTok.decimals : null,
  };
}

/* ---------------------------------- Swap --------------------------------- */

const SWAP_DRAFT_KEY = "seidar.swapDraft";

function readSwapDraft(): {
  sellCode?: string;
  buyCode?: string;
  sellAmt?: string;
} {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(SWAP_DRAFT_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return typeof d === "object" && d ? d : {};
  } catch {
    return {};
  }
}

function SwapPanel({
  tokens,
  bals,
  balStatus,
  wallet,
  onConnect,
  quote,
  setQuote,
  slippageBps,
  protocols,
  sellCode,
  setSellCode,
  buyCode,
  setBuyCode,
  sellAmt,
  setSellAmt,
}: {
  tokens: SwapToken[];
  bals: Bal[];
  balStatus: "idle" | "loading" | "ready" | "error";
  wallet: string | null;
  onConnect: () => Promise<string | null>;
  quote: Quote | null;
  setQuote: (q: Quote | null) => void;
  slippageBps: string;
  protocols: string[] | undefined;
  sellCode: string;
  setSellCode: (v: string) => void;
  buyCode: string;
  setBuyCode: (v: string) => void;
  sellAmt: string;
  setSellAmt: (v: string) => void;
}) {
  const [quoting, setQuoting] = useState(false);
  const fees = useFees();
  const [noKey, setNoKey] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState(false);
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{
    hash: string | null;
    out: number | null;
  } | null>(null);
  const px = usePairPrices(sellCode, buyCode);
  // Swaps run from the smart account; the connected wallet signs for it.
  const { owner: swapOwner, smarts: swapSmarts } = useSmartAccount();
  const smartTx = isSmartAddress(wallet);
  const gate = wallet && !smartTx ? smartGate(swapOwner, swapSmarts) : null;
  const reqId = useRef(0);
  const quoteRef = useRef<Quote | null>(null);
  quoteRef.current = quote;

  const sellTok = tokens.find((t) => t.code === sellCode) ?? null;
  const buyTok = tokens.find((t) => t.code === buyCode) ?? null;
  // Balances known only after a successful feed read. A connected wallet
  // whose asset is absent from a READY feed holds none of it (0) — so
  // over-balance and unowned-asset amounts can never reach submission.
  const balsReady = balStatus === "ready";
  const balsLoading = !!wallet && !balsReady && balStatus !== "error";
  const balsFailed = !!wallet && balStatus === "error";
  const sellBal = bals.find((b) => b.code === sellCode)?.balance ?? (balsReady ? 0 : null);
  const buyBal = bals.find((b) => b.code === buyCode)?.balance ?? (balsReady ? 0 : null);
  const amtNum = Number(sellAmt) || 0;

  /* Live quote (debounced, stale-while-revalidate): a failed refresh keeps
     the last good quote on screen instead of blanking buy/rate/impact.
     Only fresh user input (new pair, cleared amount) replaces it. */
  useEffect(() => {
    setDone(null);
    if (
      !sellTok ||
      !buyTok ||
      sellTok.code === buyTok.code ||
      !(amtNum > 0)
    ) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setNoKey(false);
    const base = toBaseUnits(sellAmt, sellTok.decimals);
    if (base == null || BigInt(base) <= BigInt(0)) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoting(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const q = await postJson("/api/swap/quote", {
          assetIn: sellTok.contract,
          assetOut: buyTok.contract,
          amount: base,
          tradeType: "EXACT_IN",
          slippageBps,
          ...(protocols && protocols.length > 0 ? { protocols } : {}),
          ...(smartTx ? { smart: true } : {}),
        });
        if (id !== reqId.current) return;
        if (q?.reason === "no-api-key") {
          setNoKey(true);
          setQuote(null);
          setQuoteError(null);
        } else if (q?.ok && q.quote != null) {
          setNoKey(false);
          setQuote(q.quote as Quote);
          setQuoteError(null);
        } else {
          const stale = quoteRef.current ? " — showing last quote." : "";
          setQuoteError(`${String(q?.error ?? "No route found.")}${stale}`);
        }
      } catch {
        if (id !== reqId.current) return;
        setQuoteError(
          quoteRef.current
            ? "Quote refresh failed — showing last quote."
            : "Quote refresh failed — check connection and retype.",
        );
      } finally {
        if (id === reqId.current) setQuoting(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellTok, buyTok, amtNum, slippageBps, protocols?.join(), smartTx]);

  const outBase = quoteOut(quote);
  const outTokens =
    quote && outBase != null && buyTok
      ? outBase / 10 ** buyTok.decimals
      : null;
  const pxIn = px(sellCode);
  const pxOut = px(buyCode);
  const estOut =
    !quote && pxIn != null && pxOut != null && pxOut > 0 && amtNum > 0
      ? (amtNum * pxIn) / pxOut
      : null;
  const shownOut = outTokens ?? estOut;
  /* Rate always visible: live quote first, else per-unit price ratio. */
  const unitRate =
    pxIn != null && pxOut != null && pxOut > 0 ? pxIn / pxOut : null;
  const rate =
    quote && outTokens != null && amtNum > 0
      ? outTokens / amtNum
      : estOut != null && amtNum > 0
        ? estOut / amtNum
        : unitRate;
  const rateLive = Boolean(quote && outTokens != null && amtNum > 0);
  const impact =
    quote?.priceImpactPct != null ? String(quote.priceImpactPct) : null;
  const routes = quoteRoutes(quote);
  const sellUsd = pxIn != null && amtNum > 0 ? amtNum * pxIn : null;
  const buyUsd =
    pxOut != null && shownOut != null ? shownOut * pxOut : null;
  const destBad = sendTo && !/^G[A-Z2-7]{55}$/.test(dest.trim());
  const maxSell =
    sellBal != null
      ? Math.max(0, sellBal - (sellCode === "XLM" ? 1 : 0))
      : null;

  function flip() {
    setSellCode(buyCode);
    setBuyCode(sellCode);
    setQuote(null);
    setQuoteError(null);
    setDone(null);
  }

  /* Confirm + result through the shared transaction popup. */
  const [swapConfirm, setSwapConfirm] = useState<TxSpec | null>(null);
  async function onSwap() {
    setDone(null);
    try {
      const addr = wallet ?? (await onConnect());
      if (!addr) throw new Error("Connect a wallet first.");
      if (maxSell != null && amtNum > maxSell)
        throw new Error(
          `Amount exceeds your balance (${maxSell.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sellCode}).`,
        );
      if (!sellTok || !buyTok) throw new Error("Pick two swap tokens.");
      if (sellTok.code === buyTok.code)
        throw new Error("Pick two different assets.");
      if (destBad) throw new Error("Destination must be a G… address.");
      const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
      const sTok = sellTok;
      const bTok = buyTok;
      setStatus(null);
      setSwapConfirm({
        title: `Swap: ${sellAmt} ${sellCode} → ${buyCode}`,
        code: buyCode,
        amount: shownOut != null ? `≈ ${fmt(shownOut)}` : undefined,
        context: smartTx ? "From your smart account" : undefined,
        serviceFee: smartTx
          ? feeText(
              quoteFeeBps(quote) ?? fees?.swapBps,
              buyTok && num(quote?.amountOut) != null ? num(quote?.amountOut)! / 10 ** buyTok.decimals : null,
              buyCode,
            )
          : "None",
        rows: [
          { label: "Sell", value: `${sellAmt} ${sellCode}`, sub: sellUsd != null ? `$${sellUsd.toFixed(2)}` : undefined },
          {
            label: "Receive (est.)",
            value: shownOut != null ? `${fmt(shownOut)} ${buyCode}` : "—",
            sub: buyUsd != null ? `$${buyUsd.toFixed(2)}` : undefined,
          },
          ...(impact != null ? [{ label: "Price impact", value: `${impact}%` }] : []),
          ...(routes.length > 0 ? [{ label: "Route", value: routes.join(" · ") }] : []),
          { label: "Slippage guard", value: `${(Number(slippageBps) / 100).toFixed(2)}%`, hint: "The swap reverts if it would return less." },
          ...(sendTo ? [{ label: "Send to", value: `${dest.trim().slice(0, 4)}…${dest.trim().slice(-4)}` }] : []),
          { label: "Signatures", value: smartTx && sendTo ? "2" : "1" },
        ],
        notes: [
          "The quote refreshes at execution; you receive at least the slippage-guarded amount or nothing.",
          ...(smartTx && sendTo ? ["From a smart account the swap lands in the account first; a second signature sends exactly what it returned."] : []),
        ],
        confirmLabel: "Swap",
        execute: async (onSteps) => {
          const step: TxStep = { key: "swap", label: `Swap ${sellCode} → ${buyCode}`, status: "building" };
          onSteps([{ ...step }]);
          setBusy(true);
          try {
            const r = await executeMarketSwap({
              sellTok: sTok,
              buyTok: bTok,
              amountTokens: sellAmt,
              from: addr,
              signer: swapOwner ?? undefined,
              to: sendTo ? dest.trim() : undefined,
              slippageBps,
              protocols,
              onStatus: (m) => {
                step.status = /wallet/i.test(m) ? "signing" : /Submitting/i.test(m) ? "sending" : "building";
                onSteps([{ ...step }]);
              },
            });
            step.status = "done";
            step.hash = r.hash;
            onSteps([{ ...step }]);
            setDone({ hash: r.hash, out: r.outTokens });
          } catch (e) {
            step.status = "failed";
            step.error = e instanceof Error ? e.message : String(e);
            step.hash = (e as { hash?: string | null })?.hash ?? null;
            onSteps([{ ...step }]);
            throw e;
          } finally {
            setBusy(false);
          }
        },
      });
    } catch (e) {
      setStatus(String(e instanceof Error ? e.message : e).slice(0, 200));
    }
  }

  // Buy side still resolving (amount set, no exact quote yet, no error).
  const buyLoading = amtNum > 0 && quote == null && !quoteError;
  // Over balance (maxSell already keeps 1 XLM for reserve) or an asset
  // the account holds none of (maxSell resolves to 0 there).
  const insufficient = maxSell != null && amtNum > maxSell;
  const btnLabel = !wallet
    ? "Connect wallet"
    : balsLoading
      ? "Loading balances…"
      : balsFailed
        ? "Balances unavailable"
        : !(amtNum > 0)
          ? "Enter an amount"
          : insufficient
            ? "Insufficient balance"
            : quoting || buyLoading
              ? "Quoting…"
              : busy
                ? "Working…"
                : noKey
                  ? "Routing unavailable"
                  : "Swap";
  const btnDisabled =
    busy ||
    quoting ||
    buyLoading ||
    !wallet ||
    balsLoading ||
    balsFailed ||
    insufficient ||
    !(amtNum > 0) ||
    !sellTok ||
    !buyTok ||
    sellTok.code === buyTok.code ||
    noKey ||
    destBad;

  return (
    <div className="pf-card x-main">
      {" "}
      <h3>Swap</h3>{" "}
      <p className="x-balance">
        Balance:{" "}
        <b>
          {sellBal != null
            ? `${sellBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sellCode}`
            : "—"}
        </b>{" "}
        {maxSell != null && maxSell > 0 && amtNum <= 0 && (
          <button
            type="button"
            className="x-max"
            onClick={() => setSellAmt(String(maxSell))}
          >
            MAX
          </button>
        )}{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">You sell:</span>{" "}
        <div className="x-mid">
          {" "}
          <input
            className="x-amt"
            value={sellAmt}
            onChange={(e) => setSellAmt(numOnly(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            aria-label="Sell amount"
          />{" "}
          <span className="x-usd">
            {sellUsd != null
              ? `$${sellUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "$0"}
          </span>{" "}
        </div>{" "}
        <div className="x-cell">
          {" "}
          <SwapSelect
            value={sellCode}
            onChange={(c) => {
              setSellCode(c);
              setQuote(null);
              setDone(null);
            }}
            options={tokens}
            label="Sell token"
          />{" "}
        </div>{" "}
      </div>{" "}
      <div className="x-flip-row">
        {" "}
        <span className="x-flip-line" aria-hidden="true" />{" "}
        <button
          type="button"
          className="x-flip"
          onClick={flip}
          aria-label="Flip tokens"
          title="Flip"
        >
          {" "}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3L4 7l4 4" />
            <path d="M4 7h16" />
            <path d="M16 21l4-4-4-4" />
            <path d="M20 17H4" />
          </svg>{" "}
        </button>{" "}
        <span className="x-flip-line" aria-hidden="true" />{" "}
      </div>{" "}
      <p className="x-balance">
        Balance:{" "}
        <b>
          {buyBal != null
            ? `${buyBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${buyCode}`
            : "—"}
        </b>{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">You buy:</span>{" "}
        <div className="x-mid">
          {" "}
          <span className="x-amt x-out">
            {shownOut != null
              ? shownOut.toLocaleString("en-US", { maximumFractionDigits: 6 })
              : "0"}
          </span>{" "}
          <span className="x-usd">
            {buyUsd != null
              ? `$${buyUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "$0"}
          </span>{" "}
        </div>{" "}
        <div className="x-cell">
          {" "}
          <SwapSelect
            value={buyCode}
            onChange={(c) => {
              setBuyCode(c);
              setQuote(null);
              setDone(null);
            }}
            options={tokens}
            label="Buy token"
          />{" "}
        </div>{" "}
      </div>{" "}
      <p className="x-line x-split">
        {" "}
        <span>≈ Rate:</span>{" "}
        {rate != null ? (
          <b>
            1.00 {sellCode} ={" "}
            {rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
            {buyCode}
            {!rateLive && <span className="x-est"> est</span>}
          </b>
        ) : (
          "—"
        )}{" "}
      </p>{" "}
      {impact != null && (
        <p className="x-line x-split">
          {" "}
          <span>≈ Trade size price impact:</span>{" "}
          <b>{`${impact}%`}</b>{" "}
        </p>
      )}{" "}
      {routes.length > 0 && <p className="x-line">via {routes.join(" · ")}</p>}{" "}
      <p className="x-note">No fee is taken by Seidar for this action.</p>{" "}
      {noKey && (
        <p className="x-warn">
          Live routing needs a Soroswap API key (free at
          api.soroswap.finance/login, set SOROSWAP_API_KEY server-side).
          Showing indicative prices meanwhile.{" "}
        </p>
      )}{" "}
      {quoteError && <p className="x-warn">{quoteError}</p>}{" "}
      <div className="x-check">
        {" "}
        <button
          type="button"
          role="switch"
          aria-checked={sendTo}
          aria-label="Send to a different address"
          className={`x-switch${sendTo ? " on" : ""}`}
          onClick={() => setSendTo((s) => !s)}
        >
          <i aria-hidden="true" />
        </button>{" "}
        <span>Send to a different address</span>{" "}
      </div>{" "}
      {sendTo && (
        <input
          className="x-addr"
          value={dest}
          onChange={(e) => setDest(e.target.value.trim())}
          placeholder="G… destination"
          aria-label="Destination wallet"
          spellCheck={false}
          autoComplete="off"
        />
      )}{" "}
      <button
        type="button"
        className="btn primary x-go"
        disabled={gate ? false : btnDisabled}
        onClick={gate ? gate.run : onSwap}
      >
        {" "}
        {gate ? gate.label : btnLabel}{" "}
      </button>{" "}
      {status && <p className="x-status">{status}</p>}{" "}
      <TxModal spec={swapConfirm} onClose={() => setSwapConfirm(null)} />{" "}
      {done && (
        <div className="x-done">
          {" "}
          {done.out != null && (
            <p>
              Received ≈{" "}
              {done.out.toLocaleString("en-US", {
                maximumFractionDigits: 6,
              })}{" "}
              {buyCode}
            </p>
          )}{" "}
          {done.hash ? (
            <a
              href={`${explorerBase()}/tx/${done.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View on stellar.expert →
            </a>
          ) : (
            <p>Submitted — check your wallet activity.</p>
          )}{" "}
        </div>
      )}{" "}
    </div>
  );
}

/* ------------------------------- Limit order ------------------------------ */
/* DeFiSaver-style conditional swap: condition -> fresh Soroswap quote (with
   min-out guard) -> swap execution. Soroswap routes; we decide WHEN. No
   order books, no ManageBuyOffer flows. */

/** Status pill for limit/DCA strategies. */
function StatusPill({ status }: { status: string }) {
  const color =
    status === "active"
      ? "var(--green)"
      : status === "triggered" || status === "executing"
        ? "var(--amber)"
        : status === "executed" || status === "completed"
          ? "#8ea2ff"
          : status === "failed"
            ? "#e5484d"
            : "var(--muted)";
  return (
    <b className="x-status-pill" style={{ color }}>
      {status}
    </b>
  );
}

function LimitPanel({
  tokens,
  wallet,
  onConnect,
  strategies,
  onCreate,
  onRun,
  onCancel,
  onPrepare,
  preparingId,
  onRevoke,
  grants,
  dbMode,
  canArm,
}: {
  tokens: SwapToken[];
  wallet: string | null;
  onConnect: () => Promise<string | null>;
  strategies: Strategy[];
  onCreate: (
    kind: "limit" | "dca",
    params: Record<string, unknown>,
  ) => Promise<Strategy | null>;
  onRun: (s: Strategy) => Promise<void>;
  onCancel: (s: Strategy) => Promise<void>;
  onPrepare: (s: Strategy) => Promise<void>;
  preparingId: string | null;
  onRevoke: (s: Strategy) => Promise<void>;
  grants: Record<string, number>;
  dbMode: boolean;
  canArm: boolean;
}) {
  const limitFees = useFees();
  const [sellCode, setSellCode] = useState("USDC");
  const [buyCode, setBuyCode] = useState("XLM");
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [price, setPrice] = useState("");
  const [locked, setLocked] = useState(false);
  const [inverted, setInverted] = useState(false);
  const [lastEdit, setLastEdit] = useState<"sell" | "buy" | "price">("sell");
  const [expiryMs, setExpiryMs] = useState(86400000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const px = usePairPrices(sellCode, buyCode);
  const { bals, status: limitBalStatus } = useBalances(wallet);
  const balsReady = limitBalStatus === "ready";
  /* Hands-off: a guarded keeper rule on the smart account (sell budget +
     minimum rate, enforced on-chain) that the Seidar keeper fills when the
     pool pays the limit — no app open, no signature at fill time. */
  const { owner: ownerWallet } = useSmartAccount();
  const auto = useAutomation(canArm ? ownerWallet : null);
  const handsOffReady = canArm && !!auto.cfg?.deployed && !!ownerWallet;
  const [handsOff, setHandsOff] = useState(true);
  const [limitTx, setLimitTx] = useState<TxSpec | null>(null);
  const handsOffOrders = auto.automations
    .filter((a) => a.kind === "limit" && a.account === wallet && a.status !== "off")
    .slice(0, 8);

  const sellTok = tokens.find((t) => t.code === sellCode) ?? null;
  const buyTok = tokens.find((t) => t.code === buyCode) ?? null;
  const pxSell = px(sellCode);
  const pxBuy = px(buyCode);
  // Live market ratio (buy tokens per 1 sell token), indicative.
  const mkt =
    pxSell != null && pxBuy != null && pxBuy > 0 ? pxSell / pxBuy : null;
  // Displayed price converts to canonical buy-per-sell when inverted.
  const dispNum = Number(price) || 0;
  const priceCanon = dispNum > 0 ? (inverted ? 1 / dispNum : dispNum) : 0;
  const sellNum = Number(sellAmt) || 0;
  const buyNum = Number(buyAmt) || 0;
  // Buy preview uses the limit price when set, else the live market rate —
  // typing a sell amount always shows its equivalent immediately.
  const previewRate = priceCanon > 0 ? priceCanon : mkt ?? 0;
  const buyDerived = sellNum > 0 && previewRate > 0 ? sellNum * previewRate : 0;
  const sellDerived =
    buyNum > 0 && priceCanon > 0 ? buyNum / priceCanon : 0;
  const sellShown =
    locked && lastEdit === "buy"
      ? sellDerived > 0
        ? fmtAmt(sellDerived)
        : ""
      : sellAmt;
  const buyShown =
    !locked || lastEdit !== "buy"
      ? buyDerived > 0
        ? fmtAmt(buyDerived)
        : ""
      : buyAmt;
  // Effective sell amount (what the strategy would swap).
  const effSell = locked && lastEdit === "buy" ? sellDerived : sellNum;
  const sellShownNum = Number(sellShown) || 0;
  const buyShownNum = Number(buyShown) || 0;
  const sellUsd = pxSell != null && sellShownNum > 0 ? sellShownNum * pxSell : null;
  const buyUsd = pxBuy != null && buyShownNum > 0 ? buyShownNum * pxBuy : null;
  const sellBal = bals.find((b) => b.code === sellCode)?.balance ?? (balsReady ? 0 : null);
  const buyBal = bals.find((b) => b.code === buyCode)?.balance ?? (balsReady ? 0 : null);
  const unitLabel = inverted ? `${sellCode}/${buyCode}` : `${buyCode}/${sellCode}`;

  function onSell(v: string) {
    setSellAmt(numOnly(v));
    setLastEdit("sell");
  }
  function onBuy(v: string) {
    if (!locked) return;
    setBuyAmt(numOnly(v));
    setLastEdit("buy");
  }
  function onPrice(v: string) {
    setPrice(numOnly(v));
    setLastEdit("price");
  }
  function resetRate() {
    if (mkt == null || !(mkt > 0)) return;
    setInverted(false);
    setPrice(fmtAmt(mkt));
    setLastEdit("price");
  }
  function invertPrice() {
    const d = Number(price) || 0;
    setPrice(d > 0 ? fmtAmt(1 / d) : "");
    setInverted((i) => !i);
    setLastEdit("price");
  }
  function flipTokens() {
    setSellCode(buyCode);
    setBuyCode(sellCode);
    const d = Number(price) || 0;
    setPrice(d > 0 ? fmtAmt(1 / (inverted ? 1 / d : d)) : "");
    setInverted(false);
    setBuyAmt("");
    setLastEdit("sell");
  }

  async function create() {
    setMsg(null);
    try {
      const addr = wallet ?? (await onConnect());
      if (!addr) throw new Error("Connect a wallet first.");
      if (!sellTok || !buyTok) throw new Error("Pick two swap tokens.");
      if (sellTok.code === buyTok.code)
        throw new Error("Pick two different assets.");
      if (!(effSell > 0)) throw new Error("Enter an amount above 0.");
      if (!(priceCanon > 0)) throw new Error("Enter a limit price above 0.");
      // Minimum acceptable output, locked at creation: sell amount at the
      // limit price, minus 2% execution slippage. The runner re-quotes
      // fresh and aborts when the market moved past it.
      const minOutTokens = effSell * priceCanon * 0.98;
      let minOutBase = toBaseUnits(
        String(minOutTokens),
        buyTok.decimals,
      );
      if (minOutBase == null)
        throw new Error("Could not size minimum output.");
      if (BigInt(minOutBase) <= BigInt(0)) minOutBase = "1";
      if (handsOffReady && handsOff && wallet && ownerWallet) {
        armHandsOff(wallet, ownerWallet, effSell, priceCanon);
        return;
      }
      setBusy(true);
      const s = await onCreate("limit", {
        sell: sellTok.code,
        buy: buyTok.code,
        sellContract: sellTok.contract,
        buyContract: buyTok.contract,
        sellDecimals: sellTok.decimals,
        buyDecimals: buyTok.decimals,
        amount: String(effSell),
        limitPrice: priceCanon,
        minOutBase,
        expiresAt: expiryMs > 0 ? Date.now() + expiryMs : null,
      });
      if (!s) throw new Error("Could not store the strategy.");
      setSellAmt("");
      setBuyAmt("");
      setMsg(
        `Armed: swap ${fmtAmt(effSell)} ${sellTok.code} at ≥${fmtAmt(priceCanon)} ${buyTok.code}/${sellTok.code} (min out ${minOutTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${buyTok.code}).`,
      );
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  /** Install the keeper's Swap rule (one signature) and register the order. */
  function armHandsOff(account: string, owner: string, amount: number, rate: number) {
    if (!sellTok || !buyTok || !auto.cfg) return;
    const amountBase = toBaseUnits(String(amount), sellTok.decimals);
    // Exact limit (no execution haircut): the guard requires >= amount x rate.
    const outBase = toBaseUnits((amount * rate).toFixed(buyTok.decimals), buyTok.decimals);
    if (!amountBase || !outBase || BigInt(amountBase) <= BigInt(0)) {
      setMsg("Could not size the order.");
      return;
    }
    const scale = BigInt(10) ** BigInt(18);
    const minRate = ((BigInt(outBase) * scale) / BigInt(amountBase)).toString();
    const ledger = auto.cfg.ledger;
    const validUntil = expiryMs > 0 && ledger ? ledger + Math.ceil(expiryMs / 5000) : null;
    // A Swap rule only reads prices through the pool's oracle: any Blend pool will do.
    const pool = auto.cfg.supportedPools[0] ?? auto.cfg.blendPools?.[0]?.address;
    const sell = sellTok;
    const buy = buyTok;
    setLimitTx({
      title: `Hands-off limit order: ${fmtAmt(amount)} ${sell.code}`,
      code: sell.code,
      amount: fmtAmt(amount),
      context: "Seidar keeper · Soroswap",
      rows: [
        { label: "Sell", value: `${fmtAmt(amount)} ${sell.code}` },
        { label: "Limit price", value: `≥ ${fmtAmt(rate)} ${buy.code}/${sell.code}` },
        { label: "Receive at least", value: `${fmtAmt(amount * rate)} ${buy.code}` },
        { label: "Expires", value: validUntil ? new Date(Date.now() + expiryMs).toLocaleString() : "Never" },
        { label: "Signatures", value: "1", hint: "One keeper rule on your smart account." },
      ],
      notes: [
        `When the pool pays your limit, Seidar's keeper sells up to ${fmtAmt(amount)} ${sell.code} for ${buy.code} from your smart account. The guard only lets it pull exactly what it swaps and requires at least ${fmtAmt(rate)} ${buy.code} per ${sell.code}, all sent back to your account — enforced on-chain. Fills may be partial until the amount is used.`,
      ],
      confirmLabel: "Arm order",
      execute: async (onSteps) => {
        await enableAutomation(
          {
            owner,
            account,
            kind: "limit",
            pool,
            collateral: sell.contract,
            debt: buy.contract,
            config: {
              sell: sell.contract,
              buy: buy.contract,
              sellCode: sell.code,
              buyCode: buy.code,
              sellDecimals: sell.decimals,
              buyDecimals: buy.decimals,
              maxAmount: amountBase,
              minRate,
              limitPrice: rate,
              expiresAt: expiryMs > 0 ? Date.now() + expiryMs : null,
            },
            rules: [
              {
                role: "swap",
                target: sell.contract,
                action: "Swap",
                trigger: { kind: "always" },
                asset: buy.contract,
                maxAmount: amountBase,
                minRate,
                validUntil,
                name: "seidar-limit",
              },
            ],
            tokens: tokens.map((t) => ({ code: t.code, contract: t.contract, decimals: t.decimals })),
          },
          onSteps,
        );
        setSellAmt("");
        setBuyAmt("");
        auto.reload();
      },
    });
  }

  function cancelHandsOff(a: Automation) {
    if (!ownerWallet) return;
    const owner = ownerWallet;
    setLimitTx({
      title: "Cancel hands-off limit order",
      context: `${String(a.config.sellCode)} → ${String(a.config.buyCode)}`,
      rows: [{ label: "Signatures", value: String(a.rules.length), hint: "Removes the keeper rule from your smart account." }],
      notes: ["Anything already filled stays in your account; the keeper can no longer sell."],
      confirmLabel: "Cancel order",
      execute: async (onSteps) => {
        await disableAutomation(owner, a, onSteps);
        auto.reload();
      },
    });
  }

  return (
    <div className="pf-card x-main">
      {" "}
      <h3>Limit Order</h3>{" "}
      <p className="x-balance">
        <span>
          Balance:{" "}
          <b>
            {sellBal != null
              ? `${sellBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sellCode}`
              : "—"}
          </b>{" "}
          {sellBal != null && sellBal > 0 && (
            <button
              type="button"
              className="x-max"
              onClick={() => {
                setSellAmt(String(sellBal));
                setLastEdit("sell");
              }}
            >
              MAX
            </button>
          )}{" "}
        </span>{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">You sell:</span>{" "}
        <div className="x-mid">
          {" "}
          <input
            className="x-amt"
            value={sellShown}
            onChange={(e) => onSell(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label="Sell amount"
          />{" "}
          <span className="x-usd">
            {sellUsd != null
              ? `$${sellUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "$0"}
          </span>{" "}
        </div>{" "}
        <div className="x-cell">
          {" "}
          <SwapSelect
            value={sellCode}
            onChange={(c) => {
              setSellCode(c);
              setBuyAmt("");
            }}
            options={tokens}
            label="Sell token"
          />{" "}
        </div>{" "}
      </div>{" "}
      <p className="x-rate-row">
        {" "}
        <button type="button" className="x-link" onClick={resetRate}>
          Reset rate
        </button>{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">At price:</span>{" "}
        <div className="x-mid">
          {" "}
          <input
            className="x-amt"
            value={price}
            onChange={(e) => onPrice(e.target.value)}
            inputMode="decimal"
            placeholder={
              mkt != null && mkt > 0
                ? inverted
                  ? `${fmtAmt(1 / mkt)} ${sellCode} / 1 ${buyCode}`
                  : `${fmtAmt(mkt)} ${buyCode} / 1 ${sellCode}`
                : "0"
            }
            aria-label={`Limit price in ${unitLabel}`}
          />{" "}
          <span className="x-usd">{unitLabel}</span>{" "}
        </div>{" "}
        <div className="x-rate-icons">
          {" "}
          <span className="x-lockwrap">
            {" "}
            <button
              type="button"
              className={`x-iconbtn${locked ? " active" : ""}`}
              aria-pressed={locked}
              aria-label="Lock rate"
              title="Lock rate"
              onClick={() => setLocked((l) => !l)}
            >
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
                aria-hidden="true"
              >
                {locked ? (
                  <>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </>
                ) : (
                  <>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
                  </>
                )}
              </svg>{" "}
            </button>{" "}
            <span className="x-locktip" aria-hidden="true">
              Lock the rate field so your sell amount gets adjusted when
              changing the buy amount.
            </span>{" "}
          </span>{" "}
          <span className="x-lockwrap">
            {" "}
            <button
              type="button"
              className="x-iconbtn"
              aria-label="Invert price"
              title="Invert price"
              onClick={invertPrice}
            >
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
                aria-hidden="true"
              >
                <path d="M8 3L4 7l4 4" />
                <path d="M4 7h16" />
                <path d="M16 21l4-4-4-4" />
                <path d="M20 17H4" />
              </svg>{" "}
            </button>{" "}
            <span className="x-locktip" aria-hidden="true">
              Flip the price between buy-per-sell and sell-per-buy without
              changing the trade.
            </span>{" "}
          </span>{" "}
        </div>{" "}
      </div>{" "}
      <div className="x-flip-row">
        {" "}
        <span className="x-flip-line" aria-hidden="true" />{" "}
        <button
          type="button"
          className="x-flip"
          onClick={flipTokens}
          aria-label="Flip tokens"
          title="Flip"
        >
          {" "}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3L4 7l4 4" />
            <path d="M4 7h16" />
            <path d="M16 21l4-4-4-4" />
            <path d="M20 17H4" />
          </svg>{" "}
        </button>{" "}
        <span className="x-flip-line" aria-hidden="true" />{" "}
      </div>{" "}
      <p className="x-balance">
        <span />
        <span>
          Balance:{" "}
          <b>
            {buyBal != null
              ? `${buyBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${buyCode}`
              : "—"}
          </b>{" "}
        </span>{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">You buy:</span>{" "}
        <div className="x-mid">
          {" "}
          <input
            className="x-amt"
            value={buyShown}
            onChange={(e) => onBuy(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label="Buy amount"
            disabled={!locked}
          />{" "}
          <span className="x-usd">
            {buyUsd != null
              ? `$${buyUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "$0"}
          </span>{" "}
        </div>{" "}
        <div className="x-cell">
          {" "}
          <SwapSelect
            value={buyCode}
            onChange={(c) => {
              setBuyCode(c);
              setBuyAmt("");
            }}
            options={tokens}
            label="Buy token"
          />{" "}
        </div>{" "}
      </div>{" "}
      <div className="x-box x-expire-box">
        {" "}
        <span className="x-box-label">Expires in:</span>{" "}
        <div className="x-expire-wrap">
          {" "}
          <XExpirySelect value={expiryMs} onChange={setExpiryMs} />{" "}
        </div>{" "}
      </div>{" "}
      <p className="x-note">
        {limitFees == null
          ? "Transaction fee deducted during onchain execution."
          : `Seidar service fee: ${limitFees.swapBps > 0 ? `${pct(limitFees.swapBps)} of the output` : "none"}${limitFees.automationBps > 0 ? ` (${pct(limitFees.automationBps)} when hands-off)` : ""}. Transaction fee deducted during onchain execution.`}
      </p>{" "}
      {handsOffReady ? (
        <AkCheck checked={handsOff} onChange={setHandsOff}>
          Hands-off — Seidar&apos;s keeper fills it on-chain; no app open, no signature at fill time
        </AkCheck>
      ) : canArm && auto.cfg && !auto.cfg.deployed ? (
        <p className="x-note">
          Hands-off orders go live with the automation contracts on mainnet. Until then this order executes while Seidar is open.
        </p>
      ) : null}{" "}
      <button
        type="button"
        className="btn primary x-go"
        disabled={
          busy ||
          !(effSell > 0) ||
          !(priceCanon > 0) ||
          sellCode === buyCode
        }
        onClick={create}
      >
        {" "}
        {busy ? "Working…" : "Arm limit order"}{" "}
      </button>{" "}
      {msg && <p className="x-status">{msg}</p>}{" "}
      {handsOffOrders.length > 0 && (
        <div className="x-handsoff">
          <p className="x-perks-head">Hands-off orders</p>
          {handsOffOrders.map((a) => (
            <div key={a.id} className="x-handsoff-row">
              <span>
                <b>
                  {String(a.config.sellCode)} → {String(a.config.buyCode)}
                </b>{" "}
                at ≥ {fmtAmt(Number(a.config.limitPrice))}
              </span>
              <small>{a.status === "done" ? "Filled" : a.last_note || "Watching"}</small>
              {a.status === "active" && (
                <button type="button" className="x-max" onClick={() => cancelHandsOff(a)}>
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <TxModal spec={limitTx} onClose={() => setLimitTx(null)} />
    </div>
  );
}

/* ----------------------------------- DCA ---------------------------------- */

const INTERVALS = [
  { label: "1 day", sec: 86400 },
  { label: "3 days", sec: 259200 },
  { label: "7 days", sec: 604800 },
  { label: "2 weeks", sec: 1209600 },
  { label: "1 month", sec: 2592000 },
  { label: "6 months", sec: 15552000 },
];

/** Seidar's cut of each automated DCA run, in basis points (0.2%).
 *  Stored on the strategy, quoted into the aggregator (Soroswap feeBps)
 *  at run time, and shown live before arming — never invented. */
const DCA_FEE_BPS = 20;

/* Interval picker in the app's dv-* dropdown language (native selects
   can't carry the theme). */
function IntervalPick({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
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
  }, [open ]);
  const picked = INTERVALS.find((iv) => iv.sec === value) ?? null;
  return (
    <div className="dv-select mv-pick" ref={ref}>
      {" "}
      <button
        type="button"
        className="mv-pickbtn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Execution interval"
      >
        {" "}
        <span className={picked ? "mv-pickname" : "mv-pickplaceholder"}>
          {picked ? picked.label : "Execute every"}
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
        <div className="dv-drop" role="listbox" aria-label="Execution interval">
          {" "}
          <div className="dv-options">
            {" "}
            {INTERVALS.map((iv) => (
              <button
                key={iv.sec}
                type="button"
                role="option"
                aria-selected={value === iv.sec}
                className={`dv-option${value === iv.sec ? " selected" : ""}`}
                onClick={() => {
                  onChange(iv.sec);
                  setOpen(false);
                }}
              >
                {" "}
                <span>{iv.label}</span>{" "}
                {value === iv.sec && (
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

function dueIn(ms: number): string {
  if (ms <= 0) return "due now";
  const s = Math.floor(ms / 1000);
  if (s < 90) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 90) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 72) return `in ${h}h ${m % 60}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

function DcaPanel({
  tokens,
  wallet,
  onConnect,
  strategies,
  onCreate,
  onRun,
  onCancel,
  dbMode,
}: {
  tokens: SwapToken[];
  wallet: string | null;
  onConnect: () => Promise<string | null>;
  strategies: Strategy[];
  onCreate: (
    kind: "limit" | "dca",
    params: Record<string, unknown>,
  ) => Promise<Strategy | null>;
  onRun: (s: Strategy) => Promise<void>;
  onCancel: (s: Strategy) => Promise<void>;
  dbMode: boolean;
}) {
  const [sellCode, setSellCode] = useState("USDC");
  const [buyCode, setBuyCode] = useState("XLM");
  const [amount, setAmount] = useState("");
  const [intervalSec, setIntervalSec] = useState<number | null>(86400);
  const [msg, setMsg] = useState<string | null>(null);

  const sellTok = tokens.find((t) => t.code === sellCode) ?? null;
  const buyTok = tokens.find((t) => t.code === buyCode) ?? null;
  // Live per-run buy preview (same feed as Swap/Limit).
  const dcaPx = usePairPrices(sellCode, buyCode);
  const dcaPxSell = dcaPx(sellCode);
  const dcaPxBuy = dcaPx(buyCode);
  const dcaRate =
    dcaPxSell != null && dcaPxBuy != null && dcaPxBuy > 0
      ? dcaPxSell / dcaPxBuy
      : null;
  const amtNum = Number(amount) || 0;
  const estBuy = amtNum > 0 && dcaRate != null ? amtNum * dcaRate : null;
  // Sell-side balance (same live feed as Swap/Limit): absent from a READY
  // feed means none held. Powers the balance line + MAX prefill.
  const { bals: dcaBals, status: dcaBalStatus } = useBalances(wallet);
  const dcaBalsReady = dcaBalStatus === "ready";
  const sellBal =
    dcaBals.find((b) => b.code === sellCode)?.balance ??
    (dcaBalsReady ? 0 : null);
  const buyBal =
    dcaBals.find((b) => b.code === buyCode)?.balance ??
    (dcaBalsReady ? 0 : null);
  const sellUsd =
    amtNum > 0 && dcaPxSell != null ? amtNum * dcaPxSell : null;
  // Seidar's cut per run, live from the entered amount (% of run USD);
  // 0 where the Seidar router isn't deployed (then nothing is charged).
  const dcaBps = useFees()?.dcaBps ?? null;
  const feeUsd =
    amtNum > 0 && dcaPxSell != null && dcaBps != null ? (amtNum * dcaPxSell * dcaBps) / 10000 : null;

  function flipDca() {
    setSellCode(buyCode);
    setBuyCode(sellCode);
  }

  async function create() {
    setMsg(null);
    try {
      const addr = wallet ?? (await onConnect());
      if (!addr) throw new Error("Connect a wallet first.");
      const amt = Number(amount) || 0;
      if (!sellTok || !buyTok) throw new Error("Pick two swap tokens.");
      if (!(amt > 0) || sellCode === buyCode)
        throw new Error("Enter an amount above 0 for two different assets.");
      if (!(intervalSec != null && intervalSec > 0))
        throw new Error("Pick how often each run executes.");
      const runUsd = dcaPxSell != null ? amt * dcaPxSell : null;
      const s = await onCreate("dca", {
        sell: sellTok.code,
        buy: buyTok.code,
        sellContract: sellTok.contract,
        buyContract: buyTok.contract,
        sellDecimals: sellTok.decimals,
        buyDecimals: buyTok.decimals,
        amount: String(amt),
        intervalSec,
        runsLeft: null,
        nextAt: Date.now(),
        feeBps: DCA_FEE_BPS,
        feeUsd: runUsd != null ? (runUsd * DCA_FEE_BPS) / 10000 : null,
      });
      if (!s) throw new Error("Could not store the plan.");
      setAmount("");
      setMsg("Plan armed — first run is due now.");
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e).slice(0, 200));
    }
  }

  const estBuyUsd =
    estBuy != null && dcaPxBuy != null ? estBuy * dcaPxBuy : null;
  return (
    <div className="pf-card x-main">
      {" "}
      <h3>DCA</h3>{" "}
      <p className="x-balance">
        Balance:{" "}
        <b>
          {sellBal != null
            ? `${sellBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sellCode}`
            : "—"}
        </b>{" "}
        {sellBal != null && sellBal > 0 && (
          <button
            type="button"
            className="x-max"
            onClick={() => setAmount(String(sellBal))}
          >
            MAX
          </button>
        )}{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">You sell:</span>{" "}
        <div className="x-mid">
          {" "}
          <input
            className="x-amt"
            value={amount}
            onChange={(e) => setAmount(numOnly(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            aria-label="DCA sell amount"
          />{" "}
          <span className="x-usd">
            {sellUsd != null
              ? `$${sellUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "$0"}
          </span>{" "}
        </div>{" "}
        <div className="x-cell">
          {" "}
          <SwapSelect
            value={sellCode}
            onChange={setSellCode}
            options={tokens}
            label="DCA sell token"
          />{" "}
        </div>{" "}
      </div>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">Execute every:</span>{" "}
        <IntervalPick
          value={intervalSec}
          onChange={(v) => setIntervalSec(v)}
        />{" "}
      </div>{" "}
      <div className="x-flip-row">
        {" "}
        <span className="x-flip-line" aria-hidden="true" />{" "}
        <button
          type="button"
          className="x-flip"
          onClick={flipDca}
          aria-label="Flip tokens"
          title="Flip"
        >
          {" "}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3L4 7l4 4" />
            <path d="M4 7h16" />
            <path d="M16 21l4-4-4-4" />
            <path d="M20 17H4" />
          </svg>{" "}
        </button>{" "}
        <span className="x-flip-line" aria-hidden="true" />{" "}
      </div>{" "}
      <p className="x-balance">
        Balance:{" "}
        <b>
          {buyBal != null
            ? `${buyBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${buyCode}`
            : "—"}
        </b>{" "}
      </p>{" "}
      <div className="x-box">
        {" "}
        <span className="x-box-label">You buy:</span>{" "}
        <div className="x-mid">
          {" "}
          <span className="x-amt x-out">
            {estBuy != null
              ? estBuy.toLocaleString("en-US", { maximumFractionDigits: 6 })
              : "0"}
          </span>{" "}
          <span className="x-usd">
            {estBuyUsd != null
              ? `$${estBuyUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "$0"}
          </span>{" "}
        </div>{" "}
        <div className="x-cell">
          {" "}
          <SwapSelect
            value={buyCode}
            onChange={setBuyCode}
            options={tokens}
            label="DCA buy token"
          />{" "}
        </div>{" "}
      </div>{" "}
      <button
        type="button"
        className="btn primary x-go"
        disabled={
          !(Number(amount) > 0) ||
          sellCode === buyCode ||
          !(intervalSec != null && intervalSec > 0)
        }
        onClick={create}
      >
        {" "}
        Start DCA{" "}
      </button>{" "}
      {msg && <p className="x-status">{msg}</p>}{" "}
      <p className="x-note">
        {dcaBps === 0
          ? "No service fee on this network — tx fee only."
          : feeUsd != null && dcaBps != null
            ? `Includes ~$${feeUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct(dcaBps)}) service fee + tx fee.`
            : `Includes ${pct(dcaBps ?? DCA_FEE_BPS)} service fee per run + tx fee.`}
      </p>{" "}
    </div>
  );
}

/* ------------------------------ Swap details ------------------------------ */

const VENUES = ["soroswap", "phoenix", "aqua", "sdex", "sushi"] as const;
export type Venue = (typeof VENUES)[number];
/** Selected swap venues; empty = Automatic (all venues). */
export type RouteChoice = Venue[];

function venueLabel(v: string) {
  return v === "sdex" ? "SDEX" : v[0].toUpperCase() + v.slice(1);
}

/** Button/menu label: Automatic when everything is on, else the set. */
export function routeLabel(route: RouteChoice): string {
  if (route.length === 0) return "Automatic";
  return route.map(venueLabel).join(" · ");
}

export function isAutoRoute(route: RouteChoice): boolean {
  return route.length === 0;
}

/** Aggregator protocols for /api/swap/quote; undefined = all (automatic). */
export function routeProtocols(route: RouteChoice): string[] | undefined {
  return route.length === 0 ? undefined : [...route];
}

const VENUE_META: { id: Venue | "automatic"; label: string; logo: string | null }[] = [
  { id: "automatic", label: "Automatic", logo: "/seidar-mark.png" },
  { id: "soroswap", label: "Soroswap", logo: "/dex-soroswap.png" },
  { id: "phoenix", label: "Phoenix", logo: "/dex-phoenix.png" },
  { id: "aqua", label: "Aqua", logo: "/aqua-logo.png" },
  { id: "sdex", label: "SDEX", logo: "/seidar-mark.png" },
  { id: "sushi", label: "Sushi", logo: "/sushi-logo.png" },
];

/** DEX logo with letter-badge fallback. */
function DexIcon({ logo, label, size = 22 }: { logo: string | null; label: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!logo || err) {
    return (
      <span
        className="dex-fallback"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) }}
        aria-hidden="true"
      >
        {label.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img loading="lazy"
      src={logo}
      alt=""
      width={size}
      height={size}
      className="dex-icon"
      onError={() => setErr(true)}
      aria-hidden="true"
    />
  );
}

const EXPIRY_OPTS = [
  { label: "1 min", ms: 60000 },
  { label: "10 min", ms: 600000 },
  { label: "1 hr", ms: 3600000 },
  { label: "1 day", ms: 86400000 },
  { label: "3 days", ms: 259200000 },
  { label: "7 days", ms: 604800000 },
  { label: "2 weeks", ms: 1209600000 },
  { label: "1 month", ms: 2592000000 },
  { label: "6 months", ms: 15552000000 },
];

/** Custom expiry dropdown (clock + label + caret, same kit as routes). */
function XExpirySelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
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
  }, [open ]);
  const cur = EXPIRY_OPTS.find((o) => o.ms === value) ?? EXPIRY_OPTS[3];
  return (
    <div className="x-route" ref={ref}>
      {" "}
      <button
        type="button"
        className="x-route-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Expires in"
      >
        {" "}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 13.5" />
        </svg>{" "}
        <b>{cur.label}</b>{" "}
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
        <div className="x-route-drop" role="listbox" aria-label="Expires in">
          {" "}
          {EXPIRY_OPTS.map((o) => (
            <button
              key={o.ms}
              type="button"
              role="option"
              aria-selected={o.ms === value}
              className={`x-route-option${o.ms === value ? " selected" : ""}`}
              onClick={() => {
                onChange(o.ms);
                setOpen(false);
              }}
            >
              {" "}
              <span>{o.label}</span>{" "}
              {o.ms === value && (
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
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}{" "}
            </button>
          ))}{" "}
        </div>
      )}{" "}
    </div>
  );
}

/** Exchange-route picker: checkbox multi-select. Automatic checks every
 *  venue (the aggregator's default); unchecking Automatic's row or picking
 *  venues builds a custom subset. At least one venue stays on — the last
 *  checked row can't be toggled off. The menu stays open while picking. */
export function XRouteSelect({
  value,
  onChange,
}: {
  value: RouteChoice;
  onChange: (v: RouteChoice) => void;
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
  }, [open ]);
  const auto = value.length === 0;
  const multi = value.length >= 2;
  const label = routeLabel(value);
  const logos = auto
    ? [{ logo: "/seidar-mark.png", label: "Automatic" }]
    : value.map((id) => VENUE_META.find((v) => v.id === id) ?? { logo: null as string | null, label: venueLabel(id) });

  function toggleVenue(id: Venue) {
    if (auto) {
      // From Automatic, picking one venue narrows to just it.
      onChange([id]);
      return;
    }
    if (value.includes(id)) {
      // Never leave zero venues on; selecting the full set
      // collapses back to Automatic (same aggregator default).
      if (value.length <= 1) return;
      const next = value.filter((v) => v !== id);
      onChange(next.length === VENUES.length ? [] : next);
      return;
    }
    const next = [...value, id].sort(
      (a, b) => VENUES.indexOf(a) - VENUES.indexOf(b),
    );
    onChange(next.length === VENUES.length ? [] : next);
  }

  function checkRow(checked: boolean) {
    return (
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
      </span>
    );
  }

  return (
    <div className="x-route" ref={ref}>
      {" "}
      <button
        type="button"
        className="x-route-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Swap route: ${label}`}
        title={label}
      >
        {" "}
        <span className="x-route-icons">
          {" "}
          {logos.map((l) => (
            <DexIcon key={l.label} logo={l.logo} label={l.label} size={20} />
          ))}{" "}
        </span>{" "}
        {!multi && <b>{label}</b>}{" "}
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
        <div className="x-route-drop" role="listbox" aria-label="Swap route">
          {" "}
          <button
            type="button"
            role="option"
            aria-selected={auto}
            className={`x-route-option${auto ? " selected" : ""}`}
            onClick={() => onChange([])}
          >
            {" "}
            <DexIcon logo="/seidar-mark.png" label="Automatic" size={20} />{" "}
            <span>Automatic (all)</span> {checkRow(auto)}{" "}
          </button>{" "}
          {VENUES.map((id) => {
            const meta = VENUE_META.find((v) => v.id === id)!;
            const checked = !auto && value.includes(id);
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={checked}
                className={`x-route-option${checked ? " selected" : ""}`}
                onClick={() => toggleVenue(id)}
              >
                {" "}
                <DexIcon logo={meta.logo} label={meta.label} size={20} />{" "}
                <span>{meta.label}</span> {checkRow(checked)}{" "}
              </button>
            );
          })}{" "}
        </div>
      )}{" "}
    </div>
  );
}

function SwapDetails({
  quote,
  tokens,
  sellCode,
  buyCode,
  amtNum,
  buyDec,
  slipBps,
  setSlipBps,
  route,
  setRoute,
}: {
  quote: Quote | null;
  tokens: SwapToken[];
  sellCode: string;
  buyCode: string;
  amtNum: number;
  buyDec: number;
  slipBps: string;
  setSlipBps: (v: string) => void;
  route: RouteChoice;
  setRoute: (v: RouteChoice) => void;
}) {
  const [custom, setCustom] = useState("");
  const [customOn, setCustomOn] = useState(false);
  const dist = quote?.rawTrade?.distribution ?? quote?.distribution ?? [];
  const venues = quoteRoutes(quote);
  const best = venues[0] ?? null;
  // Before a quote lands, a custom subset names its own venues so the
  // panel never claims a venue it isn't allowed to use.
  const bestLabel = best
    ? venueLabel(best)
    : route.length === 0
      ? null
      : routeLabel(route);
  const hops = (() => {
    const legs: { protocol_id?: unknown; path?: unknown }[] = Array.isArray(dist) ? [...dist] : [];
    const plan = (quote as { routePlan?: unknown })?.routePlan;
    if (Array.isArray(plan)) {
      for (const leg of plan) {
        const info = (leg as { swapInfo?: { protocol?: unknown; path?: unknown } })?.swapInfo;
        if (info && Array.isArray(info.path) && info.path.length > 0)
          legs.push({ protocol_id: info.protocol, path: info.path });
      }
    }
    const withPath = legs.find(
      (d) =>
        Array.isArray((d as { path?: unknown })?.path) &&
        ((d as { path: unknown[] }).path.length > 0),
    ) as { path: unknown[] } | undefined;
    if (!withPath) return [sellCode, buyCode];
    const codes = withPath.path.slice(0, 4).map((p) => {
      const s = String(p ?? "");
      const hit = tokens.find((t) => t.contract === s);
      return hit ? hit.code : s.length > 10 ? `${s.slice(0, 4)}…` : s;
    });
    const full = [sellCode, ...codes.filter((c) => c !== sellCode), buyCode];
    return [...new Set(full)].slice(0, 4);
  })();
  const feeBps = quoteFeeBps(quote);
  const minBase =
    num((quote as { seidar?: { amountOutMinNet?: unknown } } | null)?.seidar?.amountOutMinNet) ??
    num((quote as { otherAmountThreshold?: unknown } | null)?.otherAmountThreshold) ??
    (quoteOut(quote) != null && buyDec != null
      ? (quoteOut(quote) as number) * (1 - Number(slipBps) / 10000)
      : null);
  const minTokens = minBase != null ? minBase / 10 ** buyDec : null;
  const pills: { label: string; bps: string }[] = [
    { label: "0.05%", bps: "5" },
    { label: "0.2%", bps: "20" },
    { label: "0.5%", bps: "50" },
  ];

  return (
    <div className="pf-card x-rail x-det">
      {" "}
      <h3>Details</h3>{" "}
      <div className="mv-rowline">
        {" "}
          <span>Swap route:</span>{" "}
        <XRouteSelect value={route} onChange={setRoute} />{" "}
      </div>{" "}
      <p className="x-line left">
        Best rate found using: <b>{bestLabel ?? "—"}</b>
      </p>{" "}
      <p className="x-line left">
        Route: <b>{hops.join(" → ")}</b>
      </p>{" "}
      {feeBps != null && (
        <p className="x-line left">
          Seidar service fee: <b>{feeBps > 0 ? `${pct(feeBps)} of the output` : "none"}</b>
        </p>
      )}{" "}
      <p className="mv-label left">Limit additional price slippage:</p>{" "}
      <div className="mv-pills">
        {" "}
        {pills.map((p) => (
          <button
            key={p.bps}
            type="button"
            className={`mv-pill${!customOn && slipBps === p.bps ? " active" : ""}`}
            onClick={() => {
              setCustomOn(false);
              setSlipBps(p.bps);
            }}
          >
            {p.label}
          </button>
        ))}{" "}
        <button
          type="button"
          className={`mv-pill${customOn ? " active" : ""}`}
          onClick={() => setCustomOn(true)}
        >
          Custom
        </button>{" "}
      </div>{" "}
      {customOn && (
        <input
          className="x-addr"
          value={custom}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            setCustom(v);
            const n = Number(v);
            if (n > 0 && n < 100) setSlipBps(String(Math.round(n * 100)));
          }}
          inputMode="decimal"
          placeholder="Custom slippage %"
          aria-label="Custom slippage percent"
        />
      )}{" "}
      <p className="x-note left">
        {amtNum > 0 && minTokens != null
          ? `You are selling ${amtNum.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sellCode} for at least ${minTokens.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${buyCode}`
          : "Enter an amount to see minimum receive."}
      </p>{" "}
    </div>
  );
}

/* ------------------------------- Right rail ------------------------------- */

const VENUE_LOGOS: { code: string; logo: string }[] = [
  { code: "Soroswap", logo: "/dex-soroswap.png" },
  { code: "Phoenix", logo: "/dex-phoenix.png" },
  { code: "Aqua", logo: "/aqua-logo.png" },
  { code: "SDEX", logo: "/seidar-mark.png" },
  { code: "Sushi", logo: "/sushi-logo.png" },
];

function RoutesRail() {
  // Tile centers sit at 10/30/50/70/90% of the row by construction
  // (5 equal columns, no gap), so the stretched wire layer underneath
  // always meets the tiles exactly.
  const centers = [70, 210, 350, 490, 630];
  return (
    <div className="pf-card x-rail">
      {" "}
      <h3>Best swap routes aggregated.</h3>{" "}
      <div
        className="x-venn"
        role="img"
          aria-label="Soroswap, Phoenix, Aqua, SDEX and Sushi routing into Seidar"
      >
        {" "}
        <div className="x-venn-nodes">
          {" "}
          {VENUE_LOGOS.map((v) => (
            <span className="x-venn-tile" key={v.code} title={v.code}>
              {" "}
              <img loading="lazy" src={v.logo} alt={`${v.code} logo`} width="40" height="40" />{" "}
            </span>
          ))}{" "}
        </div>{" "}
        <svg
          className="x-venn-wires"
          viewBox="0 0 700 96"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {" "}
          <g stroke="#4d5761" strokeWidth="1.5" fill="none">
            {" "}
            {centers.map((cx) => (
              <path key={cx} d={`M${cx} 6 C${cx} 48 350 48 350 78`} />
            ))}{" "}
          </g>{" "}
          <g fill="#57c36b">
            {" "}
            {centers.map((cx) => (
              <circle key={cx} cx={cx} cy="6" r="4" />
            ))}{" "}
          </g>{" "}
          <circle cx="350" cy="84" r="6" fill="#cbd4d9" />{" "}
        </svg>{" "}
      </div>{" "}
      <p className="x-feefree">0% fee on swaps.</p>{" "}
      <div className="x-perks">
        {" "}
        <p className="x-perks-head">
          Better with <b>Seidar smart account</b>
        </p>{" "}
        <ul>
          <li>Scoped swap sessions</li>
          <li>No failed transactions</li>
          <li>Unsigned intents first</li>
          <li>No additional costs</li>
        </ul>{" "}
      </div>{" "}
    </div>
  );
}

/* --------------------------------- Exchange -------------------------------- */

export function ExchangeView() {
  /* Tab follows the URL (/exchange/swap|limit|dca) so each mode has its
     own path; the buttons navigate instead of holding local state. */
  const pathname = usePathname();
  const router = useRouter();
  const tab =
    pathname?.endsWith("/dca") || pathname?.endsWith("/DCA")
      ? "dca"
      : pathname?.endsWith("/limit")
        ? "limit"
        : "swap";
  function goTab(t: "swap" | "limit" | "dca") {
    if (t !== tab) router.push(`/exchange/${t}`);
  }
  const { address, connect } = useXWallet();
  /* Active transaction account (shell broadcast): main wallet by default,
     automation account once picked. Swaps execute from it; strategies and
     grants stay keyed by the connected owner. */
  const txAccount = useTxActive(address) ?? address;
  // Connected wallet's network vs the app's: warn early instead of failing
  // at the signature with a cryptic account error. Only checks once a
  // wallet is connected — the connect prompt covers the rest.
  const [netWarning, setNetWarning] = useState(false);
  useEffect(() => {
    if (!address) {
      setNetWarning(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const det = await kitGetNetwork(walletKindFor(address));
      if (!cancelled)
        setNetWarning(det.ok && det.networkPassphrase !== networkPassphrase());
    })();
    return () => { cancelled = true; };
  }, [address]);
  const ownerSmarts = useOwnerSmarts(address);
  const isSmartTx = !!txAccount && ownerSmarts.includes(txAccount);
  const tokens = useSwapTokens();
  const { bals, status: balStatus } = useBalances(txAccount);
  const [swapQuote, setSwapQuote] = useState<Quote | null>(null);
  const [slipBps, setSlipBps] = useState("50");
  const [route, setRoute] = useState<RouteChoice>([]);
  const protocols = routeProtocols(route);
  const [swapDraft] = useState(readSwapDraft);
  const [sellCode, setSellCode] = useState(swapDraft.sellCode ?? "XLM");
  const [buyCode, setBuyCode] = useState(swapDraft.buyCode ?? "USDC");
  const [sellAmt, setSellAmt] = useState(swapDraft.sellAmt ?? "");
  const buyTokForDec =
    tokens.find((t) => t.code === buyCode) ?? null;

  /* Draft survives remounts/reloads so typed values never vanish. */
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SWAP_DRAFT_KEY,
        JSON.stringify({ sellCode, buyCode, sellAmt }),
      );
    } catch {
      /* ignore */
    }
  }, [sellCode, buyCode, sellAmt]);
  const { strategies, dbMode, create, patch } = useStrategies(address);
  const runRef = useRef(false);
  const lastTry = useRef(new Map<string, number>());
  const [grants, setGrants] = useState<Record<string, number>>({});
  const [armingId, setArmingId] = useState<string | null>(null);

  async function loadGrants(owner: string) {
    try {
      const d = await apiFetch(`/api/sessions?owner=${owner}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (d?.ok && Array.isArray(d.grants)) {
        const m: Record<string, number> = {};
        for (const g of d.grants as {
          strategyId?: unknown;
          id?: unknown;
          revoked?: unknown;
        }[]) {
          if (!g.revoked && g.strategyId != null && g.id != null)
            m[String(g.strategyId)] = Number(g.id);
        }
        setGrants(m);
      }
    } catch {
      /* grant list is advisory; execution checks server-side */
    }
  }

  useEffect(() => {
    if (address) loadGrants(address);
    else setGrants({});
  }, [address]);

  /**
   * Hands-off arming: ONE user signature covers (a) a standing session
   * grant (scope + cap + expiry, signed message, stored server-side) and
   * (b) a time-bounded pre-signed execution envelope stored on the strategy.
   * The keeper may then submit that exact envelope — nothing else — while
   * the grant lives. Revoking returns the strategy to prompt mode.
   */
  /* Hands-off limit orders are keeper Swap rules on the smart account (see
     LimitPanel.armHandsOff and contracts/guard), not stored strategies;
     strategies here are the in-app orders that execute while Seidar is open. */
  async function prepareHandsOff(s: Strategy) {
    await patch(s.id, {
      last_note: isSmartTx
        ? "Arm a new order with Hands-off ticked to have Seidar's keeper fill it on-chain. This one executes while Seidar is open."
        : "Switch to your smart account — orders run from it.",
    });
  }

  async function revokeHandsOff(s: Strategy) {
    const gid = grants[String(s.id)];
    if (gid != null && address) {
      try {
        await apiFetch("/api/sessions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: address, id: gid }),
        });
      } catch {
        /* envelope cleared below regardless */
      }
    }
    const p = { ...(s.params as Record<string, unknown>) };
    delete p.exec_envelope;
    delete p.envelope_expires_at;
    await patch(s.id, {
      params: p,
      last_note: "Hands-off revoked — back to prompt mode.",
    });
    if (address) loadGrants(address);
  }

  async function onConnect() {
    try {
      return await connect();
    } catch {
      return null;
    }
  }

  function stratTokens(s: Strategy): {
    sellTok: SwapToken;
    buyTok: SwapToken;
  } | null {
    const p = s.params as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const num = (v: unknown, fb: number) =>
      typeof v === "number" && v >= 0 ? Math.floor(v) : fb;
    if (!str(p.sellContract) || !str(p.buyContract)) return null;
    return {
      sellTok: {
        code: str(p.sell) || "?",
        contract: str(p.sellContract),
        decimals: num(p.sellDecimals, 7),
        name: null,
        issuer: null,
      },
      buyTok: {
        code: str(p.buy) || "?",
        contract: str(p.buyContract),
        decimals: num(p.buyDecimals, 7),
        name: null,
        issuer: null,
      },
    };
  }

  /** Execute one strategy run: fresh quote + min-out guard + sign + send. */
  async function runStrategy(s: Strategy) {
    const p = { ...(s.params as Record<string, unknown>) };
    const toks = stratTokens(s);
    const addr = txAccount ?? (await onConnect());
    if (!toks) {
      await patch(s.id, {
        status: "failed",
        attempts: s.attempts + 1,
        last_note: "Unknown tokens — recreate the strategy.",
      });
      return;
    }
    if (!addr) {
      await patch(s.id, { last_note: "Connect a wallet to execute." });
      return;
    }
    lastTry.current.set(String(s.id), Date.now());
    await patch(s.id, { status: "executing", last_note: "Quoting…" });
    try {
      const r = await executeMarketSwap({
        sellTok: toks.sellTok,
        buyTok: toks.buyTok,
        amountTokens: String(p.amount ?? ""),
        from: addr,
        signer: address ?? undefined,
        minOutBase:
          s.kind === "limit" && typeof p.minOutBase === "string"
            ? p.minOutBase
            : undefined,
        feeBps:
          s.kind === "dca" && typeof p.feeBps === "number"
            ? p.feeBps
            : undefined,
        onStatus: (note) => {
          patch(s.id, { last_note: note });
        },
      });
      const filled = r.hash
        ? `Filled · ${r.hash.slice(0, 8)}…`
        : "Filled — check wallet activity.";
      if (s.kind === "limit") {
        await patch(s.id, { status: "executed", last_note: filled });
      } else {
        const left =
          p.runsLeft == null ? null : Math.max(0, Number(p.runsLeft) - 1);
        const next = {
          ...p,
          runsLeft: left,
          nextAt: Date.now() + Number(p.intervalSec || 86400) * 1000,
        };
        if (left === 0) {
          await patch(s.id, {
            status: "completed",
            params: next,
            last_note: `${filled} Plan complete.`,
          });
        } else {
          await patch(s.id, { params: next, last_note: filled });
        }
      }
    } catch (e) {
      const minOut =
        (e as { minOutViolated?: boolean })?.minOutViolated === true;
      const msg = String(e instanceof Error ? e.message : e).slice(0, 200);
      await patch(s.id, {
        status: minOut ? "active" : "failed",
        attempts: s.attempts + 1,
        last_note: minOut ? `${msg} Will retry.` : msg,
      });
    }
  }

  /* Keeper-style monitor: expiry, DCA due dates, limit triggers. Runs while
     the app is open; execution still needs the user's wallet signature,
     so a triggered run opens the signing prompt. Strategies carrying a
     pre-signed envelope are keeper-owned and skipped here. */
  useEffect(() => {
    if (!address || strategies.length === 0) return;
    let cancelled = false;
    async function evaluate() {
      if (runRef.current) return;
      const actives = strategies.filter((s) =>
        ["active", "triggered", "failed"].includes(s.status),
      );
      if (actives.length === 0) return;
      runRef.current = true;
      try {
        const codes = [
          ...new Set(
            actives.flatMap((s) => {
              const p = s.params as Record<string, unknown>;
              return [String(p.sell ?? ""), String(p.buy ?? "")];
            }),
          ),
        ].filter(Boolean);
        let prices: Record<string, number | null> = {};
        try {
          const d = await apiFetch(
            `/api/prices?codes=${encodeURIComponent(codes.join(","))}`,
            { cache: "no-store" },
          ).then((r) => r.json());
          if (d?.ok) prices = d.prices ?? {};
        } catch {
          /* monitor retries next round */
        }
        if (cancelled) return;
        const now = Date.now();
        for (const s of actives) {
          if (cancelled) return;
          const last = lastTry.current.get(String(s.id)) ?? 0;
          if (now - last < 60000) continue;
          const p = s.params as Record<string, unknown>;
          // Keeper-owned: pre-signed envelope + session grant on file.
          // The daemon evaluates and executes; the tab stays out of the way.
          if (typeof p.exec_envelope === "string" && p.exec_envelope.length > 16) continue;
          if (
            s.kind === "limit" &&
            typeof p.expiresAt === "number" &&
            now > p.expiresAt
          ) {
            await patch(s.id, {
              status: "expired",
              last_note: "Expired without filling.",
            });
            continue;
          }
          if (s.kind === "dca") {
            if (p.runsLeft != null && Number(p.runsLeft) <= 0) {
              await patch(s.id, {
                status: "completed",
                last_note: "All runs filled.",
              });
              continue;
            }
            if (typeof p.nextAt !== "number" || p.nextAt > now) continue;
            await runStrategy(s);
            continue;
          }
          /* Ratio trigger: live buy-per-sell at/above the limit price.
             Legacy USD-target strategies (no limitPrice) keep their old
             buy-low / sell-high evaluation. */
          const limitPrice = Number(p.limitPrice) || 0;
          let hit = false;
          let hitNote = "";
          if (limitPrice > 0) {
            const ps = prices[String(p.sell ?? "").toUpperCase()];
            const pb = prices[String(p.buy ?? "").toUpperCase()];
            const psn = typeof ps === "number" && ps > 0 ? ps : null;
            const pbn = typeof pb === "number" && pb > 0 ? pb : null;
            if (psn != null && pbn != null) {
              const ratio = psn / pbn;
              hit = ratio >= limitPrice;
              hitNote = `Rate ${ratio.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${p.buy}/${p.sell} hit ≥ ${limitPrice} — executing with min-out guard.`;
            }
          } else {
            const side = p.side === "sell" ? "sell" : "buy";
            const tracked = String(side === "buy" ? p.buy : p.sell);
            const raw = prices[tracked.toUpperCase()];
            const live = typeof raw === "number" && raw > 0 ? raw : null;
            const target = Number(p.targetUsd) || 0;
            if (live != null && target > 0) {
              hit = side === "buy" ? live <= target : live >= target;
              hitNote = `Target hit (${tracked} $${live}) — executing with min-out guard.`;
            }
          }
          if (!hit) continue;
          await patch(s.id, {
            status: "triggered",
            last_note: hitNote,
          });
          await runStrategy(s);
        }
      } finally {
        runRef.current = false;
      }
    }
    evaluate();
    const t = setInterval(evaluate, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, strategies]);

  return (
    <div className="x-wrap">
      {" "}
      {netWarning && (
        <p className="x-warn">
          Your wallet is on a different network than Seidar (
          {isTestnetMode() ? "testnet" : "mainnet"}). Switch the network in
          your wallet to trade.
        </p>
      )}{" "}
      <div className="tabs x-tabs" role="tablist" aria-label="Swap">
        {" "}
        {(
          [
            { id: "swap", label: "Swap" },
            { id: "limit", label: "Limit Order" },
            { id: "dca", label: "DCA" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => goTab(t.id)}
          >
            {" "}
            {t.label}{" "}
          </button>
        ))}{" "}
      </div>{" "}
      <div className="x-grid">
        {" "}
        {tab === "swap" ? (
          <SwapPanel
            tokens={tokens}
            bals={bals}
            balStatus={balStatus}
            wallet={txAccount}
            onConnect={onConnect}
            quote={swapQuote}
            setQuote={setSwapQuote}
            slippageBps={slipBps}
            protocols={protocols}
            sellCode={sellCode}
            setSellCode={setSellCode}
            buyCode={buyCode}
            setBuyCode={setBuyCode}
            sellAmt={sellAmt}
            setSellAmt={setSellAmt}
          />
        ) : tab === "limit" ? (
          <LimitPanel
            tokens={tokens}
            wallet={txAccount}
            onConnect={onConnect}
            strategies={strategies}
            onCreate={create}
            onRun={runStrategy}
            onCancel={(s) => patch(s.id, { status: "cancelled" })}
            onPrepare={prepareHandsOff}
            preparingId={armingId}
            onRevoke={revokeHandsOff}
            grants={grants}
            dbMode={dbMode}
            canArm={isSmartTx}
          />
        ) : (
          <DcaPanel
            tokens={tokens}
            wallet={txAccount}
            onConnect={onConnect}
            strategies={strategies}
            onCreate={create}
            onRun={runStrategy}
            onCancel={(s) => patch(s.id, { status: "cancelled" })}
            dbMode={dbMode}
          />
        )}{" "}
        {tab === "swap" ? (
          (Number(sellAmt) || 0) > 0 ? (
            <SwapDetails
              quote={swapQuote}
              tokens={tokens}
              sellCode={sellCode}
              buyCode={buyCode}
              amtNum={Number(sellAmt) || 0}
              buyDec={buyTokForDec?.decimals ?? 7}
              slipBps={slipBps}
              setSlipBps={setSlipBps}
              route={route}
              setRoute={setRoute}
            />
          ) : (
            <RoutesRail />
          )
        ) : (
          <RoutesRail />
        )}{" "}
      </div>{" "}
    </div>
  );
}
