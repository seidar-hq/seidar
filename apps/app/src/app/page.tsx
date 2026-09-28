"use client";

import { useMemo, useState } from "react";
import { Shell, type AppView } from "@/components/shell";

type Position = {
  id: string;
  market: string;
  protocol: "Blend" | "XOXNO" | "Peridot" | "Vault";
  collateral: string;
  debt: string;
  leverage: string;
  health: number;
  automation: string;
};

const POSITIONS: Position[] = [
  { id: "1", market: "XLM / USDC · Blend", protocol: "Blend", collateral: "12,400 XLM", debt: "3,100 USDC", leverage: "3.2x", health: 1.82, automation: "Auto-repay" },
  { id: "2", market: "USDC / XLM · XOXNO", protocol: "XOXNO", collateral: "8,000 USDC", debt: "41,200 XLM", leverage: "2.1x", health: 2.1, automation: "Stop-loss" },
  { id: "3", market: "XLM / USDC · Peridot", protocol: "Peridot", collateral: "5,600 XLM", debt: "900 USDC", leverage: "1.8x", health: 1.35, automation: "Off" },
  { id: "4", market: "USDC Vault · DeFindex", protocol: "Vault", collateral: "10,000 USDC", debt: "—", leverage: "Yield", health: 0, automation: "Compound" },
];

function healthPill(h: number) {
  if (h === 0) return <span className="pill">Yield</span>;
  if (h >= 1.6) return <span className="pill green">Healthy · {h.toFixed(2)}</span>;
  if (h >= 1.25) return <span className="pill amber">Watch · {h.toFixed(2)}</span>;
  return <span className="pill red">Risk · {h.toFixed(2)}</span>;
}

function Portfolio() {
  const [leverage, setLeverage] = useState(3.2);
  const quote = useMemo(() => {
    const flash = (12400 * (leverage - 1)).toFixed(0);
    const health = (2.6 - leverage * 0.28).toFixed(2);
    return { flash, health };
  }, [leverage]);

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Portfolio</h1>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4 }}>
        Health, leverage, automation and gas credits across Blend, XOXNO and Peridot.
      </p>
      <div className="cards">
        <div className="card"><small>NET COLLATERAL</small><strong>$24,180</strong><span>4 positions · Testnet</span></div>
        <div className="card"><small>NET DEBT</small><strong>$8,940</strong><span>XLM + USDC</span></div>
        <div className="card"><small>PROTECTED</small><strong>2 / 3 loans</strong><span>Keeper + guardian on-chain</span></div>
        <div className="card"><small>GAS CREDITS</small><strong>4 left</strong><span>Then pay in USDC</span></div>
      </div>
      <div className="table">
        <header><span>POSITION</span><span>COLLATERAL</span><span>DEBT</span><span>AUTOMATION</span><span>HEALTH</span></header>
        {POSITIONS.map((p) => (
          <div className="row" key={p.id}>
            <span><b>{p.market}</b> <span style={{ color: "#8a8a91" }}>· {p.leverage}</span></span>
            <span>{p.collateral}</span>
            <span>{p.debt}</span>
            <span>{p.automation}</span>
            <span>{healthPill(p.health)}</span>
          </div>
        ))}
      </div>
      <div className="leverage">
        <b>Boost / Repay preview — XLM / USDC · Blend</b>
        <p style={{ color: "#8a8a91", fontSize: 12.5, marginTop: 6 }}>
          Drag leverage. Quote uses flash liquidity + Soroswap routing; signing executes atomically.
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
        <div className="kv"><span>Flash amount</span><b>{quote.flash} XLM</b></div>
        <div className="kv"><span>Resulting health</span><b>{quote.health}</b></div>
        <div className="actions-row">
          <button className="btn primary" type="button">Boost to {leverage.toFixed(1)}x</button>
          <button className="btn" type="button">Repay</button>
          <button className="btn" type="button">Simulate</button>
        </div>
      </div>
    </>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  const [on, setOn] = useState(true);
  return (
    <>
      <h1 style={{ fontSize: 20 }}>{title}</h1>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4 }}>{body}</p>
      <div className="cards">
        <div className="card"><small>STATUS</small><strong>Testnet</strong><span>Soroban · Reflector prices</span></div>
        <div className="card"><small>AUTOMATION</small><strong>{on ? "Armed" : "Off"}</strong><span>Keeper + guardian</span></div>
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
      {view === "blend" && <Placeholder title="Blend" body="Supply, borrow, boost, repay and automate Blend V2 pools with flash-submit + Soroswap swaps." />}
      {view === "xoxno" && <Placeholder title="XOXNO" body="Hub-and-spoke markets with health-factor limits, flash loans and dual-oracle guards." />}
      {view === "peridot" && <Placeholder title="Peridot" body="Cross-chain hub money market with vault-share collateral and expert routing." />}
      {view === "savings" && <Placeholder title="Smart Savings" body="Hop USDC and EURC across DeFindex and Templar curated vaults in one transaction." />}
      {view === "shifter" && <Placeholder title="Loan Shifter" body="Move collateral, debt or full positions between pools without unwinding manually." />}
      {view === "recipes" && <Placeholder title="Recipe Creator" body="Compose flash + supply + borrow + swap steps visually; execute atomically via recipe_executor." />}
      {view === "automate" && <Placeholder title="Automation" body="Auto-repay, stop-loss, take-profit and trailing stops. Keepers propose, guardian verifies." />}
      {view === "settings" && <Placeholder title="Settings" body="Wallets, smart account, optional multisig policy (2-of-3 / weighted), keeper keys, gas credits." />}
    </Shell>
  );
}
