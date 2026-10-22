"use client";

import { useEffect } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "./theme";
import { AlertProvider } from "@/components/common/Alerts";

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const toTop = () => window.scrollTo(0, 0);
    window.addEventListener("beforeunload", toTop);
    return () => window.removeEventListener("beforeunload", toTop);
  }, []);

  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AlertProvider>{children}</AlertProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
