"use client";

import { useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

// Modal surface (matches the wallet account modal): solid dark card, hairline border, round corners.
export const MODAL = {
  bg: "#1F1F1F",
  border: "#323232",
  inset: "#2A2A2A",
  insetHover: "#333333",
  muted: "#8A8A8A",
  dangerBg: "#402522",
  danger: "#C74430",
} as const;

export const GlassPaper = styled(Dialog)(({ theme }) => ({
  "& .MuiBackdrop-root": { backgroundColor: "rgba(0, 0, 0, 0.6)" },
  "& .MuiDialog-paper": {
    width: "90vw",
    maxWidth: "29.4375rem",
    maxHeight: "90vh",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    borderRadius: "2rem",
    border: `0.0625rem solid ${MODAL.border}`,
    backgroundColor: MODAL.bg,
    backgroundImage: "none",
    boxShadow: `0 0.5rem 2.5rem ${theme.palette.shadow.heavy}`,
    position: "relative",
    color: theme.palette.common.black,
  },
}));

const HeaderRow = styled(Box)({ display: "flex", alignItems: "flex-start", gap: "0.5rem", width: "100%" });
const HeaderText = styled(Box)({ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.5rem" });

export const DialogCloseButton = styled(IconButton)({
  width: "2.25rem",
  height: "2.25rem",
  padding: 0,
  flexShrink: 0,
  borderRadius: "50%",
  color: "#E3E3E3",
  backgroundColor: "transparent",
  "&:hover": { backgroundColor: MODAL.inset },
  "& svg": { fontSize: "1.5rem" },
});

const DividerRow = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  width: "100%",
  "&::before, &::after": { content: '""', flex: 1, borderTop: `0.0625rem dashed ${MODAL.border}` },
});
const DividerLabel = styled(Box)({ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 });
const ScrollBody = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  margin: "0 -1rem",
  padding: "0 1rem",
});
const ActionsRow = styled(Box)({ display: "flex", justifyContent: "flex-end", gap: "0.5rem", width: "100%" });

type Props = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  titleIcon?: React.ReactNode;
  subtitle?: React.ReactNode;
  dividerLabel?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  primaryLabel?: string;
  onPrimary?: () => unknown;
  primaryDisabled?: boolean;
  primaryStartIcon?: React.ReactNode;
  hidePrimary?: boolean;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  hideClose?: boolean;
  stackIcon?: boolean;
  maxWidth?: string;
  gap?: string;
};

export default function GlassDialog({
  open,
  onClose,
  title,
  titleIcon,
  subtitle,
  dividerLabel,
  children,
  actions,
  primaryLabel = "Confirm",
  onPrimary,
  primaryDisabled = false,
  primaryStartIcon,
  hidePrimary = false,
  cancelLabel = "Cancel",
  cancelDisabled = false,
  hideClose = false,
  stackIcon = false,
  maxWidth,
  gap,
}: Props) {
  const busy = useRef(false);
  const handlePrimary = useCallback(async () => {
    if (busy.current || !onPrimary) return;
    busy.current = true;
    try {
      await onPrimary();
    } finally {
      busy.current = false;
    }
  }, [onPrimary]);

  return (
    <GlassPaper
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && onClose()}
      maxWidth={false}
      PaperProps={maxWidth || gap ? { sx: { ...(maxWidth && { maxWidth }), ...(gap && { gap }) } } : undefined}
    >
      <HeaderRow>
        <HeaderText>
          {stackIcon ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {titleIcon}
              <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Typography variant="body2" color="common.black">
                  {title}
                </Typography>
                {subtitle && (
                  <Typography variant="subtitle1" color="grey.200">
                    {subtitle}
                  </Typography>
                )}
              </Box>
            </Box>
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {titleIcon}
                <Typography variant="body2" color="common.black">
                  {title}
                </Typography>
              </Box>
              {subtitle && (
                <Typography variant="subtitle1" color="grey.200">
                  {subtitle}
                </Typography>
              )}
            </>
          )}
        </HeaderText>
        {!hideClose && (
          <DialogCloseButton onClick={onClose} aria-label="Close">
            <CloseRoundedIcon />
          </DialogCloseButton>
        )}
      </HeaderRow>
      {dividerLabel && (
        <DividerRow>
          <DividerLabel>{dividerLabel}</DividerLabel>
        </DividerRow>
      )}
      {children && <ScrollBody>{children}</ScrollBody>}
      {actions !== undefined ? (
        <ActionsRow>{actions}</ActionsRow>
      ) : (
        <ActionsRow>
          <Button variant="outlined" color="cancel" size="small" onClick={onClose} disabled={cancelDisabled}>
            {cancelLabel}
          </Button>
          {!hidePrimary && (
            <Button
              variant="solid"
              color="connect"
              size="small"
              onClick={handlePrimary}
              disabled={primaryDisabled}
              startIcon={primaryStartIcon}
            >
              {primaryLabel}
            </Button>
          )}
        </ActionsRow>
      )}
    </GlassPaper>
  );
}
