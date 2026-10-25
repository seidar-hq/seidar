"use client";

import Button from "@mui/material/Button";
import { useWallet } from "@/wallet/WalletContext";

export default function ConnectWalletButton() {
  const { openConnectModal } = useWallet();

  return (
    <Button
      onClick={() => void openConnectModal()}
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
      Connect Wallet
    </Button>
  );
}
