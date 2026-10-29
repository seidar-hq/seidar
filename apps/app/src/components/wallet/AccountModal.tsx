"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import { DialogCloseButton, GlassPaper, MODAL } from "@/components/common/GlassDialog";
import { shortAddress } from "@/lib/format";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import { StellarLogo, WalletAvatar } from "./WalletParts";

/** Deterministic pastel orb for an address (same address, same colours). */
function orbGradient(address: string) {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `radial-gradient(circle at 66% 30%, #FFFFFF 0%, hsl(${hue}, 62%, 82%) 22%, hsl(${hue}, 52%, 64%) 62%, hsl(${hue}, 48%, 56%) 100%)`;
}

const AddressButton = styled(ButtonBase)({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "999rem",
  "&:hover": { backgroundColor: MODAL.inset },
});

const DisconnectRow = styled(ButtonBase)({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "0.875rem",
  width: "100%",
  padding: "0.25rem",
  borderRadius: "999rem",
  "&:hover": { backgroundColor: MODAL.inset },
});

/** Active account overview. The caret beside the address opens the wallets list. */
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
  const { byAddress } = useBalances(open && activeWallet ? [activeWallet.address] : []);
  if (!activeWallet) return null;

  const bal = byAddress[activeWallet.address];
  const xlm = bal?.tokens.find((t) => t.code === "XLM" && !t.issuer)?.amount ?? 0;
  const [whole, frac] = xlm.toFixed(3).split(".");

  return (
    <GlassPaper
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && onClose()}
      maxWidth={false}
      PaperProps={{ sx: { maxWidth: "22.5rem", alignItems: "center", gap: "1.25rem", pb: "1.5rem" } }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <Tooltip title="Stellar Mainnet" arrow placement="top">
          <Box sx={{ display: "inline-flex", p: "0.25rem" }}>
            <StellarLogo size="2rem" />
          </Box>
        </Tooltip>
        <DialogCloseButton onClick={onClose} aria-label="Close">
          <CloseRoundedIcon />
        </DialogCloseButton>
      </Box>

      <Box sx={{ width: "6rem", height: "6rem", borderRadius: "50%", background: orbGradient(activeWallet.address) }} />

      <Tooltip title="All wallets" arrow placement="top">
        <AddressButton onClick={onOpenWallets} aria-label="Show all wallets">
          <WalletAvatar walletId={activeWallet.walletId} peer={activeWallet.peer} size="1.75rem" status="active" />
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 500, color: "#E3E3E3" }}>
            {activeWallet.name || shortAddress(activeWallet.address, 4, 6)}
          </Typography>
          <KeyboardArrowDownRoundedIcon sx={{ fontSize: "1.25rem", color: MODAL.muted }} />
        </AddressButton>
      </Tooltip>

      {!bal || bal.loading ? (
        <Skeleton variant="rounded" width="9rem" height="3rem" />
      ) : (
        <Box sx={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
          <Typography component="span" sx={{ fontSize: "3rem", fontWeight: 500, lineHeight: 1, color: "#E3E3E3" }}>
            {Number(whole).toLocaleString("en-US")}
            <Box component="span" sx={{ color: MODAL.muted }}>
              .{frac}
            </Box>
          </Typography>
          <Typography component="span" sx={{ fontSize: "1.75rem", fontWeight: 500, color: "#E3E3E3" }}>
            XLM
          </Typography>
        </Box>
      )}

      <DisconnectRow
        onClick={() => {
          disconnect(activeWallet.address);
          onClose();
        }}
      >
        <Box
          sx={{
            width: "3.75rem",
            height: "3.75rem",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: MODAL.dangerBg,
          }}
        >
          <PowerSettingsNewRoundedIcon sx={{ color: MODAL.danger, fontSize: "1.5rem" }} />
        </Box>
        <Typography sx={{ fontSize: "1.25rem", fontWeight: 500, color: "#E3E3E3" }}>Disconnect</Typography>
      </DisconnectRow>
    </GlassPaper>
  );
}
