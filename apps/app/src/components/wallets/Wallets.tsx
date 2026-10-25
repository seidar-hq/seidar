"use client";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DataTable, { type Column } from "@/components/common/DataTable";
import ThemeButton from "@/components/common/ThemeButton";
import { useWallet } from "@/wallet/WalletContext";
import PortfolioKpis from "./PortfolioKpis";

type WalletRow = { name: string; type: string; network: string; address: string; balance: string; status: string };

const COLUMNS: Column<WalletRow>[] = [
  { id: "name", header: "Wallet Name", accessor: "name" },
  { id: "type", header: "Wallet Type", accessor: "type" },
  { id: "network", header: "Network", accessor: "network" },
  { id: "address", header: "Address", accessor: "address" },
  { id: "balance", header: "Balance", accessor: "balance" },
  { id: "status", header: "Status", accessor: "status" },
  { id: "action", header: "Action" },
];

export default function Wallets() {
  const theme = useTheme();
  const { openConnectModal } = useWallet();

  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh" }}>
      <Box sx={{ mt: "1rem", backgroundColor: theme.palette.surfaceBg.section, p: 0, width: "100%", borderRadius: "0.500rem" }}>
        <PortfolioKpis />
      </Box>
      <Paper
        sx={{
          mt: "1rem",
          backgroundColor: theme.palette.surfaceBg.section,
          width: "100%",
          padding: "1rem",
          borderRadius: "0.500rem",
          border: 0,
          boxShadow: "none",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "auto" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: "1rem" }}>
            <Typography variant="body4">Connected Wallets</Typography>
            <Box>
              <ThemeButton
                isLightPurple
                noDarkBg
                borderColor={theme.palette.overlay.white40}
                onClick={openConnectModal}
                startIcon={<AddIcon />}
              >
                Add New Wallet
              </ThemeButton>
            </Box>
          </Box>
          <Box sx={{ flex: 1 }}>
            <DataTable columns={COLUMNS} rows={[]} emptyDataText="No wallet found" />
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
