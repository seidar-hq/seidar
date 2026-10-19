"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { feeText, pct, useFees } from "@/lib/fees";
import { isTestnetMode } from "@/lib/network";
import { signAndSend, type TxStep } from "@/lib/tx";
import { executeMarketSwap, quoteFeeBps, quoteOut, SwapSelect, type Quote, type SwapToken } from "./exchange";
import { smartGate, useSmartAccount } from "./smart-gate";
import { TokenIcon } from "./token-icon";
import { TxModal, type TxSpec } from "./tx-modal";

/* One-step deposit from any token (modeled on DeFi Saver's "Stake sGHO"):
   pick what to pay with on the left, the target on the right; Seidar swaps
   the share each target asset needs through the aggregator (Seidar router,
   from the smart account) and then deposits. A vault target takes one asset;
   a pool target takes two, split by the pool's current reserve value. Every
   step is a real transaction from the active smart account. */

export type DepositAsset = { code: string; contract: string; decimals: number };

export type DepositTarget = {
  key: string;
  /** Chip label, e.g. "USDC". */
  label: string;
  /** Venue line, e.g. "Seidar USDC (DeFindex)". */
  name: string;
  apyPct: number | null;
  tvlUsd: number | null;
  /** What the deposit takes, with each asset's share of the deposit value. */
  assets: (DepositAsset & { weight: number })[];
  /** Unsigned deposit XDR for these base-unit amounts (same order as assets). */
  build: (exec: string, signer: string, amounts: string[]) => Promise<string>;
};

type Bal = { code: string; balance: number; contract?: string };

const SLIPS = [
  { label: "0.1%", bps: "10" },
  { label: "0.5%", bps: "50" },
  { label: "1%", bps: "100" },
];
/** Highest custom slippage accepted (5%). */
const MAX_SLIP_BPS = 500;
const PERIODS = { year: 1, month: 12, week: 52 } as const;

