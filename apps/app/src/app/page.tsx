"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell, type AppView } from "@/components/shell";
import {
  healthBps,
  healthStatus,
  aggregatePortfolio,
} from "@seidar/positions-sdk";
import { boostRecipe, quoteFee, feeTierBps } from "@seidar/sdk";
import { evaluateRule } from "@seidar/automation-sdk";
import { CONTRACTS, EXPERT_TX, type ChainEvent } from "@/lib/chain";

// Mock pool snapshot (USD values). RPC snapshots replace this in services/.
type Position = {
  id: string;
  market: string;
  protocol: "Blend" | "XOXNO" | "Peridot" | "Vault";
  collateralLabel: string;
  debtLabel: string;
  collateralValue: number;
  debtValue: number;
  leverage: string;
  automation: string;
};

const POSITIONS: Position[] = [
  { id: "1", market: "XLM / USDC · Blend", protocol: "Blend", collateralLabel: "12,400 XLM", debtLabel: "3,100 USDC", collateralValue: 1240, debtValue: 3100 * 0.22, leverage: "3.2x", automation: "Auto-repay" },
  { id: "2", market: "USDC / XLM · XOXNO", protocol: "XOXNO", collateralLabel: "8,000 USDC", debtLabel: "41,200 XLM", collateralValue: 8000, debtValue: 4120, leverage: "2.1x", automation: "Stop-loss" },
  { id: "3", market: "XLM / USDC · Peridot", protocol: "Peridot", collateralLabel: "5,600 XLM", debtLabel: "900 USDC", collateralValue: 560, debtValue: 900 * 0.22, leverage: "1.8x", automation: "Off" },
  { id: "4", market: "USDC Vault · DeFindex", protocol: "Vault", collateralLabel: "10,000 USDC", debtLabel: "—", collateralValue: 10000, debtValue: 0, leverage: "Yield", automation: "Compound" },
];

function healthPill(collateralValue: number, debtValue: number) {
  const h = healthBps(collateralValue, debtValue);
  const s = healthStatus(h);
  if (s === "yield") return <span className="pill">Yield</span>;
  const bps = (h as number).toFixed(0);
  if (s === "healthy") return <span className="pill green">Healthy · {(Number(bps) / 10000).toFixed(2)}</span>;
  if (s === "watch") return <span className="pill amber">Watch · {(Number(bps) / 10000).toFixed(2)}</span>;
  return <span className="pill red">Risk · {(Number(bps) / 10000).toFixed(2)}</span>;
}

function LiveActivity() {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [live, setLive] = useState<boolean | null>(null);
  const [ledger, setLedger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setLive(d.live);
        setLedger(d.ledger ?? 0);
        setEvents(d.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nameOf = (c: string) =>
    c === CONTRACTS.guardian ? "guardian" : c === CONTRACTS.recipeExecutor ? "executor" : "unknown";

  return (
    <div className="leverage">
      <b>
        Live testnet activity{" "}
        <span className={`pill ${live ? "green" : live === false ? "amber" : ""}`} style={{ marginLeft: 6 }}>
          {live ? `Live · #${ledger}` : live === false ? "Offline — showing last known" : "Connecting…"}
        </span>
      </b>
      <p style={{ color: "#8a8a91", fontSize: 12.5, marginTop: 6 }}>
        Real guardian + executor events from Soroban testnet. Click through to stellar.expert.
      </p>
      <div className="table" style={{ marginTop: 10 }}>
        <header><span>CONTRACT</span><span>EVENT</span><span>LEDGER</span><span>TX</span><span></span></header>
        {events.length === 0 && (
          <div className="row"><span>No events in window</span><span>—</span><span>—</span><span>—</span><span></span></div>
        )}
        {events.map((e) => (
          <div className="row" key={`${e.txHash}-${e.topic}`}>
            <span>{nameOf(e.contract)}</span>
            <span>{e.topic}</span>
            <span>{e.ledger}</span>
            <span style={{ color: "#8a8a91" }}>{e.txHash.slice(0, 8)}…</span>
            <span><a href={EXPERT_TX(e.txHash)} target="_blank" rel="noreferrer">View ↗</a></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Portfolio() {
  const [leverage, setLeverage] = useState(3.2);
  const agg = useMemo(() => aggregatePortfolio(POSITIONS), []);
  const quote = useMemo(() => {
    // Quote the boost the same way @seidar/sdk + positions math do.
    const base = POSITIONS[0];
    const flash = Math.round(base.collateralValue * (leverage - 1));
    const recipe = boostRecipe({
      debtAsset: "USDC",
      collateralAsset: "XLM",
      flashAmount: Math.round(flash / 0.1),
      supplyAmount: Math.round(flash / 0.1),
      borrowAmount: Math.round(flash / 0.1),
    });
    recipe.validate();
    const fee = quoteFee(flash, feeTierBps({}));
    const health = healthBps(
      base.collateralValue + flash,
      base.debtValue + flash
    );
    return {
      flash,
      fee,
      steps: recipe.actions.length,
      health: health === null ? "—" : (health / 10000).toFixed(2),
    };
  }, [leverage]);

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Portfolio</h1>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4 }}>
        Health, leverage, automation and gas credits across Blend, XOXNO and Peridot.
      </p>
      <div className="cards">
        <div className="card"><small>NET COLLATERAL</small><strong>${agg.collateral.toLocaleString()}</strong><span>{agg.count} positions · Testnet</span></div>
        <div className="card"><small>NET DEBT</small><strong>${Math.round(agg.debt).toLocaleString()}</strong><span>XLM + USDC</span></div>
        <div className="card"><small>PROTECTED</small><strong>{agg.protected} / {agg.loans} loans</strong><span>Keeper + guardian on-chain</span></div>
        <div className="card"><small>GAS CREDITS</small><strong>4 left</strong><span>Then pay in USDC</span></div>
      </div>
      <div className="table">
        <header><span>POSITION</span><span>COLLATERAL</span><span>DEBT</span><span>AUTOMATION</span><span>HEALTH</span></header>
        {POSITIONS.map((p) => (
          <div className="row" key={p.id}>
            <span><b>{p.market}</b> <span style={{ color: "#8a8a91" }}>· {p.leverage}</span></span>
            <span>{p.collateralLabel}</span>
            <span>{p.debtLabel}</span>
            <span>{p.automation}</span>
            <span>{healthPill(p.collateralValue, p.debtValue)}</span>
          </div>
        ))}
      </div>
      <div className="leverage">
        <b>Boost / Repay preview — XLM / USDC · Blend</b>
        <p style={{ color: "#8a8a91", fontSize: 12.5, marginTop: 6 }}>
          Quoted live by @seidar/sdk + @seidar/positions-sdk: flash liquidity, 25bps service fee, atomic {quote.steps}-step recipe.
        </p>
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          aria-label="Leverage"
        />
        <div className="kv"><span>Leverage</span><b>{leverage.toFixed(1)}x</b></div>
        <div className="kv"><span>Flash amount</span><b>${quote.flash.toLocaleString()}</b></div>
        <div className="kv"><span>Service fee (25bps)</span><b>${quote.fee.toLocaleString()}</b></div>
        <div className="kv"><span>Resulting health</span><b>{quote.health}</b></div>
        <div className="actions-row">
          <button className="btn primary" type="button">Boost to {leverage.toFixed(1)}x</button>
          <button className="btn" type="button">Repay</button>
          <button className="btn" type="button">Simulate</button>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <LiveActivity />
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
