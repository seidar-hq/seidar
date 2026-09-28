"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  healthBps,
  healthStatus,
  aggregatePortfolio,
  netApy,
} from "@seidar/positions-sdk";
import { evaluateRule } from "@seidar/automation-sdk";
import type { AppView } from "./shell";
import { PairIcons, TokenIcon } from "./token-icon";

function goto(view: AppView) {
  window.dispatchEvent(new CustomEvent("seidar:goto-view", { detail: view }));
}

// Mock pool snapshot (USD values). RPC snapshots replace this in services/.
type Position = {
  id: string;
  market: string;
  protocol: "Blend" | "XOXNO" | "Peridot" | "Vault";
  kind: "lending" | "vault";
  collateralLabel: string;
  debtLabel: string;
  collateralSymbol: string;
  debtSymbol: string | null;
  collateralValue: number;
  debtValue: number;
  leverage: string;
  automation: string;
};

const POSITIONS: Position[] = [
  { id: "1", market: "XLM / USDC · Blend", protocol: "Blend", kind: "lending", collateralLabel: "12,400 XLM", debtLabel: "3,100 USDC", collateralSymbol: "XLM", debtSymbol: "USDC", collateralValue: 1240, debtValue: 3100 * 0.22, leverage: "3.2x", automation: "Auto-repay" },
  { id: "2", market: "USDC / XLM · XOXNO", protocol: "XOXNO", kind: "lending", collateralLabel: "8,000 USDC", debtLabel: "41,200 XLM", collateralSymbol: "USDC", debtSymbol: "XLM", collateralValue: 8000, debtValue: 4120, leverage: "2.1x", automation: "Stop-loss" },
  { id: "3", market: "XLM / USDC · Peridot", protocol: "Peridot", kind: "lending", collateralLabel: "5,600 XLM", debtLabel: "900 USDC", collateralSymbol: "XLM", debtSymbol: "USDC", collateralValue: 560, debtValue: 900 * 0.22, leverage: "1.8x", automation: "Off" },
  { id: "4", market: "USDC Vault · DeFindex", protocol: "Vault", kind: "vault", collateralLabel: "10,000 USDC", debtLabel: "—", collateralSymbol: "USDC", debtSymbol: null, collateralValue: 10000, debtValue: 0, leverage: "Yield", automation: "Compound" },
];

// Native assets live outside the Tokens card (balances, not tokens).
const NATIVE_ASSETS = new Set(["XLM"]);

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

/* ------------------------------- Discover ------------------------------- */

type FeatureCard = {
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
};

type EarnCard = {
  tag: string;
  title: string;
  asset: string;
  showAsset: boolean;
  cta: string;
  view: AppView;
  apy?: string;
  desc?: string;
};

const DISCOVER: Record<
  "getting" | "trending",
  { features: FeatureCard[]; earns: EarnCard[] }
