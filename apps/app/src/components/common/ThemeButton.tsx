"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import { useThemeMode } from "@/theme/ThemeModeContext";

type Props = ButtonProps & {
  isLightPurple?: boolean;
  borderColor?: string;
  noDarkBg?: boolean;
};

export default function ThemeButton({ isLightPurple = false, borderColor, noDarkBg = false, sx, ...rest }: Props) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const border = `0.0625rem solid ${borderColor || theme.palette.overlay.white08}`;

  return (
    <Button
      variant="solid"
      color={isLightPurple ? "purple" : "primary-main"}
      {...rest}
      sx={{
        ...((sx as object) || {}),
        ...(isDarkMode && {
          backgroundColor: noDarkBg ? "transparent" : "grey.800",
          borderTop: border,
          borderBottom: border,
          color: "common.black",
          "&:hover": {
            backgroundColor: noDarkBg ? "transparent" : "grey.800",
            borderTop: border,
            borderBottom: border,
            color: "common.black",
            boxShadow: "none",
          },
          "&:disabled": { backgroundColor: "overlay.white20", border: "none", color: "grey.200" },
        }),
      }}
    />
  );
}
