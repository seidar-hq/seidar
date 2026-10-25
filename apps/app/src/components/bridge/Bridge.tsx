"use client";

import { useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { ConnectPill } from "@/components/trade/TradeLocked";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";
import BridgeForm from "./BridgeForm";
import { bridgeLayout, bridgeText, summaryStyles } from "./bridgeStyles";

function TransactionSummary() {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const { openConnectModal } = useWallet();
  const s = useMemo(() => summaryStyles(theme, isDarkMode), [theme, isDarkMode]);

  return (
    <Card elevation={0} sx={s.txnSummaryCard}>
      <Typography variant="h6" color="common.black">
        Transaction Summary
      </Typography>
      <Box sx={s.lockedBody}>
        <Box component="img" src="/assets/bridgeSummaryLocked.svg" alt="" sx={s.lockedIllustration} />
        <Typography variant="subtitle10" color="sidebar.subText" sx={{ textAlign: "center", maxWidth: "16.375rem" }}>
          Connect a wallet to move assets safely across supported networks.
        </Typography>
        <ConnectPill onClick={openConnectModal} sx={{ alignSelf: "center" }} />
      </Box>
    </Card>
  );
}

export default function Bridge() {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const t = useMemo(() => bridgeText(theme, isDarkMode), [theme, isDarkMode]);
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);

  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh" }}>
      <Box
        sx={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "1fr 28.5625rem",
          mt: "0.4rem",
          "@media (max-width: 75rem)": { gridTemplateColumns: "1fr" },
        }}
      >
        <Box sx={{ ...s.bridgeSectionCard, padding: { xs: "1rem", sm: "1.500rem" } }}>
          <Box sx={{ mb: "1.500rem" }}>
            <Typography variant="h5" sx={{ ...t.heading, mb: "0.500rem" }}>
              Bridge
            </Typography>
            <Typography variant="body1" sx={{ ...t.body }}>
              Move digital assets seamlessly between Stellar and other networks.
            </Typography>
          </Box>
          <Box sx={{ ...s.bridgeWidgetWrapper, minHeight: { xs: "auto", md: "50vh" } }}>
            <BridgeForm />
          </Box>
        </Box>
        <Box sx={{ display: "flex" }}>
          <TransactionSummary />
        </Box>
      </Box>
    </Box>
  );
}
