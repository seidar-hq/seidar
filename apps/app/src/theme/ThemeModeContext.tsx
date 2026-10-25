"use client";

import { createContext, useContext } from "react";
import type { PaletteMode } from "@mui/material/styles";

// Seidar ships a single dark theme. The light palette stays in palette.ts but is not selectable.
type ThemeModeValue = { mode: PaletteMode; isDarkMode: boolean; isLightMode: boolean };

const VALUE: ThemeModeValue = { mode: "dark", isDarkMode: true, isLightMode: false };
const ThemeModeContext = createContext<ThemeModeValue>(VALUE);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeModeContext.Provider value={VALUE}>{children}</ThemeModeContext.Provider>;
}

export const useThemeMode = () => useContext(ThemeModeContext);
