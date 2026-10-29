"use client";

import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { useWallet } from "@/wallet/WalletContext";

const Pill = styled(ButtonBase, { shouldForwardProp: (p) => p !== "open" })<{ open?: boolean }>(({ theme, open }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  height: "2.75rem",
  padding: "0 0.875rem 0 0.625rem",
  borderRadius: "999rem",
  flexShrink: 0,
  whiteSpace: "nowrap",
  backgroundColor: open ? theme.palette.surfaceBg.pill : theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${open ? theme.palette.sidebar.primary : theme.palette.border.main1000}`,
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
  [theme.breakpoints.down("sm")]: { width: "2.75rem", padding: 0, justifyContent: "center" },
}));

/** Header teaser for the Seidar Agent (shown while a wallet is connected). It doesn't open the
 *  panel yet: hovering or tapping shows "Coming soon". */
export default function AgentPill() {
  const { isConnected } = useWallet();
  if (!isConnected) return null;
  return (
    <Tooltip title="Coming soon" arrow placement="bottom" enterTouchDelay={0} leaveTouchDelay={1500}>
      <Pill aria-label="Seidar Agent, coming soon" aria-disabled sx={{ cursor: "default" }}>
        <AutoAwesomeRoundedIcon sx={{ fontSize: "1.25rem", color: "#8DE8FF" }} />
        <Typography variant="body1" sx={{ color: "sidebar.heading", display: { xs: "none", sm: "block" } }}>
          Agent
        </Typography>
      </Pill>
    </Tooltip>
  );
}
