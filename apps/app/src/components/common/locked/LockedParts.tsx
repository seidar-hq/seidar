"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";

// Building blocks for the "connect a wallet" states shown across the app.

export const ARROW_CIRCLE_ICON = "/assets/locked/arrowCircle.svg";
export const WATERMARK_ICON = "/assets/locked/watermark.svg";

export const LockedTextColumn = styled(Box)({
  position: "relative",
  zIndex: 2,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  width: "100%",
  minHeight: "14.5rem",
  gap: "1rem",
});

export const LockedTitleBlock = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  maxWidth: "32.875rem",
});

export const LockedCtaPill = styled(ButtonBase)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  const line = dark ? theme.palette.overlay.white08 : theme.palette.border.main600;
  return {
    alignSelf: "flex-start",
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    height: "2.0625rem",
    padding: "0.375rem 0.375rem 0.375rem 0.5rem",
    borderRadius: "6.25rem",
    backgroundColor: dark ? theme.palette.overlay.white04 : theme.palette.overlay.black02,
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    boxShadow: dark ? `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.elevated}` : "none",
    transition: "background-color 200ms ease",
    "&:hover": { backgroundColor: dark ? theme.palette.overlay.white08 : theme.palette.overlay.black06 },
  };
});

export const LockedCtaIcon = styled("img")({ width: "1.5rem", height: "1.5rem" });

export const WalletPromoRoot = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  padding: "1rem 0",
});

export const WalletIconRow = styled(Box)({ display: "flex", alignItems: "center" });

export const WalletPromoText = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.25rem",
  marginTop: "1rem",
  textAlign: "center",
});

export const WalletPromoNote = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  marginTop: "2.875rem",
});

export const WalletPromoNoteIcon = styled("img")({ width: "1rem", height: "1rem" });

export const WalletPromoButton = styled(Button)({
  textTransform: "none",
  height: "2.75rem",
  width: "9.9375rem",
  minWidth: "9.9375rem",
  borderRadius: "12.5rem",
  padding: "0.375rem 0.5rem 0.3125rem 0.5rem",
  gap: "0.25rem",
  marginTop: "1.0625rem",
});

export const WalletPromoButtonIcon = styled("img")({ width: "1.125rem", height: "1.125rem" });

export const LockedChartRoot = styled(Box)({
  position: "relative",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  minHeight: "18.5rem",
  padding: "0.5rem 0.25rem",
});

export const LockedChartArt = styled(Box)({
  position: "absolute",
  left: "40%",
  right: "0.25rem",
  bottom: "1rem",
  top: "3.5rem",
  pointerEvents: "none",
  "& img": { width: "100%", height: "100%", display: "block" },
});

export const LockedTableRoot = styled(Box)({
  position: "relative",
  overflow: "hidden",
  display: "flex",
  alignItems: "stretch",
  gap: "1.5rem",
  height: "24.125rem",
  margin: "0 -1rem -1rem",
  padding: "0.75rem 1.75rem 1.5rem",
  borderRadius: "0 0 1.5rem 1.5rem",
});

export const LockedTableText = styled(Box)({ flex: "0 0 36%", minWidth: 0, display: "flex" });

export const LockedTableArt = styled(Box)({
  flex: 1,
  minWidth: 0,
  position: "relative",
  overflow: "hidden",
  pointerEvents: "none",
});

export const LockedTableImage = styled("img")({ display: "block", width: "100%", minWidth: "34rem", height: "auto" });

type LockedCopyProps = {
  titleLead: string;
  titleAccent: string;
  titleTrail?: string;
  description: string;
  ctaLabel: string;
  onConnect: () => void;
};

// Title with an italic accent, a short description and a pill CTA.
export function LockedCopy({ titleLead, titleAccent, titleTrail, description, ctaLabel, onConnect }: LockedCopyProps) {
  return (
    <LockedTextColumn>
      <LockedTitleBlock>
        <Typography variant="subtitle6" component="p" color="common.black">
          {titleLead}
          <Box component="span" sx={{ color: "primary.main", fontStyle: "italic" }}>
            {titleAccent}
          </Box>
          {titleTrail}
        </Typography>
        <Typography variant="subtitle9" color="sidebar.subText">
          {description}
        </Typography>
      </LockedTitleBlock>
      <LockedCtaPill onClick={onConnect}>
        <Typography variant="caption" color="common.black">
          {ctaLabel}
        </Typography>
        <LockedCtaIcon src={ARROW_CIRCLE_ICON} alt="" />
      </LockedCtaPill>
    </LockedTextColumn>
  );
}
