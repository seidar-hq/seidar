"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/wallet/WalletContext";

type AgentState = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };

const AgentCtx = createContext<AgentState>({ open: false, setOpen: () => {}, toggle: () => {} });

/** Open/closed state of the Seidar Agent panel. It only exists while a wallet is connected. */
export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useWallet();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isConnected) setOpen(false);
  }, [isConnected]);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(() => ({ open: open && isConnected, setOpen, toggle }), [open, isConnected, toggle]);
  return <AgentCtx.Provider value={value}>{children}</AgentCtx.Provider>;
}

export const useAgent = () => useContext(AgentCtx);

/** Width of the docked panel; pages reserve this much room on the right while it is open. */
export const AGENT_PANEL_WIDTH = "27.375rem";
/** Below this width the panel covers the page instead of docking beside it. */
export const AGENT_DOCK_MIN = "54.25rem";
