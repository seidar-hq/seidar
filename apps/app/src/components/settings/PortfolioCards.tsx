"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { WalletAvatar, glassMenuPaperSx } from "@/components/wallet/WalletParts";
import { formatUsd, formatUsdCompact } from "@/lib/format";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { useWallet, type LinkedWallet, type Portfolio } from "@/wallet/WalletContext";
import { DeletePortfolioDialog, PortfolioNameDialog } from "./PortfolioDialogs";

export const CardGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: "1rem",
  // Fixed-width cards (no stretching across wide screens).
  gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 15rem))",
  [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" },
}));

export const CountChip = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.75rem",
  height: "1.75rem",
  padding: "0 0.5rem",
  borderRadius: "1rem",
  border: `0.0625rem solid ${theme.palette.border.main600}`,
}));

const Card = styled(Box, { shouldForwardProp: (p) => p !== "isActive" })<{ isActive?: boolean }>(({ theme, isActive }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  minHeight: "17rem",
  padding: "0.875rem",
  borderRadius: "1rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  border: `0.0625rem solid ${isActive ? theme.palette.primary.main : "transparent"}`,
  boxShadow: isActive ? `0 0 0 0.0625rem ${theme.palette.overlay.primary12}` : "none",
}));

const StatusPill = styled(Box, { shouldForwardProp: (p) => p !== "isActive" })<{ isActive?: boolean }>(({ theme, isActive }) => ({
  display: "inline-flex",
  alignItems: "center",
  height: "1.5rem",
  padding: "0 0.75rem",
  borderRadius: "999rem",
  fontSize: "0.75rem",
  color: isActive ? theme.palette.green.main : theme.palette.common.black,
  backgroundColor: isActive ? theme.palette.overlay.success10 : theme.palette.overlay.white10,
}));

const Inset = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  borderRadius: "0.75rem",
  backgroundColor: theme.palette.overlay.white04,
  padding: "0.625rem 0.625rem",
  "& > div + div": { borderLeft: `0.0625rem solid ${theme.palette.overlay.white08}`, paddingLeft: "0.75rem" },
}));

const AddCard = styled(ButtonBase)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.875rem",
  minHeight: "17rem",
  borderRadius: "1rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  transition: "background-color 150ms ease-in-out",
  "&:hover": { backgroundColor: theme.palette.border.main1000 },
}));

export const AddCircle = styled(Box)(({ theme }) => ({
  width: "3rem",
  height: "3rem",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.border.main1000,
  color: theme.palette.common.black,
}));

/** Up to three overlapping wallet logos for a portfolio. */
function WalletStack({ wallets }: { wallets: LinkedWallet[] }) {
  if (!wallets.length) return null;
  return (
    <Box sx={{ display: "flex" }}>
      {wallets.slice(0, 3).map((w, i) => (
        <Box key={w.address} sx={{ ml: i ? "-0.4rem" : 0 }}>
          <WalletAvatar walletId={w.walletId} peer={w.peer} size="1.125rem" />
        </Box>
      ))}
    </Box>
  );
}

