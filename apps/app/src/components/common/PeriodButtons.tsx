"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useTheme, type Theme } from "@mui/material/styles";

export type Period<T extends string = string> = { value: T; label: string };

const buttonSx = (theme: Theme, active: boolean) => {
  const dark = theme.palette.mode === "dark";
  return {
    minWidth: "fit-content",
    width: "1.75rem",
    height: "1.75rem",
    padding: "0.25rem 0.5rem",
    borderRadius: "6.25rem",
    fontWeight: 400,
    fontSize: "0.75rem",
    textTransform: "none",
    minHeight: "auto",
    backgroundColor: active ? theme.palette.sidebar.primary : "transparent",
    color: dark ? theme.palette.common.black : active ? theme.palette.common.white : theme.palette.common.black,
    borderTop: dark ? "none" : `0.0625rem solid ${theme.palette.border.main1000}`,
    borderBottom: dark ? "none" : `0.0625rem solid ${theme.palette.border.main1000}`,
    boxShadow: "none",
    "&:hover": {
      backgroundColor: active ? theme.palette.sidebar.primary : dark ? theme.palette.sidebar.black100 : theme.palette.grey[100],
      boxShadow: "none",
    },
  } as const;
};

/** Row of pill buttons for choosing a chart period (1d, 7d, 30d …). */
export default function PeriodButtons<T extends string>({
  periods,
  value,
  onChange,
  noTopMargin = false,
}: {
  periods: Period<T>[];
  value: T;
  onChange: (v: T) => void;
  noTopMargin?: boolean;
}) {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: noTopMargin ? "nowrap" : "wrap", mt: noTopMargin ? 0 : "0.5rem" }}>
      {periods.map((p) => (
        <Button key={p.value} disableElevation onClick={() => onChange(p.value)} sx={buttonSx(theme, value === p.value)}>
          {p.label}
        </Button>
      ))}
    </Box>
  );
}
