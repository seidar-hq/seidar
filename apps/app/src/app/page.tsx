"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell, type AppView } from "@/components/shell";
import {
  healthBps,
  healthStatus,
  aggregatePortfolio,
} from "@seidar/positions-sdk";
import { evaluateRule } from "@seidar/automation-sdk";

// Mock pool snapshot (USD values). RPC snapshots replace this in services/.
type Position = {
  id: string;
  market: string;
  protocol: "Blend" | "XOXNO" | "Peridot" | "Vault";
  kind: "lending" | "vault";
  collateralLabel: string;
  debtLabel: string;
  collateralValue: number;
  debtValue: number;
  leverage: string;
  automation: string;
};

const POSITIONS: Position[] = [
  { id: "1", market: "XLM / USDC · Blend", protocol: "Blend", kind: "lending", collateralLabel: "12,400 XLM", debtLabel: "3,100 USDC", collateralValue: 1240, debtValue: 3100 * 0.22, leverage: "3.2x", automation: "Auto-repay" },
  { id: "2", market: "USDC / XLM · XOXNO", protocol: "XOXNO", kind: "lending", collateralLabel: "8,000 USDC", debtLabel: "41,200 XLM", collateralValue: 8000, debtValue: 4120, leverage: "2.1x", automation: "Stop-loss" },
  { id: "3", market: "XLM / USDC · Peridot", protocol: "Peridot", kind: "lending", collateralLabel: "5,600 XLM", debtLabel: "900 USDC", collateralValue: 560, debtValue: 900 * 0.22, leverage: "1.8x", automation: "Off" },
  { id: "4", market: "USDC Vault · DeFindex", protocol: "Vault", kind: "vault", collateralLabel: "10,000 USDC", debtLabel: "—", collateralValue: 10000, debtValue: 0, leverage: "Yield", automation: "Compound" },
];

function shortAddr(a: string | null) {
  return a && a.length > 9 ? `${a.slice(0, 4)}…${a.slice(-4)}` : "this wallet";
}

function healthPill(collateralValue: number, debtValue: number) {
  const h = healthBps(collateralValue, debtValue);
  const s = healthStatus(h);
  if (s === "yield") return <span className="pill">Yield</span>;
  const bps = (h as number).toFixed(0);
  if (s === "healthy") return <span className="pill green">Healthy · {(Number(bps) / 10000).toFixed(2)}</span>;
  if (s === "watch") return <span className="pill amber">Watch · {(Number(bps) / 10000).toFixed(2)}</span>;
  return <span className="pill red">Risk · {(Number(bps) / 10000).toFixed(2)}</span>;
}

