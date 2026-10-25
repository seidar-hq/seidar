"use client";

import { useEffect, useMemo } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { createAppTheme } from "./theme";
import { ThemeModeProvider, useThemeMode } from "./ThemeModeContext";
import { AlertProvider } from "@/components/common/Alerts";

function ThemeLayer({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-bg", theme.palette.surfaceBg.main);
    document.documentElement.style.setProperty("--scrollbar-thumb", theme.palette.scrollbar.thumb);
  }, [theme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AlertProvider>{children}</AlertProvider>
    </ThemeProvider>
  );
}

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeModeProvider>
        <ThemeLayer>{children}</ThemeLayer>
      </ThemeModeProvider>
    </AppRouterCacheProvider>
  );
}
