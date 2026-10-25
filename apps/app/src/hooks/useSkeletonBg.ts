"use client";

import { useTheme } from "@mui/material/styles";
import { useThemeMode } from "@/theme/ThemeModeContext";

export const useSkeletonBg = () => {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  return isDarkMode ? theme.palette.overlay.white02 : theme.palette.grey[100];
};
