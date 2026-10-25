"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PaletteMode } from "@mui/material/styles";

type ThemeModeValue = {
  mode: PaletteMode;
  isDarkMode: boolean;
  isLightMode: boolean;
  toggleThemeMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeValue>({
  mode: "dark",
  isDarkMode: true,
  isLightMode: false,
  toggleThemeMode: () => {},
});

const STORAGE_KEY = "theme";

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch {}
  }, []);

  const toggleThemeMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, isDarkMode: mode === "dark", isLightMode: mode === "light", toggleThemeMode }),
    [mode, toggleThemeMode],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export const useThemeMode = () => useContext(ThemeModeContext);
