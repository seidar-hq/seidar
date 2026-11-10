"use client";

import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import { pinnedColumn, usePinnedColumn } from "./EarnUI";

const MainCard = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.surfaceBg.section,
  borderRadius: "1.5rem",
  padding: "1.25rem",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
}));

const Side = styled(Box)({ display: "flex", flexDirection: "column", gap: "1rem", alignSelf: "start", minWidth: 0 });

/** Side column pinned to the viewport on wide screens, scrolling on its own (the dual-scroll layout). */
function PinnedSide({ children }: { children: React.ReactNode }) {
  const props = usePinnedColumn();
  return (
    <Side sx={pinnedColumn} {...props}>
      {children}
    </Side>
  );
}

/** Earn page layout: tab bar + main content on the left, summary cards on the right (full width without them).
 *  `pinned`: the right column stays in view and scrolls by itself while the page scrolls the left. */
export function EarnGrid({ tabs, main, side, pinned }: { tabs: React.ReactNode; main: React.ReactNode; side?: React.ReactNode; pinned?: boolean }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: side ? "minmax(0, 1fr) 28.5625rem" : "minmax(0, 1fr)",
        mt: "0.4rem",
        alignItems: "start",
        "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
      }}
    >
      <MainCard>
        <Box sx={{ mb: "1rem" }}>{tabs}</Box>
        {main}
      </MainCard>
      {side && (pinned ? <PinnedSide>{side}</PinnedSide> : <Side>{side}</Side>)}
    </Box>
  );
}
