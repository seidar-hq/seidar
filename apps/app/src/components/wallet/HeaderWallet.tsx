"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled, useTheme, type Theme } from "@mui/material/styles";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ConnectWalletButton from "@/components/common/ConnectWalletButton";
import { formatUsd, shortAddress } from "@/lib/format";
import { walletMeta } from "@/lib/wallets";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import AccountModal from "./AccountModal";
import WalletsModal from "./WalletsModal";
import { CopyButton, StellarLogo, WalletAvatar, glassMenuPaperSx } from "./WalletParts";

const pillLine = (dark: boolean, t: Theme) => (dark ? t.palette.overlay.white08 : t.palette.border.main600);

// Network is fixed to Stellar mainnet: a static badge, not a selector.
const NetworkBadge = styled(Box)(({ theme }) => {
  const line = pillLine(theme.palette.mode === "dark", theme);
  return {
    width: "2.75rem",
    height: "2.75rem",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white08 : theme.palette.grey[800],
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
  };
});

const WalletPill = styled(ButtonBase)(({ theme }) => {
  const line = pillLine(theme.palette.mode === "dark", theme);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    height: "2.75rem",
    padding: "0 0.625rem 0 0.375rem",
    borderRadius: "999rem",
    backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white08 : theme.palette.grey[800],
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    "&:hover": { backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white20 : theme.palette.grey[300] },
  };
});

export default function HeaderWallet() {
  const theme = useTheme();
  const { activeWallet, disconnect, ready } = useWallet();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const { byAddress } = useBalances(activeWallet ? [activeWallet.address] : []);

  if (!ready) return <Skeleton variant="rounded" width="10rem" height="2.75rem" sx={{ borderRadius: "999rem" }} />;
  if (!activeWallet) return <ConnectWalletButton />;

  const bal = byAddress[activeWallet.address];
  const meta = walletMeta(activeWallet.walletId);

  return (
    <>
      <Tooltip title="Stellar Mainnet" arrow placement="bottom">
        <NetworkBadge>
          <StellarLogo size="1.5rem" />
        </NetworkBadge>
      </Tooltip>
      <WalletPill onClick={(e) => setAnchor(e.currentTarget)} aria-label="Wallet menu">
        <WalletAvatar walletId={activeWallet.walletId} size="2rem" status="active" />
        <Typography variant="subtitle1" color="common.black" sx={{ display: { xs: "none", md: "block" } }}>
          {shortAddress(activeWallet.address)}
        </Typography>
        <KeyboardArrowDownRoundedIcon
          sx={{
            fontSize: "1.125rem",
            color: "grey.200",
            transition: "transform 0.2s ease",
            transform: anchor ? "rotate(180deg)" : "none",
          }}
        />
      </WalletPill>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { elevation: 0, sx: glassMenuPaperSx(theme, "17.5rem") },
          list: { sx: { padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" } },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <WalletAvatar walletId={activeWallet.walletId} size="2.5rem" status="active" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Typography variant="subtitle1" color="common.black" noWrap>
                {shortAddress(activeWallet.address, 6, 6)}
              </Typography>
              <CopyButton text={activeWallet.address} size="0.875rem" />
            </Box>
            <Typography variant="subtitle3" color="grey.200">
              {activeWallet.name || meta?.name}
            </Typography>
          </Box>
          <Tooltip title="Account details" arrow placement="top">
            <IconButton
              aria-label="Account details"
              onClick={() => {
                setAnchor(null);
                setAccountOpen(true);
              }}
              sx={{ color: "common.black", backgroundColor: "overlay.white08", width: "2rem", height: "2rem" }}
            >
              <VisibilityOutlinedIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            p: "0.75rem",
            borderRadius: "0.75rem",
            backgroundColor: "surfaceBg.softInset",
          }}
        >
          <Typography variant="subtitle3" color="grey.200">
            Wallet balance
          </Typography>
          <Typography variant="h6" color="common.black">
            {bal && !bal.loading ? formatUsd(bal.usd) : "—"}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="cancel"
          size="small"
          startIcon={<LogoutRoundedIcon />}
          onClick={() => {
            setAnchor(null);
            disconnect(activeWallet.address);
          }}
        >
          Disconnect
        </Button>
      </Menu>

      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onOpenWallets={() => {
          setAccountOpen(false);
          setWalletsOpen(true);
        }}
      />
      <WalletsModal open={walletsOpen} onClose={() => setWalletsOpen(false)} />
    </>
  );
}
