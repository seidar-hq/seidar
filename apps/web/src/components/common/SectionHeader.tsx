"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { SxProps, Theme } from "@mui/material/styles";

const Pill = styled(Box, {
  shouldForwardProp: (prop) => prop !== "bgColor" && prop !== "mobileWidth",
})<{ bgColor?: string; mobileWidth?: string }>(({ theme, bgColor, mobileWidth }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: "200px",
  background: bgColor || "rgba(255, 255, 255, 0.10)",
  width: "fit-content",
  ...(mobileWidth && { [theme.breakpoints.down("sm")]: { width: mobileWidth } }),
}));

type Props = {
  text: string;
  bgColor?: string;
  mobileWidth?: string;
  sx?: SxProps<Theme>;
};

export default function SectionHeader({ text, bgColor, mobileWidth, sx }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Pill bgColor={bgColor} mobileWidth={mobileWidth} sx={sx}>
      <Typography
        variant={isMobile ? "body4SemiBold" : "subtitle1SemiBold"}
        sx={{ lineHeight: 1.4, ...(mobileWidth && isMobile && { textAlign: "center" }) }}
      >
        {text}
      </Typography>
    </Pill>
  );
}