function PortfolioCard({
  portfolio,
  active,
  onRename,
  onDelete,
}: {
  portfolio: Portfolio;
  active: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const { wallets, setActivePortfolio, portfolios } = useWallet();
  const data = usePortfolio(portfolio.wallets);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const members = portfolio.wallets.map((a) => wallets.find((w) => w.address === a)).filter((w): w is LinkedWallet => !!w);
  const total = data.totals.totalUsd;
  const utilised = data.totals.utilisedUsd;
  // Utilised = capital deployed in protocols, against everything held (wallet assets + deployed).
  const gross = data.totals.assetsUsd + utilised;
  const pct = gross > 0 ? Math.min(100, (utilised / gross) * 100) : 0;
  const positions = data.supplied.length + data.borrowed.length + data.vaults.length;
  const loading = portfolio.wallets.length > 0 && data.assetsLoading;

  return (
    <Card isActive={active}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <StatusPill isActive={active}>{active ? "Active" : "Inactive"}</StatusPill>
        <IconButton size="small" aria-label="Portfolio actions" onClick={(e) => setAnchor(e.currentTarget)} sx={{ width: "1.75rem", height: "1.75rem" }}>
          <MoreVertIcon fontSize="small" sx={{ color: active ? "common.black" : "primary.main" }} />
        </IconButton>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
        <Typography variant="body2" color="common.black" noWrap sx={{ fontSize: "0.9375rem" }}>
          {portfolio.name}
        </Typography>
        <Typography variant="h1" color="common.black" noWrap sx={{ fontSize: "1.375rem" }}>
          {loading ? "—" : formatUsd(total)}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <Box sx={{ height: "0.3rem", borderRadius: "999rem", backgroundColor: "overlay.white10", overflow: "hidden" }}>
          <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: "999rem", backgroundColor: "primary.main", transition: "width 300ms ease" }} />
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <Typography variant="subtitle1" color="grey.200" noWrap sx={{ fontSize: "0.75rem" }}>
            {formatUsdCompact(utilised)} utilised
          </Typography>
          <Typography variant="subtitle1" color="grey.200" noWrap sx={{ fontSize: "0.75rem" }}>
            {pct.toFixed(0)}% of {formatUsdCompact(gross)}
          </Typography>
        </Box>
      </Box>
      <Inset>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <Typography variant="subtitle1" color="grey.200" sx={{ fontSize: "0.75rem" }}>
            Wallets
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <WalletStack wallets={members} />
            <Typography variant="body3" color="common.black">
              {members.length}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <Typography variant="subtitle1" color="grey.200" sx={{ fontSize: "0.75rem" }}>
            Positions
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Box sx={{ width: "0.4rem", height: "0.4rem", borderRadius: "50%", backgroundColor: positions ? "green.main" : "grey.200" }} />
            <Typography variant="body3" color="common.black">
              {data.positionsLoading && portfolio.wallets.length ? "—" : positions}
            </Typography>
          </Box>
        </Box>
      </Inset>
      <ButtonBase
        onClick={() => !active && setActivePortfolio(portfolio.id)}
        sx={{
          mt: "auto",
          height: "2.25rem",
          borderRadius: "999rem",
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          color: "common.white",
          backgroundColor: active ? theme.palette.green.main : theme.palette.overlay.white10,
          cursor: active ? "default" : "pointer",
          "&:hover": { backgroundColor: active ? theme.palette.green.main : theme.palette.overlay.white20 },
        }}
      >
        {active ? "Active Portfolio" : "Set as Active"}
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { elevation: 0, sx: glassMenuPaperSx(theme, "13rem") },
          list: { sx: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" } },
        }}
      >
        <MenuItem onClick={() => (setAnchor(null), onRename())} sx={{ gap: "0.625rem", borderRadius: "0.5rem" }}>
          <EditOutlinedIcon sx={{ fontSize: "1.125rem", color: "sidebar.subText" }} />
          <Typography variant="subtitle1" color="sidebar.subText">
            Rename
          </Typography>
        </MenuItem>
        <MenuItem
          disabled={portfolios.length <= 1}
          onClick={() => (setAnchor(null), onDelete())}
          sx={{ gap: "0.625rem", borderRadius: "0.5rem" }}
        >
          <DeleteOutlineRoundedIcon sx={{ fontSize: "1.125rem", color: "error.main" }} />
          <Typography variant="subtitle1" color="error.main">
            Delete
          </Typography>
        </MenuItem>
      </Menu>
    </Card>
  );
}

/** Settings → Portfolios: one card per portfolio plus "Add Portfolio". */
export default function PortfolioCards() {
  const { portfolios, activePortfolio } = useWallet();
  const [naming, setNaming] = useState<{ id: string | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Typography variant="body4" color="common.black" sx={{ fontSize: "1.25rem" }}>
          Portfolios
        </Typography>
        <CountChip>
          <Typography variant="caption" color="common.black">
            {portfolios.length}
          </Typography>
        </CountChip>
      </Box>
      <CardGrid>
        {portfolios.map((p) => (
          <PortfolioCard
            key={p.id}
            portfolio={p}
            active={p.id === activePortfolio?.id}
            onRename={() => setNaming({ id: p.id })}
            onDelete={() => setDeleting(p.id)}
          />
        ))}
        <AddCard onClick={() => setNaming({ id: null })}>
          <AddCircle>
            <AddIcon />
          </AddCircle>
          <Typography variant="subtitle2" color="common.black" sx={{ fontSize: "0.9375rem" }}>
            Add Portfolio
          </Typography>
        </AddCard>
      </CardGrid>
      <PortfolioNameDialog open={!!naming} id={naming?.id ?? null} onClose={() => setNaming(null)} />
      <DeletePortfolioDialog id={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
