"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { formatUsd, shortAddress } from "@/lib/format";
import { useBalances } from "@/wallet/useBalances";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { WalletAvatar, glassMenuPaperSx } from "./WalletParts";

/** Heading-sized dropdown: "All Portfolios" or one linked wallet. The dashboard follows the selection. */
export default function PortfolioSelect() {
  const theme = useTheme();
  const { wallets, portfolio, setPortfolio } = useWallet();
  const { byAddress, totalUsd } = useBalances(wallets.map((w) => w.address));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const selected = wallets.find((w) => w.address === portfolio);

  const choose = (p: string) => {
    setPortfolio(p);
    setAnchor(null);
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ gap: "0.25rem", borderRadius: "0.5rem", px: "0.25rem", "&:hover": { backgroundColor: "overlay.white04" } }}
      >
        <Typography variant="h6" color="common.black">
          {selected ? walletLabel(selected) : "All Portfolios"}
        </Typography>
        <KeyboardArrowDownRoundedIcon
          sx={{ fontSize: "1.25rem", color: "grey.200", transition: "transform 0.2s", transform: anchor ? "rotate(180deg)" : "none" }}
        />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{
          paper: { elevation: 0, sx: glassMenuPaperSx(theme, "18rem") },
          list: { sx: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" } },
        }}
      >
        <MenuItem onClick={() => choose("all")} sx={{ gap: "0.75rem", borderRadius: "0.5rem", py: "0.625rem" }}>
          <Box
            sx={{
              width: "2rem",
              height: "2rem",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "overlay.white08",
            }}
          >
            <LayersOutlinedIcon sx={{ fontSize: "1.125rem", color: "common.black" }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" color="common.black">
              All Portfolios
            </Typography>
            <Typography variant="subtitle3" color="grey.200">
              {wallets.length} wallet{wallets.length === 1 ? "" : "s"} · {formatUsd(totalUsd)}
            </Typography>
          </Box>
          {portfolio === "all" && <CheckRoundedIcon sx={{ fontSize: "1.125rem", color: "primary.main" }} />}
        </MenuItem>
        {wallets.map((w) => (
          <MenuItem key={w.address} onClick={() => choose(w.address)} sx={{ gap: "0.75rem", borderRadius: "0.5rem", py: "0.625rem" }}>
            <WalletAvatar walletId={w.walletId} size="2rem" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" color="common.black" noWrap>
                {walletLabel(w)}
              </Typography>
              <Typography variant="subtitle3" color="grey.200">
                {shortAddress(w.address)} · {formatUsd(byAddress[w.address]?.usd)}
              </Typography>
            </Box>
            {portfolio === w.address && <CheckRoundedIcon sx={{ fontSize: "1.125rem", color: "primary.main" }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
