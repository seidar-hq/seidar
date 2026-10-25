"use client";

import Button from "@mui/material/Button";
import { useWallet } from "@/wallet/WalletContext";

export default function ConnectWalletButton() {
  const { address, isConnected, openConnectModal } = useWallet();
  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <Button
      onClick={openConnectModal}
      variant="solid"
      fullWidth
      sx={{
        padding: "0.375rem 0.500rem 0.313rem 0.500rem",
        transition: "200ms ease",
        textTransform: "none",
        fontSize: "0.875rem",
        fontWeight: 500,
        width: "10.063rem",
        height: "3rem",
      }}
    >
      {isConnected ? short : "Connect Wallet"}
    </Button>
  );
}
