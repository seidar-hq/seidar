"use client";

import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";

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

/** Earn page layout: tab bar + main content on the left, summary cards on the right (full width without them). */
export function EarnGrid({ tabs, main, side }: { tabs: React.ReactNode; main: React.ReactNode; side?: React.ReactNode }) {
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
      {side && <Side>{side}</Side>}
    </Box>
  );
}
