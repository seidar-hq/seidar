"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { shortAddress } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import { explorerBase, isTestnetMode, networkPassphrase, setNetwork } from "@/lib/network";
import { nextAccountName, setAccountNames, useAccountNames } from "@/lib/account-names";
import { AccountTag } from "./account-tag";
import {
  kitGetAddress,
  kitOpenAuthModal,
  rememberWalletKind,
  WALLETS,
  walletKindFor,
} from "@/lib/wallets";
import { signAndSend } from "@/lib/tx";
import { AccountDrawer } from "./account-drawer";

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
/** DiceBear "gaze" avatar — one stable face per address. */
export function DiceAvatar({ address, size = 26, square = false }: { address: string; size?: number; square?: boolean }) {
  return (
    <img
      className={`dice-avatar${square ? " square" : ""}`}
      src={`https://api.dicebear.com/10.x/gaze/svg?tags=animation&seed=${encodeURIComponent(address)}`}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}

/** Active transaction account picked in a protocol header (shell owns the
 *  broadcast). Falls back to the owner wallet; null while disconnected. */
export function useTxActive(owner: string | null): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    function onActive(e: Event) {
      const a = (e as CustomEvent<string | null>).detail;
      setActive(
        typeof a === "string" && /^[GC][A-Z2-7]{55}$/.test(a) ? a : null,
      );
    }
    window.addEventListener("seidar:active-account", onActive);
    try {
      const raw = window.localStorage.getItem("seidar.activeAccount");
      const s = raw ? JSON.parse(raw) : null;
      if (
        s &&
        s.owner === owner &&
        typeof s.address === "string" &&
        /^[GC][A-Z2-7]{55}$/.test(s.address)
      )
        setActive(s.address);
    } catch {
      /* broadcast covers */
    }
    return () => window.removeEventListener("seidar:active-account", onActive);
  }, [owner]);
  return active;
}

/** Dashboard view scope picked in the wallet menus: null = "All wallets"
 *  (the owner plus every smart account, combined) or a smart-account
 *  address to focus the dashboard on. Same mirror/broadcast pattern as the
 *  active-account hook above. */
export function useViewScope(owner: string | null): string | null {
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    function onScope(e: Event) {
      const a = (e as CustomEvent<string | null>).detail;
      setScope(typeof a === "string" && /^C[A-Z2-7]{55}$/.test(a) ? a : null);
    }
    window.addEventListener("seidar:view-scope", onScope);
    try {
      const raw = window.localStorage.getItem("seidar.viewScope");
      const s = raw ? JSON.parse(raw) : null;
      if (
        s &&
        s.owner === owner &&
        typeof s.address === "string" &&
        /^C[A-Z2-7]{55}$/.test(s.address)
      )
        setScope(s.address);
    } catch {
      /* broadcast covers */
    }
    return () => window.removeEventListener("seidar:view-scope", onScope);
  }, [owner]);
  return scope;
}

/** Smart-account addresses owned by a wallet. Refreshes every 30s so a
 *  single failed fetch (dev reload, cold DB) never sticks. */
