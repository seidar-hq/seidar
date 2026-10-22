/* eslint-disable @typescript-eslint/no-empty-object-type -- module augmentation needs empty interface merges */
import "@mui/material/styles";
import "@mui/material/Typography";
import "@mui/material/Button";

type CustomTypographyVariant =
  | "body1Medium"
  | "body1SemiBold"
  | "body1Bold"
  | "body2Medium"
  | "body2SemiBold"
  | "body2Bold"
  | "body3"
  | "body3Medium"
  | "body3SemiBold"
  | "body3Bold"
  | "body4"
  | "body4Medium"
  | "body4SemiBold"
  | "body4Bold"
  | "subtitle1Medium"
  | "subtitle1SemiBold"
  | "subtitle1Bold"
  | "captionMedium"
  | "captionSemiBold"
  | "captionBold"
  | "overlineMedium"
  | "overlineSemiBold"
  | "overlineBold";

declare module "@mui/material/styles" {
  interface PaletteColor {
    blackBackground?: string;
    blackText?: string;
    black?: string;
    frostedBlue?: string;
    gray?: string;
    mutedBlue?: string;
    purple?: string;
    themeColor2?: string;
    cardBackground?: string;
    cardImageBackground?: string;
    paleBlue?: string;
  }

  interface SimplePaletteColorOptions {
    blackBackground?: string;
    blackText?: string;
    black?: string;
    frostedBlue?: string;
    gray?: string;
    mutedBlue?: string;
    purple?: string;
    themeColor2?: string;
    cardBackground?: string;
    cardImageBackground?: string;
    paleBlue?: string;
  }

  interface WhitePalette {
    main: string;
    main100: string;
    light: string;
    light200: string;
    soft: string;
    faint: string;
    alpha19: string;
  }

  interface Palette {
    white: WhitePalette;
    dark: { main: string; light: string };
    border: { dark: string; main: string };
    green: { main: string };
    orange: { main: string };
    blue: { main: string };
    black: { main: string };
  }

  interface PaletteOptions {
    white?: Partial<WhitePalette>;
    dark?: { main: string; light: string };
    border?: { dark: string; main: string };
    green?: { main: string };
    orange?: { main: string };
    blue?: { main: string };
    black?: { main: string };
  }

  interface Color {
    main?: string;
    main100?: string;
    placeholder?: string;
    inputPlaceholder?: string;
    dark?: string;
    dark200?: string;
    muted?: string;
  }

  interface TypographyVariants extends Record<CustomTypographyVariant, React.CSSProperties> {}
  interface TypographyVariantsOptions extends Partial<Record<CustomTypographyVariant, React.CSSProperties>> {}
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides extends Record<CustomTypographyVariant, true> {}
}

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    primary: true;
    secondary: true;
    success: true;
  }
}
