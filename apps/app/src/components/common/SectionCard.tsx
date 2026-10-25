import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import { styled } from "@mui/material/styles";

// Shared card shells used by the dashboard widgets.

export const SectionCard = styled(Grid)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    width: "100%",
    backgroundColor: dark ? theme.palette.overlay.white02 : theme.palette.surfaceBg.section,
    border: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : theme.palette.border.main1000}`,
    borderRadius: dark ? "1.125rem" : "1.5rem",
    ...(dark && { backdropFilter: "blur(3.125rem)", WebkitBackdropFilter: "blur(3.125rem)" }),
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  };
});

export const InsetCard = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    backgroundColor: dark ? theme.palette.overlay.white02 : theme.palette.surfaceBg.softInset,
    border: dark ? `0.125rem solid ${theme.palette.overlay.white08}` : `0.0625rem solid ${theme.palette.border.main1000}`,
    ...(dark && { boxShadow: `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.heavy}` }),
    padding: "1rem",
    borderRadius: dark ? "0.75rem" : "0.5rem",
    ...(dark && { display: "flex", flexDirection: "column", gap: "1rem" }),
  };
});

export const SectionHeaderRow = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.5rem",
  gap: 0,
  [theme.breakpoints.down("sm")]: { flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" },
}));

export const SectionHeaderLeft = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
  [theme.breakpoints.down("sm")]: { gap: "0.5rem" },
}));

export const VerticalRule = styled(Box)(({ theme }) => ({
  height: "1.5rem",
  width: "0.0625rem",
  backgroundColor: theme.palette.divider,
  [theme.breakpoints.down("sm")]: { display: "none" },
}));

// KPI blocks ("All Portfolios" on the wallets page).
export const KpiSection = styled(Box)({ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" });
export const KpiHeader = styled(Box)({ display: "flex", alignItems: "center", paddingLeft: "0.25rem" });

export const KpiCard = styled(Grid)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    backgroundColor: dark ? theme.palette.overlay.white02 : theme.palette.surfaceBg.softInset,
    border: dark ? `0.125rem solid ${theme.palette.overlay.white08}` : `0.0625rem solid ${theme.palette.border.main1000}`,
    ...(dark && { boxShadow: `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.heavy}` }),
    height: "8.875rem",
    padding: "1rem",
    borderRadius: dark ? "0.75rem" : "0.5rem",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "1rem",
    overflow: "hidden",
  };
});

export const KpiTop = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.375rem",
  width: "100%",
});
export const KpiValueRow = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  gap: "0.5rem",
});
export const KpiFooterRow = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  paddingTop: "0.5rem",
});

// Plain bordered card (dashboard wallet table, etc.).
export const PlainCard = styled(Grid)(({ theme }) => ({
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
  borderRadius: "1.5rem",
}));

// Gradient hairline border that fades out towards the bottom of locked cards.
export const fadedBorder = (theme: import("@mui/material/styles").Theme) => ({
  position: "relative" as const,
  border: "none",
  "&::before": {
    content: '""',
    position: "absolute" as const,
    inset: 0,
    borderRadius: "inherit",
    padding: "0.0625rem",
    background: `linear-gradient(180deg, ${theme.palette.overlay.white08} 0%, ${theme.palette.overlay.white08} 28%, ${theme.palette.overlay.zero} 55%)`,
    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    pointerEvents: "none" as const,
  },
});
