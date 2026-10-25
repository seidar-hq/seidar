"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { GlassPaper, DialogCloseButton } from "@/components/common/GlassDialog";
import { useAlerts } from "@/components/common/Alerts";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { walletMeta } from "@/lib/wallets";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import { EXPLORER_ACCOUNT, StellarLogo, WalletAvatar } from "./WalletParts";

const ActionRow = styled(ButtonBase)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "0.75rem",
  width: "100%",
  padding: "0.875rem 1rem",
  borderRadius: "0.75rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  color: theme.palette.common.black,
  transition: "background-color 0.15s ease",
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
}));

const AddressButton = styled(ButtonBase)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "999rem",
  color: theme.palette.common.black,
  "&:hover": { backgroundColor: theme.palette.overlay.white08 },
}));

const NetworkPill = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  padding: "0.25rem 0.625rem 0.25rem 0.25rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.overlay.white08,
}));

/** Active account overview. The caret under the address opens the wallets list. */
export default function AccountModal({
  open,
  onClose,
  onOpenWallets,
}: {
  open: boolean;
  onClose: () => void;
  onOpenWallets: () => void;
}) {
  const { activeWallet, disconnect } = useWallet();
  const { successAlert } = useAlerts();
  const { byAddress } = useBalances(open && activeWallet ? [activeWallet.address] : []);
  if (!activeWallet) return null;

  const bal = byAddress[activeWallet.address];
  const xlm = bal?.tokens.find((t) => t.code === "XLM" && !t.issuer);
  const actions: { label: string; Icon: SvgIconComponent; onClick: () => void }[] = [
    {
      label: "Copy address",
      Icon: ContentCopyOutlinedIcon,
      onClick: () =>
        void navigator.clipboard?.writeText(activeWallet.address).then(() => successAlert({ message: "Copied to clipboard" })),
    },
    {
      label: "View on Stellar Expert",
      Icon: OpenInNewRoundedIcon,
      onClick: () => window.open(EXPLORER_ACCOUNT(activeWallet.address), "_blank", "noopener"),
    },
    {
      label: "Disconnect",
      Icon: LogoutRoundedIcon,
      onClick: () => {
        disconnect(activeWallet.address);
        onClose();
      },
    },
  ];

  return (
    <GlassPaper
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && onClose()}
      maxWidth={false}
      PaperProps={{ sx: { maxWidth: "23.75rem", alignItems: "center", gap: "1.25rem" } }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <NetworkPill>
          <StellarLogo size="1.25rem" />
          <Typography variant="subtitle3" color="common.black">
            Stellar
          </Typography>
        </NetworkPill>
        <DialogCloseButton onClick={onClose} aria-label="Close">
          <CloseRoundedIcon />
        </DialogCloseButton>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
        <WalletAvatar walletId={activeWallet.walletId} size="4.5rem" status="active" />
        <AddressButton onClick={onOpenWallets} aria-label="Show all wallets">
          <Typography variant="body2" color="common.black">
            {activeWallet.name || shortAddress(activeWallet.address)}
          </Typography>
          <KeyboardArrowDownRoundedIcon sx={{ fontSize: "1.25rem", color: "grey.200" }} />
        </AddressButton>
        <Typography variant="subtitle3" color="grey.200">
          {walletMeta(activeWallet.walletId)?.name} · {shortAddress(activeWallet.address, 6, 6)}
        </Typography>
        <Typography variant="h5" color="common.black" sx={{ mt: "0.25rem" }}>
          {bal && !bal.loading ? formatUsd(bal.usd) : "—"}
        </Typography>
        <Typography variant="subtitle3" color="grey.200">
          {xlm ? `${formatAmount(xlm.amount, 4)} XLM` : bal?.loading ? "Loading balance…" : "0 XLM"}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
        {actions.map(({ label, Icon, onClick }) => (
          <ActionRow key={label} onClick={onClick}>
            <Icon sx={{ fontSize: "1.25rem", color: label === "Disconnect" ? "red.main" : "grey.200" }} />
            <Typography variant="subtitle1" color="common.black">
              {label}
            </Typography>
          </ActionRow>
        ))}
      </Box>
    </GlassPaper>
  );
}
