"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import { useWallet } from "@/wallet/WalletContext";
import Footer from "./Footer";
import Header from "./Header";
import TourGuideModal from "./tour/TourGuideModal";

const AppRoot = styled(Box)(({ theme }) => ({
  padding: "6.5rem 1rem 1rem 1rem",
  [theme.breakpoints.down("sm")]: { padding: "5.5rem 0.75rem 0.75rem 0.75rem" },
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.border.iconBg : theme.palette.surfaceBg.main,
  backgroundImage: theme.palette.mode === "dark" ? "url(/assets/page-bg.svg)" : "none",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
  backgroundPosition: "center center",
  backgroundSize: "100% 100%",
}));

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isConnected } = useWallet();
  const [tourOpen, setTourOpen] = useState(false);
  const prompted = useRef(false);

  // First visit without a wallet opens the tour, as the original app does.
  useEffect(() => {
    if (isConnected) {
      setTourOpen(false);
      prompted.current = true;
      return;
    }
    if (prompted.current) return;
    let returning = false;
    try {
      returning = !!localStorage.getItem("lastConnectedWalletType");
    } catch {}
    const t = setTimeout(
      () => {
        if (!prompted.current) {
          setTourOpen(true);
          prompted.current = true;
        }
      },
      returning ? 1500 : 500,
    );
    return () => clearTimeout(t);
  }, [isConnected]);

  return (
    <AppRoot>
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "transparent" }}>
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        <Box component="main" sx={{ flexGrow: 1, width: "100%", backgroundColor: "transparent", display: "flex" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
        </Box>
        <Footer />
        <TourGuideModal open={tourOpen} handleClose={() => setTourOpen(false)} />
      </Box>
    </AppRoot>
  );
}
