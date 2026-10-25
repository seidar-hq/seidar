"use client";

import { useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

export const GlassPaper = styled(Dialog)(({ theme }) => ({
  "& .MuiDialog-paper": {
    width: "90vw",
    maxWidth: "29.4375rem",
    maxHeight: "90vh",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    borderRadius: "1.5rem",
    border: `0.0625rem solid ${theme.palette.overlay.white18}`,
    backgroundColor: theme.palette.surfaceBg.section,
    backgroundImage: "none",
    backdropFilter: "blur(2.6875rem)",
    WebkitBackdropFilter: "blur(2.6875rem)",
    boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
    position: "relative",
    isolation: "isolate",
    transform: "translateZ(0)",
    color: theme.palette.common.black,
  },
}));

const HeaderRow = styled(Box)({ display: "flex", alignItems: "flex-start", gap: "0.5rem", width: "100%" });
const HeaderText = styled(Box)({ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.5rem" });

export const DialogCloseButton = styled(IconButton)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    width: "2rem",
    height: "2rem",
    padding: 0,
    flexShrink: 0,
    borderRadius: "3.125rem",
    color: theme.palette.common.black,
    backgroundColor: dark ? theme.palette.overlay.white08 : theme.palette.surfaceBg.main,
    ...(dark && {
      borderTop: `0.0625rem solid ${theme.palette.overlay.white08}`,
      borderBottom: `0.0625rem solid ${theme.palette.overlay.white08}`,
      boxShadow: `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}`,
    }),
    "&:hover": { backgroundColor: dark ? theme.palette.overlay.white18 : theme.palette.surfaceBg.main },
    "& svg": { fontSize: "1.125rem" },
  };
});

const DividerRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  width: "100%",
  "&::before, &::after": { content: '""', flex: 1, borderTop: `0.0625rem dashed ${theme.palette.border.main700}` },
}));
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
