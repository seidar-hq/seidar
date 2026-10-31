"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import { styled } from "@mui/material/styles";
import Footer from "./Footer";
import Header from "./Header";
import SmoothScroll from "./SmoothScroll";
import { useWallet } from "@/wallet/WalletContext";
import AgentPanel from "@/components/agent/AgentPanel";
import { AGENT_DOCK_MIN, AGENT_PANEL_WIDTH, useAgent } from "@/components/agent/AgentContext";
import { HOME_ENABLED } from "@/lib/features";

const AppRoot = styled(Box)(({ theme }) => ({
  padding: "6.5rem 1rem 1rem 1rem",
  [theme.breakpoints.down("sm")]: { padding: "5.5rem 0.75rem 0.75rem 0.75rem" },
  backgroundColor: theme.palette.surfaceBg.main,
}));

function AppLoading() {
  return (
    <Box
      aria-label="Loading wallet session"
      sx={{
        display: "grid",
        gap: "1rem",
        alignItems: "start",
        gridTemplateColumns: { xs: "1fr", md: "minmax(12.5rem, 1fr) 27.375rem" },
      }}
    >
      <Box sx={{ display: "grid", gap: "1rem" }}>
        <Skeleton variant="rounded" height="11rem" sx={{ borderRadius: "1rem" }} />
        <Skeleton variant="rounded" height="22rem" sx={{ borderRadius: "1rem" }} />
      </Box>
      <Skeleton variant="rounded" height="38.5rem" sx={{ borderRadius: "1rem" }} />
    </Box>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useWallet();
  const { open } = useAgent();
  const pathname = usePathname();
  // Portfolio gives the agent its right-hand column; other pages make room beside their content.
  const onPortfolio = pathname.startsWith("/portfolio") || (!HOME_ENABLED && pathname === "/");
  const dock = open && !onPortfolio;
  // Page cache for networks that intermittently can't reach the site (public/sw.js).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <AppRoot>
      <SmoothScroll />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          backgroundColor: "transparent",
          ...(dock && { [`@media (min-width: ${AGENT_DOCK_MIN})`]: { marginRight: `calc(${AGENT_PANEL_WIDTH} + 1rem)` } }),
        }}
      >
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        <Box component="main" sx={{ flexGrow: 1, width: "100%", backgroundColor: "transparent", display: "flex" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{ready ? children : <AppLoading />}</Box>
        </Box>
        <Footer />
      </Box>
      {open && (
        <Box
          data-lenis-prevent
          sx={{
            position: "fixed",
            zIndex: 1000,
            top: "6.5rem",
            right: "1rem",
            bottom: "1rem",
            width: AGENT_PANEL_WIDTH,
            [`@media (max-width: ${AGENT_DOCK_MIN})`]: { top: "5.5rem", left: "0.75rem", right: "0.75rem", bottom: "0.75rem", width: "auto" },
          }}
        >
          <AgentPanel />
        </Box>
      )}
    </AppRoot>
  );
}
