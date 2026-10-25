"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import GlassDialog from "@/components/common/GlassDialog";
import { useAlerts } from "@/components/common/Alerts";
import { shortAddress } from "@/lib/format";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { CopyButton, InsetRow, WalletAvatar } from "./WalletParts";

const NAME_MAX = 32;

export function RemoveWalletDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const { wallets, disconnect } = useWallet();
  const { successAlert } = useAlerts();
  const wallet = wallets.find((w) => w.address === address);
  return (
    <GlassDialog
      open={!!wallet}
      onClose={onClose}
      title="Remove Wallet"
      subtitle="This wallet will be unlinked from Seidar. You can always add it back later."
      primaryLabel="Remove Wallet"
      onPrimary={() => {
        if (!wallet) return;
        disconnect(wallet.address);
        successAlert({ message: "Wallet removed" });
        onClose();
      }}
    >
      {wallet && (
        <>
          <InsetRow>
            <WalletAvatar walletId={wallet.walletId} size="2.25rem" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body3" color="common.black">
                {walletLabel(wallet)}
              </Typography>
              <Typography variant="subtitle3" color="grey.200">
                {shortAddress(wallet.address, 6, 6)}
              </Typography>
            </Box>
          </InsetRow>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <InfoOutlinedIcon sx={{ fontSize: "1.125rem", color: "primary.main" }} />
            <Typography variant="body3">Removing a wallet does not move any assets. Your funds stay in your wallet.</Typography>
          </Box>
        </>
      )}
    </GlassDialog>
  );
}

export function RenameWalletDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const { wallets, renameWallet } = useWallet();
  const { successAlert } = useAlerts();
  const wallet = wallets.find((w) => w.address === address);
  const [name, setName] = useState("");

  useEffect(() => {
    if (wallet) setName(wallet.name);
  }, [wallet]);

  const trimmed = name.trim();
  return (
    <GlassDialog
      open={!!wallet}
      onClose={onClose}
      title="Set Wallet Name"
      primaryLabel="Save"
      primaryDisabled={!wallet || trimmed === wallet.name || trimmed.length > NAME_MAX}
      onPrimary={() => {
        if (!wallet) return;
        renameWallet(wallet.address, trimmed);
        successAlert({ message: "Wallet name updated" });
        onClose();
      }}
    >
      {wallet && (
        <>
          <InsetRow sx={{ flexDirection: "column", alignItems: "stretch", gap: "0.375rem", px: "1rem" }}>
            <Typography variant="subtitle3" color="grey.200">
              Wallet Name
            </Typography>
            <InputBase
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && trimmed !== wallet.name) {
                  renameWallet(wallet.address, trimmed);
                  onClose();
                }
              }}
              placeholder="Enter wallet name"
              inputProps={{ maxLength: NAME_MAX }}
              sx={{ fontSize: "1rem", fontWeight: 500, color: "common.black", "& input": { p: 0 } }}
            />
          </InsetRow>
          <InsetRow sx={{ flexDirection: "column", alignItems: "stretch", gap: "0.375rem", px: "1rem" }}>
            <Typography variant="subtitle3" color="grey.200">
              Wallet Address
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Typography variant="body3" color="primary.main">
                {shortAddress(wallet.address, 8, 8)}
              </Typography>
              <CopyButton text={wallet.address} />
            </Box>
          </InsetRow>
        </>
      )}
    </GlassDialog>
  );
}
