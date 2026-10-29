"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { styled, type Theme } from "@mui/material/styles";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { useAlerts } from "@/components/common/Alerts";
import { STELLAR_LOGO, displayMeta, walletMeta, type WalletKind, type WalletPeer } from "@/lib/wallets";

export const EXPLORER_ACCOUNT = (address: string) => `https://stellar.expert/explorer/public/account/${address}`;

const AvatarRoot = styled(Box)({ position: "relative", flexShrink: 0, display: "inline-flex" });

const AvatarCircle = styled(Box)(({ theme }) => ({
  borderRadius: "50%",
  overflow: "hidden",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.sidebar.black,
}));

const StatusDot = styled(Box, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(
  ({ theme, active }) => ({
    position: "absolute",
    right: "-0.125rem",
    bottom: "-0.125rem",
    borderRadius: "50%",
    backgroundColor: active ? theme.palette.green.main : theme.palette.grey[200],
    border: `0.125rem solid ${theme.palette.sidebar.black}`,
  }),
);

/** Wallet logo in a dark circle, with an optional active/inactive dot. */
export function WalletAvatar({
  walletId,
  peer,
  size = "2rem",
  status,
}: {
  walletId: WalletKind | null | undefined;
  /** Over WalletConnect: the wallet app that answered, whose logo is shown. */
  peer?: WalletPeer;
  size?: string;
  status?: "active" | "inactive";
}) {
  const meta = displayMeta(walletId, peer);
  const fallback = walletMeta(walletId)?.logo ?? "/assets/defaultWallet.svg";
  return (
    <AvatarRoot sx={{ width: size, height: size }}>
      <AvatarCircle sx={{ width: size, height: size, backgroundColor: meta?.bg ?? "sidebar.black" }}>
        <Box
          component="img"
          src={meta?.logo ?? "/assets/defaultWallet.svg"}
          alt={meta?.name ?? "Wallet"}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (!img.src.endsWith(fallback)) img.src = fallback;
          }}
          sx={meta?.bleed ? { width: "100%", height: "100%", objectFit: "cover" } : { width: "66%", height: "66%", objectFit: "contain" }}
        />
      </AvatarCircle>
      {status && (
        <StatusDot
          active={status === "active"}
          sx={{ width: `max(0.625rem, calc(${size} * 0.28))`, height: `max(0.625rem, calc(${size} * 0.28))` }}
        />
      )}
    </AvatarRoot>
  );
}

export const StellarLogo = ({ size = "1.25rem" }: { size?: string }) => (
  <Box component="img" src={STELLAR_LOGO} alt="Stellar" sx={{ width: size, height: size, borderRadius: "50%" }} />
);

export function CopyButton({ text, size = "1rem", label = "Copy address" }: { text: string; size?: string; label?: string }) {
  const { successAlert } = useAlerts();
  return (
    <Tooltip title={label} arrow placement="top">
      <IconButton
        size="small"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(text).then(() => successAlert({ message: "Copied to clipboard" }));
        }}
        sx={{ p: 0.25, color: "primary.main" }}
      >
        <ContentCopyOutlinedIcon sx={{ fontSize: size }} />
      </IconButton>
    </Tooltip>
  );
}

/** Glass dropdown paper shared by the header menus. */
export const glassMenuPaperSx = (theme: Theme, minWidth: string) => ({
  mt: "0.5rem",
  minWidth,
  backgroundColor: theme.palette.overlay.white08,
  backgroundImage: "none",
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  borderRadius: "1.25rem",
  backdropFilter: "blur(2.6875rem)",
  WebkitBackdropFilter: "blur(2.6875rem)",
  boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
});

export const InsetRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.75rem",
  borderRadius: "0.75rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  borderTop: `0.0625rem solid ${theme.palette.border.main700}`,
  borderBottom: `0.0625rem solid ${theme.palette.border.main700}`,
}));
