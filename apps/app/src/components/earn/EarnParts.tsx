"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
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

const Card = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "1.25rem",
    border: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : theme.palette.border.main600}`,
    boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
    backgroundColor: dark ? theme.palette.overlay.white05 : theme.palette.common.white,
  };
});

/** Earn page layout: tab bar + main content on the left, summary cards on the right. */
export function EarnGrid({ tabs, main, side }: { tabs: React.ReactNode; main: React.ReactNode; side: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "minmax(0, 1fr) 28.5625rem",
        mt: "0.4rem",
        alignItems: "start",
        "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
      }}
    >
      <MainCard>
        <Box sx={{ mb: "1rem" }}>{tabs}</Box>
        {main}
      </MainCard>
      <Side>{side}</Side>
    </Box>
  );
}

/** Right-column card in the Earn layout (header with icon + title, padded body). */
export function SideCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <Card>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", p: "1rem" }}>
        {icon && <Box component="img" src={icon} alt="" sx={{ width: "1.5625rem", height: "1.5625rem" }} />}
        <Typography variant="subtitle2" color="common.black">
          {title}
        </Typography>
      </Box>
      <Box sx={{ p: "0 1rem 1rem" }}>{children}</Box>
    </Card>
  );
}
