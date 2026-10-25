"use client";

import { Suspense } from "react";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import Footer from "./Footer";
import Header from "./Header";

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
      </Box>
    </AppRoot>
  );
}
