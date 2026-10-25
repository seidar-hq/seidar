"use client";

import Alert from "@mui/material/Alert";
import type { SxProps, Theme } from "@mui/material/styles";
import { useWallet } from "@/wallet/WalletContext";

export default function ConnectAlert({
  message = "Please connect your wallet to continue.",
  sx,
}: {
  message?: string;
  sx?: SxProps<Theme>;
}) {
  const { isConnected } = useWallet();
  if (isConnected) return null;
  return (
    <Alert severity="info" sx={{ mt: 2, mb: 2, ...(sx as object) }}>
      {message}
    </Alert>
  );
}