export function useOwnerSmarts(owner: string | null): string[] {
  const [smarts, setSmarts] = useState<string[]>([]);
  useEffect(() => {
    if (!owner) {
      setSmarts([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const d = await apiFetch(`/api/smart-account?owner=${owner}`, {
          cache: "no-store",
        }).then((r) => r.json());
        if (!cancelled && d?.ok && Array.isArray(d.smarts))
          setSmarts(
            (d.smarts as { address?: unknown }[])
              .map((s) => String(s.address ?? ""))
              .filter((a) => /^C[A-Z2-7]{55}$/.test(a)),
          );
      } catch {
        /* retry on the interval */
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [owner]);
  return smarts;
}

/** Shell-broadcast smart-account state for a wallet: the address list plus
 *  whether it resolved (server or mirror). Boards smart-gate their quote
 *  buttons on this; unknown (never loaded, owner mismatch) fails open so
 *  quoting never blocks on account plumbing. */
export function useShellSmarts(owner: string | null): {
  smarts: string[];
  loaded: boolean;
} {
  function readMirror(o: string | null): { smarts: string[]; loaded: boolean } {
    try {
      if (!o) return { smarts: [], loaded: false };
      const raw = window.localStorage.getItem("seidar.smartAccount");
      const s = raw ? JSON.parse(raw) : null;
      if (s && s.owner === o && Array.isArray(s.list)) {
        const list = (s.list as unknown[])
          .map((a) => String((a as { address?: unknown })?.address ?? a ?? ""))
          .filter((a) => /^C[A-Z2-7]{55}$/.test(a));
        return { smarts: list, loaded: true };
      }
    } catch {
      /* fall through to unknown */
    }
    return { smarts: [], loaded: false };
  }
  const [state, setState] = useState(() => readMirror(owner));
  useEffect(() => {
    // Resync from the mirror when the owner changes, then live off broadcasts.
    setState(readMirror(owner));
    function onSmarts(e: Event) {
      const d = (
        e as CustomEvent<{ owner: string | null; list: unknown; loaded: unknown }>
      ).detail;
      if (!d || d.owner !== owner || !Array.isArray(d.list)) return;
      const list = (d.list as unknown[])
        .map((a) => String(a ?? ""))
        .filter((a) => /^C[A-Z2-7]{55}$/.test(a));
      setState({ smarts: list, loaded: d.loaded === true });
    }
    window.addEventListener("seidar:smart-accounts", onSmarts);
    return () => window.removeEventListener("seidar:smart-accounts", onSmarts);
  }, [owner]);
  return state;
}

export type AppView =
  | "portfolio"
  | "markets"
  | "blend"
  | "xoxno"
  | "defindex"
  | "upshift"
  | "soroswap"
  | "phoenix"
  | "aqua"
  | "sushi"
  | "exchange"
  | "earn"
  | "refinance"
  | "lend-borrow"
  | "pools"
  | "vaults"
  | "recipes"
  | "automate";

type NavChild = { id: AppView; label: string; icon?: React.ReactNode };
type NavItem = { id: AppView; label: string; icon: React.ReactNode; children?: NavChild[]; menu?: boolean };

/** View <-> URL mapping. Portfolio lives at `/`; markets nest under `/markets`. */
export function viewToPath(v: AppView): string {
  if (v === "portfolio") return "/";
  if (
    v === "blend" ||
    v === "xoxno" ||
    v === "defindex" ||
    v === "upshift" ||
    v === "soroswap" ||
    v === "phoenix" ||
    v === "aqua" ||
    v === "sushi"
  )
    return `/markets/${v}`;
  if (v === "lend-borrow" || v === "pools") return `/markets/${v}`;
  if (v === "vaults") return "/vaults";
  if (v === "recipes") return "/strategies";
  if (v === "exchange") return "/exchange/swap";
  return `/${v}`;
}

/** Sidebar highlight: venue pages live under their Markets section. */
function navSection(v: AppView): AppView {
  if (v === "blend" || v === "xoxno") return "lend-borrow";
  if (v === "aqua" || v === "phoenix" || v === "soroswap" || v === "sushi") return "pools";
  if (v === "defindex" || v === "upshift") return "vaults";
  return v;
}

export function pathToView(pathname: string | null): AppView {
  const seg = (pathname ?? "/").split("/").filter(Boolean);
  if (seg.length === 0) return "portfolio";
  if (seg[0] === "markets") {
    if (
      seg[1] === "blend" ||
      seg[1] === "xoxno" ||
      seg[1] === "defindex" ||
      seg[1] === "upshift" ||
      seg[1] === "soroswap" ||
      seg[1] === "phoenix" ||
      seg[1] === "aqua" ||
      seg[1] === "sushi" ||
      seg[1] === "lend-borrow" ||
      seg[1] === "pools"
    )
      return seg[1];
    return "markets";
  }
  if (seg[0] === "vaults") return "vaults";
  if (seg[0] === "strategies") return "recipes";
  const known: AppView[] = ["exchange", "earn", "refinance", "automate", "markets", "portfolio"];
  return known.includes(seg[0] as AppView) ? (seg[0] as AppView) : "portfolio";
}

/** Protocol mark for nav menus (letter fallback when the file is missing). */
function NavProtoIcon({ id }: { id: string }) {
  const src =
    id === "blend"
      ? "/protocol-blend.png"
      : id === "xoxno"
        ? "/protocol-xoxno.png"
            : id === "defindex"
              ? "/defindex-mark.svg"
            : id === "upshift"
              ? "/upshift-logo.png"
          : id === "soroswap"
            ? "/dex-soroswap.png"
            : id === "phoenix"
              ? "/dex-phoenix.png"
              : id === "aqua"
                ? "/aqua-logo.png"
                : id === "sushi"
                  ? "/sushi-logo.png"
                  : null;
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="nav-child-fb" aria-hidden="true">
        {id.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img loading="lazy"
      src={src}
      alt=""
      width={20}
      height={20}
      onError={() => setFailed(true)}
    />
  );
}

const NAV: NavItem[] = [
  {
    id: "portfolio",
    label: "Portfolio",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    ),
  },
  {
    id: "markets",
    label: "Markets",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    ),
    /* Dropdown menu, not a page: the row toggles the protocol list. */
    menu: true,
    children: [
      {
        id: "lend-borrow",
        label: "Lend & Borrow",
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 15.5l7-7" /><circle cx="9.2" cy="9.2" r="1.1" /><circle cx="14.8" cy="14.8" r="1.1" /></svg>
        ),
      },
      {
        id: "pools",
        label: "Pools",
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2c3.4 3.9 5.8 6.7 5.8 9.7a5.8 5.8 0 0 1-11.6 0c0-3 2.4-5.8 5.8-9.7z" /></svg>
        ),
      },
      {
        id: "vaults",
        label: "Vaults",
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3.4" /><path d="M15.4 12h3.1" /></svg>
        ),
      },
    ],
  },
  {
    id: "exchange",
    label: "Swap",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3L4 7l4 4" /><path d="M4 7h16" /><path d="M16 21l4-4-4-4" /><path d="M20 17H4" /></svg>
    ),
  },
  {
    id: "earn",
    label: "Earn",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>
    ),
  },
  {
    id: "refinance",
    label: "Refinance",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
    ),
  },
  {
    id: "recipes",
    label: "Strategy",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
    ),
  },
];

/* Feedback dialog: text + optional screenshots, server-stored with the
   connected wallet attached (works disconnected too). */
