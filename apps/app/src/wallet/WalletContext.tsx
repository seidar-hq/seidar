"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAlerts } from "@/components/common/Alerts";
import { kitDisconnect, kitOpenAuthModal, walletMeta, type KitWalletId } from "@/lib/wallets";
import { shortAddress } from "@/lib/format";

// Wallet session for the whole app. Several Stellar wallets can be linked at once: one is the
// active signer, and the portfolio selection ("all" or one address) drives what the dashboard shows.

export type LinkedWallet = { address: string; walletId: KitWalletId; name: string };
export type PortfolioSelection = "all" | string;

type WalletValue = {
  wallets: LinkedWallet[];
  /** Active signer address (null when nothing is linked). */
  address: string | null;
  activeWallet: LinkedWallet | null;
  isConnected: boolean;
  portfolio: PortfolioSelection;
  /** Addresses the current portfolio selection covers. */
  portfolioAddresses: string[];
  setPortfolio: (p: PortfolioSelection) => void;
  /** Opens the wallet picker and links (or re-activates) the chosen wallet. */
  openConnectModal: () => Promise<void>;
  switchWallet: (address: string) => void;
  renameWallet: (address: string, name: string) => void;
  disconnect: (address?: string) => void;
  disconnectAll: () => void;
};

const noop = () => {};
const WalletContext = createContext<WalletValue>({
  wallets: [],
  address: null,
  activeWallet: null,
  isConnected: false,
  portfolio: "all",
  portfolioAddresses: [],
  setPortfolio: noop,
  openConnectModal: async () => {},
  switchWallet: noop,
  renameWallet: noop,
  disconnect: noop,
  disconnectAll: noop,
});

const WALLETS_KEY = "seidar.wallets";
const ACTIVE_KEY = "seidar.activeWallet";
const PORTFOLIO_KEY = "seidar.portfolio";

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
  !!w && typeof (w as LinkedWallet).address === "string" && !!walletMeta((w as LinkedWallet).walletId);

export const walletLabel = (w: LinkedWallet) => w.name || `${walletMeta(w.walletId)?.name ?? "Wallet"} ${shortAddress(w.address)}`;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { successAlert, errorAlert } = useAlerts();
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [portfolio, setPortfolioState] = useState<PortfolioSelection>("all");

  useEffect(() => {
    const stored = load<unknown[]>(WALLETS_KEY, []).filter(isLinkedWallet);
    setWallets(stored);
    const active = load<string | null>(ACTIVE_KEY, null);
    setAddress(stored.find((w) => w.address === active)?.address ?? stored[0]?.address ?? null);
    const p = load<PortfolioSelection>(PORTFOLIO_KEY, "all");
    setPortfolioState(p === "all" || stored.some((w) => w.address === p) ? p : "all");
  }, []);

  const commit = useCallback((next: LinkedWallet[], nextActive: string | null) => {
    setWallets(next);
    setAddress(nextActive);
    save(WALLETS_KEY, next);
    save(ACTIVE_KEY, nextActive);
    setPortfolioState((p) => {
      const fixed = p === "all" || next.some((w) => w.address === p) ? p : "all";
      save(PORTFOLIO_KEY, fixed);
      return fixed;
    });
  }, []);

  const setPortfolio = useCallback((p: PortfolioSelection) => {
    setPortfolioState(p);
    save(PORTFOLIO_KEY, p);
  }, []);

  const openConnectModal = useCallback(async () => {
    const r = await kitOpenAuthModal();
    if (!r) return;
    const exists = wallets.some((w) => w.address === r.address);
    const next = exists
      ? wallets.map((w) => (w.address === r.address ? { ...w, walletId: r.walletId } : w))
      : [...wallets, { address: r.address, walletId: r.walletId, name: "" }];
    commit(next, r.address);
    successAlert({ message: exists ? "Wallet switched" : "Wallet connected" });
  }, [wallets, commit, successAlert]);

  const switchWallet = useCallback(
    (target: string) => {
      if (!wallets.some((w) => w.address === target)) return errorAlert({ message: "Wallet not found" });
      commit(wallets, target);
    },
    [wallets, commit, errorAlert],
  );

  const renameWallet = useCallback(
    (target: string, name: string) => {
      commit(
        wallets.map((w) => (w.address === target ? { ...w, name: name.trim() } : w)),
        address,
      );
    },
    [wallets, address, commit],
  );

  const disconnect = useCallback(
    (target?: string) => {
      const which = target ?? address;
      if (!which) return;
      const next = wallets.filter((w) => w.address !== which);
      commit(next, which === address ? (next[0]?.address ?? null) : address);
      if (next.length === 0) void kitDisconnect();
    },
    [wallets, address, commit],
  );

  const disconnectAll = useCallback(() => {
    commit([], null);
    void kitDisconnect();
  }, [commit]);

  const value = useMemo<WalletValue>(() => {
    const activeWallet = wallets.find((w) => w.address === address) ?? null;
    return {
      wallets,
      address,
      activeWallet,
      isConnected: !!activeWallet,
      portfolio,
      portfolioAddresses: portfolio === "all" ? wallets.map((w) => w.address) : [portfolio],
      setPortfolio,
      openConnectModal,
      switchWallet,
      renameWallet,
      disconnect,
      disconnectAll,
    };
  }, [wallets, address, portfolio, setPortfolio, openConnectModal, switchWallet, renameWallet, disconnect, disconnectAll]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
