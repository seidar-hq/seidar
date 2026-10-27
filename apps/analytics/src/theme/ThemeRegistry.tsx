"use client";

import { useEffect, useMemo } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { createAppTheme } from "./theme";

// Same theme as the app (palette/components/theme are copied from apps/app/src/theme). Dark only.
export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const theme = useMemo(() => createAppTheme("dark"), []);
  useEffect(() => {
    document.documentElement.style.setProperty("--app-bg", theme.palette.surfaceBg.main);
    document.documentElement.style.setProperty("--scrollbar-thumb", theme.palette.scrollbar.thumb);
  }, [theme]);
  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