> = {
  getting: {
    features: [
      {
        asset: "XLM",
        tint: "#3b82f6",
        titleA: "Go long on",
        leverage: "3.2x",
        leverageColor: "#8ea2ff",
        primary: "Long",
        secondary: "Short",
        browse: "Browse all XLM markets",
        view: "blend",
        spark: "0,34 20,30 40,32 60,22 80,26 100,16 120,20 140,10 160,14",
      },
      {
        asset: "USDC",
        against: "XLM",
        tint: "#57c36b",
        titleA: "Borrow USDC against",
        leverage: "75% LTV",
        leverageColor: "#7ee2a0",
        primary: "Supply",
        secondary: "Borrow",
        browse: "Browse all USDC markets",
        view: "blend",
        spark: "0,20 20,24 40,18 60,22 80,16 100,20 120,14 140,18 160,12",
      },
    ],
    earns: [
      { tag: "Blend", title: "Earn with", asset: "USDC", showAsset: true, cta: "Open position", view: "blend", apy: "7.42%" },
      { tag: "DeFindex", title: "Earn steady vault", asset: "USDC", showAsset: true, cta: "Open vault", view: "savings", apy: "5.10%" },
      { tag: "Automation", title: "Protect with auto-repay", asset: "XLM", showAsset: false, cta: "Arm automation", view: "automate", desc: "Set & forget liquidation protection on every loan." },
    ],
  },
  trending: {
    features: [
      {
        asset: "XLM",
        tint: "#3b82f6",
        titleA: "Go long on",
        leverage: "5.0x",
        leverageColor: "#8ea2ff",
        primary: "Long",
        secondary: "Short",
        browse: "Browse all XLM markets",
        view: "xoxno",
        spark: "0,30 20,22 40,26 60,14 80,20 100,10 120,16 140,6 160,10",
      },
      {
        asset: "EURC",
        tint: "#57c36b",
        titleA: "Earn with",
        leverage: "5.84%",
        leverageColor: "#7ee2a0",
        primary: "Supply",
        secondary: "Borrow",
        browse: "Browse all EURC markets",
        view: "blend",
        spark: "0,24 20,20 40,22 60,16 80,18 100,12 120,16 140,10 160,12",
      },
    ],
    earns: [
      { tag: "XOXNO", title: "Loop with", asset: "XLM", showAsset: true, cta: "Open position", view: "xoxno", apy: "9.10%" },
      { tag: "Peridot", title: "Borrow cross-chain", asset: "USDC", showAsset: false, cta: "Open position", view: "peridot", apy: "4.20%" },
      { tag: "Automation", title: "Trail your stop", asset: "XLM", showAsset: false, cta: "Arm automation", view: "automate", desc: "Lock in profit while price climbs." },
    ],
  },
};