function Portfolio() {
  const [tab, setTab] = useState<"all" | "lending" | "vaults">("all");
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [walletBal, setWalletBal] = useState<{ xlm: number; usd: number | null }>({ xlm: 0, usd: 0 });
  const agg = useMemo(() => aggregatePortfolio(POSITIONS), []);

  useEffect(() => {
    function onWallet(e: Event) {
      setWalletAddr((e as CustomEvent<string | null>).detail ?? null);
    }
    window.addEventListener("seidar:wallet", onWallet);
    try {
      const raw = window.localStorage.getItem("seidar.wallet");
      if (raw) setWalletAddr(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("seidar:wallet", onWallet);
  }, []);

  useEffect(() => {
    if (!walletAddr) {
      setWalletBal({ xlm: 0, usd: 0 });
      return;
    }
    let cancelled = false;
    function load() {
      fetch(`/api/balance?address=${walletAddr}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setWalletBal({ xlm: Number(d.xlm ?? 0), usd: d.usd ?? null });
        })
        .catch(() => {
          /* keep last */
        });
    }
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      cancelled = true;
      window.removeEventListener("seidar:refresh", load);
    };
  }, [walletAddr]);

  const supplied = agg.collateral;
  const borrowed = Math.round(agg.debt);
  const vaultValue = POSITIONS.filter((p) => p.kind === "vault").reduce((a, p) => a + p.collateralValue, 0);
  const tokensValue = walletBal.usd ?? 0;
  const netWorth = supplied - borrowed + tokensValue;
  const barTotal = Math.max(1, supplied + borrowed);
  const rows = POSITIONS.filter((p) => tab === "all" || (tab === "lending" ? p.kind === "lending" : p.kind === "vault"));
  const tokenRows = [
    { symbol: "XLM", amount: walletBal.xlm, usd: walletBal.usd },
  ].filter((t) => t.amount > 0);

  function refreshAll() {
    window.dispatchEvent(new Event("seidar:refresh"));
    window.dispatchEvent(new Event("seidar:refresh-notes"));
  }

  return (
    <>
      <div className="pf-grid">
        <div className="pf-card">
          <div className="pf-head">
            <span className="pf-title">Portfolio</span>
            <div className="pf-actions">
              <button
                type="button"
                className="pf-wallets"
                onClick={() => window.dispatchEvent(new Event("seidar:open-wallets"))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>
                Wallets
              </button>
              <button type="button" className="icon-btn" aria-label="Refresh" onClick={refreshAll}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              </button>
            </div>
          </div>
          <p className="pf-net-label">Net worth</p>
          <p className="pf-net">${Math.round(netWorth).toLocaleString()}</p>
          <div className="pf-break">
            <div><small>Tokens</small><b className="pos">${Math.round(tokensValue).toLocaleString()}</b></div>
            <div><small>Supplied</small><b className="pos">${Math.round(supplied).toLocaleString()}</b></div>
            <div><small>Claimable</small><b className="pos">$0</b></div>
            <div><small>Staked</small><b className="warn">$0</b></div>
            <div><small>Borrowed</small><b className="neg">${borrowed.toLocaleString()}</b></div>
            <div><small>Vaults</small><b className="pos">${Math.round(vaultValue).toLocaleString()}</b></div>
          </div>
          <div className="pf-bar" aria-hidden="true">
            <span style={{ width: `${(supplied / barTotal) * 100}%` }} className="seg-supplied" />
            <span style={{ width: `${(borrowed / barTotal) * 100}%` }} className="seg-borrowed" />
          </div>
        </div>
        <div className="pf-card">
          <div className="pf-head">
            <span className="pf-title">Tokens</span>
          </div>
          {tokenRows.length === 0 ? (
            <p className="pf-empty">This account currently doesn&apos;t own any tokens</p>
          ) : (
            <div className="token-list">
              {tokenRows.map((t) => (
                <div className="token-row" key={t.symbol}>
                  <span><b>{t.symbol}</b> <small>· {t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</small></span>
                  <span>${t.usd === null ? "—" : Math.round(t.usd).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pf-card" style={{ marginTop: 12 }}>
        <div className="pf-head">
          <span className="pf-title">Positions</span>
          <div className="tabs" role="tablist" aria-label="Position filters">
            {(["all", "lending", "vaults"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`tab${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "all" ? "All" : t === "lending" ? "Lending" : "Vaults"}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="pf-empty-block">
            <svg width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="#3a3a41" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="8" y="6" width="40" height="7" rx="3.5" strokeDasharray="4 4" />
              <rect x="8" y="17" width="40" height="7" rx="3.5" strokeDasharray="4 4" />
              <rect x="8" y="28" width="40" height="7" rx="3.5" strokeDasharray="4 4" />
              <rect x="8" y="39" width="28" height="7" rx="3.5" strokeDasharray="4 4" />
              <circle cx="50" cy="38" r="10" />
              <line x1="57.5" y1="45.5" x2="66" y2="54" />
            </svg>
            <p>No active positions found for {shortAddr(walletAddr)}.</p>
          </div>
        ) : (
          <div className="table" style={{ marginTop: 12 }}>
            <header><span>POSITION</span><span>COLLATERAL</span><span>DEBT</span><span>AUTOMATION</span><span>HEALTH</span></header>
            {rows.map((p) => (
              <div className="row" key={p.id}>
                <span><b>{p.market}</b> <span style={{ color: "#8a8a91" }}>· {p.leverage}</span></span>
                <span>{p.collateralLabel}</span>
                <span>{p.debtLabel}</span>
                <span>{p.automation}</span>
                <span>{healthPill(p.collateralValue, p.debtValue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Placeholder({ title, body, ruleBody }: { title: string; body: string; ruleBody?: string }) {
  const [on, setOn] = useState(true);
  const decision = useMemo(
    () =>
      evaluateRule(
        {
          active: on,
          lastFired: 0,
          cooldownLedgers: 100,
          trigger: { type: "HealthBelow", value: 15000 },
        },
        { healthBps: 13500, price: 0 },
        10000
      ),
    [on]
  );
  return (
    <>
      <h1 style={{ fontSize: 20 }}>{title}</h1>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4 }}>{body}</p>
      {ruleBody && <p style={{ color: "#8a8a91", fontSize: 12.5, marginTop: 4 }}>{ruleBody}</p>}
      <div className="cards">
        <div className="card"><small>STATUS</small><strong>Testnet</strong><span>Soroban · Reflector prices</span></div>
        <div className="card"><small>AUTOMATION</small><strong>{on ? "Armed" : "Off"}</strong><span>Keeper says: {decision.reason}</span></div>
        <div className="card"><small>QUOTE</small><strong>Live</strong><span>Soroswap routing</span></div>
      </div>
      <div className="actions-row">
        <button className="btn primary" type="button" onClick={() => setOn(!on)}>
          {on ? "Pause automation" : "Arm automation"}
        </button>
        <button className="btn" type="button">Build recipe</button>
        <button className="btn" type="button">Shift position</button>
      </div>
    </>
  );
}

export default function AppHome() {
  const [view, setView] = useState<AppView>("portfolio");
  return (
    <Shell view={view} setView={setView}>
      {view === "portfolio" && <Portfolio />}
      {view === "discover" && <Placeholder title="Discover" body="Browse leverage, borrow and yield presets across Blend, XOXNO and Peridot without connecting." />}
      {view === "blend" && <Placeholder title="Blend" body="Supply, borrow, boost, repay and automate Blend V2 pools with flash-submit + Soroswap swaps." ruleBody="Keeper evaluation for HealthBelow 15000 at 13500: fires when armed." />}
      {view === "xoxno" && <Placeholder title="XOXNO" body="Hub-and-spoke markets with health-factor limits, flash loans and dual-oracle guards." />}
      {view === "peridot" && <Placeholder title="Peridot" body="Cross-chain hub money market with vault-share collateral and expert routing." />}
      {view === "savings" && <Placeholder title="Smart Savings" body="Hop USDC and EURC across DeFindex and Templar curated vaults in one transaction." />}
      {view === "shifter" && <Placeholder title="Loan Shifter" body="Move collateral, debt or full positions between pools without unwinding manually." />}
      {view === "recipes" && <Placeholder title="Recipe Creator" body="Compose flash + supply + borrow + swap steps visually; execute atomically via recipe_executor." />}
      {view === "automate" && <Placeholder title="Automation" body="Auto-repay, stop-loss, take-profit and trailing stops. Keepers propose, guardian verifies." ruleBody="Toggle arming to see the keeper decision change between fire and inactive." />}
      {view === "settings" && <Placeholder title="Settings" body="Wallets, smart account, optional multisig policy (2-of-3 / weighted), keeper keys, gas credits." />}
    </Shell>
  );
}
