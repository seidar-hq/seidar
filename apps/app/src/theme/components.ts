import type { Components, PaletteMode, Theme } from "@mui/material/styles";
import type { AppColors } from "./palette";

export const getComponents = (d: AppColors, g: PaletteMode): Components<Omit<Theme, "components">> => ({
    MuiCssBaseline: {
      styleOverrides: {
        '[data-mui-internal-clone-element="true"]:not(button):not(a)': {
          cursor: "default",
        },
        "& .MuiOutlinedInput-root": {
          "& .MuiOutlinedInput-notchedOutline": { border: "none" },
          "&:hover .MuiOutlinedInput-notchedOutline": { border: "none" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: "none" },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { height: "2.500rem", borderRadius: "0.500rem" },
      },
      defaultProps: {
        MenuProps: {
          disableScrollLock: true,
          PaperProps: { sx: { maxHeight: 300 } },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: {
          "& .MuiBackdrop-root": {
            backgroundColor: d.overlay.backdrop,
            backdropFilter: "blur(0.25rem)",
            WebkitBackdropFilter: "blur(0.25rem)",
          },
        },
      },
    },
    MuiMenu: { defaultProps: { disableScrollLock: true } },
    MuiPopover: { defaultProps: { disableScrollLock: true } },
    MuiTypography: {
      variants: [
        {
          props: { variant: "body2" },
          style: {
            fontSize: "1.500rem",
            lineHeight: "2.100rem",
            color: d.common.black,
            fontWeight: "600",
          },
        },
        { props: { variant: "h6" }, style: { fontSize: "1.125rem" } },
        {
          props: { variant: "h5" },
          style: { fontSize: "1.375rem", fontWeight: 400, lineHeight: 1.4 },
        },
        {
          props: { variant: "h4" },
          style: {
            fontSize: "1.75rem",
            fontWeight: 700,
            color: d.common.black,
          },
        },
        {
          props: { variant: "h1" },
          style: { fontSize: "2.125rem", fontWeight: 700, lineHeight: 1.3 },
        },
        {
          props: { variant: "subtitle2" },
          style: {
            fontSize: "1rem",
            lineHeight: "1.400rem",
            fontWeight: "500",
          },
        },
        {
          props: { variant: "subtitle1" },
          style: { fontSize: "1rem", lineHeight: "1.400rem", fontWeight: 400 },
        },
        { props: { variant: "body1" }, style: { fontSize: "0.875rem" } },
        {
          props: { variant: "body3" },
          style: {
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "0.875rem",
            lineHeight: "140%",
            letterSpacing: "0%",
            color: g === "dark" ? d.grey[200] : d.black.main100,
          },
        },
        {
          props: { variant: "body4" },
          style: {
            fontWeight: 500,
            fontStyle: "normal",
            fontSize: "1.25rem",
            lineHeight: "100%",
            letterSpacing: "0%",
            color: d.common.black,
          },
        },
        {
          props: { variant: "subtitle3" },
          style: {
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "0.875rem",
            lineHeight: "140%",
            letterSpacing: "0%",
            color: d.grey[200],
          },
        },
        {
          props: { variant: "subtitle4" },
          style: {
            fontWeight: 600,
            fontStyle: "normal",
            fontSize: "1rem",
            lineHeight: "140%",
            letterSpacing: "0%",
            color: d.grey[200],
          },
        },
        {
          props: { variant: "subtitle5" },
          style: {
            fontWeight: 500,
            fontStyle: "normal",
            fontSize: "0.875rem",
            lineHeight: "1.2",
            letterSpacing: "-0.0175rem",
            color: d.grey[200],
          },
        },
        {
          props: { variant: "subtitle6" },
          style: {
            fontWeight: 500,
            fontStyle: "normal",
            fontSize: "1.125rem",
            lineHeight: "1.2",
            letterSpacing: "-0.0225rem",
            color: d.common.black,
          },
        },
        {
          props: { variant: "subtitle7" },
          style: {
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "0.875rem",
            lineHeight: "1.2",
            letterSpacing: "-0.0175rem",
            color: d.grey[200],
          },
        },
        {
          props: { variant: "subtitle8" },
          style: {
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "1.125rem",
            lineHeight: "1.2",
            letterSpacing: "-0.0225rem",
            color: d.common.black,
          },
        },
        {
          props: { variant: "subtitle9" },
          style: {
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "0.875rem",
            lineHeight: "1.2",
            letterSpacing: "-0.0175rem",
            color: d.grey[200],
          },
        },
        {
          props: { variant: "subtitle10" },
          style: {
            fontWeight: 300,
            fontStyle: "normal",
            fontSize: "1.5rem",
            lineHeight: "1.2",
            letterSpacing: "-0.03rem",
          },
        },
        {
          props: { variant: "caption" },
          style: { fontSize: "0.75rem", fontWeight: 400 },
        },
        {
          props: { variant: "displayH" },
          style: {
            fontSize: "1.75rem",
            fontWeight: 400,
            lineHeight: "1.2",
            letterSpacing: "-0.035rem",
            color: d.common.black,
          },
        },
        {
          props: { variant: "displayNumber" },
          style: {
            fontSize: "2.5rem",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
            color: d.common.black,
          },
        },
        {
          props: { variant: "displayUnit" },
          style: {
            fontSize: "1.125rem",
            fontWeight: 600,
            lineHeight: 1,
            color: d.common.black,
          },
        },
      ],
    },
    MuiAlert: {
      variants: [
        {
          props: { severity: "info" },
          style: {
            backgroundColor: d.purple.background100,
            color: d.common.black,
            fontSize: "1rem",
            fontWeight: 400,
            "& .MuiAlert-icon": { color: d.primary.main },
          },
        },
      ],
    },
    MuiChip: {
      variants: [
        {
          props: { size: "small", color: "success", variant: "outlined" },
          style: {
            height: "1.875rem",
            color: d.green.main,
            border: `0.5px solid ${d.green.main}`,
            borderRadius: "1.25rem",
          },
        },
        {
          props: { size: "small", color: "success", variant: "filled" },
          style: {
            height: "1.875rem",
            backgroundColor: `${g === "dark" ? d.green.main : d.green.main200} !important`,
            color: `${g === "dark" ? d.sidebar.white : d.green.main} !important`,
            border: "none",
            borderRadius: "1.25rem",
          },
        },
        {
          props: { size: "small", color: "error", variant: "outlined" },
          style: {
            height: "1.875rem",
            color: d.error.main,
            border: `0.5px solid ${d.error.main}`,
            borderRadius: "1.25rem",
          },
        },
        {
          props: { size: "small", color: "error", variant: "filled" },
          style: {
            height: "1.875rem",
            backgroundColor: `${g === "dark" ? d.red.main : d.red.main400} !important`,
            color: `${g === "dark" ? d.sidebar.white : d.error.main} !important`,
            border: "none",
            borderRadius: "1.25rem",
          },
        },
        {
          props: { size: "small", color: "secondary" },
          style: {
            color: d.black.main100,
            borderRadius: "1.25rem",
            backgroundColor: d.grey[800],
            fontSize: "0.875rem",
            fontWeight: 400,
            minWidth: "6.75rem",
            height: "1.875rem",
            padding: "0rem 1rem",
            textTransform: "none",
          },
        },
        {
          props: { variant: "mini", color: "success" },
          style: {
            height: "1.375rem",
            minWidth: "2.5rem",
            backgroundColor: d.overlay.success10,
            color: d.green.main,
            border: "none",
            ...(g === "dark" && {
              borderTop: `0.0625rem solid ${d.border.stepperBorder}`,
              borderBottom: `0.0625rem solid ${d.border.stepperBorder}`,
            }),
            borderRadius: "1.25rem",
            "& .MuiChip-label": {
              padding: "0 0.375rem",
              fontSize: "0.75rem",
              fontWeight: 400,
              lineHeight: 1.2,
            },
          },
        },
        {
          props: { variant: "mini", color: "error" },
          style: {
            height: "1.375rem",
            minWidth: "2.5rem",
            backgroundColor: d.overlay.error10,
            color: d.error.main,
            border: "none",
            ...(g === "dark" && {
              borderTop: `0.0625rem solid ${d.border.stepperBorderNegative}`,
              borderBottom: `0.0625rem solid ${d.border.stepperBorderNegative}`,
            }),
            borderRadius: "1.25rem",
            "& .MuiChip-label": {
              padding: "0 0.375rem",
              fontSize: "0.75rem",
              fontWeight: 400,
              lineHeight: 1.2,
            },
          },
        },
      ],
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: g === "dark" ? d.overlay.white05 : d.sidebar.white,
          color: g === "dark" ? d.sidebar.white : d.sidebar.black,
          maxWidth: "23.750rem",
          padding: "0.5rem 0.625rem 0.625rem",
          borderRadius: "1.21875rem",
          fontFamily: "Public Sans, sans-serif",
          fontSize: "0.750rem",
          fontWeight: 400,
          lineHeight: "120%",
          letterSpacing: "-0.015rem",
          filter: `drop-shadow(0rem 0.250rem 2.5rem ${d.shadow.elevated})`,
          ...(g === "dark"
            ? {
                backdropFilter: "blur(0.625rem)",
                WebkitBackdropFilter: "blur(0.625rem)",
                border: `0.0625rem solid ${d.overlay.white08}`,
              }
            : {}),
        },
        arrow: {
          color: g === "dark" ? d.overlay.white05 : d.sidebar.white,
          ...(g === "dark"
            ? {
                "&::before": {
                  backdropFilter: "blur(0.625rem)",
                  WebkitBackdropFilter: "blur(0.625rem)",
                },
              }
            : {}),
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          "&.Mui-focusVisible": { outline: "none" },
          "&:focus-visible": { outline: "none" },
        },
      },
    },
    MuiButton: {
      variants: [
        {
          props: { size: "small" },
          style: { fontSize: "0.750rem", padding: "0.375rem 0.625rem" },
        },
        {
          props: { size: "medium" },
          style: { fontSize: "0.875rem", padding: "0.625rem 1rem" },
        },
        {
          props: { size: "large" },
          style: { fontSize: "1rem", padding: "0.750rem 1.250rem" },
        },
        {
          props: { variant: "solid", color: "primary" },
          style: {
            background: d.gradient.buttonGradient,
            color: d.sidebar.white,
            borderRadius: "999rem",
            fontFamily: "Public Sans, sans-serif",
            fontWeight: 500,
            fontStyle: "Medium",
            fontSize: "0.875rem",
            lineHeight: "140%",
            letterSpacing: "0%",
            textTransform: "uppercase",
            height: "3rem",
            boxShadow: "none",
            "&:disabled": { background: d.border.main600, color: d.grey[200] },
          },
        },
        {
          props: { variant: "solid", color: "primary-main" },
          style: {
            backgroundColor: d.primary.main,
            color: d.common.white,
            borderRadius: "999rem",
            boxShadow: "none",
            textTransform: "none",
            "&:hover": { backgroundColor: d.primary.main },
            "&:disabled": {
              backgroundColor: d.grey[300],
              color: d.common.white,
            },
            ...(g === "dark" && {
              backgroundColor: d.sidebar.primary,
              color: d.sidebar.heading,
              "&:hover": {
                backgroundColor: d.sidebar.primary,
                color: d.sidebar.heading,
              },
              "&:disabled": {
                backgroundColor: d.grey[300],
                color: d.black.main300,
                cursor: "not-allowed",
                pointerEvents: "auto",
              },
            }),
          },
        },
        {
          props: { variant: "solid", color: "remove-button" },
          style: {
            color: d.red.main,
            backgroundColor: d.red.main100,
            borderRadius: "999rem",
            boxShadow: "none",
            textTransform: "none",
            "&:hover": { backgroundColor: d.red.main100 },
            "&:disabled": {
              backgroundColor: d.grey[300],
              color: d.common.white,
            },
          },
        },
        {
          props: { variant: "solid", color: "secondary" },
          style: {
            backgroundColor: d.success.main,
            color: d.common.white,
            fontSize: "1rem",
            padding: "0.750rem",
            borderRadius: "999rem",
            boxShadow: "none",
            "&:hover": { backgroundColor: d.success.dark },
            "&:disabled": {
              backgroundColor: d.grey[300],
              color: d.common.white,
            },
            ...(g === "dark" && {
              color: "#fff",
              "&:disabled": {
                backgroundColor: d.grey[300],
                color: d.black.main300,
              },
            }),
          },
        },
        {
          props: { variant: "solid", color: "error" },
          style: {
            backgroundColor: d.error.button,
            color: d.sidebar.white,
            fontSize: "1rem",
            padding: "0.750rem",
            borderRadius: "999rem",
            boxShadow: "none",
            "&:hover": { backgroundColor: d.error.buttonHover },
            "&:disabled": {
              backgroundColor: d.grey[300],
              color: d.common.white,
            },
            ...(g === "dark" && {
              "&:disabled": {
                backgroundColor: d.grey[300],
                color: d.black.main300,
              },
            }),
          },
        },
        {
          props: { variant: "solid", color: "purple" },
          style: {
            backgroundColor: d.purple.background,
            color: d.primary.main,
            borderRadius: "999rem",
            boxShadow: "none",
            textTransform: "none",
            "&:hover": {
              backgroundColor: d.purple.background,
              color: d.primary.main,
              boxShadow: "none",
            },
          },
        },
        {
          props: { variant: "outlined" },
          style: { color: d.primary.main, borderRadius: "999rem" },
        },
        {
          props: { variant: "outlined", color: "primary" },
          style: {
            ...(g === "dark" && {
              borderColor: "rgba(255, 255, 255, 0.20)",
              color: d.grey[700],
              "&:hover": {
                borderColor: "rgba(255, 255, 255, 0.40)",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
              },
            }),
          },
        },
        {
          props: { variant: "outlined", color: "purple" },
          style: {
            backgroundColor: d.purple.background,
            border: "none",
            textTransform: "capitalize",
            fontSize: "1rem",
            fontWeight: 500,
            borderRadius: "999rem",
            padding: "1rem",
            height: "3rem",
            "&:hover": {
              backgroundColor: d.purple.background200,
              border: "none",
            },
          },
        },
        {
          props: { variant: "outlined", color: "transparent" },
          style: {
            background: "transparent",
            color: d.common.black,
            border: "1px solid rgba(255, 255, 255, 0.40)",
          },
        },
        {
          props: { variant: "outlined", color: "cancel" },
          style: {
            background: g === "dark" ? d.overlay.white10 : d.overlay.black06,
            color: d.common.black,
            border: "none",
            borderRadius: "999rem",
            fontFamily: "Public Sans, sans-serif",
            fontSize: "0.75rem",
            fontWeight: 400,
            lineHeight: 1.2,
            textTransform: "uppercase",
            letterSpacing: "-0.015rem",
            padding: "0.375rem 0.75rem",
            height: "2rem",
            borderTop: `0.0625rem solid ${g === "dark" ? d.overlay.white08 : d.border.main600}`,
            borderBottom: `0.0625rem solid ${g === "dark" ? d.overlay.white08 : d.border.main600}`,
            boxShadow:
              g === "dark" ? `0 0.25rem 2.5rem 0 ${d.shadow.exchange}` : "none",
            "&:hover": {
              background: g === "dark" ? d.overlay.white18 : d.overlay.black08,
              borderColor: g === "dark" ? d.overlay.white08 : d.border.main600,
            },
            "&:disabled": { opacity: 0.5, color: d.common.black },
          },
        },
        {
          props: { variant: "solid", color: "connect" },
          style: {
            backgroundColor: d.sidebar.primary,
            color: d.sidebar.white,
            borderRadius: "999rem",
            fontFamily: "Public Sans, sans-serif",
            fontSize: "0.75rem",
            fontWeight: 400,
            lineHeight: 1.2,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            padding: "0.375rem 0.75rem",
            height: "2rem",
            boxShadow: "none",
            "&:hover": {
              backgroundColor: d.sidebar.primary,
              filter: "brightness(1.08)",
              boxShadow: "none",
            },
            "&:disabled": {
              backgroundColor: d.sidebar.primary,
              color: d.sidebar.white,
              opacity: 0.5,
            },
          },
        },
        {
          props: { variant: "borderless" },
          style: {
            backgroundColor: "transparent",
            color: d.primary.main,
            border: "none",
            minWidth: "auto",
            textTransform: "none",
            ":hover": {
              backgroundColor: "transparent",
              textDecoration: "underline",
            },
          },
        },
        {
          props: { className: "custom-max-button" },
          style: {
            minWidth: "unset",
            padding: "0.250rem 0.500rem",
            fontSize: "0.625rem",
            borderRadius: "999rem",
          },
        },
      ],
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: "inherit",
          "&.Mui-selected": { color: d.primary.light },
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          "&:first-of-type": { borderRadius: 8 },
          "&:last-of-type": { borderRadius: 8 },
          "& .MuiAccordionSummary-content.MuiAccordionSummary-contentGutters": {
            margin: "0",
          },
          "& .MuiAccordionSummary-content.Mui-expanded.MuiAccordionSummary-contentGutters":
            { margin: "0" },
          "& .MuiButtonBase-root.MuiAccordionSummary-root.Mui-expanded": {
            minHeight: "3rem",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: "0.500rem",
            height: "2.500rem",
          },
        },
      },
    },
  });
