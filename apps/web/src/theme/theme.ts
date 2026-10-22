"use client";

import { createTheme } from "@mui/material/styles";
import type { CSSObject } from "@mui/material/styles";

export const palette = {
  primary: {
    main: "#346CFF",
    blackBackground: "#101010",
    blackText: "#101828",
    black: "#141414",
    frostedBlue: "#8DE8FF",
    gray: "#9E9E9E",
    mutedBlue: "#AEBFFF",
    purple: "#4460FF",
    themeColor2: "#3671FF",
    cardBackground: "#1E1D25",
    cardImageBackground: "#17233B",
    paleBlue: "#F6F6FF",
  },
  white: {
    main: "#FFF",
    main100: "#F2F2F2",
    light: "#E8E8E8",
    light200: "#E5E5E5",
    soft: "#F1F1F1",
    faint: "#FAFAFA",
    alpha19: "rgba(255, 255, 255, 0.19)",
  },
  grey: {
    main: "#888888",
    main100: "#878787",
    placeholder: "#969696",
    inputPlaceholder: "#636363",
    dark: "#262626",
    dark200: "#202020",
    muted: "#868686",
  },
  error: { main: "#FF0000" },
  dark: { main: "#191919", light: "#1A1A1A" },
  border: { dark: "#2E2E2E", main: "#c4c4c4" },
  green: { main: "#17B26A" },
  orange: { main: "#b95000" },
  blue: { main: "#2e5aac" },
  black: { main: "#000" },
} as const;

export const pxToRem = (px: number) => `${px / 16}rem`;

const FONT_FAMILY = '"Public Sans", sans-serif';

const typographyVariant = (
  variant: string,
  size: number,
  weight: number,
  mediumSize?: number,
  smallSize?: number,
) => ({
  props: { variant },
  style: {
    fontSize: pxToRem(size),
    fontWeight: weight,
    fontFamily: FONT_FAMILY,
    ...(mediumSize && { "@media (max-width:1200px)": { fontSize: pxToRem(mediumSize) } }),
    ...(smallSize && { "@media (max-width:600px)": { fontSize: pxToRem(smallSize) } }),
  } as CSSObject,
});

const theme = createTheme({
  palette: { ...palette } as never,
  typography: { fontFamily: FONT_FAMILY },
  components: {
    MuiTypography: {
      styleOverrides: {
        root: {
          fontFamily: FONT_FAMILY,
          color: palette.white.main,
          "&.gradient": {
            background: "linear-gradient(113deg, #FFF 37.74%, rgba(255, 255, 255, 0.00) 163.06%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          },
        },
      },
      variants: [
        typographyVariant("h1", 84, 600, 52, 40),
        typographyVariant("h2", 40, 600, 34, 32),
        typographyVariant("h3", 32, 600, 28, 24),
        typographyVariant("body1", 24, 400, 20, 16),
        typographyVariant("body1Medium", 24, 500, 20, 16),
        typographyVariant("body1SemiBold", 24, 600, 20, 16),
        typographyVariant("body1Bold", 24, 700, 20, 16),
        typographyVariant("body2", 20, 400, 18, 16),
        typographyVariant("body2Medium", 20, 500, 18, 16),
        typographyVariant("body2SemiBold", 20, 600, 18, 16),
        typographyVariant("body2Bold", 20, 700, 18, 16),
        typographyVariant("body3", 18, 400, 16, 15),
        typographyVariant("body3Medium", 18, 500, 16, 15),
        typographyVariant("body3SemiBold", 18, 600, 16, 15),
        typographyVariant("body3Bold", 18, 700, 16, 15),
        typographyVariant("body4", 16, 400, 15, 14),
        typographyVariant("body4Medium", 16, 500, 15, 14),
        typographyVariant("body4SemiBold", 16, 600, 15, 14),
        typographyVariant("body4Bold", 16, 700, 15, 14),
        typographyVariant("subtitle1", 14, 400, 13, 12),
        typographyVariant("subtitle1Medium", 14, 500, 13, 12),
        typographyVariant("subtitle1SemiBold", 14, 600, 13, 12),
        typographyVariant("subtitle1Bold", 14, 700, 13, 12),
        typographyVariant("caption", 12, 400, 11, 10),
        typographyVariant("captionMedium", 12, 500, 11, 10),
        typographyVariant("captionSemiBold", 12, 600, 11, 10),
        typographyVariant("captionBold", 12, 700, 11, 10),
        typographyVariant("overline", 10, 400, 9, 8),
        typographyVariant("overlineMedium", 10, 500, 9, 8),
        typographyVariant("overlineSemiBold", 10, 600, 9, 8),
        typographyVariant("overlineBold", 10, 700, 9, 8),
      ] as never,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "48px",
          textTransform: "none",
          fontFamily: FONT_FAMILY,
          "&:focus": { outline: "none", boxShadow: "none" },
          "&:focus-visible": { outline: "none", boxShadow: "none" },
          "&:active": { outline: "none", boxShadow: "none" },
        },
        containedPrimary: { background: palette.primary.main },
      },
      variants: [
        { props: { size: "large" }, style: { fontSize: "16px", fontWeight: 500 } },
        { props: { size: "small" }, style: { fontSize: "14px", fontWeight: 600 } },
        {
          props: { variant: "primary" },
          style: {
            background: palette.primary.main,
            color: palette.white.main,
            borderRadius: "1000px",
            padding: "10px 24px",
          },
        },
        {
          props: { variant: "secondary" },
          style: {
            backgroundColor: "transparent",
            color: palette.white.main,
            border: `1px solid ${palette.white.main}`,
            borderRadius: "1000px",
            padding: "10px 24px",
            "&:hover": {
              backgroundColor: "transparent",
              borderColor: palette.white.main,
              color: palette.white.main,
            },
          },
        },
        {
          props: { variant: "success" },
          style: {
            backgroundColor: "transparent",
            color: palette.white.main,
            border: `1px solid ${palette.white.alpha19}`,
            borderRadius: "1000px",
            padding: "10px 24px",
            "&:hover": {
              backgroundColor: "transparent",
              borderColor: palette.white.main,
              color: palette.white.main,
            },
          },
        },
      ] as never,
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          "&:focus": { outline: "none", boxShadow: "none" },
          "&:focus-visible": { outline: "none", boxShadow: "none" },
          "&:active": { outline: "none", boxShadow: "none" },
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { color: palette.white.main } },
      variants: [
        { props: { severity: "success" }, style: { backgroundColor: palette.green.main } },
        { props: { severity: "error" }, style: { backgroundColor: palette.error.main } },
        { props: { severity: "warning" }, style: { backgroundColor: palette.orange.main } },
        { props: { severity: "info" }, style: { backgroundColor: palette.blue.main } },
      ],
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontFamily: FONT_FAMILY,
          "& input": { color: palette.white.main },
          "& input:-webkit-autofill, & input:-webkit-autofill:hover, & input:-webkit-autofill:focus, & input:-webkit-autofill:active":
            {
              WebkitBoxShadow: "0 0 0 100px transparent inset",
              WebkitTextFillColor: palette.white.main,
              caretColor: palette.white.main,
              transition: "background-color 5000s ease-in-out 0s",
            },
        },
      },
    },
  },
});

export default theme;
