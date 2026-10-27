"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchAdjustments, saveAdjustments } from "@/lib/api";
import type { Adjustments } from "./adjustments";

const TOKEN_KEY = "seidar.analytics.admin";

type AdminValue = {
  unlocked: boolean;
  adjustments: Adjustments | null;
  updatedAt: string | null;
  busy: boolean;
  error: string | null;
  open: boolean;
  loginOpen: boolean;
  revision: number;
  setOpen: (v: boolean) => void;
  setLoginOpen: (v: boolean) => void;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  refresh: () => Promise<void>;
  save: (next: Adjustments) => Promise<boolean>;
};

const DEFAULT: AdminValue = {
  unlocked: false,
  adjustments: null,
  updatedAt: null,
  busy: false,
  error: null,
  open: false,
  loginOpen: false,
  revision: 0,
  setOpen: () => {},
  setLoginOpen: () => {},
  login: async () => false,
  logout: () => {},
  refresh: async () => {},
  save: async () => false,
};

const Ctx = createContext<AdminValue>(DEFAULT);

export const useAdmin = () => useContext(Ctx);

const readToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};

const writeToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
};

export const removeToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

const adminRequested = (): boolean => {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  return url.searchParams.has("admin") || url.hash === "#admin";
};

const clearAdminRequest = (): void => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("admin") && url.hash !== "#admin") return;
  url.searchParams.delete("admin");
  if (url.hash === "#admin") url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [adjustments, setAdjustments] = useState<Adjustments | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const requested = adminRequested();
    const saved = readToken();
    if (!saved) {
      if (requested) setLoginOpen(true);
      return () => {
        mounted.current = false;
      };
    }
    setBusy(true);
    void fetchAdjustments(saved).then((r) => {
      if (!mounted.current) return;
      setBusy(false);
      if (!r.ok) {
        if (r.error.includes("token")) removeToken();
        else setError(r.error);
        if (requested) setLoginOpen(true);
        return;
      }
      setToken(saved);
      setUnlocked(true);
      setAdjustments(r.adjustments);
      setUpdatedAt(r.updatedAt);
      if (requested) {
        setOpen(true);
        clearAdminRequest();
      }
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const login = useCallback(async (value: string) => {
    const next = value.trim();
    if (!next) {
      setError("Enter the admin token.");
      return false;
    }
    setBusy(true);
    setError(null);
    const r = await fetchAdjustments(next);
    if (!mounted.current) return false;
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    writeToken(next);
    setToken(next);
    setUnlocked(true);
    setAdjustments(r.adjustments);
    setUpdatedAt(r.updatedAt);
    setLoginOpen(false);
    setOpen(true);
    clearAdminRequest();
    return true;
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setToken(null);
    setUnlocked(false);
    setAdjustments(null);
    setUpdatedAt(null);
    setError(null);
    setOpen(false);
    setLoginOpen(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const r = await fetchAdjustments(token);
    if (!mounted.current) return;
    if (!r.ok) {
      if (r.error.includes("token")) {
        removeToken();
        setToken(null);
        setUnlocked(false);
        setAdjustments(null);
        setUpdatedAt(null);
        setLoginOpen(true);
      }
      setError(r.error);
      return;
    }
    setError(null);
    setAdjustments(r.adjustments);
    setUpdatedAt(r.updatedAt);
  }, [token]);

  const save = useCallback(
    async (next: Adjustments) => {
      if (!token) {
        setLoginOpen(true);
        return false;
      }
      setBusy(true);
      setError(null);
      const r = await saveAdjustments(token, next);
      if (!mounted.current) return false;
      setBusy(false);
      if (!r.ok) {
        if (r.error.includes("token")) {
          removeToken();
          setToken(null);
          setUnlocked(false);
          setLoginOpen(true);
        }
        setError(r.error);
        return false;
      }
      setAdjustments(r.adjustments);
      setUpdatedAt(r.updatedAt);
      setRevision((n) => n + 1);
      return true;
    },
    [token],
  );

  const value = useMemo(
    () => ({
      unlocked,
      adjustments,
      updatedAt,
      busy,
      error,
      open,
      loginOpen,
      revision,
      setOpen,
      setLoginOpen,
      login,
      logout,
      refresh,
      save,
    }),
    [unlocked, adjustments, updatedAt, busy, error, open, loginOpen, revision, login, logout, refresh, save],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
