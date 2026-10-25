"use client";

import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled, useTheme, type Theme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useThemeMode } from "@/theme/ThemeModeContext";

export function BackButton({ fontSize, to }: { fontSize?: string; to?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { isDarkMode } = useThemeMode();
  const line = isDarkMode ? `0.0625rem solid ${theme.palette.overlay.white08}` : `0.0625rem solid ${theme.palette.border.main1000}`;
  return (
    <IconButton
      sx={{
        backgroundColor: isDarkMode ? theme.palette.overlay.white05 : theme.palette.overlay.dark06,
        borderRadius: "1.75rem",
        borderTop: line,
        borderBottom: line,
        boxShadow: isDarkMode ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.exchange}` : "none",
        height: "2.25rem",
        width: "2.25rem",
        padding: "0.5rem",
        "&:hover": { backgroundColor: isDarkMode ? theme.palette.overlay.white08 : theme.palette.overlay.dark16 },
      }}
      onClick={() => {
        if (to) router.push(to);
        else if (window.history.length > 1) router.back();
        else router.push("/");
      }}
    >
      <ArrowBackRoundedIcon style={{ fontSize: fontSize || "1.250rem", color: theme.palette.grey[200] }} />
    </IconButton>
  );
}

const periodSx = (theme: Theme, active: boolean, dark: boolean) => ({
  minWidth: "fit-content",
  width: "1.750rem",
  height: "1.750rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "6.250rem",
  fontWeight: 400,
  fontSize: "0.750rem",
  textTransform: "none",
  minHeight: "auto",
  backgroundColor: active ? theme.palette.sidebar.primary : "transparent",
  color: dark ? theme.palette.common.black : active ? theme.palette.common.white : theme.palette.common.black,
  borderTop: dark ? `0.0625rem solid ${theme.palette.overlay.white08}` : `0.0625rem solid ${theme.palette.border.main1000}`,
  borderBottom: dark ? `0.0625rem solid ${theme.palette.overlay.white08}` : `0.0625rem solid ${theme.palette.border.main1000}`,
  boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.exchange}` : "none",
  "&:hover": {
    backgroundColor: active ? theme.palette.sidebar.primary : dark ? theme.palette.sidebar.black100 : theme.palette.grey[100],
    boxShadow: "none",
  },
});

export function TimePeriodSelector({
  timePeriods,
  selected,
  onSelect,
}: {
  timePeriods: { value: string; label: string }[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", mt: "0.5rem" }}>
      {timePeriods.map((p) => (
        <Button key={p.value} color="primary-main" variant="solid" onClick={() => onSelect(p.value)} sx={periodSx(theme, selected === p.value, isDarkMode)}>
          {p.label}
        </Button>
      ))}
    </Box>
  );
}

const StatShell = styled(Box, { shouldForwardProp: (p) => p !== "glass" && p !== "noBg" })<{ glass?: boolean; noBg?: boolean }>(
  ({ theme, glass = false, noBg = false }) => {
    const dark = theme.palette.mode === "dark";
    return {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      height: "8rem",
      padding: "1.125rem",
      borderRadius: glass ? "0.75rem" : "0.5rem",
      overflow: "hidden",
      backgroundColor: noBg ? "transparent" : dark ? (glass ? theme.palette.overlay.white02 : theme.palette.overlay.white05) : theme.palette.surfaceBg.softInset,
      border: noBg
        ? "none"
        : dark && glass
          ? `0.0625rem solid ${theme.palette.overlay.white08}`
          : `0.0625rem solid ${theme.palette.border.main1000}`,
      boxShadow: noBg ? "none" : dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.exchange}` : "none",
    };
  },
);

const StatBody = styled(Box)({ display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: "1rem", width: "100%" });

export function StatCard({
  label,
  value,
  valueTooltip,
  showChange = false,
  changeValue = 0,
  icon,
}: {
  label: string;
  value: string;
  valueTooltip?: string;
  showChange?: boolean;
  changeValue?: number;
  icon?: React.ReactNode;
}) {
  const theme = useTheme();
  const up = changeValue >= 0;
  const valueNode = (color: string) =>
    valueTooltip ? (
      <Tooltip placement="top" arrow title={valueTooltip}>
        <Typography variant="body4" sx={{ color, cursor: "default", width: "fit-content" }}>
          {value}
        </Typography>
      </Tooltip>
    ) : (
      <Typography variant="body4" sx={{ color }}>
        {value}
      </Typography>
    );

  return (
    <StatShell>
      <StatBody>
        <Typography variant="subtitle5">{label}</Typography>
        <Box>
          {icon ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>{icon}</Box>
          ) : showChange ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              {up ? (
                <ArrowUpwardIcon sx={{ fontSize: "1rem", color: "success.main" }} />
              ) : (
                <ArrowDownwardIcon sx={{ fontSize: "1rem", color: "error.main" }} />
              )}
              {valueNode(up ? theme.palette.green.main : theme.palette.error.main)}
            </Box>
          ) : (
            valueNode(theme.palette.common.black)
          )}
        </Box>
      </StatBody>
    </StatShell>
  );
}
