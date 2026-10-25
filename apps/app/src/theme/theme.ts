import { createTheme, type PaletteMode } from "@mui/material/styles";
import { darkColors, lightColors } from "./palette";
import { getComponents } from "./components";

export const typography = { fontFamily: '"Public Sans", sans-serif' };

export const createAppTheme = (mode: PaletteMode) => {
  const colors = mode === "light" ? lightColors : darkColors;
  return createTheme({
    palette: { mode, ...colors },
    typography,
    components: getComponents(colors, mode || "dark"),
  });
};
