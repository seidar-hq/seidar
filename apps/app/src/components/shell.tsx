"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { requestAccess, getAddress } from "@stellar/freighter-api";
import { shortAddress } from "@/lib/chain";

/** localStorage helpers (client-only; guarded for SSR). */
function readStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (typeof window === "undefined") return;
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* private mode etc — session-only fallback */
  }
}
function makeIdenticon(seed: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const c of seed) {
    h1 = Math.imul(h1 ^ c.charCodeAt(0), 16777619);
    h2 = Math.imul(h2 + c.charCodeAt(0), 31);
  }
  const rand = () => {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 2246822519);
    h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489917);
    return (h1 ^ h2) >>> 0;
  };
  const hue = rand() % 360;
  const cells: boolean[] = [];
  for (let y = 0; y < 5; y++) {
    const a = rand() % 2 === 0;
    const b = rand() % 2 === 0;
    const c = rand() % 2 === 0;
    cells.push(a, b, c, b, a);
  }
  return { hue, cells };
}

function Identicon({ address, size = 26, square = false }: { address: string; size?: number; square?: boolean }) {
  const { hue, cells } = useMemo(() => makeIdenticon(address), [address]);
  const cell = size / 5;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`identicon${square ? " square" : ""}`}
      aria-hidden="true"
    >
      <rect width={size} height={size} fill={`hsl(${hue} 55% 13%)`} />
      {cells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={(i % 5) * cell}
            y={Math.floor(i / 5) * cell}
            width={cell}
            height={cell}
            fill={`hsl(${hue} 85% 60%)`}
          />
        ) : null
      )}
    </svg>
  );
}

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
  // SSR-safe initial state (matches server HTML); session restores after mount.
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => searchInputRef.current?.focus(), 30);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prev;
      };
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  type QuickAction = { label: string; hint: string; view: AppView };
  const QUICK_ACTIONS: QuickAction[] = [
    { label: "Boost / Repay on Blend", hint: "Leverage", view: "blend" },
    { label: "Open a leveraged position", hint: "Blend", view: "blend" },
    { label: "Arm liquidation protection", hint: "Automation", view: "automate" },
    { label: "Set a stop-loss", hint: "Automation", view: "automate" },
    { label: "Shift a position", hint: "Shifter", view: "shifter" },
    { label: "Build a recipe", hint: "Recipes", view: "recipes" },
    { label: "View savings vaults", hint: "Savings", view: "savings" },
    { label: "Browse XOXNO markets", hint: "XOXNO", view: "xoxno" },
    { label: "Browse Peridot markets", hint: "Peridot", view: "peridot" },
    { label: "Portfolio overview", hint: "Portfolio", view: "portfolio" },
    { label: "Settings & multisig", hint: "Settings", view: "settings" },
  ];

  const sq = query.trim().toLowerCase();
  const matchedSections = NAV.filter((item) => item.label.toLowerCase().includes(sq));
  const matchedActions = QUICK_ACTIONS.filter(
    (a) => a.label.toLowerCase().includes(sq) || a.hint.toLowerCase().includes(sq)
  );

  function go(view: AppView) {
    setView(view);
    setSearchOpen(false);
  }
  const [balance, setBalance] = useState<{ xlm: number; usd: number | null }>({
    xlm: 0,
    usd: 0,
  });

  useEffect(() => {
    if (!wallet) {
      setBalance({ xlm: 0, usd: 0 });
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/balance?address=${wallet}`);
        const d = await r.json();
        if (!cancelled) {
          setBalance({
            xlm: Number(d.xlm ?? 0),
            usd: d.usd === null || d.usd === undefined ? null : Number(d.usd),
          });
        }
      } catch {
        if (!cancelled) setBalance({ xlm: 0, usd: null });
      }
    }
    load();
    const id = setInterval(load, 30000);
    window.addEventListener("seidar:refresh", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("seidar:refresh", load);
    };
  }, [wallet]);

  async function connectWallet() {
    setWalletError(null);
    try {
      const access = await requestAccess();
      let address = access?.address ?? "";
      if (!address) {
        const g = await getAddress();
        address = g?.address ?? "";
      }
      if (!address) {
        showError(
          typeof access?.error === "string" && access.error
            ? `Freighter: ${access.error}`
            : "Connect approved but no address returned — unlock Freighter and retry"
        );
        return;
      }
      setWallet(address);
      await ensureWelcome(address);
    } catch {
      showError("Freighter not found — install it to connect");
    }
  }

  /** Welcome exactly once per wallet (DB-first, localStorage fallback). */
  async function ensureWelcome(address: string, force = false) {
    if (!force && welcomedRef.current) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, welcome: true }),
        signal: ctrl.signal,
      });
      const d = await r.json();
      if (d?.ok && d.created && d.note) {
        setNotes((prev) => [{ ...d.note, at: String(d.note.at) }, ...prev].slice(0, 20));
      }
      welcomedRef.current = true;
      writeStorage("seidar.welcomed", true);
    } catch {
      if (!welcomedRef.current) {
        welcomedRef.current = true;
        writeStorage("seidar.welcomed", true);
        pushNotification(
          `Welcome to Seidar, ${shortAddress(address)} — your positions, keepers and gas credits live here. Start with a testnet Boost to see automation in action.`
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Reconcile on every wallet load: if no welcome exists anywhere (server
   * list + local), create it. A single interrupted first attempt can never
   * strand a wallet without its welcome again.
   */
  async function reconcileWelcome(address: string, serverNotes: Note[]) {
    const hasWelcome =
      serverNotes.some((n) => n.text.startsWith("Welcome to Seidar")) ||
      readStorage<Note[]>("seidar.notes", []).some((n) => n.text.startsWith("Welcome to Seidar"));
    if (!hasWelcome) {
      welcomedRef.current = false;
      writeStorage("seidar.welcomed", false);
      await ensureWelcome(address, true);
    }
  }

  /** Merge server notes with local-only ones (dedupe by id + text). */
  function mergeNotes(prev: Note[], server: Note[]): Note[] {
    const seenIds = new Set(server.map((n) => n.id));
    const seenText = new Set(server.map((n) => n.text));
    const localOnly = prev.filter(
      (n) => (n.id < 0 && !seenText.has(n.text)) || (n.id >= 0 && !seenIds.has(n.id))
    );
    return [...server, ...localOnly].slice(0, 20);
  }

  async function fetchNotes(walletAddr: string, why: string) {
    try {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.debug(`[seidar] notes fetch (${why}) for`, shortAddress(walletAddr));
      }
      const r = await fetch(`/api/notifications?wallet=${walletAddr}`);
      const d = await r.json();
      if (d?.ok && Array.isArray(d.notes)) {
        const server = d.notes.map((n: Note) => ({ ...n, at: String(n.at) }));
        setNotes((prev) => mergeNotes(prev, server));
        await reconcileWelcome(walletAddr, server);
      }
    } catch {
      /* offline DB — keep localStorage mirror */
    }
  }

  type Note = { id: number; text: string; at: string; read: boolean };
  const [notes, setNotes] = useState<Note[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  /** Reload server notes whenever a wallet is present. */
  useEffect(() => {
    if (!wallet) return;
    fetchNotes(wallet, "wallet-change");
  }, [wallet]);

  function toggleNotif() {
    setNotifOpen((o) => {
      if (!o && wallet) fetchNotes(wallet, "bell-open");
      return !o;
    });
  }
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const welcomedRef = useRef(false);
  const noteId = useRef(0);

  // Restore session AFTER mount so server HTML and first client render match.
  useEffect(() => {
    welcomedRef.current = readStorage("seidar.welcomed", false);
    const stored = readStorage<Note[]>("seidar.notes", []);
    if (stored.length > 0) setNotes(stored);
    noteId.current = stored.reduce((m, n) => Math.max(m, n.id || 0), 0);
    const storedWallet = readStorage<string | null>("seidar.wallet", null);
    if (storedWallet) setWallet(storedWallet);
    let cancelled = false;
    getAddress()
      .then(({ address }) => {
        if (!cancelled && address) setWallet(address);
      })
      .catch(() => {
        /* locked/missing Freighter — keep stored address for display */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStorage("seidar.wallet", wallet);
    window.dispatchEvent(new CustomEvent("seidar:wallet", { detail: wallet }));
  }, [wallet]);

  useEffect(() => {
    writeStorage("seidar.notes", notes.slice(0, 20));
  }, [notes]);

  function showError(msg: string) {
    setWalletError(msg);
    setTimeout(() => setWalletError(null), 6000);
  }
  const rightRef = useRef<HTMLDivElement>(null);

  // Click-outside dismisses open dropdowns.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rightRef.current && !rightRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setWalletMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Portfolio card actions (event bus keeps Shell state local).
  useEffect(() => {
    function onOpenWallets() {
      setWalletMenuOpen(true);
    }
    function onRefreshAll() {
      if (wallet) fetchNotes(wallet, "manual-refresh");
    }
    function onGotoView(e: Event) {
      const view = (e as CustomEvent<AppView>).detail;
      if (view) {
        setView(view);
        setWalletMenuOpen(false);
      }
    }
    window.addEventListener("seidar:open-wallets", onOpenWallets);
    window.addEventListener("seidar:refresh-notes", onRefreshAll);
    window.addEventListener("seidar:goto-view", onGotoView);
    return () => {
      window.removeEventListener("seidar:open-wallets", onOpenWallets);
      window.removeEventListener("seidar:refresh-notes", onRefreshAll);
      window.removeEventListener("seidar:goto-view", onGotoView);
    };
  }, [wallet]);

  function disconnectWallet() {
    setWallet(null);
    setWalletMenuOpen(false);
  }

  /** Switch accounts: drop the session, then let Freighter pick again. */
  async function connectDifferent() {
    setWalletMenuOpen(false);
    setWallet(null);
    await connectWallet();
  }

  async function copyAddress() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
    setWalletMenuOpen(false);
  }

  function pushNotification(text: string) {
    noteId.current += 1;
    // Negative ids = local-only (never collide with DB serials).
    const id = -Math.abs(noteId.current);
    const note: Note = {
      id,
      text,
      at: new Date().toLocaleString(),
      read: false,
    };
    setNotes((prev) => [note, ...prev].slice(0, 20));
  }

  const unread = notes.filter((n) => !n.read).length;

  async function markAllRead() {
    setNotes((prev) => prev.map((n) => ({ ...n, read: true })));
    if (!wallet) return;
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, all: true }),
      });
    } catch {
      /* local-only when DB unreachable */
    }
  }

  return (
    <>
      <header className="shell-topbar">
        <div className="shell-topbar-left">
          <img src="/logo.png" alt="Seidar" className="shell-logo" />
          <span className="shell-name">Seidar</span>
          <button className="shell-search" type="button" onClick={() => setSearchOpen(true)} aria-label="Search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <span>Search positions, pools, actions…</span>
          </button>
        </div>
        <div className="shell-topbar-right" ref={rightRef}>
          <div className="notif-wrap">
            <button
              className="notif-btn"
              type="button"
              aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
              onClick={toggleNotif}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {unread > 0 && <span className="notif-badge">{unread}</span>}
            </button>
            {notifOpen && (
              <div className="notif-drop" role="dialog" aria-label="Notifications">
                <div className="notif-head">
                  <b>Notifications</b>
                  <button type="button" onClick={markAllRead} disabled={unread === 0}>
                    Mark as read
                  </button>
                </div>
                {notes.length === 0 && <p className="notif-empty">Nothing yet — connect a wallet to get started.</p>}
                {notes.map((n) => (
                  <div key={n.id} className={`notif-row${n.read ? "" : " unread"}`}>
                    <p>{n.text}</p>
                    <small>{n.at}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="shell-balance" title={wallet ? "Connected wallet balance (testnet)" : "Connect a wallet to see its balance"}>
            <b>{balance.xlm.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</b>
            <small>{balance.usd === null ? "—" : `$${balance.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</small>
          </span>
          {walletError && <span className="wallet-error" role="alert">{walletError}</span>}
          <div className={`seg-group wallet${wallet ? " connected" : ""}`}>
            {wallet ? (
              <>
                <button className="seg-main wallet-main" type="button" onClick={() => setWalletMenuOpen((o) => !o)} title={wallet}>
                  <span className="identicon-wrap">
                    <Identicon address={wallet} size={32} square />
                    <span className="provider-badge" title="Connected wallet">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><circle cx="17" cy="12.5" r="1.2" fill="currentColor" stroke="none" /></svg>
                    </span>
                  </span>
                  <span className="wallet-text">
                    <b>{shortAddress(wallet)}</b>
                    <em>No Smart Account</em>
                  </span>
                  <span className="wallet-logo" title="Freighter">
                    <img src="/freighter-logo.svg" alt="" />
                  </span>
                </button>
                <button className="seg-chev wallet-chev" type="button" aria-label="Wallet menu" onClick={() => setWalletMenuOpen((o) => !o)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </>
            ) : (
              <button className="seg-main" type="button" onClick={connectWallet} title={walletError ?? "Connect Freighter (testnet)"}>
                Connect wallet
              </button>
            )}
          </div>
          <img src="/stellar-logo.png" alt="Stellar" className="stellar-logo" title="Built on Stellar" />
          {walletMenuOpen && wallet && (
            <div className="wallet-drop dfs" role="menu" aria-label="Wallet menu">
              <div className="wdrop-head">
                <span className="identicon-wrap lg">
                  <Identicon address={wallet} size={36} square />
                  <span className="provider-badge" title="Connected wallet">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><circle cx="17" cy="12.5" r="1.2" fill="currentColor" stroke="none" /></svg>
                  </span>
                </span>
                <div className="wdrop-identity">
                  <button type="button" className="wdrop-addr" onClick={copyAddress} title="Copy full address">
                    {copied ? "Copied ✓" : shortAddress(wallet)}
                  </button>
                </div>
                <button type="button" className="wdrop-collapse" aria-label="Close menu" onClick={() => setWalletMenuOpen(false)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
              </div>
              <button
                type="button"
                className="wdrop-create"
                onClick={() => {
                  setWalletMenuOpen(false);
                  setView("settings");
                }}
              >
                <span className="wdrop-create-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>
                </span>
                Create Smart Account
              </button>
              <div className="wdrop-rows">
                <button type="button" onClick={() => go("portfolio")}>
                  <span className="wdrop-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg></span>
                  Track
                </button>
                <button type="button" onClick={copyAddress}>
                  <span className="wdrop-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="13" y2="11" /></svg></span>
                  {copied ? "Copied ✓" : "Address book"}
                </button>
                <button type="button" onClick={() => go("settings")}>
                  <span className="wdrop-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></span>
                  Manage
                </button>
              </div>
              <div className="wdrop-rows">
                <button type="button" onClick={connectDifferent}>
                  <span className="wdrop-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="M15 10l5 2-5 2v-4z" /></svg></span>
                  Connect different wallet
                </button>
                <button type="button" className="danger" onClick={disconnectWallet}>
                  <span className="wdrop-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></span>
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
      {searchOpen && (
        <div
          className="search-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div className="search-modal" role="dialog" aria-label="Search">
            <div className="search-input-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (matchedSections[0]) go(matchedSections[0].id);
                    else if (matchedActions[0]) go(matchedActions[0].view);
                  }
                }}
                placeholder="Search sections and actions…"
                aria-label="Search sections and actions"
              />
              <button type="button" className="search-esc" onClick={() => setSearchOpen(false)} aria-label="Close search">
                esc
              </button>
            </div>
            <div className="search-results">
            {matchedSections.length > 0 && (
              <>
                <p className="search-group">Sections</p>
                {matchedSections.map((item) => (
                  <button key={item.id} type="button" className="search-row" onClick={() => go(item.id)}>
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </>
            )}
            {matchedActions.length > 0 && (
              <>
                <p className="search-group">Actions</p>
                {matchedActions.map((a) => (
                  <button key={a.label} type="button" className="search-row" onClick={() => go(a.view)}>
                    <span>{a.label}</span>
                    <small>{a.hint}</small>
                  </button>
                ))}
              </>
            )}
            {matchedSections.length === 0 && matchedActions.length === 0 && (
              <p className="notif-empty" style={{ padding: "12px 10px" }}>No matches for “{query}”.</p>
            )}
            </div>
          </div>
        </div>
      )}
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
        <main className="shell-main"><div className="shell-content">{children}</div></main>
      </div>
    </>
  );
}
