"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAlerts } from "@/components/common/Alerts";

// Wallet session for the whole app. Connection is not wired up yet, so every page renders its
// "connect a wallet" state; openConnectModal is the single entry point the UI calls.
type WalletValue = {
  address: string | null;
  isConnected: boolean;
  openConnectModal: () => void;
  disconnect: () => void;
};

const WalletContext = createContext<WalletValue>({
  address: null,
  isConnected: false,
  openConnectModal: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { infoAlert } = useAlerts();
  const [address, setAddress] = useState<string | null>(null);

  const openConnectModal = useCallback(() => {
    infoAlert({ message: "Stellar wallet connection is coming soon." });
  }, [infoAlert]);

  const disconnect = useCallback(() => setAddress(null), []);

  const value = useMemo(
    () => ({ address, isConnected: !!address, openConnectModal, disconnect }),
    [address, openConnectModal, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
