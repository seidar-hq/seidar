"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAlerts } from "@/components/common/Alerts";
import {
  WATCH_ENABLED,
  isStellarAddress,
  kitDisconnect,
  kitOpenAuthModal,
  walletMeta,
  type WalletKind,
} from "@/lib/wallets";
import { shortAddress } from "@/lib/format";

// Wallet session for the whole app. Linked Stellar wallets are grouped into named portfolios.
// One portfolio is active: the dashboard, earn and history follow its wallets, and one of its
// wallets is the active signer. Inside the active portfolio the view can narrow to one wallet.

export type LinkedWallet = { address: string; walletId: WalletKind; name: string };
export type Portfolio = { id: string; name: string; wallets: string[] };
/** View inside the active portfolio: every wallet in it ("all") or one address. */
export type PortfolioSelection = "all" | string;

type WalletValue = {
  /** Every linked wallet, across all portfolios. */
  wallets: LinkedWallet[];
  portfolios: Portfolio[];
  activePortfolio: Portfolio | null;
  /** Wallets that belong to the active portfolio. */
  portfolioWallets: LinkedWallet[];
  /** Active signer address (null when the active portfolio has no wallet). */
  address: string | null;
  activeWallet: LinkedWallet | null;
  isConnected: boolean;
  portfolio: PortfolioSelection;
  /** Addresses the current view covers. */
  portfolioAddresses: string[];
  setPortfolio: (p: PortfolioSelection) => void;
  setActivePortfolio: (id: string) => void;
  /** Creates a portfolio (optionally making it active) and returns its id. */
  createPortfolio: (name: string, activate?: boolean) => string;
  renamePortfolio: (id: string, name: string) => void;
  /** Deletes a portfolio; its wallets move to `moveTo` (or stay linked in the first other portfolio). */
  deletePortfolio: (id: string, moveTo?: string) => void;
  moveWallet: (address: string, portfolioId: string) => void;
  portfolioOf: (address: string) => Portfolio | null;
  /** Opens the wallet picker and links (or re-activates) the chosen wallet in the active portfolio. */
  openConnectModal: () => Promise<void>;
  /** Links a read-only mainnet address for testing (no signing). Dev builds only. */
  watchAddress: (address: string, name?: string) => boolean;
  switchWallet: (address: string) => void;
  renameWallet: (address: string, name: string) => void;
  disconnect: (address?: string) => void;
  disconnectAll: () => void;
};

const noop = () => {};
const WalletContext = createContext<WalletValue>({
  wallets: [],
  portfolios: [],
  activePortfolio: null,
  portfolioWallets: [],
  address: null,
  activeWallet: null,
  isConnected: false,
  portfolio: "all",
  portfolioAddresses: [],
  setPortfolio: noop,
  setActivePortfolio: noop,
  createPortfolio: () => "",
  renamePortfolio: noop,
  deletePortfolio: noop,
  moveWallet: noop,
  portfolioOf: () => null,
  openConnectModal: async () => {},
  watchAddress: () => false,
  switchWallet: noop,
  renameWallet: noop,
  disconnect: noop,
  disconnectAll: noop,
});

const WALLETS_KEY = "seidar.wallets";
const ACTIVE_KEY = "seidar.activeWallet";
const PORTFOLIO_KEY = "seidar.portfolio";
const PORTFOLIOS_KEY = "seidar.portfolios";
const ACTIVE_PORTFOLIO_KEY = "seidar.activePortfolio";
const DEFAULT_NAME = "My Portfolio";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const isLinkedWallet = (w: unknown): w is LinkedWallet =>
  !!w &&
  typeof (w as LinkedWallet).address === "string" &&
  !!walletMeta((w as LinkedWallet).walletId) &&
  ((w as LinkedWallet).walletId !== "watch" || WATCH_ENABLED);

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const walletLabel = (w: LinkedWallet) => w.name || `${walletMeta(w.walletId)?.name ?? "Wallet"} ${shortAddress(w.address)}`;

