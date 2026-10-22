"use client";

import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { pxToRem } from "@/theme/theme";

type Props = { mediumFontSize?: number; smallFontSize?: number };

// Typography that can force a font size below the lg (1200px) and sm (600px) breakpoints.
const ResponsiveTypography = styled(Typography, {
  shouldForwardProp: (prop) => prop !== "mediumFontSize" && prop !== "smallFontSize",
})<Props>(({ mediumFontSize, smallFontSize }) => ({
  ...(mediumFontSize && {
    "@media (max-width:1200px)": { fontSize: `${pxToRem(mediumFontSize)} !important` },
  }),
  ...(smallFontSize && {
    "@media (max-width:600px)": { fontSize: `${pxToRem(smallFontSize)} !important` },
  }),
}));

export default ResponsiveTypography;
