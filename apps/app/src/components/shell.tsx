"use client";

import { useState } from "react";
import { requestAccess, getAddress } from "@stellar/freighter-api";
import { shortAddress } from "@/lib/chain";

export type AppView =
  | "portfolio"
  | "discover"
  | "blend"
  | "xoxno"
  | "peridot"
  | "savings"
  | "shifter"
  | "recipes"
  | "automate"
  | "settings";

const NAV: { id: AppView; label: string; icon: React.ReactNode }[] = [
  {
    id: "portfolio",
    label: "Portfolio",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    ),
  },
  {
    id: "discover",
    label: "Discover",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    ),
  },
  {
    id: "blend",
    label: "Blend",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
    ),
  },
  {
    id: "xoxno",
    label: "XOXNO",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
    ),
  },
  {
    id: "peridot",
    label: "Peridot",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
    ),
  },
  {
    id: "savings",
    label: "Savings",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>
    ),
  },
  {
    id: "shifter",
    label: "Shifter",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
    ),
  },
  {
    id: "recipes",
    label: "Recipes",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
    ),
  },
  {
    id: "automate",
    label: "Automate",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>
    ),
  },
];

export function Shell({
  view,
  setView,
  children,
}: {
  view: AppView;
  setView: (v: AppView) => void;
  children: React.ReactNode;
}) {
  const [credits] = useState(4);
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  async function connectWallet() {
    setWalletError(null);
    try {
      await requestAccess();
      const { address } = await getAddress();
      setWallet(address);
    } catch {
      setWalletError("Freighter not found — install it to connect");
    }
  }
  const titles: Record<AppView, string> = {
    portfolio: "Portfolio",
    discover: "Discover",
    blend: "Blend",
    xoxno: "XOXNO",
    peridot: "Peridot",
    savings: "Smart Savings",
    shifter: "Loan Shifter",
    recipes: "Recipe Creator",
    automate: "Automation",
    settings: "Settings",
  };
  return (
    <>
      <header className="shell-topbar">
        <div className="shell-topbar-left">
          <div className="shell-avatar">S</div>
          <button className="shell-ws-btn" type="button">
            <span className="shell-ws-name">Seidar Workspace</span>
            <span className="badge-credits">{credits} credits</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <span className="shell-crumb-sep">/</span>
          <span className="shell-crumb">{titles[view]}</span>
        </div>
        <div className="shell-topbar-right">
          <div className="seg-group">
            <button className="seg-main" type="button" onClick={connectWallet} title={walletError ?? "Connect Freighter (testnet)"}>
              {wallet ? `${shortAddress(wallet)} · Testnet` : "Connect wallet"}
            </button>
            <button className="seg-chev" type="button" aria-label="Wallets" onClick={connectWallet}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          </div>
          <div className="seg-group create">
            <button className="seg-main" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New position
            </button>
            <button className="seg-chev" type="button" aria-label="More actions">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          </div>
        </div>
      </header>
      <div className="shell-layout">
        <aside className="shell-sidebar">
          <nav className="side-nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${view === item.id ? " active" : ""}`}
                onClick={() => setView(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.id === "automate" && (
                  <span className="badge-beta">BETA</span>
                )}
              </button>
            ))}
            <div className="section-title">
              <span className="rule" />
              <span className="nav-label">MORE</span>
            </div>
            <button type="button" className="nav-item" onClick={() => setView("settings")}>
              <span className="nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              </span>
              <span className="nav-label">Settings</span>
            </button>
          </nav>
          <div className="side-bottom">
            <button type="button" className="nav-item">
              <span className="nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              </span>
              <span className="nav-label">What&apos;s New</span>
              <span className="dot" />
            </button>
          </div>
        </aside>
        <main className="shell-main">{children}</main>
      </div>
    </>
  );
}