/** Every wallet sits in exactly one portfolio; there is always at least one portfolio. */
function normalize(portfolios: Portfolio[], wallets: LinkedWallet[]): Portfolio[] {
  const known = new Set(wallets.map((w) => w.address));
  const seen = new Set<string>();
  const out = (portfolios.length ? portfolios : [{ id: newId(), name: DEFAULT_NAME, wallets: [] }]).map((p) => ({
    ...p,
    wallets: p.wallets.filter((a) => known.has(a) && !seen.has(a) && (seen.add(a), true)),
  }));
  const orphans = wallets.map((w) => w.address).filter((a) => !seen.has(a));
  if (orphans.length) out[0] = { ...out[0], wallets: [...out[0].wallets, ...orphans] };
  return out;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { successAlert, errorAlert } = useAlerts();
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [portfolio, setPortfolioState] = useState<PortfolioSelection>("all");

  useEffect(() => {
    const stored = load<unknown[]>(WALLETS_KEY, []).filter(isLinkedWallet);
    const ps = normalize(load<Portfolio[]>(PORTFOLIOS_KEY, []), stored);
    const pid = load<string | null>(ACTIVE_PORTFOLIO_KEY, null);
    const active = ps.find((p) => p.id === pid) ?? ps[0];
    const signer = load<string | null>(ACTIVE_KEY, null);
    setWallets(stored);
    setPortfolios(ps);
    setActiveId(active.id);
    setAddress(active.wallets.includes(signer ?? "") ? signer : (active.wallets[0] ?? null));
    const view = load<PortfolioSelection>(PORTFOLIO_KEY, "all");
    setPortfolioState(view === "all" || active.wallets.includes(view) ? view : "all");
    save(PORTFOLIOS_KEY, ps);
    save(ACTIVE_PORTFOLIO_KEY, active.id);
  }, []);

  /** Single write path: keeps portfolios normalized, the signer inside the active portfolio, and storage in sync. */
  const commit = useCallback(
    (next: { wallets?: LinkedWallet[]; portfolios?: Portfolio[]; activeId?: string; address?: string | null }) => {
      const w = next.wallets ?? wallets;
      const ps = normalize(next.portfolios ?? portfolios, w);
      const active = ps.find((p) => p.id === (next.activeId ?? activeId)) ?? ps[0];
      const wanted = next.address !== undefined ? next.address : address;
      const signer = wanted && active.wallets.includes(wanted) ? wanted : (active.wallets[0] ?? null);
      setWallets(w);
      setPortfolios(ps);
      setActiveId(active.id);
      setAddress(signer);
      save(WALLETS_KEY, w);
      save(PORTFOLIOS_KEY, ps);
      save(ACTIVE_PORTFOLIO_KEY, active.id);
      save(ACTIVE_KEY, signer);
      setPortfolioState((p) => {
        const fixed = p === "all" || active.wallets.includes(p) ? p : "all";
        save(PORTFOLIO_KEY, fixed);
        return fixed;
      });
    },
    [wallets, portfolios, activeId, address],
  );

  const setPortfolio = useCallback((p: PortfolioSelection) => {
    setPortfolioState(p);
    save(PORTFOLIO_KEY, p);
  }, []);

  const setActivePortfolio = useCallback(
    (id: string) => {
      if (id === activeId) return;
      setPortfolio("all");
      commit({ activeId: id });
    },
    [activeId, commit, setPortfolio],
  );

  const createPortfolio = useCallback(
    (name: string, activate = false) => {
      const id = newId();
      if (activate) setPortfolio("all");
      commit({
        portfolios: [...portfolios, { id, name: name.trim() || `Portfolio ${portfolios.length + 1}`, wallets: [] }],
        activeId: activate ? id : undefined,
      });
      return id;
    },
    [portfolios, commit, setPortfolio],
  );

  const renamePortfolio = useCallback(
    (id: string, name: string) => commit({ portfolios: portfolios.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) }),
    [portfolios, commit],
  );

  const deletePortfolio = useCallback(
    (id: string, moveTo?: string) => {
      if (portfolios.length <= 1) return errorAlert({ message: "Keep at least one portfolio" });
      const gone = portfolios.find((p) => p.id === id);
      const rest = portfolios.filter((p) => p.id !== id);
      const target = rest.find((p) => p.id === moveTo) ?? rest[0];
      const ps = rest.map((p) => (p.id === target.id ? { ...p, wallets: [...p.wallets, ...(gone?.wallets ?? [])] } : p));
      commit({ portfolios: ps, activeId: id === activeId ? target.id : activeId ?? undefined });
    },
    [portfolios, activeId, commit, errorAlert],
  );

  const moveWallet = useCallback(
    (addr: string, portfolioId: string) =>
      commit({
        portfolios: portfolios.map((p) =>
          p.id === portfolioId
            ? { ...p, wallets: p.wallets.includes(addr) ? p.wallets : [...p.wallets, addr] }
            : { ...p, wallets: p.wallets.filter((a) => a !== addr) },
        ),
      }),
    [portfolios, commit],
  );

  const portfolioOf = useCallback((addr: string) => portfolios.find((p) => p.wallets.includes(addr)) ?? null, [portfolios]);

  /** Adds `addr` to the active portfolio (moving it there if it sits in another one). */
  const intoActive = useCallback(
    (addr: string) =>
      portfolios.map((p) =>
        p.id === activeId
          ? { ...p, wallets: p.wallets.includes(addr) ? p.wallets : [...p.wallets, addr] }
          : { ...p, wallets: p.wallets.filter((a) => a !== addr) },
      ),
    [portfolios, activeId],
  );

  const openConnectModal = useCallback(async () => {
    const r = await kitOpenAuthModal();
    if (!r) return;
    const exists = wallets.some((w) => w.address === r.address);
    const next = exists
      ? wallets.map((w) => (w.address === r.address ? { ...w, walletId: r.walletId } : w))
      : [...wallets, { address: r.address, walletId: r.walletId, name: "" }];
    commit({ wallets: next, portfolios: intoActive(r.address), address: r.address });
    successAlert({ message: exists ? "Wallet switched" : "Wallet connected" });
  }, [wallets, commit, intoActive, successAlert]);

  const watchAddress = useCallback(
    (target: string, name = "Test wallet") => {
      if (!WATCH_ENABLED || !isStellarAddress(target)) return false;
      const next = wallets.some((w) => w.address === target)
        ? wallets
        : [...wallets, { address: target, walletId: "watch" as const, name }];
      commit({ wallets: next, portfolios: intoActive(target), address: target });
      return true;
    },
    [wallets, commit, intoActive],
  );

  // Test hooks: /dashboard?watch=G... or window.seidar.watch("G...") in the console.
  const [watchQueued, setWatchQueued] = useState<string | null>(null);
  useEffect(() => {
    if (!WATCH_ENABLED) return;
    const q = new URLSearchParams(window.location.search).get("watch");
    if (q) setWatchQueued(q.trim());
  }, []);
  useEffect(() => {
    if (!watchQueued || !activeId) return;
    watchAddress(watchQueued);
    setWatchQueued(null);
  }, [watchQueued, activeId, watchAddress]);
  useEffect(() => {
    if (!WATCH_ENABLED) return;
    (window as unknown as { seidar?: object }).seidar = {
      watch: (a: string, name?: string) => watchAddress(a, name),
      wallets: () => load(WALLETS_KEY, []),
      portfolios: () => load(PORTFOLIOS_KEY, []),
    };
  }, [watchAddress]);

  const switchWallet = useCallback(
    (target: string) => {
      const home = portfolios.find((p) => p.wallets.includes(target));
      if (!home) return errorAlert({ message: "Wallet not found" });
      commit({ activeId: home.id, address: target });
    },
    [portfolios, commit, errorAlert],
  );

  const renameWallet = useCallback(
    (target: string, name: string) => commit({ wallets: wallets.map((w) => (w.address === target ? { ...w, name: name.trim() } : w)) }),
    [wallets, commit],
  );

  const disconnect = useCallback(
    (target?: string) => {
      const which = target ?? address;
      if (!which) return;
      const next = wallets.filter((w) => w.address !== which);
      commit({ wallets: next, address: which === address ? null : address });
      if (next.length === 0) void kitDisconnect();
    },
    [wallets, address, commit],
  );

  const disconnectAll = useCallback(() => {
    commit({ wallets: [], address: null });
    void kitDisconnect();
  }, [commit]);

  const value = useMemo<WalletValue>(() => {
    const activePortfolio = portfolios.find((p) => p.id === activeId) ?? null;
    const inActive = activePortfolio?.wallets ?? [];
    const portfolioWallets = inActive.map((a) => wallets.find((w) => w.address === a)).filter((w): w is LinkedWallet => !!w);
    const activeWallet = wallets.find((w) => w.address === address) ?? null;
    return {
      wallets,
      portfolios,
      activePortfolio,
      portfolioWallets,
      address,
      activeWallet,
      isConnected: !!activeWallet,
      portfolio,
      portfolioAddresses: portfolio === "all" ? inActive : inActive.filter((a) => a === portfolio),
      setPortfolio,
      setActivePortfolio,
      createPortfolio,
      renamePortfolio,
      deletePortfolio,
      moveWallet,
      portfolioOf,
      openConnectModal,
      watchAddress,
      switchWallet,
      renameWallet,
      disconnect,
      disconnectAll,
    };
  }, [
    wallets,
    portfolios,
    activeId,
    address,
    portfolio,
    setPortfolio,
    setActivePortfolio,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    moveWallet,
    portfolioOf,
    openConnectModal,
    watchAddress,
    switchWallet,
    renameWallet,
    disconnect,
    disconnectAll,
  ]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