function FeedbackDialog({
  wallet,
  onClose,
}: {
  wallet: string | null;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ name: string; type: string; dataUrl: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  function pickFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list).slice(0, 3 - next.length)) {
      if (!f.type.startsWith("image/")) {
        setError("Only image attachments are supported.");
        continue;
      }
      if (f.size > 1024 * 1024) {
        setError(`${f.name}: over 1MB, skipped.`);
        continue;
      }
      const rd = new FileReader();
      rd.onload = () => {
        const dataUrl = String(rd.result ?? "");
        if (dataUrl) setFiles((prev) => (prev.length >= 3 ? prev : [...prev, { name: f.name, type: f.type, dataUrl }]));
      };
      rd.readAsDataURL(f);
    }
  }
  async function send() {
    if (busy || text.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: wallet ?? "",
          text: text.trim().slice(0, 2000),
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.dataUrl.length, dataUrl: f.dataUrl })),
        }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) throw new Error(String(d?.error ?? "Send failed."));
      setRef(String(d.ref ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 160) : "Send failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="search-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="search-modal sa-modal" role="dialog" aria-modal="true" aria-label="Send feedback">
        <h3>Send feedback</h3>
        {ref ? (
          <>
            <div className="sa-check" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <p className="sa-sub">Thanks — your feedback is with the team{ref ? ` (ref ${ref.slice(0, 8)})` : ""}.</p>
            <div className="sa-actions sa-center">
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="sa-sub">
              Tell us what broke or what you want — screenshots help.
              {wallet ? " Sent from your connected wallet." : " Connect a wallet to attach it."}
            </p>
            <textarea
              className="fb-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What happened, and what did you expect?"
              rows={5}
              maxLength={2000}
              aria-label="Feedback text"
            />
            <div className="fb-row">
              <label className="fb-attach">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={busy || files.length >= 3}
                  onChange={(e) => {
                    pickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                Attach{files.length > 0 ? ` (${files.length}/3)` : ""}
              </label>
              {files.map((f) => (
                <span className="fb-file" key={f.name + f.dataUrl.length}>
                  {f.name.length > 18 ? `${f.name.slice(0, 16)}…` : f.name}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    disabled={busy}
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {error && (
              <p className="wallet-error" role="alert">
                {error}
              </p>
            )}
            <div className="sa-actions">
              <button type="button" className="sa-ghost" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || text.trim().length === 0}
                onClick={send}
              >
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const view = pathToView(pathname);
  const navView = navSection(view);
  // SSR-safe initial state (matches server HTML); session restores after mount.
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // The main pane scrolls itself (scrollbar starts below the topbar):
  // reset it on navigation so every page opens at the top.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Zero-width overlay scrollbar: the native bar is hidden (CSS), this thumb
  // is measured from the main pane and floats over the content edge.
  const [scrollThumb, setScrollThumb] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const node = el;
    let raf = 0;
    function measure() {
      raf = 0;
      const sh = node.scrollHeight;
      const ch = node.clientHeight;
      if (sh <= ch + 1) {
        setScrollThumb((p) => (p === null ? p : null));
        return;
      }
      const height = ch / sh;
      const top = (node.scrollTop / (sh - ch)) * (1 - height);
      setScrollThumb((p) =>
        p && Math.abs(p.top - top) < 0.0005 && Math.abs(p.height - height) < 0.0005 ? p : { top, height },
      );
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(measure);
    }
    measure();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  function startThumbDrag(ev: React.PointerEvent<HTMLDivElement>) {
    const el = mainRef.current;
    if (!el || !scrollThumb) return;
    const node = el;
    ev.preventDefault();
    const startY = ev.clientY;
    const startTop = node.scrollTop;
    const ch = node.clientHeight;
    const room = ch * (1 - scrollThumb.height);
    const factor = room > 0 ? (node.scrollHeight - ch) / room : 0;
    function move(e: PointerEvent) {
      node.scrollTop = startTop + (e.clientY - startY) * factor;
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

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
    { label: "Refinance a position", hint: "Refinance", view: "refinance" },
    { label: "Build a strategy", hint: "Strategy", view: "recipes" },
    { label: "View savings vaults", hint: "DeFindex", view: "defindex" },
    { label: "Browse XOXNO markets", hint: "XOXNO", view: "xoxno" },
    { label: "Portfolio overview", hint: "Portfolio", view: "portfolio" },
  ];

  const sq = query.trim().toLowerCase();
  const PROTOCOL_SEARCH: { id: AppView; label: string }[] = [
    { id: "blend", label: "Blend" },
    { id: "xoxno", label: "XOXNO" },
    { id: "defindex", label: "DeFindex" },
  ];
  const SEARCH_SECTIONS = [
    ...NAV.flatMap((item) => [
      { id: item.id, label: item.label, icon: item.icon },
        ...(item.children ?? []).map((c) => ({ id: c.id, label: c.label, icon: c.icon ?? item.icon })),
    ]),
    ...PROTOCOL_SEARCH.map((p) => ({
      id: p.id,
      label: p.label,
      icon: NAV.find((n) => n.id === "markets")!.icon,
    })),
  ];
  const matchedSections = SEARCH_SECTIONS.filter((item) => item.label.toLowerCase().includes(sq));
  const matchedActions = QUICK_ACTIONS.filter(
    (a) => a.label.toLowerCase().includes(sq) || a.hint.toLowerCase().includes(sq)
  );

  function go(v: AppView) {
    setSearchOpen(false);
    setWalletMenuOpen(false);
    if (v !== view) router.push(viewToPath(v));
  }

  /** Sidebar navigation: release focus so the rail collapses on hover-out. */
  function navGo(v: AppView, el: HTMLButtonElement | null) {
    go(v);
    el?.blur();
  }

  async function connectWallet() {
    setWalletError(null);
    try {
      // The kit's own auth modal (dark): every supported wallet with
      // install detection; resolves with the picked address, null when
      // the user closes it.
      const c = await kitOpenAuthModal();
      if (!c) return;
      rememberWalletKind(c.address, c.walletId);
      setWallet(c.address);
      await ensureWelcome(c.address);
    } catch {
      showError("No Stellar wallet available — install one to connect");
    }
  }

  /** Welcome exactly once per wallet (DB-first, localStorage fallback). */
  async function ensureWelcome(address: string, force = false) {
    if (!force && welcomedRef.current) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await apiFetch("/api/notifications", {
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
          `Welcome to Seidar, ${shortAddress(address)} — your positions, keepers and gas credits live here. Open a position, then protect it from the Automate tab.`
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
      const r = await apiFetch(`/api/notifications?wallet=${walletAddr}`);
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
    kitGetAddress(walletKindFor(storedWallet))
      .then((address) => {
        if (!cancelled && address) setWallet(address);
      })
      .catch(() => {
        /* locked/missing wallet — keep stored address for display */
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
      // No wallet yet (smart-gate / portfolio CTAs): the kit modal is the
      // picker. Connected: open the wallet dropdown.
      if (!wallet) {
        void connectWallet();
        return;
      }
      setWalletMenuOpen(true);
    }
    function onRefreshAll() {
      if (wallet) fetchNotes(wallet, "manual-refresh");
    }
    function onGotoView(e: Event) {
      const v = (e as CustomEvent<AppView>).detail;
      if (v) go(v);
    }
    function onOpenNotifications() {
      if (wallet) fetchNotes(wallet, "board-notify");
      setNotifOpen(true);
    }
    function onOpenSmartAccount() {
      void openSaModal();
    }
    function onOpenMyAccount() {
      openMyAccount();
    }
    window.addEventListener("seidar:open-my-account", onOpenMyAccount);
    window.addEventListener("seidar:open-wallets", onOpenWallets);
    window.addEventListener("seidar:refresh-notes", onRefreshAll);
    window.addEventListener("seidar:goto-view", onGotoView);
    window.addEventListener("seidar:open-notifications", onOpenNotifications);
    window.addEventListener("seidar:open-smart-account", onOpenSmartAccount);
    return () => {
      window.removeEventListener("seidar:open-wallets", onOpenWallets);
      window.removeEventListener("seidar:refresh-notes", onRefreshAll);
      window.removeEventListener("seidar:goto-view", onGotoView);
      window.removeEventListener("seidar:open-notifications", onOpenNotifications);
      window.removeEventListener("seidar:open-smart-account", onOpenSmartAccount);
      window.removeEventListener("seidar:open-my-account", onOpenMyAccount);
    };
  }, [wallet]);

  /** Wallet-menu scope pick: flip the whole app to the chosen wallet. */
  function switchScope(addr: string | null) {
    setWalletMenuOpen(false);
    window.dispatchEvent(
      new CustomEvent("seidar:set-view-scope", { detail: addr }),
    );
  }

  /** Open the active smart account's drawer (else the first one, else Create). */
  function openMyAccount() {
    setWalletMenuOpen(false);
    if (!wallet) {
      window.dispatchEvent(new Event("seidar:open-wallets"));
      return;
    }
    const target = smarts.find((s) => s.address === activeAcct)?.address ?? smarts[0]?.address;
    if (!target) {
      void openSaModal();
      return;
    }
    window.dispatchEvent(new CustomEvent("seidar:open-account", { detail: { address: target, owner: wallet } }));
  }

  function disconnectWallet() {
    setWallet(null);
    setActiveAcct(null);
    setWalletMenuOpen(false);
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

  /* Smart account: policy-controlled automation identity owned 1/1 by the
     connected wallet. DB record + local mirror per owner wallet. */
  type SmartAccount = {
    address: string;
    /** Owner-chosen label (lib/account-names.ts); "" = unnamed. */
    name: string;
    policy: Record<string, unknown>;
    txHash: string;
    created_at: string;
  };
  const [smarts, setSmarts] = useState<SmartAccount[]>([]);
  // True once the smart list resolved for the current wallet (server or
  // mirror) - the stale-pick check must wait for this, never fire on [].
  const [smartsLoaded, setSmartsLoaded] = useState(false);
  const [saOpen, setSaOpen] = useState(false);
  const [saName, setSaName] = useState("");
  /** Setup preview: whether the one-time code install is still needed + fee. */
  // Testnet mode (lib/network.ts): read after mount so SSR markup matches.
  const [testnet, setTestnet] = useState(false);
  useEffect(() => setTestnet(isTestnetMode()), []);
  const [saPlan, setSaPlan] = useState<{ install: boolean; feeXlm: number } | null>(null);
  const [saStatus, setSaStatus] = useState<string | null>(null);
  const [saBusy, setSaBusy] = useState(false);
  const [saError, setSaError] = useState<string | null>(null);
  const [saCreated, setSaCreated] = useState<{
    address: string;
    name: string;
    hash: string | null;
  } | null>(null);
  const [copiedSmart, setCopiedSmart] = useState<string | null>(null);

  function normalizeSmarts(owner: string, list: unknown): SmartAccount[] {
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (s): s is SmartAccount =>
          !!s &&
          typeof (s as SmartAccount).address === "string" &&
          /^C[A-Z2-7]{55}$/.test((s as SmartAccount).address) &&
          ((s as { owner?: unknown }).owner === undefined ||
            (s as { owner?: unknown }).owner === owner),
      )
      .map((s) => ({
        address: s.address,
        name: typeof s.name === "string" ? s.name : "",
        policy: (s.policy ?? {}) as Record<string, unknown>,
        txHash: typeof s.txHash === "string" ? s.txHash : "",
        created_at: typeof s.created_at === "string" ? s.created_at : "",
      }));
  }

  useEffect(() => {
    if (!wallet) {
      setSmarts([]);
      setSmartsLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await apiFetch(`/api/smart-account?owner=${wallet}`, {
          cache: "no-store",
        }).then((r) => r.json());
        if (!cancelled && d?.ok && Array.isArray(d.smarts)) {
          const list = normalizeSmarts(wallet, d.smarts);
          setSmarts(list);
          setAccountNames(Object.fromEntries(list.map((s) => [s.address, s.name])));
          try {
            window.localStorage.setItem(
              "seidar.smartAccount",
              JSON.stringify({ owner: wallet, list }),
            );
          } catch {
            /* ignore */
          }
          setSmartsLoaded(true);
          return;
        }
      } catch {
        /* fall through to mirror */
      }
      if (!cancelled) {
        try {
          const raw = window.localStorage.getItem("seidar.smartAccount");
          const s = raw ? JSON.parse(raw) : null;
          setSmarts(
            s && s.owner === wallet
              ? normalizeSmarts(wallet, s.list ?? (s.address ? [s] : []))
              : [],
          );
        } catch {
          setSmarts([]);
        }
        setSmartsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  /* Broadcast smart-account state so boards can smart-gate their quote
     buttons without their own fetchers; newly created accounts propagate
     instantly and every gate reverts to quoting on its own. */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("seidar:smart-accounts", {
        detail: {
          owner: wallet,
          list: smarts.map((s) => s.address),
          loaded: smartsLoaded,
        },
      }),
    );
  }, [wallet, smarts, smartsLoaded]);
  /* Active transaction account: the connected (main) wallet by default,
     or one of its smart accounts once picked. Every board and Exchange
     builds transactions for the picked account; the pick persists per
     owner and newly created smart accounts take over immediately.
     NB: the stored pick seeds state lazily so the persist effect below
     can never overwrite it with the default on reload. */
  const [activeAcct, setActiveAcct] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem("seidar.activeAccount");
      const s = raw ? JSON.parse(raw) : null;
      if (
        s &&
        typeof s.address === "string" &&
        /^[GC][A-Z2-7]{55}$/.test(s.address)
      )
        return s.address as string;
    } catch {
      /* default below */
    }
    return null;
  });
  useAccountNames();

  // Validate the seeded pick against the connected owner (and clear it on
  // disconnect); a pick from another owner falls back to the main wallet.
  // The seen-ref keeps the initial mount from clearing the seed before the
  // wallet restores.
  const walletSeen = useRef(false);
  const restored = useRef(false);
  const lastWallet = useRef<string | null>(null);
  useEffect(() => {
    restored.current = true;
    if (!wallet) {
      if (walletSeen.current) setActiveAcct(null);
      lastWallet.current = null;
      return;
    }
    walletSeen.current = true;
    // Already validated this owner: explicit picks stand, never re-read.
    if (wallet === lastWallet.current) return;
    lastWallet.current = wallet;
    // Re-read the stored pick (SSR hydration discards the lazy seed).
    try {
      const raw = window.localStorage.getItem("seidar.activeAccount");
      const s = raw ? JSON.parse(raw) : null;
      if (
        s &&
        s.owner === wallet &&
        typeof s.address === "string" &&
        /^[GC][A-Z2-7]{55}$/.test(s.address)
      ) {
        if (activeAcct !== s.address) setActiveAcct(s.address);
        return;
      }
    } catch {
      /* fall through to main */
    }
    setActiveAcct(wallet);
  }, [wallet, activeAcct]);

  // Drop a stale pick once the smart list is known (e.g. after a DB reset).
  // Never fires while the list is still loading - that would wipe a valid
  // restored pick on every reload.
  useEffect(() => {
    if (!wallet || !activeAcct || activeAcct === wallet) return;
    if (!smartsLoaded) return;
    if (!smarts.some((s) => s.address === activeAcct)) setActiveAcct(wallet);
  }, [wallet, activeAcct, smarts, smartsLoaded]);

  // Broadcast the pick and persist it per owner. Deferred a tick so a
  // queued restore/switch always supersedes a stale render closure; the
  // cleanup cancels overwritten broadcasts (no main-then-pick flicker).
  useEffect(() => {
    if (!wallet || !restored.current) return;
    const active = activeAcct ?? wallet;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          "seidar.activeAccount",
          JSON.stringify({ owner: wallet, address: active }),
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("seidar:active-account", { detail: active }),
      );
    }, 0);
    return () => clearTimeout(t);
  }, [wallet, activeAcct]);

  // Boards request a switch through the bus; only owned addresses stick.
  // A storage listener keeps parallel tabs converged on the latest pick
  // (last writer wins instead of clobbering each other on reload).
  useEffect(() => {
    function onSetActive(e: Event) {
      const addr = (e as CustomEvent<string | null>).detail;
      if (
        !wallet ||
        typeof addr !== "string" ||
        !/^[GC][A-Z2-7]{55}$/.test(addr)
      )
        return;
      if (addr !== wallet && !smarts.some((s) => s.address === addr)) return;
      lastWallet.current = wallet;
      setActiveAcct(addr);
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== "seidar.activeAccount" || !wallet || !e.newValue) return;
      try {
        const s = JSON.parse(e.newValue);
        if (
          s &&
          s.owner === wallet &&
          typeof s.address === "string" &&
          /^[GC][A-Z2-7]{55}$/.test(s.address) &&
          s.address !== activeAcct
        ) {
          lastWallet.current = wallet;
          setActiveAcct(s.address);
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("seidar:set-active-account", onSetActive);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("seidar:set-active-account", onSetActive);
      window.removeEventListener("storage", onStorage);
    };
  }, [wallet, smarts, activeAcct]);

  /* Dashboard view scope for the wallet menus (navbar + portfolio card):
     null = All wallets (the owner plus its smart accounts, combined), or
     one smart account to focus on. Picking a smart here ALSO switches the
     transaction account to it, so what you see is what you sign from. */
  const [viewScope, setViewScope] = useState<string | null>(null);
  const lastScopeWallet = useRef<string | null>(null);

  // Re-read the stored scope when the owner arrives (SSR drops the seed).
  useEffect(() => {
    if (!wallet) return;
    if (wallet === lastScopeWallet.current) return;
    lastScopeWallet.current = wallet;
    try {
      const raw = window.localStorage.getItem("seidar.viewScope");
      const s = raw ? JSON.parse(raw) : null;
      if (
        s &&
        s.owner === wallet &&
        (s.address === null ||
          (typeof s.address === "string" && /^C[A-Z2-7]{55}$/.test(s.address)))
      )
        setViewScope(s.address as string | null);
      else setViewScope(null);
    } catch {
      setViewScope(null);
    }
  }, [wallet]);

  // Drop a stale scope once the smart list is known; disconnect clears it.
  const scopeWalletSeen = useRef(false);
  useEffect(() => {
    if (!wallet) {
      if (scopeWalletSeen.current) setViewScope(null);
      return;
    }
    scopeWalletSeen.current = true;
    if (!smartsLoaded) return;
    if (viewScope && !smarts.some((s) => s.address === viewScope))
      setViewScope(null);
  }, [wallet, viewScope, smarts, smartsLoaded]);

  // Broadcast the scope and persist it per owner.
  useEffect(() => {
    if (!wallet) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          "seidar.viewScope",
          JSON.stringify({ owner: wallet, address: viewScope }),
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("seidar:view-scope", { detail: viewScope }),
      );
    }, 0);
    return () => clearTimeout(t);
  }, [wallet, viewScope]);

  // Menus request scope changes through the bus; only owned picks stick.
  useEffect(() => {
    function onSetScope(e: Event) {
      const addr = (e as CustomEvent<string | null>).detail;
      if (!wallet) return;
      if (
        addr !== null &&
        (typeof addr !== "string" ||
          !/^C[A-Z2-7]{55}$/.test(addr) ||
          !smarts.some((s) => s.address === addr))
      )
        return;
      lastWallet.current = wallet;
      setViewScope(addr);
      // The tx account follows the view, so the dashboard and the signer
      // never disagree.
      setActiveAcct(addr ?? wallet);
    }
    window.addEventListener("seidar:set-view-scope", onSetScope);
    return () =>
      window.removeEventListener("seidar:set-view-scope", onSetScope);
  }, [wallet, smarts]);
  async function copySmartAddress(address: string) {    try {
      await navigator.clipboard.writeText(address);
      setCopiedSmart(address);
      setTimeout(() => setCopiedSmart(null), 1500);
    } catch {
      setCopiedSmart(null);
    }
  }

  async function openSaModal() {
    setWalletMenuOpen(false);
    setSaError(null);
    setSaCreated(null);
    setSaOpen(true);
    setSaPlan(null);
    setSaName(nextAccountName(smarts.length));
    if (!wallet) return;
    try {
      const r = await apiFetch("/api/smart-account/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: wallet }),
      }).then((x) => x.json());
      if (r?.ok && typeof r.xdr === "string") {
        const sdk = await import("@stellar/stellar-sdk");
        const tx = sdk.TransactionBuilder.fromXDR(r.xdr, networkPassphrase());
        setSaPlan({ install: r.step === "upload", feeXlm: Number(tx.fee) / 1e7 });
      } else if (r?.error) setSaError(saFriendly(String(r.error)));
    } catch {
      /* preview only */
    }
  }

  /** Account setup errors in plain words. */
  function saFriendly(msg: string): string {
    if (/account not found/i.test(msg))
      return `Your wallet isn't active on ${testnet ? "testnet" : "Stellar"} yet. Send it some XLM, then create the account.`;
    return msg.slice(0, 300);
  }

  /** Horizon rejection -> human cause (result codes, not raw dumps). */
  function submitError(e: unknown): string {
    try {
      const codes = (
        e as {
          response?: {
            data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } };
          };
        }
      )?.response?.data?.extras?.result_codes;
      if (codes) {
        const friendly: Record<string, string> = {
          op_low_reserve: "balance too low for reserve + account entries",
          op_underfunded: "funding wallet lacks XLM for reserve + fee",
          op_no_destination: "destination missing",
          tx_bad_auth: "signature rejected — wrong network or key",
          tx_bad_seq: "stale sequence — retry",
          tx_insufficient_fee: "fee too low — retry",
          tx_no_source_account: "source account missing or unfunded",
        };
        const ops = codes.operations ?? [];
        const hint = [...ops, codes.transaction ?? ""]
          .filter(Boolean)
          .map((c) => friendly[c] ?? c)
          .join("; ");
        return `Rejected (${[...ops, codes.transaction ?? ""].filter(Boolean).join(" / ")}): ${hint}.`;
      }
    } catch {
      /* fall through */
    }
    return String(e instanceof Error ? e.message : e).slice(0, 400);
  }

  async function createSmartAccount() {
    if (!wallet || saBusy) return;
    setSaBusy(true);
    setSaError(null);
    try {
      // OpenZeppelin smart account owned by the wallet. The first account on
      // the network also installs the account code (a one-time signature).
      let deployed: { account: string; hash: string } | null = null;
      for (let guard = 0; guard < 3 && !deployed; guard++) {
        const r = await apiFetch("/api/smart-account/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: wallet }),
        }).then((x) => x.json());
        if (!r?.ok || typeof r.xdr !== "string") throw new Error(String(r?.error ?? "Could not prepare the account."));
        setSaStatus(r.step === "upload" ? "Approve the one-time account code install…" : "Approve the account creation…");
        const sent = await signAndSend(r.xdr, wallet, (st) =>
          setSaStatus(st === "signing" ? "Approve in your wallet…" : "Confirming on Stellar…"),
        );
        if (r.step === "deploy") deployed = { account: String(r.account), hash: sent.hash };
      }
      if (!deployed) throw new Error("Account creation did not complete — try again.");
      setSaStatus("Registering…");
      const reg = await apiFetch("/api/smart-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: wallet, address: deployed.account, txHash: deployed.hash, name: saName.trim() }),
      }).then((x) => x.json());
      if (!reg?.ok) throw new Error(String(reg?.error ?? "Account created but not registered — reload to retry."));
      const record: SmartAccount = {
        address: deployed.account,
        name: saName.trim().slice(0, 32),
        policy: { type: "openzeppelin", owner: wallet },
        txHash: deployed.hash,
        created_at: new Date().toISOString(),
      };
      setSmarts((prev) => [record, ...prev.filter((x) => x.address !== record.address)]);
      setAccountNames({ [record.address]: record.name });
      try {
        const prev = readStorage<{ owner?: string; list?: SmartAccount[] }>("seidar.smartAccount", {});
        const list = [
          record,
          ...(prev.owner === wallet && Array.isArray(prev.list) ? prev.list.filter((x) => x.address !== record.address) : []),
        ];
        window.localStorage.setItem("seidar.smartAccount", JSON.stringify({ owner: wallet, list }));
      } catch {
        /* ignore */
      }
      // The new smart account takes over as the transaction account.
      setActiveAcct(record.address);
      setSaOpen(false);
      setSaCreated({ address: record.address, name: record.name, hash: deployed.hash });
      pushNotification(`Smart account ${record.name || shortAddress(record.address)} created — fund it to start.`);
    } catch (e) {
      setSaError(saFriendly(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaBusy(false);
      setSaStatus(null);
    }
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

  /** The connected wallet's kit entry (logo/name); Freighter is the
   *  signing fallback for wallets connected before kinds were tracked. */
  const connectedMeta = WALLETS.find((w) => w.id === walletKindFor(wallet)) ?? WALLETS[0];

  async function markAllRead() {
    setNotes((prev) => prev.map((n) => ({ ...n, read: true })));
    if (!wallet) return;
    try {
      await apiFetch("/api/notifications", {
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
      {/* Fullscreen canvas routes render without sidebar/navbar. */}
      {pathname?.startsWith("/strategies/create") ? (
        children
      ) : (
        <>
      {testnet && (
        <div className="net-banner" role="status">
          TESTNET — Blend, swaps and automation run on Stellar testnet with test funds.{" "}
          <button type="button" onClick={() => setNetwork("mainnet")}>
            Back to mainnet
          </button>
        </div>
      )}
      <header className="shell-topbar">
        <div className="shell-topbar-left">
          <img src="/seidar-mark.png" alt="Seidar" className="shell-logo" />
        </div>
        <nav className="shell-sections" aria-label="Sections">
          <button
            type="button"
            className={`shell-section${navView === "vaults" ? " active" : ""}`}
            onClick={(e) => navGo("vaults", e.currentTarget)}
          >
            Vaults
          </button>
          <button
            type="button"
            className={`shell-section${navView === "portfolio" ? " active" : ""}`}
            onClick={(e) => navGo("portfolio", e.currentTarget)}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`shell-section${navView === "recipes" ? " active" : ""}`}
            onClick={(e) => navGo("recipes", e.currentTarget)}
          >
            Strategies
          </button>
        </nav>
        <div className="shell-topbar-right" ref={rightRef}>
          <button
            className="notif-btn"
            type="button"
            aria-label="Send feedback"
            title="Feedback"
            onClick={() => setFbOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </button>
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
          {walletError && <span className="wallet-error" role="alert">{walletError}</span>}
          <div className={`seg-group wallet${wallet ? " connected" : ""}`}>
            {wallet ? (
              <>
                <button className="seg-main wallet-main" type="button" onClick={() => setWalletMenuOpen((o) => !o)} title={wallet} aria-haspopup="menu" aria-expanded={walletMenuOpen}>
                  <DiceAvatar address={wallet} size={30} square />
                  <span className="wallet-text">
                    <span className="wallet-row">
                      <b>{shortAddress(wallet)}</b>
                      <span className="wallet-logo" title={connectedMeta.name}>
                        <img loading="lazy" src={connectedMeta.logo ?? "/freighter-logo.svg"} alt="" width={9} height={9} />
                      </span>
                    </span>
                  </span>
                </button>
              </>
            ) : (
              <button className="seg-main" type="button" onClick={connectWallet} title={walletError ?? "Connect a Stellar wallet"}>
                Connect wallet
              </button>
            )}
          </div>
          {walletMenuOpen && wallet && (
            <div className="wallet-drop dfs" role="menu" aria-label="Wallet menu">
              <div className="wdrop-head">
                <DiceAvatar address={wallet} size={36} square />
                <div className="wdrop-identity">
                  <button type="button" className="wdrop-addr" onClick={copyAddress} title="Copy full address">
                    {copied ? "Copied ✓" : shortAddress(wallet)}
                  </button>
                </div>
                <button type="button" className="wdrop-collapse" aria-label="Close menu" onClick={() => setWalletMenuOpen(false)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
              </div>
              {smarts.map((s) => (
                <button
                  key={s.address}
                  type="button"
                  className="wdrop-create"
                  onClick={() => switchScope(s.address)}
                  title="Focus the app on this smart account"
                >
                  <span className="wdrop-create-icon" aria-hidden="true">
                    <DiceAvatar address={s.address} size={16} square />
                  </span>
                  <AccountTag address={s.address} />
                  <em className="wdrop-tag">{viewScope === s.address ? "Active" : "Smart account"}</em>
                </button>
              ))}
              <button
                type="button"
                className="wdrop-create"
                onClick={openSaModal}
              >
                <span className="wdrop-create-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>
                </span>
                Create Smart Account
              </button>
              <div className="wdrop-rows">
                <button type="button" className="danger" onClick={disconnectWallet}>
                  <span className="wdrop-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></span>
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
      <AccountDrawer activeAccount={activeAcct} />
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
      {saOpen && (
        <div
          className="mv-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saBusy) setSaOpen(false);
          }}
        >
          <div className="sam" role="dialog" aria-modal="true" aria-label="Create smart account">
            <div className="sam-head">
              <span className="sam-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="14" rx="3" /><path d="M2.5 10.5h19" /><path d="M16.5 15h1.5" /><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V6" /></svg>
              </span>
              <div className="sam-titles">
                <h3>Create smart account</h3>
                <p>Only your wallet controls it.</p>
              </div>
              <button type="button" className="sam-x" aria-label="Close" disabled={saBusy} onClick={() => setSaOpen(false)}>
                ×
              </button>
            </div>
            <div className="sam-body">
              <label className="sam-field">
                <span>Account name</span>
                <input
                  value={saName}
                  maxLength={32}
                  placeholder="e.g. Main, Savings, Leverage"
                  disabled={saBusy}
                  autoFocus
                  onChange={(e) => setSaName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && wallet && !saBusy) void createSmartAccount();
                  }}
                />
              </label>
              <div className="sam-rows">
                <div>
                  <span>Owner</span>
                  <b className="sam-owner">
                    {wallet && <DiceAvatar address={wallet} size={16} square />}
                    {wallet ? shortAddress(wallet) : "—"}
                  </b>
                </div>
                <div>
                  <span>Signatures</span>
                  <b>{saPlan == null ? (saError ? "—" : "…") : saPlan.install ? "2" : "1"}</b>
                </div>
                {saPlan?.install && (
                  <div>
                    <span>Account code install (once)</span>
                    <b>{saPlan.feeXlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM</b>
                  </div>
                )}
                {saPlan && !saPlan.install && (
                  <div>
                    <span>Network fee</span>
                    <b>~{saPlan.feeXlm.toLocaleString("en-US", { maximumFractionDigits: 4 })} XLM</b>
                  </div>
                )}
              </div>
              {saStatus && (
                <p className="sam-status">
                  <span className="txm-spin" aria-hidden="true" />
                  {saStatus}
                </p>
              )}
              {saError && (
                <p className="sam-error" role="alert">
                  {saError}
                </p>
              )}
            </div>
            <div className="txm-foot">
              <button type="button" className="txm-cancel" disabled={saBusy} onClick={() => setSaOpen(false)}>
                Cancel
              </button>
              <button type="button" className="txm-accept" disabled={saBusy || !wallet || (saPlan == null && !!saError)} onClick={createSmartAccount}>
                {saBusy ? "Creating…" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}
      {saCreated && (
        <div
          className="mv-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSaCreated(null);
          }}
        >
          <div className="sam sam-done" role="dialog" aria-modal="true" aria-label="Smart account created">
            <div className="sam-body sam-center">
              <div className="sa-check" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h3>{saCreated.name || "Smart account"} is ready</h3>
              <p>Fund it from your wallet to start.</p>
              <button
                type="button"
                className="sam-addr"
                onClick={() => copySmartAddress(saCreated.address)}
                title="Copy address"
              >
                <DiceAvatar address={saCreated.address} size={16} square />
                <span>{copiedSmart ? "Copied ✓" : shortAddress(saCreated.address)}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
              </button>
              {saCreated.hash && (
                <a href={`${explorerBase()}/tx/${saCreated.hash}`} target="_blank" rel="noreferrer" className="sa-link">
                  View on explorer ↗
                </a>
              )}
            </div>
            <div className="txm-foot">
              <button type="button" className="txm-cancel" onClick={() => setSaCreated(null)}>
                Done
              </button>
              <button
                type="button"
                className="txm-accept"
                onClick={() => {
                  const address = saCreated.address;
                  setSaCreated(null);
                  if (wallet) window.dispatchEvent(new CustomEvent("seidar:open-account", { detail: { address, owner: wallet } }));
                }}
              >
                Fund account
              </button>
            </div>
          </div>
        </div>
      )}
      {fbOpen && <FeedbackDialog wallet={wallet} onClose={() => setFbOpen(false)} />}
      <div className="shell-layout">
        <main ref={mainRef} className="shell-main full"><div className="shell-content" key={pathname ?? "/"}>{children}</div></main>
        {scrollThumb && (
          <div className="shell-scroll" aria-hidden="true">
            <div
              className="shell-scroll-thumb"
              style={{ top: `${scrollThumb.top * 100}%`, height: `${scrollThumb.height * 100}%` }}
              onPointerDown={startThumbDrag}
            />
          </div>
        )}
      </div>
        </>
      )}
    </>
  );
}
