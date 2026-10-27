import type { CSSProperties } from "react";
import type { AppColors } from "./palette";

type CustomPalette = Omit<AppColors, "common" | "grey" | "primary" | "info" | "success" | "error" | "warning">;

declare module "@mui/material/styles" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Palette extends CustomPalette {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface PaletteOptions extends Partial<CustomPalette> {}
  interface CommonColors {
    orange: string;
    chartOrange: string;
  }
  interface PaletteColor {
    border?: string;
    alert?: string;
    button?: string;
    buttonHover?: string;
  }
  interface SimplePaletteColorOptions {
    border?: string;
    alert?: string;
    button?: string;
    buttonHover?: string;
  }
  interface TypographyVariants {
    body3: CSSProperties;
    body4: CSSProperties;
    subtitle3: CSSProperties;
    subtitle4: CSSProperties;
    subtitle5: CSSProperties;
    subtitle6: CSSProperties;
    subtitle7: CSSProperties;
    subtitle8: CSSProperties;
    subtitle9: CSSProperties;
    subtitle10: CSSProperties;
    displayH: CSSProperties;
    displayNumber: CSSProperties;
    displayUnit: CSSProperties;
  }
  interface TypographyVariantsOptions {
    body3?: CSSProperties;
    body4?: CSSProperties;
    subtitle3?: CSSProperties;
    subtitle4?: CSSProperties;
    subtitle5?: CSSProperties;
    subtitle6?: CSSProperties;
    subtitle7?: CSSProperties;
    subtitle8?: CSSProperties;
    subtitle9?: CSSProperties;
    subtitle10?: CSSProperties;
    displayH?: CSSProperties;
    displayNumber?: CSSProperties;
    displayUnit?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    body3: true;
    body4: true;
    subtitle3: true;
    subtitle4: true;
    subtitle5: true;
    subtitle6: true;
    subtitle7: true;
    subtitle8: true;
    subtitle9: true;
    subtitle10: true;
    displayH: true;
    displayNumber: true;
    displayUnit: true;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    solid: true;
    borderless: true;
  }
  interface ButtonPropsColorOverrides {
    "primary-main": true;
    "remove-button": true;
    purple: true;
    transparent: true;
    cancel: true;
    connect: true;
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsVariantOverrides {
    mini: true;
  }
}
