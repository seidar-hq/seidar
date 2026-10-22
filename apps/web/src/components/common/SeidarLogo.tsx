"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

type Props = {
  onClick?: () => void;
  sx?: SxProps<Theme>;
};

// White Seidar mark followed by the "Seidar" wordmark, sized to sit where the 200x20 nav logo did.
export default function SeidarLogo({ onClick, sx }: Props) {
  return (
    <Box
      onClick={onClick}
      sx={[{ display: "flex", alignItems: "center", gap: "8px", height: 20, width: 200 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Box component="img" src="/logos/seidar-mark-white.svg" alt="" sx={{ height: 13, width: "auto", display: "block" }} />
      <Typography
        component="span"
        sx={{ fontSize: "19px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em", color: "white.main" }}
      >
        Seidar
      </Typography>
    </Box>
  );
}