function Spark({ points, tint }: { points: string; tint: string }) {
  return (
    <svg viewBox="0 0 160 40" preserveAspectRatio="none" className="dz-spark" aria-hidden="true">
      <polyline points={points} fill="none" stroke={tint} strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

function DiscoverSection() {
  const [dzTab, setDzTab] = useState<"getting" | "trending">("getting");
  const data = DISCOVER[dzTab];
  return (
    <div className="pf-card" style={{ marginTop: 12 }}>
      <div className="dz-head">
        <div className="dz-tabs" role="tablist" aria-label="Discover feeds">
          {(["getting", "trending"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={dzTab === t}
              className={`dz-tab${dzTab === t ? " active" : ""}`}
              onClick={() => setDzTab(t)}
            >
              {t === "getting" ? "Getting Started" : "Trending & popular"}
            </button>
          ))}
        </div>
        <button type="button" className="dz-more" onClick={() => goto("discover")}>
          <span className="dz-more-ico" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2.5" /></svg>
          </span>
          View more
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
        </button>
      </div>
      <div className="dz-grid">
        <div className="dz-col">
          {data.features.map((f) => (
            <div className="dz-card" key={f.titleA + f.asset + f.leverage}>
              <div className="dz-visual" style={{ background: `linear-gradient(180deg, ${f.tint}26, transparent)` }}>
                <Spark points={f.spark} tint={f.tint} />
                <span className="dz-big-icon" style={{ background: `${f.tint}30`, boxShadow: `0 0 40px ${f.tint}55` }}>
                  <TokenIcon symbol={f.asset} size={40} />
                </span>
              </div>
              <div className="dz-body">
                <p className="dz-title">
                  {f.titleA} <TokenIcon symbol={f.asset} size={18} /> {f.against ?? f.asset} up to{" "}
                  <b style={{ color: f.leverageColor }}>{f.leverage}</b>
                </p>
                <div className="dz-btnrow">
                  <button type="button" onClick={() => goto(f.view)}>⚡ {f.primary}</button>
                  <button type="button" onClick={() => goto(f.view)}>⚡ {f.secondary}</button>
                  <button type="button" className="dz-link" onClick={() => goto(f.view)}>{f.browse}</button>
                </div>
              </div>
            </div>
          ))}
          <div className="dz-card dz-explore">
            <p className="dz-explore-title">Explore more options</p>
            <p className="dz-explore-sub">Compare all markets across protocols.</p>
            <div className="dz-chips">
              <button type="button" onClick={() => goto("blend")}>Leveraged borrowing <span aria-hidden="true">→</span></button>
              <button type="button" onClick={() => goto("savings")}>Passive yield <span aria-hidden="true">→</span></button>
              <button type="button" onClick={() => goto("savings")}>Smart savings <span aria-hidden="true">→</span></button>
              <button type="button" onClick={() => goto("automate")}>Automation <span aria-hidden="true">→</span></button>
            </div>
          </div>
        </div>
        <div className="dz-col">
          {data.earns.map((c) => (
            <div className="dz-card dz-earn" key={c.tag + c.title}>
              <div>
                <small className="dz-tag">{c.tag}</small>
                <p className="dz-title">
                  {c.title}{" "}
                  {c.showAsset && (
                    <>
                      <TokenIcon symbol={c.asset} size={18} /> {c.asset}
                    </>
                  )}
                </p>
                {c.desc && <p className="dz-desc">{c.desc}</p>}
                <button type="button" className="dz-open" onClick={() => goto(c.view)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
                  {c.cta}
                </button>
              </div>
              {c.apy && (
                <div className="dz-apy">
                  <TokenIcon symbol={c.asset} size={40} />
                  <b>{c.apy}</b>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Donut chart ----------------------------- */

type DonutItem = { label: string; value: number; color: string };

function Donut({ items, total }: { items: DonutItem[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const R = 60;
  const C = 2 * Math.PI * R;
  const denom = Math.max(1, items.reduce((a, i) => a + Math.max(0, i.value), 0));
  let acc = 0;
  const segs = items
    .filter((i) => i.value > 0)
    .map((item) => {
      const frac = item.value / denom;
      const seg = { ...item, frac, offset: acc };
      acc += frac;
      return seg;
    });
  const active = hover != null ? segs[hover] ?? null : null;
  return (
    <div className="pf-donut">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Portfolio allocation">
        <circle cx="75" cy="75" r={R} fill="none" stroke="#1c1c20" strokeWidth="18" />
        {segs.map((s, i) => (
          <circle
            key={s.label}
            cx="75"
            cy="75"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={i === hover ? 15 : 12}
            strokeDasharray={`${Math.max(0, s.frac * C - 2)} ${C}`}
            strokeDashoffset={-s.offset * C}
            strokeLinecap="butt"
            transform="rotate(-90 75 75)"
            opacity={hover == null || i === hover ? 1 : 0.35}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "pointer", transition: "opacity .15s, stroke-width .15s" }}
          >
            <title>{`${s.label}: $${Math.round(s.value).toLocaleString()} (${(s.frac * 100).toFixed(1)}%)`}</title>
          </circle>
        ))}
        <text x="75" y={active ? 70 : 72} textAnchor="middle" fill="#8a8a91" fontSize="10.5" fontWeight="700">
          {active ? active.label : "Net worth"}
        </text>
        <text x="75" y={active ? 88 : 90} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">
          $
          {Math.round(active ? active.value : total).toLocaleString()}
        </text>
        {active && (
          <text x="75" y="102" textAnchor="middle" fill="#8a8a91" fontSize="10.5" fontWeight="700">
            {(active.frac * 100).toFixed(1)}%
          </text>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------- Portfolio ------------------------------ */

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

  const [spinning, setSpinning] = useState(false);

  function refreshAll() {
    if (spinning) return;
    setSpinning(true);
    const done = () => setSpinning(false);
    const minSpin = new Promise((res) => setTimeout(res, 600));
    const bal =
      walletAddr != null
        ? fetch(`/api/balance?address=${walletAddr}`)
            .then((r) => r.json())
            .then((d) => {
              setWalletBal({ xlm: Number(d.xlm ?? 0), usd: d.usd ?? null });
            })
            .catch(() => {
              /* keep last */
            })
        : Promise.resolve();
    window.dispatchEvent(new Event("seidar:refresh-notes"));
    Promise.all([bal, minSpin]).then(done, done);
  }

  const supplied = agg.collateral;
  const borrowed = Math.round(agg.debt);
  const vaultValue = POSITIONS.filter((p) => p.kind === "vault").reduce((a, p) => a + p.collateralValue, 0);
  const tokensValue = walletBal.usd ?? 0;
  const netWorth = supplied - borrowed + tokensValue;
  const alloc = [
    { label: "Tokens", value: tokensValue, color: "#2dd4bf" },
    { label: "Supplied", value: supplied, color: "#57c36b" },
    { label: "Claimable", value: 0, color: "#8a8a91" },
    { label: "Staked", value: 0, color: "#f5a524" },
    { label: "Borrowed", value: borrowed, color: "#e5484d" },
    { label: "Vaults", value: vaultValue, color: "#3b82f6" },
  ];
  const rows = POSITIONS.filter((p) => tab === "all" || (tab === "lending" ? p.kind === "lending" : p.kind === "vault"));
  const tokenRows = [
    { symbol: "XLM", amount: walletBal.xlm, usd: walletBal.usd },
    { symbol: "USDC", amount: 0, usd: 0 },
  ].filter((t) => t.amount > 0 && !NATIVE_ASSETS.has(t.symbol));

  return (
    <>
      <div className="pf-grid">
        <div className="pf-col">
          <div className="pf-card">
            <div className="pf-head">
              <span className="pf-title">Portfolio</span>
              <div className="pf-actions">
                <button
                  type="button"
                  className="pf-wallets"
                  onClick={() => window.dispatchEvent(new CustomEvent("seidar:goto-view", { detail: "settings" }))}
                  title="Manage wallets in Settings"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M20 7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><circle cx="17.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></svg>
                  Wallets
                </button>
                <button
                  type="button"
                  className={`icon-btn${spinning ? " spinning" : ""}`}
                  aria-label="Refresh"
                  onClick={refreshAll}
                  disabled={spinning}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                </button>
              </div>
            </div>
            <p className="pf-net-label">Net worth</p>
            <div className="pf-split">
              <p className="pf-net">${Math.round(netWorth).toLocaleString()}</p>
              <Donut items={alloc} total={netWorth} />
            </div>
            <div className="pf-break">
              {alloc.map((a) => (
                <div key={a.label}>
                  <small>{a.label}</small>
                  <b style={{ color: a.color }}>${Math.round(a.value).toLocaleString()}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="pf-card">
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
              <div className="pos-table">
                <header><span>POSITION</span><span>COLLATERAL</span><span>DEBT</span><span>AUTOMATION</span><span>HEALTH</span></header>
                <div className="pos-rows">
                  {rows.map((p) => (
                    <div className="row" key={p.id}>
                      <span className="pos-market">
                        <PairIcons a={p.collateralSymbol} b={p.debtSymbol} />
                        <span className="pos-names"><b>{p.market}</b><small>· {p.leverage}</small></span>
                      </span>
                      <span>{p.collateralLabel}</span>
                      <span>{p.debtLabel}</span>
                      <span>{p.automation}</span>
                      <span>{healthPill(p.collateralValue, p.debtValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="pf-card tokens-rail">
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
      <DiscoverSection />
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

const PROTOCOL_META: Record<string, { name: string; desc: string; ltv: string; view: AppView }> = {
  blend: { name: "Blend", desc: "Isolated lending pools with flash-submit and Reflector oracles.", ltv: "75% max LTV", view: "blend" },
  xoxno: { name: "XOXNO", desc: "Hub-and-spoke money market with health-factor limits.", ltv: "80% max LTV", view: "xoxno" },
  peridot: { name: "Peridot", desc: "Cross-chain hub market with vault-share collateral.", ltv: "70% max LTV", view: "peridot" },
};

function ProtocolsView() {
  return (
    <>
      <h1 style={{ fontSize: 20 }}>Protocols</h1>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4, marginBottom: 12 }}>
        Lending protocols Seidar manages positions on.
      </p>
      <div className="pf-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {Object.values(PROTOCOL_META).map((p) => (
          <div className="pf-card" key={p.name}>
            <div className="pf-head">
              <span className="pf-title">{p.name}</span>
            </div>
            <p style={{ color: "#8a8a91", fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>{p.desc}</p>
            <p style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{p.ltv}</p>
            <div className="actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={() => goto(p.view)}>
                Open {p.name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
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
  protocol: "blend" | "xoxno" | "peridot";
  protocolLabel: string;
  cats: MarketCat[];
  available: boolean;
};

/** Custom dark tooltip (hover/focus). */
function Tip({ tip, children }: { tip: React.ReactNode; children: React.ReactNode }) {
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
      {children}
      {show && <span className="tip-bubble">{tip}</span>}
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

function DiscoverPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [poolsState, setPoolsState] = useState<"loading" | "live" | "error">("loading");
  const [poolsUpdatedAt, setPoolsUpdatedAt] = useState<number>(0);
  const slug = (pathname ?? "/discover/all").split("/").filter(Boolean)[1] ?? "all";
  const slugToCat: Record<string, DvCat> = {
    all: "browse",
    "leveraged-borrowing": "leverage",
    "yield-farming": "yield",
    "passive-yield": "passive",
  };
  const catToSlug: Record<DvCat, string> = {
    browse: "all",
    leverage: "leveraged-borrowing",
    yield: "yield-farming",
    passive: "passive-yield",
  };
  const cat = slugToCat[slug] ?? "browse";
  const setCat = (c: DvCat) => {
    if (c !== cat) router.push(`/discover/${catToSlug[c]}`);
  };

  // Live markets: Blend V2 pools via SDK + XOXNO supply via DeFiLlama.
  // Peridot Stellar pools have no verified read source yet — shown as pending.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pools")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && Array.isArray(d.rows)) {
          setMarkets(d.rows);
          setPoolsUpdatedAt(d.updatedAt ?? Date.now());
          setPoolsState("live");
        } else {
          setPoolsState("error");
        }
      })
      .catch(() => {
        if (!cancelled) setPoolsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [collateral, setCollateral] = useState("all");
  const [debt, setDebt] = useState("all");
  const [protocol, setProtocol] = useState("all");
  const [estimate, setEstimate] = useState(true);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [hideTable, setHideTable] = useState(false);
  const [mode, setMode] = useState<"borrow" | "leverage">("borrow");
  const [showHint, setShowHint] = useState(true);
  const [collateralAmt, setCollateralAmt] = useState("100000");
  const [debtAmt, setDebtAmt] = useState("50000");

  const codes = useMemo(() => {
    const s = new Set<string>();
    markets.forEach((m) => {
      s.add(m.collateral);
      if (m.debt) s.add(m.debt);
    });
    return [...s].sort();
  }, [markets]);
  const protocols = useMemo(() => [...new Set(markets.map((m) => m.protocolLabel))].sort(), [markets]);

  const inCat = (m: MarketRow) => cat === "browse" || m.cats.includes(cat);
  const filtered = markets.filter(
    (m) =>
      inCat(m) &&
      (collateral === "all" || m.collateral === collateral) &&
      (debt === "all" || m.debt === debt) &&
      (protocol === "all" || m.protocolLabel === protocol) &&
      (!ownedOnly || m.collateral === "XLM") &&
      (!hideUnavailable || m.available)
  );

  const collNum = Number(collateralAmt.replace(/[^0-9.]/g, "")) || 0;
  const debtNum = Number(debtAmt.replace(/[^0-9.]/g, "")) || 0;

  function netFor(m: MarketRow): number {
    if (m.debt == null || m.borrowApy == null || debtNum <= 0) return m.supplyApy;
    if (!estimate || collNum <= 0) {
      return netApy(100000, m.supplyApy * 100, 50000, m.borrowApy * 100) / 100;
    }
    return netApy(collNum, m.supplyApy * 100, debtNum, m.borrowApy * 100) / 100;
  }

  function Toggle({ on, onFlip, label }: { on: boolean; onFlip: () => void; label: string }) {
    return (
      <button type="button" className="dv-toggle" onClick={onFlip} aria-pressed={on}>
        <span className={`dv-switch${on ? " on" : ""}`} aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Discover</h1>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4, marginBottom: 12 }}>
        Curated leverage, borrow and yield presets across Stellar protocols.
      </p>

      <div className="dv-tabs" role="tablist" aria-label="Discover categories">
        {DV_CATS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={cat === c.id}
            className={`dv-tab${cat === c.id ? " active" : ""}`}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {cat === "browse" ? (
        <div className="dv-browse">
          <div className="dv-browse-col">
            <div className="dv-sect-head" onClick={() => setCat("leverage")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setCat("leverage"); }}>
              <h2>Leveraged borrowing <span aria-hidden="true">→</span></h2>
              <p>Trade with low to medium leverage on Stellar lending protocols like Blend, XOXNO &amp; Peridot.</p>
            </div>
            <div className="dz-card">
              <div className="dz-visual" style={{ background: "linear-gradient(180deg, #3b82f626, transparent)" }}>
                <Spark points="0,34 20,30 40,32 60,22 80,26 100,16 120,20 140,10 160,14" tint="#3b82f6" />
                <span className="dz-big-icon" style={{ background: "#3b82f630", boxShadow: "0 0 40px #3b82f655" }}>
                  <TokenIcon symbol="XLM" size={40} />
                </span>
              </div>
              <div className="dz-body">
                <p className="dz-title">Go long on <TokenIcon symbol="XLM" size={18} /> XLM up to <b style={{ color: "#8ea2ff" }}>3.2x</b></p>
                <div className="dz-btnrow">
                  <button type="button" onClick={() => goto("blend")}>⚡ Long</button>
                  <button type="button" onClick={() => goto("blend")}>⚡ Short</button>
                  <button type="button" className="dz-link" onClick={() => goto("blend")}>Browse all XLM markets</button>
                </div>
              </div>
            </div>
            <div className="dz-card" style={{ padding: 18 }}>
              <p className="dz-title">Go long on crypto bluechips</p>
              <p className="dz-desc" style={{ maxWidth: "none" }}>Borrow stablecoins against the majors to lever up a long, across the biggest Stellar lending markets.</p>
              <div className="dv-assetlist">
                {["XLM", "USDC", "EURC"].map((code) => (
                  <button key={code} type="button" onClick={() => { setCat("leverage"); setCollateral(code); }}>
                    <TokenIcon symbol={code} size={22} />
                    <span>{code}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="dv-browse-col">
            <div className="dv-sect-head" onClick={() => setCat("passive")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setCat("passive"); }}>
              <h2>Passive yield <span aria-hidden="true">→</span></h2>
              <p>Earn steady rates on stables and vaults without managing loans.</p>
            </div>
            {[
              { tag: "Blend", title: "Earn with", asset: "USDC", apy: "7.42%", view: "blend" as AppView },
              { tag: "DeFindex", title: "Earn steady vault", asset: "USDC", apy: "5.10%", view: "savings" as AppView },
              { tag: "Blend", title: "Earn with", asset: "EURC", apy: "5.84%", view: "blend" as AppView },
            ].map((c) => (
              <div className="dz-card dz-earn" key={c.tag + c.asset}>
                <div>
                  <small className="dz-tag">{c.tag}</small>
                  <p className="dz-title">{c.title} <TokenIcon symbol={c.asset} size={18} /> {c.asset}</p>
                  <button type="button" className="dz-open" onClick={() => goto(c.view)}>Open position</button>
                </div>
                <div className="dz-apy">
                  <TokenIcon symbol={c.asset} size={40} />
                  <b>{c.apy}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="dv-filters">
            <label aria-label="Collateral tokens">
              <select value={collateral} onChange={(e) => setCollateral(e.target.value)} aria-label="Collateral tokens">
                <option value="all">All collateral tokens</option>
                {codes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label aria-label="Debt tokens">
              <select value={debt} onChange={(e) => setDebt(e.target.value)} aria-label="Debt tokens">
                <option value="all">All debt tokens</option>
                {codes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label aria-label="Protocols">
              <select value={protocol} onChange={(e) => setProtocol(e.target.value)} aria-label="Protocols">
                <option value="all">All protocols</option>
                {protocols.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="dv-toggles">
            <Toggle on={estimate} onFlip={() => setEstimate(!estimate)} label="Estimate Net APY" />
            <Toggle on={ownedOnly} onFlip={() => setOwnedOnly(!ownedOnly)} label="Only owned assets" />
            <Toggle on={hideUnavailable} onFlip={() => setHideUnavailable(!hideUnavailable)} label="Hide unavailable markets" />
            <span className="dv-count">Showing {filtered.length} option{filtered.length === 1 ? "" : "s"}</span>
            <span className={`pill ${poolsState === "live" ? "green" : poolsState === "error" ? "red" : ""}`} title={poolsUpdatedAt ? `Markets updated ${new Date(poolsUpdatedAt).toLocaleTimeString()}` : "Loading live markets"}>
              {poolsState === "live" ? "Live · Stellar mainnet" : poolsState === "error" ? "Feed error" : "Loading…"}
            </span>
            <button type="button" className="dv-hidetable" onClick={() => setHideTable(!hideTable)}>
              {hideTable ? "Show table" : "Hide table"} ✕
            </button>
          </div>
          {!hideTable && (
            <>
              <div className="dv-amounts">
                <div className="dv-mode">
                  <button type="button" className={mode === "borrow" ? "active" : ""} onClick={() => setMode("borrow")}>Borrow</button>
                  <button type="button" className={mode === "leverage" ? "active" : ""} onClick={() => setMode("leverage")}>Leverage</button>
                  <span>Enter amounts to see applicable protocols and net APY estimates.</span>
                  {showHint && (
                    <button type="button" aria-label="Dismiss" className="dv-x" onClick={() => setShowHint(false)}>✕</button>
                  )}
                </div>
                <div className="dv-inputs">
                  <label>ⓘ Collateral:
                    <input value={collateralAmt} onChange={(e) => setCollateralAmt(e.target.value)} inputMode="decimal" />
                  </label>
                  <label>ⓘ Debt:
                    <input value={debtAmt} onChange={(e) => setDebtAmt(e.target.value)} inputMode="decimal" />
                  </label>
                </div>
              </div>
              <div className="dv-tablewrap">
                <div className="dv-thead">
                  <span>Collateral</span><span>Debt</span><span>Supply APY</span><span>Borrow APY</span><span>Net APY</span>
                  <span>
                    Max Leverage{" "}
                    <Tip
                      tip={
                        <>
                          <b>Loan-to-Value (LTV)</b> is how much you can borrow against your
                          collateral. 75% LTV on $100 of collateral = $75 max loan. Higher
                          LTV allows higher leverage — and liquidates faster when prices fall.
                        </>
                      }
                    >
                      <span className="dv-info" aria-label="What is LTV">ⓘ</span>
                    </Tip>
                  </span>
                  <span>Protocol</span>
                </div>
                {filtered.map((m, i) => (
                  <button
                    key={`${m.protocol}-${m.collateral}-${m.debt ?? "earn"}-${i}`}
                    type="button"
                    className="dv-trow"
                    onClick={() => goto(m.protocol)}
                    title={`Open in ${m.protocolLabel}`}
                  >
                    <span className="dv-asset"><TokenIcon symbol={m.collateral} size={22} /> {m.collateral}</span>
                    <span className="dv-asset">{m.debt ? (<><TokenIcon symbol={m.debt} size={22} /> {m.debt}</>) : "—"}</span>
                    <span>{m.supplyApy.toFixed(2)}%</span>
                    <span>{m.borrowApy == null ? "—" : `${m.borrowApy.toFixed(2)}%`}</span>
                    <Tip tip={<>Decimal form: <b>{(netFor(m) / 100).toFixed(4)}</b></>}>
                      <span className="dv-net">{netFor(m).toFixed(2)}%</span>
                    </Tip>
                    {m.maxLev === "—" || m.ltv == null ? (
                      <span>{m.maxLev}</span>
                    ) : (
                      <Tip
                        tip={
                          <>
                            <b>{Math.round(parseFloat(m.maxLev) * 100)}% exposure</b>
                            <br />
                            LTV {(m.ltv * 100).toFixed(0)}% — borrow up to {(m.ltv * 100).toFixed(0)}% of
                            your collateral&apos;s value.
                          </>
                        }
                      >
                        <span>{m.maxLev}</span>
                      </Tip>
                    )}
                    <span className="dv-proto">{m.protocolLabel}</span>
                  </button>
                ))}
                {filtered.length === 0 && poolsState === "live" && (
                  <p className="pf-empty">
                    {protocol === "Peridot"
                      ? "Peridot Stellar pools: live integration pending — only Stellar-network pools will be listed here, never cross-chain positions."
                      : "No markets match these filters."}
                  </p>
                )}
                {filtered.length === 0 && poolsState !== "live" && (
                  <p className="pf-empty">
                    {poolsState === "error"
                      ? "Market feed unreachable — check your connection and retry."
                      : "Loading live markets…"}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

export function Views({ view }: { view: AppView }) {
  if (view === "portfolio") return <Portfolio />;
  if (view === "discover") return <DiscoverPage />;
  if (view === "protocols") return <ProtocolsView />;
  if (view === "blend")
    return <Placeholder title="Blend" body="Supply, borrow, boost, repay and automate Blend V2 pools with flash-submit + Soroswap swaps." ruleBody="Keeper evaluation for HealthBelow 15000 at 13500: fires when armed." />;
  if (view === "xoxno")
    return <Placeholder title="XOXNO" body="Hub-and-spoke markets with health-factor limits, flash loans and dual-oracle guards." />;
  if (view === "peridot")
    return <Placeholder title="Peridot" body="Cross-chain hub money market with vault-share collateral and expert routing." />;
  if (view === "savings")
    return <Placeholder title="Smart Savings" body="Hop USDC and EURC across DeFindex and Templar curated vaults in one transaction." />;
  if (view === "shifter")
    return <Placeholder title="Loan Shifter" body="Move collateral, debt or full positions between pools without unwinding manually." />;
  if (view === "recipes")
    return <Placeholder title="Recipe Creator" body="Compose flash + supply + borrow + swap steps visually; execute atomically via recipe_executor." />;
  if (view === "automate")
    return <Placeholder title="Automation" body="Auto-repay, stop-loss, take-profit and trailing stops. Keepers propose, guardian verifies." ruleBody="Toggle arming to see the keeper decision change between fire and inactive." />;
  return <Placeholder title="Settings" body="Wallets, smart account, optional multisig policy (2-of-3 / weighted), keeper keys, gas credits." />;
}
