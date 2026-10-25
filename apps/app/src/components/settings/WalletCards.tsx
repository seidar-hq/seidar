"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled, useTheme, type Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import Tabs from "@/components/common/Tabs";
import { RemoveWalletDialog, RenameWalletDialog } from "@/components/wallet/WalletDialogs";
import { CopyButton, WalletAvatar, glassMenuPaperSx } from "@/components/wallet/WalletParts";
import { formatUsd, shortAddress } from "@/lib/format";
import { walletMeta } from "@/lib/wallets";
import { useBalances } from "@/wallet/useBalances";
import { useWallet, type LinkedWallet } from "@/wallet/WalletContext";
import { MoveWalletDialog } from "./PortfolioDialogs";

const Card = styled(Box, { shouldForwardProp: (p) => p !== "isActive" })<{ isActive?: boolean }>(({ theme, isActive }) => {
  const inset = theme.palette.surfaceBg.softInset;
  return {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: "22rem",
    padding: "1rem",
    borderRadius: "1rem",
    border: `0.0625rem solid ${theme.palette.mode === "dark" ? "transparent" : theme.palette.border.row}`,
    gap: "1rem",
    background: isActive ? `linear-gradient(180deg, ${theme.palette.overlay.success10} 0%, transparent 100%), ${inset}` : inset,
  };
});

const SpaceRow = styled(Box)({ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" });

const pill = (theme: Theme) => {
  const dark = theme.palette.mode === "dark";
  return {
    backgroundColor: dark ? theme.palette.overlay.white10 : theme.palette.surfaceBg.pill,
    border: `0.0625rem solid ${dark ? theme.palette.overlay.white10 : theme.palette.border.chipOutline}`,
  };
};

const NamePill = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "2.25rem",
  padding: "0 1rem",
  borderRadius: "3.125rem",
  ...pill(theme),
}));

const AddressPill = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.75rem 1.25rem",
  marginTop: "auto",
  borderRadius: "3.125rem",
  ...pill(theme),
}));

const Field = styled(Box)({ display: "flex", flexDirection: "column", gap: "0.25rem" });

const ActionItem = styled(MenuItem)({
  gap: "0.5rem",
  padding: 0,
  minHeight: 0,
  alignItems: "flex-start",
  "&:hover": { backgroundColor: "transparent" },
});

const ActionDivider = styled(Box)(({ theme }) => ({ marginTop: "1rem", borderTop: `0.0625rem dashed ${theme.palette.overlay.white20}` }));

const AddCard = styled(ButtonBase)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: "22rem",
  padding: "1rem",
  borderRadius: "1rem",
  border: `0.0625rem solid ${theme.palette.mode === "dark" ? "transparent" : theme.palette.border.row}`,
  backgroundColor: theme.palette.surfaceBg.softInset,
  gap: "1rem",
  transition: "background-color 150ms ease-in-out",
  "&:hover": { backgroundColor: theme.palette.border.main1000 },
}));

const AddCircle = styled(Box)(({ theme }) => ({
  width: "3.75rem",
  height: "3.75rem",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.border.main1000,
  color: theme.palette.common.black,
}));

const Grid = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  [theme.breakpoints.down("xl")]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" },
}));

const CountChip = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.625rem",
  height: "1.625rem",
  padding: "0 0.5rem",
  borderRadius: "1rem",
  border: `0.0625rem solid ${theme.palette.border.main600}`,
}));

