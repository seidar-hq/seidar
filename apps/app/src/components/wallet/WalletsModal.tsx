"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import GlassDialog from "@/components/common/GlassDialog";
import { formatUsd, shortAddress } from "@/lib/format";
import { WATCH_ENABLED, isStellarAddress } from "@/lib/wallets";
import { useBalances } from "@/wallet/useBalances";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { StellarLogo, WalletAvatar } from "./WalletParts";

const Row = styled(Box, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(({ theme, active }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.75rem",
  borderRadius: "0.75rem",
  backgroundColor: active ? theme.palette.surfaceBg.pill : theme.palette.surfaceBg.softInset,
  border: `0.0625rem solid ${active ? theme.palette.primary.main : "transparent"}`,
  cursor: active ? "default" : "pointer",
  transition: "background-color 0.15s ease",
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
}));

const NetworkChip = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.125rem 0.5rem 0.125rem 0.25rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.overlay.white08,
}));

/** Every linked wallet: switch the active one, disconnect one or all, or add another. */
export default function WalletsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, address, switchWallet, disconnect, disconnectAll, openConnectModal, watchAddress } = useWallet();
  const [watchInput, setWatchInput] = useState("");
  const { byAddress } = useBalances(open ? wallets.map((w) => w.address) : []);

  return (
    <GlassDialog
      open={open}
      onClose={onClose}
      title="Wallets"
      subtitle="Stellar wallets linked to Seidar. Pick one to make it the active signer."
      actions={
        <Box sx={{ display: "flex", gap: "0.5rem", width: "100%" }}>
          <Button
            variant="outlined"
            color="cancel"
            size="small"
            disabled={wallets.length === 0}
            onClick={() => {
              disconnectAll();
              onClose();
            }}
            sx={{ flex: 1 }}
          >
            Disconnect all
          </Button>
          <Button
            variant="solid"
            color="connect"
            size="small"
            startIcon={<AddRoundedIcon />}
            onClick={() => {
              // Close first: the MUI focus trap would otherwise block the kit's own picker.
              onClose();
              void openConnectModal();
            }}
            sx={{ flex: 1 }}
          >
            Add wallet
          </Button>
        </Box>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {wallets.map((w) => {
          const active = w.address === address;
          const bal = byAddress[w.address];
          return (
            <Row key={w.address} active={active} onClick={() => !active && switchWallet(w.address)}>
              <WalletAvatar walletId={w.walletId} size="2.5rem" status={active ? "active" : "inactive"} />
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <Typography variant="body3" color="common.black" noWrap>
                  {walletLabel(w)}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Typography variant="subtitle3" color="grey.200">
                    {shortAddress(w.address, 6, 6)}
                  </Typography>
                  <NetworkChip>
                    <StellarLogo size="0.875rem" />
                    <Typography variant="caption" color="common.black">
                      Stellar
                    </Typography>
                  </NetworkChip>
                </Box>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                <Typography variant="subtitle1" color="common.black">
                  {bal && !bal.loading ? formatUsd(bal.usd) : "—"}
                </Typography>
                <Typography variant="caption" color={active ? "green.main" : "primary.main"}>
                  {active ? "Active" : "Switch"}
                </Typography>
              </Box>
              <Tooltip title="Disconnect" arrow placement="top">
                <IconButton
                  size="small"
                  aria-label="Disconnect wallet"
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnect(w.address);
                    if (wallets.length === 1) onClose();
                  }}
                  sx={{ color: "grey.200", "&:hover": { color: "red.main" } }}
                >
                  <LinkOffRoundedIcon sx={{ fontSize: "1.125rem" }} />
                </IconButton>
              </Tooltip>
            </Row>
          );
        })}
        {WATCH_ENABLED && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              p: "0.5rem 0.5rem 0.5rem 0.875rem",
              borderRadius: "0.75rem",
              border: (t) => `0.0625rem dashed ${t.palette.border.main700}`,
            }}
          >
            <InputBase
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value.trim())}
              placeholder="Watch a mainnet address (G…) for testing"
              sx={{ flex: 1, fontSize: "0.8125rem", color: "common.black" }}
            />
            <Button
              size="small"
              variant="outlined"
              color="cancel"
              disabled={!isStellarAddress(watchInput)}
              onClick={() => watchAddress(watchInput) && setWatchInput("")}
            >
              Watch
            </Button>
          </Box>
        )}
        {wallets.length === 0 && (
          <Typography variant="body3" sx={{ textAlign: "center", py: "1rem" }}>
            No wallets linked yet.
          </Typography>
        )}
      </Box>
    </GlassDialog>
  );
}