const fmt = (n: number, d = 6) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const fmtUsd = (n: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function postJson(path: string, body: unknown) {
  const r = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

/** Token amount -> exact base-unit string (floors). */
function toBase(amount: string, decimals: number): string | null {
  const clean = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const [i, f = ""] = clean.split(".");
  const s = ((i.replace(/^0+/, "") || "0") + (f + "0".repeat(decimals)).slice(0, decimals)).replace(/^0+(?=\d)/, "");
  return /^\d+$/.test(s) ? s : null;
}
const fromBase = (base: bigint, decimals: number) => Number(base) / 10 ** decimals;

type Leg = {
  asset: DepositAsset;
  /** Input spent on this leg (base units of the from-token). */
  inBase: bigint;
  /** Expected amount of the target asset (net of Seidar's fee). */
  out: number | null;
  quote: Quote | null;
  error: string | null;
};

export function EarnDepositModal({
  title,
  description,
  icon,
  targets,
  fromCodes,
  mainnetOnly,
  verb = "Deposit",
  apyLabel = "APY",
  apyNote,
  onClose,
}: {
  title: string;
  description: string;
  /** Heading icon: an image path, or a token code drawn with TokenIcon. */
  icon: { src: string } | { code: string };
  targets: DepositTarget[];
  /** Tokens offered on the left, in order (those Seidar can swap). */
  fromCodes: string[];
  /** The venue only exists on mainnet (DeFindex, Aqua). */
  mainnetOnly: boolean;
  verb?: string;
  /** APY row label, e.g. "Pool APY". */
  apyLabel?: string;
  /** Small print under the APY: what it does and doesn't include. */
  apyNote?: string;
  onClose: () => void;
}) {
  const { owner, account, smarts } = useSmartAccount();
  const fees = useFees();
  const testnet = isTestnetMode();
  const [tokens, setTokens] = useState<SwapToken[]>([]);
  const [bals, setBals] = useState<Bal[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [from, setFrom] = useState(fromCodes[0]);
  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
  const [amount, setAmount] = useState("");
  const [slipPick, setSlipPick] = useState("50");
  const [slipCustom, setSlipCustom] = useState("");
  const slip =
    slipPick === "custom"
      ? String(Math.min(MAX_SLIP_BPS, Math.max(1, Math.round(Number(slipCustom) * 100) || 0)))
      : slipPick;
  const [slipOpen, setSlipOpen] = useState(false);
  const [period, setPeriod] = useState<keyof typeof PERIODS>("year");
  const [legs, setLegs] = useState<Leg[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const target = targets.find((t) => t.key === targetKey) ?? targets[0] ?? null;
  useEffect(() => {
    if (!targets.some((t) => t.key === targetKey) && targets[0]) setTargetKey(targets[0].key);
  }, [targets, targetKey]);

  // Swap registry (contracts + decimals) and USD prices.
  useEffect(() => {
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && Array.isArray(d.tokens) && setTokens(d.tokens as SwapToken[]))
      .catch(() => {});
  }, []);
  const codes = useMemo(
    () => [...new Set([...fromCodes, ...targets.flatMap((t) => t.assets.map((a) => a.code))])],
    [fromCodes, targets],
  );
  useEffect(() => {
    apiFetch(`/api/prices?codes=${encodeURIComponent(codes.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setPrices(d.prices ?? {}))
      .catch(() => {});
  }, [codes]);
  const tokOf = (code: string): SwapToken | null =>
    tokens.find((t) => t.code === code) ??
    (() => {
      const a = targets.flatMap((t) => t.assets).find((x) => x.code === code);
      return a ? ({ code: a.code, contract: a.contract, decimals: a.decimals } as SwapToken) : null;
    })();
  const fromList = fromCodes.filter((c) => tokOf(c) != null);

  // Balances of the active account: the smart account when it's active,
  // else the connected wallet (the gate then asks to switch before acting).
  const balAddr = account ?? owner;
  const [balsReady, setBalsReady] = useState(false);
  useEffect(() => {
    setBalsReady(false);
    if (!balAddr) {
      setBals([]);
      return;
    }
    const extra = fromList.map((c) => tokOf(c)!.contract).join(",");
    let live = true;
    function load() {
      apiFetch(`/api/balances?address=${balAddr}&tokens=${extra}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!live || !d?.ok) return;
          // Unlisted issuers' look-alikes (a fake "USDC") never count.
          setBals(((d.balances ?? []) as (Bal & { listed?: boolean })[]).filter((b) => b.listed !== false));
          setBalsReady(true);
        })
        .catch(() => {});
    }
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      live = false;
      window.removeEventListener("seidar:refresh", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balAddr, fromList.join(",")]);
  const balOf = (code: string) => {
    const t = tokOf(code);
    return bals.find((b) => (t && b.contract === t.contract) || b.code === code)?.balance ?? 0;
  };
  const balText = (code: string) => (balAddr && !balsReady ? "…" : `${fmt(balOf(code), 6)} ${code}`);

  const fromTok = tokOf(from);
  const amtNum = Number(amount) || 0;
  const fromUsd = prices[from] != null ? amtNum * (prices[from] as number) : null;

  // Live quotes for each target asset the from-token must be swapped into.
  useEffect(() => {
    if (!target || !fromTok || !(amtNum > 0)) {
      setLegs([]);
      return;
    }
    const base = toBase(amount, fromTok.decimals);
    if (base == null) return;
    const total = BigInt(base);
    let live = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      let spent = BigInt(0);
      const next: Leg[] = [];
      for (const [i, a] of target.assets.entries()) {
        const last = i === target.assets.length - 1;
        const inBase = last ? total - spent : (total * BigInt(Math.round(a.weight * 1e6))) / BigInt(1e6);
        spent += inBase;
        if (a.contract === fromTok.contract) {
          next.push({ asset: a, inBase, out: fromBase(inBase, a.decimals), quote: null, error: null });
          continue;
        }
        try {
          const q = await postJson("/api/swap/quote", {
            assetIn: fromTok.contract,
            assetOut: a.contract,
            amount: inBase.toString(),
            tradeType: "EXACT_IN",
            slippageBps: slip,
            ...(account ? { smart: true } : {}),
          });
          if (!q?.ok || !q.quote) throw new Error(String(q?.error ?? "No route for this pair right now."));
          const out = quoteOut(q.quote as Quote);
          next.push({ asset: a, inBase, out: out != null ? out / 10 ** a.decimals : null, quote: q.quote as Quote, error: null });
        } catch (e) {
          next.push({ asset: a, inBase, out: null, quote: null, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (live) {
        setLegs(next);
        setQuoting(false);
      }
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, target?.assets.map((a) => a.weight).join(), fromTok?.contract, amount, slip, account]);

  const swaps = legs.filter((l) => l.quote != null);
  const legError = legs.find((l) => l.error)?.error ?? null;
  const depositUsd = legs.length
    ? legs.reduce((s, l) => s + (l.out != null && prices[l.asset.code] != null ? l.out * (prices[l.asset.code] as number) : 0), 0)
    : null;
  const apy = target?.apyPct ?? null;
  const rewardsUsd = depositUsd != null && apy != null ? (depositUsd * apy) / 100 / PERIODS[period] : null;
  const impact = swaps
    .map((l) => (l.quote as { priceImpactPct?: unknown }).priceImpactPct)
    .filter((v) => v != null && v !== "")
    .map(Number)
    .filter((v) => Number.isFinite(v));
  const swapFee = swaps.length ? (quoteFeeBps(swaps[0].quote) ?? fees?.swapBps ?? null) : 0;
  const rateLine = (l: Leg) =>
    l.out != null && l.inBase > BigInt(0) && fromTok
      ? `1 ${from} = ${fmt(l.out / fromBase(l.inBase, fromTok.decimals), 6)} ${l.asset.code}`
      : "—";

  const gate = !account ? smartGate(owner, smarts) : null;
  const over = account != null && balsReady && amtNum > balOf(from);
  const blocked =
    testnet && mainnetOnly
      ? `${title} is mainnet only — turn off Testnet mode to use it.`
      : !target
        ? "No eligible target is live right now."
        : target.key === "pending"
          ? null
          : legError;

  function open() {
    if (!account || !owner || !target || !fromTok || legs.length === 0) return;
    const exec = account;
    const signer = owner;
    const t = target;
    const ft = fromTok;
    const plan = legs;
    const outText = plan.map((l) => `${l.out != null ? fmt(l.out) : "—"} ${l.asset.code}`).join(" + ");
    setSpec({
      title: `${verb}: ${amount} ${from} → ${t.label}`,
      code: t.assets[0]?.code,
      amount: outText,
      context: t.name,
      rows: [
        { label: "Pay with", value: `${amount} ${from}`, sub: fromUsd != null ? fmtUsd(fromUsd) : undefined },
        { label: `Amount to ${verb.toLowerCase()} (est.)`, value: outText, sub: depositUsd != null ? fmtUsd(depositUsd) : undefined },
        { label: "APY", value: apy != null ? `${apy.toFixed(2)}%` : "—" },
        ...(swaps.length ? [{ label: "Slippage guard", value: `${(Number(slip) / 100).toFixed(2)}%` }] : []),
        ...(impact.length ? [{ label: "Price impact", value: `${Math.max(...impact).toFixed(2)}%` }] : []),
        { label: "Signatures", value: String(swaps.length + 1) },
      ],
      serviceFee: swaps.length
        ? swaps
            .map((l) => feeText(quoteFeeBps(l.quote) ?? fees?.swapBps, l.out != null && swapFee ? l.out / (1 - swapFee / 10_000) : null, l.asset.code))
            .join(" + ")
        : "None",
      notes: [
        swaps.length
          ? `Each swap runs from your smart account with a fresh quote; you get at least the slippage-guarded amount or the swap reverts, and the ${verb.toLowerCase()} uses exactly what the swap returned.`
          : `No swap needed — ${from} goes straight in.`,
      ],
      confirmLabel: verb,
      execute: async (onSteps) => {
        const steps: TxStep[] = [
          ...plan
            .filter((l) => l.asset.contract !== ft.contract)
            .map((l) => ({ key: `swap-${l.asset.code}`, label: `Swap ${from} → ${l.asset.code}`, status: "queued" as const })),
          { key: "deposit", label: `${verb} into ${t.name}`, status: "queued" },
        ];
        const push = () => onSteps(steps.map((s) => ({ ...s })));
        push();
        const amounts: string[] = [];
        for (const l of plan) {
          if (l.asset.contract === ft.contract) {
            amounts.push(l.inBase.toString());
            continue;
          }
          const step = steps.find((s) => s.key === `swap-${l.asset.code}`)!;
          step.status = "building";
          push();
          try {
            const r = await executeMarketSwap({
              sellTok: ft,
              buyTok: tokOf(l.asset.code)!,
              amountTokens: fromBase(l.inBase, ft.decimals).toFixed(ft.decimals),
              from: exec,
              signer,
              slippageBps: slip,
              onStatus: (m) => {
                step.status = /wallet/i.test(m) ? "signing" : /Submitting/i.test(m) ? "sending" : "building";
                push();
              },
            });
            if (r.outTokens == null || !(r.outTokens > 0)) throw new Error("The swap's output wasn't reported — check your smart account balance.");
            amounts.push(String(Math.floor(r.outTokens * 10 ** l.asset.decimals)));
            step.status = "done";
            step.hash = r.hash;
            push();
          } catch (e) {
            step.status = "failed";
            step.error = e instanceof Error ? e.message : String(e);
            push();
            throw e;
          }
        }
        const dep = steps[steps.length - 1];
        dep.status = "building";
        push();
        try {
          const xdr = await t.build(exec, signer, amounts);
          const sent = await signAndSend(xdr, signer, (st) => {
            dep.status = st;
            push();
          });
          dep.status = "done";
          dep.hash = sent.hash;
          push();
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          dep.status = "failed";
          dep.error = e instanceof Error ? e.message : String(e);
          dep.hash = (e as { hash?: string | null })?.hash ?? null;
          push();
          throw e;
        }
      },
    });
  }

  /* Slippage limit (preset or custom) + the swap's rate, impact and fee. */
  const swapBox = (
    <div className="ed-swap">
      <div className={`ed-slip${slipOpen ? " open" : ""}`}>
        <button type="button" className="ed-slip-head" aria-expanded={slipOpen} onClick={() => setSlipOpen((v) => !v)}>
          <span>
            <b>Slippage limit: {(Number(slip) / 100).toFixed(2)}%</b>
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
            {SLIPS.map((s) => (
              <button
                key={s.bps}
                type="button"
                className={`lev-slip${slipPick === s.bps ? " sel" : ""}`}
                onClick={() => setSlipPick(s.bps)}
              >
                {s.label}
              </button>
            ))}
            <input
              className={slipPick === "custom" ? "sel" : ""}
              value={slipPick === "custom" ? slipCustom : ""}
              onFocus={() => setSlipPick("custom")}
              onChange={(e) => {
                setSlipCustom(e.target.value.replace(/[^0-9.]/g, ""));
                setSlipPick("custom");
              }}
              placeholder="Custom %"
              inputMode="decimal"
              aria-label="Custom slippage percent"
            />
          </div>
        )}
      </div>
      {swaps.map((l) => (
        <p className="ed-line" key={l.asset.code}>
          Rate: {rateLine(l)}
        </p>
      ))}
      <p className="ed-line">Trade size price impact: {impact.length ? `${Math.max(...impact).toFixed(2)}%` : "0%"}</p>
      <p className="ed-line">
        Service fee: {swaps.length ? (swapFee == null ? "…" : swapFee > 0 ? `${pct(swapFee)} of the swapped amount` : "0%") : "0% (no swap)"}
      </p>
    </div>
  );

  return (
    <div
      className="mv-overlay"
      onMouseDown={(e) => {
        if (!spec && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mv-modal ed-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mv-head ed-head">
          <div>
            <h3>
              {"code" in icon ? (
                <TokenIcon symbol={icon.code} size={28} />
              ) : (
                <img loading="lazy" src={icon.src} alt="" width={28} height={28} className="ed-icon" />
              )}{" "}
              {title}
            </h3>
            <p className="ed-desc">{description}</p>
          </div>
          <button type="button" className="mv-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ed-body">
          <div className="ed-left">
            <p className="x-balance ed-balline">
              Balance: <b>{balText(from)}</b>
              {balsReady && balOf(from) > 0 && (
                <button type="button" className="x-max" onClick={() => setAmount(String(balOf(from)))}>
                  MAX
                </button>
              )}
            </p>
            <div className="x-box ed-amount">
              <span className="x-box-label">Amount:</span>
              <div className="x-mid">
                <input
                  className="x-amt"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label={`Amount of ${from}`}
                />
                <span className="x-usd">{fmtUsd(fromUsd ?? 0)}</span>
              </div>
              <div className="x-cell">
                <SwapSelect
                  floating
                  value={from}
                  onChange={setFrom}
                  options={fromList.map((c) => tokOf(c)!)}
                  label="Pay with"
                />
              </div>
            </div>
            {swapBox}
          </div>
          <div className="ed-right">
            <div className="ed-row ed-target">
              <span>{verb}:</span>
              <div className="ed-target-pick">
                {targets.length > 1 ? (
                  <div className="ed-targets">
                    {targets.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`lev-slip${t.key === target?.key ? " sel" : ""}`}
                        onClick={() => setTargetKey(t.key)}
                      >
                        <TokenIcon symbol={t.assets[0]?.code ?? t.label} size={22} /> {t.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="ed-chip">
                    <span className="ed-chip-icons">
                      {(target?.assets ?? []).map((a) => (
                        <TokenIcon key={a.contract} symbol={a.code} size={30} />
                      ))}
                    </span>
                    <b>{target?.label ?? "—"}</b>
                  </span>
                )}
                <small>{target?.name ?? "—"}</small>
              </div>
            </div>
            <div className="ed-receive">
              <div className="ed-receive-head">
                <span>{verb === "Deposit" ? "Amount to deposit" : "Liquidity to add"} (est.)</span>
                <b>{fmtUsd(depositUsd ?? 0)}</b>
              </div>
              {(target?.assets ?? []).map((a) => {
                const leg = legs.find((l) => l.asset.contract === a.contract);
                const out = leg ? leg.out : 0;
                const px = prices[a.code];
                return (
                  <div className="ed-receive-row" key={a.contract}>
                    <TokenIcon symbol={a.code} size={28} />
                    <span className="ed-receive-code">
                      <b>{a.code}</b>
                      {target && target.assets.length > 1 && <small>{Math.round(a.weight * 100)}% of the value</small>}
                    </span>
                    <span className="ed-receive-amt">
                      <b>{out != null ? fmt(out, 4) : "—"}</b>
                      <small>{fmtUsd(out != null && px != null ? out * px : 0)}</small>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="ed-row ed-apy">
              <span>
                {apyLabel}:{apyNote && <small>{apyNote}</small>}
              </span>
              <b>{apy != null ? `${apy.toFixed(2)}%` : "—"}</b>
            </div>
            <div className="ed-row">
              <span>Est. rewards:</span>
              <div className="ed-periods">
                {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
                  <button key={p} type="button" className={p === period ? "active" : ""} onClick={() => setPeriod(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <b>{fmtUsd(rewardsUsd ?? 0)}</b>
            </div>
            {quoting && <p className="ed-line ed-muted">Fetching a live quote…</p>}
            {blocked && <p className="ed-warn">{blocked}</p>}
            {gate ? (
              <button type="button" className="btn primary ed-go" onClick={gate.run}>
                {gate.label}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary ed-go"
                disabled={!!blocked || target?.key === "pending" || quoting || !(amtNum > 0) || over || legs.length === 0}
                onClick={open}
              >
                {over ? `Not enough ${from}` : verb}
              </button>
            )}
          </div>
        </div>
      </div>
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

type VaultRowLite = {
  protocol: string;
  address: string;
  name: string;
  asset: string;
  assetCode: string;
  assetDecimals: number;
  tvlUsd: number;
  apyPct: number | null;
  legs?: unknown[];
};

/** The top DeFindex vault per asset: single-asset, priced (the API lists
 *  only vaults with >= $100 TVL), with a live APY; largest TVL wins. */
export function topVaults(rows: VaultRowLite[], codes: string[]): VaultRowLite[] {
  return codes
    .map(
      (code) =>
        rows
          .filter((r) => r.protocol === "defindex" && r.assetCode === code && (r.legs?.length ?? 1) === 1 && r.apyPct != null)
          .sort((a, b) => b.tvlUsd - a.tvlUsd)[0],
    )
    .filter((r): r is VaultRowLite => !!r);
}

/** Stand-in while the vault list loads: deposits stay blocked (key "pending"). */
const PENDING_USDC_VAULT: DepositTarget = {
  key: "pending",
  label: "USDC",
  name: "Finding the top DeFindex USDC vault…",
  apyPct: null,
  tvlUsd: null,
  assets: [{ code: "USDC", contract: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", decimals: 7, weight: 1 }],
  build: async () => {
    throw new Error("The vault is still loading.");
  },
};

/** "Earn with USDC": any token into the top DeFindex USDC vault. */
export function StableVaultDeposit({ onClose }: { onClose: () => void }) {
  // Null until the vault list answers; the form renders at once meanwhile.
  const [targets, setTargets] = useState<DepositTarget[] | null>(null);
  useEffect(() => {
    if (isTestnetMode()) return;
    apiFetch("/api/vaults?protocol=defindex", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = (d?.ok && Array.isArray(d.rows) ? d.rows : []) as VaultRowLite[];
        setTargets(
          topVaults(rows, ["USDC"]).map((v) => ({
            key: v.address,
            label: v.assetCode,
            name: `${v.name} · DeFindex`,
            apyPct: v.apyPct,
            tvlUsd: v.tvlUsd,
            assets: [{ code: v.assetCode, contract: v.asset, decimals: v.assetDecimals, weight: 1 }],
            build: async (exec, signer, amounts) => {
              const b = await postJson("/api/vaults/build", {
                protocol: "defindex",
                vault: v.address,
                action: "deposit",
                caller: exec,
                signer,
                amounts,
                slippageBps: 50,
              });
              if (!b?.ok || typeof b.xdr !== "string") throw new Error(String(b?.error ?? "Deposit build failed."));
              return b.xdr as string;
            },
          })),
        );
      })
      .catch(() => setTargets([]));
  }, []);
  const best = (targets ?? []).reduce<number | null>((m, t) => (t.apyPct != null && (m == null || t.apyPct > m) ? t.apyPct : m), null);
  return (
    <EarnDepositModal
      title="Earn with USDC"
      description={`Earn${best != null ? ` up to ${best.toFixed(2)}% APY` : ""} in the largest DeFindex USDC vault. Pay with any token: Seidar swaps it to USDC from your smart account and deposits it in one flow. Yield accrues in the vault's share price.`}
      icon={{ code: "USDC" }}
      targets={targets ?? [PENDING_USDC_VAULT]}
      fromCodes={["USDC", "XLM", "EURC", "USDT0", "PYUSD", "USDGLO"]}
      mainnetOnly
      onClose={onClose}
    />
  );
}

/** Aqua's USTRY/USDC pool (tokenized US Treasuries), chosen 2026-10-16. */
export const AQUA_RWA_POOL = "CCX2TYR4AQTPPMTZOIMP3YIBHAYLLSTXVP47PAGTL753PCQFSKV32MIA";

/** The pool's tokens in pool order (on-chain `get_tokens`, checked 2026-10-16). */
const AQUA_RWA_ASSETS: DepositAsset[] = [
  { code: "USTRY", contract: "CBLV4ATSIWU67CFSQU2NVRKINQIKUZ2ODSZBUJTJ43VJVRSBTZYOPNUR", decimals: 7 },
  { code: "USDC", contract: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", decimals: 7 },
];

async function buildAquaRwa(exec: string, signer: string, amounts: string[]) {
  const b = await postJson("/api/dex/liquidity/build", {
    protocol: "aqua",
    pool: AQUA_RWA_POOL,
    from: exec,
    signer,
    action: "deposit",
    amounts,
    slippageBps: 100,
  });
  if (!b?.ok || typeof b.xdr !== "string") throw new Error(String(b?.error ?? "Liquidity build failed."));
  return b.xdr as string;
}

/** "Earn Treasury yield on Aqua": any token, split into the pool's two tokens, then add liquidity. */
export function AquaRwaDeposit({ onClose }: { onClose: () => void }) {
  // The pool and its tokens are fixed, so the form renders at once; the
  // live APY and the reserve-value split fill in when they arrive.
  const [live, setLive] = useState<{ apyPct: number | null; tvlUsd: number | null; weights: number[] } | null>(null);
  useEffect(() => {
    if (isTestnetMode()) return;
    const codes = AQUA_RWA_ASSETS.map((a) => a.code).join(",");
    Promise.all([
      apiFetch(`/api/dex/aqua/pool?pool=${AQUA_RWA_POOL}`, { cache: "no-store" }).then((r) => r.json()),
      apiFetch(`/api/prices?codes=${codes}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([info, px]) => {
        if (!info?.ok) return;
        // Value share of each side from live reserves x prices (50/50 for a
        // constant-product pool, read rather than assumed).
        const vals = AQUA_RWA_ASSETS.map((a) => {
          const i = (info.tokens as string[]).indexOf(a.contract);
          const p = px?.prices?.[a.code];
          return i >= 0 && typeof p === "number" ? (Number(info.reserves[i]) / 10 ** a.decimals) * p : null;
        });
        const sum = vals.every((v) => v != null) ? (vals as number[]).reduce((s, v) => s + v, 0) : 0;
        setLive({
          apyPct: typeof info.totalApyPct === "number" ? info.totalApyPct : null,
          tvlUsd: typeof info.tvlUsd === "number" ? info.tvlUsd : null,
          weights: sum > 0 ? (vals as number[]).map((v) => v / sum) : AQUA_RWA_ASSETS.map(() => 1 / AQUA_RWA_ASSETS.length),
        });
      })
      .catch(() => {});
  }, []);
  const target = useMemo<DepositTarget>(
    () => ({
      key: AQUA_RWA_POOL,
      label: AQUA_RWA_ASSETS.map((a) => a.code).join("/"),
      name: `Aqua ${AQUA_RWA_ASSETS.map((a) => a.code).join("/")} pool`,
      apyPct: live?.apyPct ?? null,
      tvlUsd: live?.tvlUsd ?? null,
      assets: AQUA_RWA_ASSETS.map((a, i) => ({ ...a, weight: live?.weights[i] ?? 1 / AQUA_RWA_ASSETS.length })),
      build: buildAquaRwa,
    }),
    [live],
  );
  return (
    <EarnDepositModal
      title="Earn Treasury yield on Aqua"
      description="Add liquidity to Aqua's USTRY/USDC pool. USTRY's Treasury yield accrues on top of the pool APY. Pay with any token; Seidar splits and deposits it from your smart account."
      icon={{ src: "/ustry-coin-wrapped.png" }}
      apyLabel="Pool APY"
      apyNote="Aqua trading fees + rewards. USTRY's Treasury yield accrues in its own price and isn't included."
      targets={[target]}
      fromCodes={["USDC", "USTRY", "XLM", "EURC", "USDT0"]}
      mainnetOnly
      verb="Add liquidity"
      onClose={onClose}
    />
  );
}
