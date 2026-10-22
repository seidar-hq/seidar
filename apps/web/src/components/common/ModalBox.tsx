"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Fade from "@mui/material/Fade";
import IconButton from "@mui/material/IconButton";
import Slide from "@mui/material/Slide";
import type { TransitionProps } from "@mui/material/transitions";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Breakpoint } from "@mui/material/styles";
import { IoClose } from "react-icons/io5";

export type ModalBoxHandle = { openModal: () => void; closeModal: () => void };

type Props = {
  children: React.ReactNode;
  modalStyle?: React.CSSProperties;
  title?: string;
  size?: Breakpoint;
  onCloseModal?: () => void;
  noWidth?: boolean;
  fullScreen?: boolean;
  disablePadding?: boolean;
  hideCloseButton?: boolean;
};

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const ModalBox = forwardRef<ModalBoxHandle, Props>(function ModalBox(
  {
    modalStyle = {},
    children,
    title = "",
    size,
    onCloseModal,
    noWidth = true,
    fullScreen = false,
    disablePadding = false,
    hideCloseButton = false,
  },
  ref,
) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openModal: () => setOpen(true),
    closeModal: () => setOpen(false),
  }));

  const handleClose = () => {
    onCloseModal?.();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const blurInput = () => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
        active.blur();
      }
    };
    window.addEventListener("orientationchange", blurInput);
    return () => window.removeEventListener("orientationchange", blurInput);
  }, [open]);

  const contentPadding = disablePadding ? 0 : isMobile ? "20px" : "40px";

  return (
    <Dialog
      fullScreen={fullScreen}
      slots={{ transition: fullScreen ? SlideUp : Fade }}
      open={open}
      maxWidth={size || "md"}
      fullWidth
      scroll="paper"
      slotProps={{
        paper: {
          style: {
            overflow: "unset",
            border: `1px solid ${theme.palette.border.dark}`,
            backgroundColor: theme.palette.white.main,
            width: size && noWidth ? "100%" : "",
            backgroundImage: "initial",
            borderRadius: "16px",
            ...modalStyle,
          },
        },
      }}
      sx={{
        "& .MuiDialog-container": { height: "100dvh" },
        "& .MuiDialog-paper": { maxHeight: "calc(100dvh - 64px)" },
        "& .MuiDialogContent-root": { padding: disablePadding ? 0 : "40px" },
        "& .MuiDialog-paperFullScreen": {
          height: "100dvh",
          maxHeight: "100dvh",
          "& .MuiDialogContent-root": { padding: contentPadding },
        },
      }}
      onClose={(_, reason) => {
        if (reason !== "backdropClick" && reason !== "escapeKeyDown") handleClose();
      }}
    >
      {title && <DialogTitle sx={{ m: 0, p: 2 }}>{title}</DialogTitle>}
      {!hideCloseButton && (
        <IconButton
          disableRipple
          aria-label="close"
          onClick={handleClose}
          sx={(t) => ({
            position: "absolute",
            right: 10,
            top: 10,
            color: t.palette.white.main,
            backgroundColor: t.palette.primary.main,
            width: isMobile ? 25 : 30,
            height: isMobile ? 25 : 30,
            p: 0,
            zIndex: 2000,
            pointerEvents: "auto",
          })}
        >
          <IoClose style={{ fontSize: isMobile ? 16 : 20 }} />
        </IconButton>
      )}
      <DialogContent
        dividers
        sx={{ p: disablePadding ? 0 : undefined, pl: disablePadding ? 0 : 3, pr: disablePadding ? 0 : 3, overscrollBehavior: "contain" }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
});

export default ModalBox;