function WalletCard({
  wallet,
  active,
  portfolioName,
  usd,
  loading,
  onSwitch,
  onMove,
  onRemove,
  onRename,
}: {
  wallet: LinkedWallet;
  active: boolean;
  portfolioName: string;
  usd: number;
  loading: boolean;
  onSwitch: () => void;
  onMove: () => void;
  onRemove: () => void;
  onRename: () => void;
}) {
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const meta = walletMeta(wallet.walletId);
  const close = () => setAnchor(null);
  const actions = [
    { key: "switch", title: "Switch", subtitle: "Make this wallet active.", Icon: SwapHorizIcon, onClick: onSwitch, disabled: active },
    { key: "move", title: "Move", subtitle: "Put it in another portfolio.", Icon: DriveFileMoveOutlinedIcon, onClick: onMove, disabled: false },
    { key: "remove", title: "Remove", subtitle: "Disconnect this wallet.", Icon: DeleteOutlineRoundedIcon, onClick: onRemove, disabled: false },
    { key: "rename", title: "Rename", subtitle: "Change the display name.", Icon: EditOutlinedIcon, onClick: onRename, disabled: false },
  ];

  return (
    <Card isActive={active}>
      <SpaceRow>
        <NamePill>
          <Typography variant="body1" color="common.black">
            {meta?.name ?? "Wallet"}
          </Typography>
        </NamePill>
        <IconButton size="small" aria-label="Wallet actions" onClick={(e) => setAnchor(e.currentTarget)} sx={{ width: "1.5rem", height: "1.5rem", p: 0 }}>
          <MoreVertIcon fontSize="small" sx={{ color: "primary.main" }} />
        </IconButton>
      </SpaceRow>
      <WalletAvatar walletId={wallet.walletId} size="3.75rem" status={active ? "active" : "inactive"} />
      <Field>
        <Typography variant="subtitle1" color="grey.200">
          Wallet Name
        </Typography>
        <Typography variant="body2" color="common.black" noWrap>
          {wallet.name || meta?.name}
        </Typography>
        <Typography variant="caption" color="grey.200" noWrap>
          {portfolioName}
        </Typography>
      </Field>
      <Field>
        <Typography variant="subtitle1" color="grey.200">
          Balance
        </Typography>
        <Typography variant="h1" color="common.black" noWrap>
          {loading ? "—" : formatUsd(usd)}
        </Typography>
      </Field>
      <AddressPill>
        <Tooltip placement="top" arrow title={wallet.address}>
          <Typography variant="subtitle1" color="primary.main">
            {shortAddress(wallet.address, 6, 6)}
          </Typography>
        </Tooltip>
        <CopyButton text={wallet.address} size="1.25rem" />
      </AddressPill>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { elevation: 0, sx: glassMenuPaperSx(theme, "15rem") },
          list: { sx: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "1rem" } },
        }}
      >
        <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "sidebar.heading", px: "0.125rem" }}>
          Wallet Actions
        </Typography>
        {actions.map(({ key, title, subtitle, Icon, onClick, disabled }, i) => (
          <Box key={key}>
            <ActionItem
              disabled={disabled}
              onClick={() => {
                close();
                onClick();
              }}
            >
              <Icon sx={{ fontSize: "1.25rem", color: "sidebar.subText", mt: "0.125rem" }} />
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                <Typography variant="subtitle1" color="sidebar.subText">
                  {title}
                </Typography>
                <Typography variant="subtitle3" color="grey.200">
                  {subtitle}
                </Typography>
              </Box>
            </ActionItem>
            {i < actions.length - 1 && <ActionDivider />}
          </Box>
        ))}
      </Menu>
    </Card>
  );
}

/** Settings → wallets of the active portfolio (or every linked wallet), plus an "Add New Wallet" card. */
export default function WalletCards() {
  const { wallets, portfolioWallets, address, switchWallet, openConnectModal, portfolioOf, activePortfolio } = useWallet();
  const [scope, setScope] = useState<string>("active");
  const shown = scope === "active" ? portfolioWallets : wallets;
  const { byAddress } = useBalances(shown.map((w) => w.address));
  const [removing, setRemoving] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  return (
    <>
      <Box sx={{ alignSelf: "flex-start" }}>
        <Tabs
          tabs={[
            { id: "active", label: "Active portfolio" },
            { id: "all", label: "All wallets" },
          ]}
          activeTab={scope}
          setActiveTab={setScope}
          isPathProvided={false}
        />
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Typography variant="body4" color="common.black" sx={{ fontSize: "1.25rem" }}>
          {scope === "active" ? "Wallets in this portfolio" : "All wallets"}
        </Typography>
        <CountChip>
          <Typography variant="caption" color="common.black">
            {shown.length}
          </Typography>
        </CountChip>
      </Box>
      <Grid>
        {shown.map((w) => (
          <WalletCard
            key={w.address}
            wallet={w}
            active={w.address === address}
            portfolioName={portfolioOf(w.address)?.name ?? ""}
            usd={byAddress[w.address]?.usd ?? 0}
            loading={byAddress[w.address]?.loading ?? true}
            onSwitch={() => switchWallet(w.address)}
            onMove={() => setMoving(w.address)}
            onRemove={() => setRemoving(w.address)}
            onRename={() => setRenaming(w.address)}
          />
        ))}
        <AddCard onClick={() => void openConnectModal()}>
          <AddCircle>
            <AddIcon />
          </AddCircle>
          <Typography variant="subtitle2" color="common.black" sx={{ fontSize: "1rem" }}>
            Add New Wallet
          </Typography>
          <Typography variant="caption" color="grey.200">
            to {activePortfolio?.name ?? "this portfolio"}
          </Typography>
        </AddCard>
      </Grid>
      <RemoveWalletDialog address={removing} onClose={() => setRemoving(null)} />
      <RenameWalletDialog address={renaming} onClose={() => setRenaming(null)} />
      <MoveWalletDialog address={moving} onClose={() => setMoving(null)} />
    </>
  );
}
