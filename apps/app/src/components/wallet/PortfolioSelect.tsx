"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { useWallet } from "@/wallet/WalletContext";
import { glassMenuPaperSx } from "./WalletParts";

/** Heading-sized dropdown naming the active portfolio; switches between portfolios (never wallets). */
export default function PortfolioSelect() {
  const theme = useTheme();
  const router = useRouter();
  const { portfolios, activePortfolio, setActivePortfolio, setPortfolio } = useWallet();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const choose = (id: string) => {
    setActivePortfolio(id);
    setPortfolio("all");
    setAnchor(null);
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ gap: "0.25rem", borderRadius: "0.5rem", px: "0.25rem", "&:hover": { backgroundColor: "overlay.white04" } }}
      >
        <Typography variant="h6" color="common.black">
          {activePortfolio?.name ?? "My Portfolio"}
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
          paper: { elevation: 0, sx: glassMenuPaperSx(theme, "16rem") },
          list: { sx: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" } },
        }}
      >
        {portfolios.map((p) => {
          const selected = p.id === activePortfolio?.id;
          return (
            <MenuItem
              key={p.id}
              onClick={() => choose(p.id)}
              sx={{ justifyContent: "space-between", gap: "0.75rem", borderRadius: "0.75rem", height: "3.25rem", backgroundColor: selected ? "overlay.white08" : undefined }}
            >
              <Typography variant="subtitle1" color="common.black" noWrap sx={{ fontSize: "1rem" }}>
                {p.name}
              </Typography>
              {selected ? (
                <Box sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%", backgroundColor: "sidebar.purple100", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CheckRoundedIcon sx={{ fontSize: "0.875rem", color: "common.white" }} />
                </Box>
              ) : (
                <Box sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%", backgroundColor: "overlay.white20", flexShrink: 0 }} />
              )}
            </MenuItem>
          );
        })}
        <Box sx={{ borderTop: `0.0625rem solid ${theme.palette.overlay.white08}`, my: "0.25rem" }} />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            router.push("/settings");
          }}
          sx={{ gap: "0.75rem", borderRadius: "0.75rem", height: "3.25rem" }}
        >
          <Box sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", backgroundColor: "overlay.white08", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SettingsOutlinedIcon sx={{ fontSize: "1.125rem", color: "sidebar.heading" }} />
          </Box>
          <Typography variant="subtitle1" color="sidebar.heading" sx={{ fontSize: "1rem" }}>
            Manage Portfolios
          </Typography>
        </MenuItem>
      </Menu>
    </>
  );
}
