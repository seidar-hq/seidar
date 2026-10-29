"use client";

import { Fragment, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Grow from "@mui/material/Grow";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";

export const FilterButton = styled(Button)(({ theme }) => {
  const line = theme.palette.mode === "light" ? theme.palette.border.main600 : theme.palette.overlay.white08;
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.625rem",
    height: "2.75rem",
    minWidth: "9.25rem",
    padding: "0.5rem 1rem",
    borderRadius: "3.125rem",
    textTransform: "none",
    backgroundColor: theme.palette.surfaceBg.pill,
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    color: theme.palette.sidebar.heading,
    transition: "200ms ease",
    "&:hover": { backgroundColor: theme.palette.overlay.white08, textDecoration: "none" },
  };
});

export const FilterPaper = styled(Paper)(({ theme }) => ({
  marginTop: "0.5rem",
  marginBottom: "0.5rem",
  width: "17.5rem",
  maxHeight: "26rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.5rem",
  borderRadius: "1.25rem",
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  backgroundColor: theme.palette.overlay.white08,
  backgroundImage: "none",
  backdropFilter: "blur(2.6875rem)",
  WebkitBackdropFilter: "blur(2.6875rem)",
  boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
  color: theme.palette.common.black,
}));

export const FilterGroupLabel = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  width: "100%",
  padding: "0.75rem 0.5rem 0.25rem",
  "&::after": { content: '""', flex: 1, borderTop: `0.0625rem solid ${theme.palette.border.main700}` },
}));

export const OptionList = styled(Box)({
  overflowY: "auto",
  overflowX: "hidden",
  flex: 1,
  minHeight: 0,
  paddingRight: "0.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
});

export const OptionRow = styled(Box, { shouldForwardProp: (p) => p !== "selected" })<{ selected?: boolean }>(
  ({ theme, selected }) => ({
    cursor: "pointer",
    flexShrink: 0,
    height: "3.8125rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.5rem",
    gap: "0.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: selected ? theme.palette.surfaceBg.pill : "transparent",
    borderTop: "none",
    borderBottom: "none",
    boxShadow: "none",
  }),
);

export const CheckDot = styled(Box)(({ theme }) => ({
  width: "1rem",
  height: "1rem",
  borderRadius: "50%",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.sidebar.white,
}));

export const IdleDot = styled(Box)(({ theme }) => ({
  width: "1rem",
  height: "1rem",
  borderRadius: "0.5rem",
  flexShrink: 0,
  backgroundColor: theme.palette.surfaceBg.radioIdle,
}));

type Option = { value: string; label: string };
const GROUPS: { group?: string; options: Option[] }[] = [
  { options: [{ value: "all", label: "All Transactions" }] },
  {
    group: "Earn",
    options: [
      { value: "lend", label: "Lend & Borrow" },
      { value: "liquidity", label: "Liquidity" },
      { value: "vaults", label: "Vaults" },
    ],
  },
  {
    group: "Trade",
    options: [
      { value: "swap", label: "Swap" },
      { value: "perps", label: "Perps" },
    ],
  },
  { group: "Bridge", options: [{ value: "bridge", label: "Bridge" }] },
  {
    group: "Others",
    options: [
      { value: "send", label: "Send" },
      { value: "receive", label: "Receive" },
      { value: "other", label: "Other" },
    ],
  },
];
const ALL_OPTIONS = GROUPS.flatMap((g) => g.options);

export default function TransactionFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const current = ALL_OPTIONS.find((o) => o.value === value) ?? ALL_OPTIONS[0];

  const handleClickAway = (e: MouseEvent | TouchEvent) => {
    if (anchor.current?.contains(e.target as Node)) return;
    setOpen(false);
  };

  return (
    <>
      <FilterButton ref={anchor} variant="borderless" disableRipple onClick={() => setOpen((o) => !o)}>
        <Typography variant="body1" sx={{ color: "sidebar.heading", whiteSpace: "nowrap" }}>
          {current.label}
        </Typography>
        <TuneRoundedIcon sx={{ fontSize: "1.25rem", color: "grey.200", flexShrink: 0 }} />
      </FilterButton>
      <Popper open={open} placement="bottom-end" transition anchorEl={anchor.current} style={{ zIndex: 1300 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} style={{ transformOrigin: "right top" }}>
            <FilterPaper elevation={0}>
              <ClickAwayListener onClickAway={handleClickAway}>
                <OptionList>
                  {GROUPS.map((g, gi) => (
                    <Fragment key={g.group ?? gi}>
                      {g.group && (
                        <FilterGroupLabel>
                          <Typography variant="subtitle3" sx={{ color: "textColor.muted" }}>
                            {g.group}
                          </Typography>
                        </FilterGroupLabel>
                      )}
                      {g.options.map((o) => {
                        const selected = o.value === current.value;
                        return (
                          <OptionRow
                            key={o.value}
                            selected={selected}
                            onClick={() => {
                              onChange(o.value);
                              setOpen(false);
                            }}
                          >
                            <Typography variant="subtitle1" sx={{ color: "common.black" }}>
                              {o.label}
                            </Typography>
                            {selected ? (
                              <CheckDot>
                                <CheckIcon sx={{ fontSize: "0.75rem", color: "purple.main" }} />
                              </CheckDot>
                            ) : (
                              <IdleDot />
                            )}
                          </OptionRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </OptionList>
              </ClickAwayListener>
            </FilterPaper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
