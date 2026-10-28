"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Grow from "@mui/material/Grow";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { useWallet } from "@/wallet/WalletContext";

/** Selected marker: filled primary circle with a check (unselected rows show a grey dot). */
function CheckSelected() {
  return (
    <Box
      sx={{
        width: "1.25rem",
        height: "1.25rem",
        borderRadius: "50%",
        backgroundColor: "sidebar.purple100",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <CheckRoundedIcon sx={{ fontSize: "0.875rem", color: "common.white" }} />
    </Box>
  );
}

/** Header pill: the active portfolio, a list to switch portfolios, and "Manage Portfolios" (Settings). */
export default function HeaderPortfolio() {
  const theme = useTheme();
  const router = useRouter();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const { portfolios, activePortfolio, setActivePortfolio, isConnected, ready } = useWallet();
  const line = theme.palette.mode === "light" ? theme.palette.border.main600 : theme.palette.overlay.white08;

  if (!ready) return <Skeleton variant="rounded" width="9.25rem" height="2.75rem" sx={{ borderRadius: "3.125rem" }} />;

  // Portfolios only mean something once a wallet is linked (connected or watched).
  if (!isConnected || !activePortfolio) return null;

  return (
    <>
      <Button
        ref={anchor}
        variant="borderless"
        disableRipple
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "2.75rem",
          borderRadius: "3.125rem",
          backgroundColor: "surfaceBg.pill",
          borderTop: `0.0625rem solid ${line}`,
          borderBottom: `0.0625rem solid ${line}`,
          textTransform: "none",
          minWidth: { xs: "auto", sm: "9.25rem" },
          maxWidth: "13rem",
          padding: { xs: "0.5rem 0.75rem", sm: "0.5rem 1.25rem" },
          gap: "0.625rem",
          "&:hover": { backgroundColor: "overlay.white08", textDecoration: "none" },
        }}
      >
        <Typography variant="body1" noWrap sx={{ color: "sidebar.heading" }}>
          {activePortfolio.name}
        </Typography>
        <KeyboardArrowDown
          sx={{
            fontSize: "1.125rem",
            color: "sidebar.heading",
            flexShrink: 0,
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </Button>
      <Popper open={open} anchorEl={anchor.current} placement="bottom-end" transition sx={{ zIndex: theme.zIndex.modal + 1 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} style={{ transformOrigin: "right top" }}>
            <Paper
              sx={{
                mt: "0.5rem",
                backgroundColor: theme.palette.overlay.white08,
                backgroundImage: "none",
                border: `0.0625rem solid ${theme.palette.overlay.white08}`,
                borderRadius: "1.25rem",
                backdropFilter: "blur(2.6875rem)",
                WebkitBackdropFilter: "blur(2.6875rem)",
                boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
                width: "18rem",
                padding: "0.5rem",
              }}
            >
              <ClickAwayListener
                onClickAway={(e) => {
                  if (!anchor.current?.contains(e.target as Node)) setOpen(false);
                }}
              >
                <MenuList autoFocusItem={open} sx={{ padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {portfolios.map((p) => {
                    const selected = p.id === activePortfolio.id;
                    return (
                      <MenuItem
                        key={p.id}
                        selected={selected}
                        onClick={() => {
                          setActivePortfolio(p.id);
                          setOpen(false);
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          height: "3.5rem",
                          borderRadius: "0.75rem",
                          px: "0.875rem",
                          "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: "overlay.white08" },
                          "&:hover": { backgroundColor: "overlay.white04" },
                        }}
                      >
                        <Typography variant="subtitle1" noWrap sx={{ color: selected ? "sidebar.white" : "sidebar.heading", fontSize: "1rem", minWidth: 0 }}>
                          {p.name}
                        </Typography>
                        {selected ? (
                          <CheckSelected />
                        ) : (
                          <Box sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%", backgroundColor: "overlay.white20", flexShrink: 0 }} />
                        )}
                      </MenuItem>
                    );
                  })}
                  <Box sx={{ borderTop: `0.0625rem solid ${theme.palette.overlay.white08}`, my: "0.375rem" }} />
                  <MenuItem
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings");
                    }}
                    sx={{ gap: "0.75rem", height: "3.5rem", borderRadius: "0.75rem", px: "0.5rem", "&:hover": { backgroundColor: "overlay.white04" } }}
                  >
                    <Box
                      sx={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "50%",
                        backgroundColor: "overlay.white08",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SettingsOutlinedIcon sx={{ fontSize: "1.25rem", color: "sidebar.heading" }} />
                    </Box>
                    <Typography variant="subtitle1" sx={{ color: "sidebar.heading", fontSize: "1rem" }}>
                      Manage Portfolios
                    </Typography>
                  </MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
