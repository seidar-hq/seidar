"use client";

import { useEffect, useState } from "react";
import CallMadeRoundedIcon from "@mui/icons-material/CallMadeRounded";
import CallReceivedRoundedIcon from "@mui/icons-material/CallReceivedRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import UploadRoundedIcon from "@mui/icons-material/UploadRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import useMediaQuery from "@mui/material/useMediaQuery";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Tabs from "@/components/common/Tabs";
import Shimmer from "@/components/common/Shimmer";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount, formatUsd } from "@/lib/format";
import type { TokenRef } from "@/lib/tokens";

// Right-column action card on market / vault / pool pages:
// action tabs, an amount box with balance + USD, detail rows and one full-width button.
// Below DOCK_BELOW (where those pages stack into one column) the card leaves the page: a floating
// dock at the bottom of the screen has one button per action, and each opens the card in a
// bottom sheet on that action.

/** Same width at which the market and vault pages drop to one column. */
const DOCK_BELOW = "75rem";
const DOCK_MEDIA = `(max-width: ${DOCK_BELOW})`;

/** Content shown only inside the mobile sheet (e.g. a position summary that is off-screen there). */
export const sheetOnly = { [`@media (min-width: calc(${DOCK_BELOW} + 0.0625rem))`]: { display: "none" } } as const;

const TAB_ICONS: Record<string, React.ElementType> = {
  supply: DownloadRoundedIcon,
  deposit: DownloadRoundedIcon,
  withdraw: UploadRoundedIcon,
  borrow: CallReceivedRoundedIcon,
  repay: CallMadeRoundedIcon,
  leverage: TrendingUpRoundedIcon,
};

export type ActionTab = { id: string; label: string; blocked?: string | null };
export type DetailRow = { label: string; value: React.ReactNode; color?: string };

export const sanitizeAmount = (v: string) => (/^\d*\.?\d*$/.test(v) ? v : null);

export function AmountBox({
  label,
  token,
  amount,
  onAmount,
  balance,
  balanceLabel = "Balance",
  balanceLoading = false,
  price,
  onMax,
  readOnly,
}: {
  label: string;
  token: TokenRef;
  amount: string;
  onAmount?: (v: string) => void;
  balance: number | null;
  balanceLabel?: string;
  /** Balance still loading, or updating after a transaction: shimmer instead of a number. */
  balanceLoading?: boolean;
  price: number | null;
  onMax?: () => void;
  readOnly?: boolean;
}) {
  const n = Number(amount || 0);
  const over = balance != null && n > balance + 1e-12;
  return (
    <Box
      sx={{
        borderRadius: "1rem",
        border: (t) => `0.0625rem solid ${over ? t.palette.error.main : t.palette.overlay.white08}`,
        backgroundColor: "overlay.white04",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: "common.black" }}>{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <InputBase
          placeholder="0.00"
          value={amount}
          readOnly={readOnly}
          onChange={(e) => {
            const v = sanitizeAmount(e.target.value);
            if (v != null) onAmount?.(v);
          }}
          inputProps={{ inputMode: "decimal", "aria-label": label }}
          sx={{ flex: 1, minWidth: 0, fontSize: "1.75rem", fontWeight: 600, color: "common.black" }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, px: "0.75rem", height: "2.5rem", borderRadius: "999rem", backgroundColor: "overlay.white08" }}>
          <TokenLogo code={token.code} issuer={token.issuer} contract={token.contract} size="1.75rem" />
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>{token.code}</Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <ButtonBase
          disabled={!onMax || !balance || balanceLoading}
          onClick={onMax}
          sx={{ height: "1.75rem", px: "0.75rem", borderRadius: "999rem", backgroundColor: "overlay.white08", fontSize: "0.75rem", color: over ? "error.main" : "grey.200" }}
        >
          {balanceLabel}:&nbsp;
          <Shimmer on={balanceLoading} width="3.5rem" height="0.875rem">
            {balance == null ? "—" : formatAmount(balance, 6)}
          </Shimmer>
          &nbsp;{token.code}
          {onMax && !!balance && !balanceLoading && (
            <Box component="span" sx={{ ml: "0.5rem", color: "primary.main", fontWeight: 600 }}>
              MAX
            </Box>
          )}
        </ButtonBase>
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>≈{price != null ? formatUsd(n * price) : "—"}</Typography>
      </Box>
    </Box>
  );
}

export function DetailRows({ rows }: { rows: DetailRow[] }) {
  if (!rows.length) return null;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem", px: "0.25rem" }}>
      {rows.map((r) => (
        <Box key={r.label} sx={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{r.label}</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: r.color ?? "common.black", textAlign: "right", whiteSpace: "nowrap" }}>{r.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function ActionCard({
  title,
  tabs,
  active,
  onTab,
  children,
  cta,
  blocker,
  onSubmit,
  busy,
}: {
  title: string;
  tabs: ActionTab[];
  active: string;
  onTab: (id: string) => void;
  children: React.ReactNode;
  cta: string;
  /** Reason the button is disabled (shown as its label). */
  blocker: string | null;
  onSubmit: () => void;
  busy?: boolean;
}) {
  const docked = useMediaQuery(DOCK_MEDIA, { noSsr: true });
  const [sheet, setSheet] = useState(false);
  // Keep the page's last lines clear of the dock.
  useEffect(() => {
    if (!docked) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "6.5rem";
    return () => {
      document.body.style.paddingBottom = prev;
    };
  }, [docked]);
  useEffect(() => {
    if (!docked) setSheet(false);
  }, [docked]);

  const tab = tabs.find((t) => t.id === active);
  const reason = tab?.blocked ?? blocker;
  const card = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        ...(docked
          ? { px: "1.25rem", pb: "calc(1.25rem + env(safe-area-inset-bottom))" }
          : {
              borderRadius: "1.25rem",
              border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
              backgroundColor: "surfaceBg.section",
              padding: "1.25rem",
            }),
      }}
    >
      {!docked && <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>{title}</Typography>}
      {tabs.length > 1 && (
        <Tabs
          tabs={tabs.map((t) => ({ id: t.id, label: t.label, padding: "0 0.5rem" }))}
          activeTab={active}
          setActiveTab={onTab}
          isPathProvided={false}
          fullWidth
        />
      )}
      {children}
      <Tooltip title={reason && reason.length > 28 ? reason : ""} arrow placement="top">
        <span>
          <Button
            variant="solid"
            color="primary"
            fullWidth
            disabled={!!reason || busy}
            onClick={() => {
              // The transaction dialog takes over from the sheet.
              setSheet(false);
              onSubmit();
            }}
            sx={{ height: "3.25rem", borderRadius: "999rem", fontSize: "0.9375rem", fontWeight: 600, textTransform: "uppercase" }}
          >
            {busy ? "Working…" : reason ? (reason.length > 28 ? "Unavailable" : reason) : cta}
          </Button>
        </span>
      </Tooltip>
      {docked && reason && reason.length > 28 && (
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200", textAlign: "center", mt: "-0.25rem" }}>{reason}</Typography>
      )}
    </Box>
  );
  if (!docked) return card;

  return (
    <>
      <Box
        component="nav"
        aria-label="Actions"
        sx={{
          position: "fixed",
          zIndex: 1100,
          left: "0.75rem",
          right: "0.75rem",
          bottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          maxWidth: "36rem",
          mx: "auto",
          display: "flex",
          p: "0.375rem",
          borderRadius: "1.5rem",
          border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
          backgroundColor: "rgba(28, 28, 30, 0.82)",
          backdropFilter: "blur(1rem)",
          WebkitBackdropFilter: "blur(1rem)",
          boxShadow: "0 0.75rem 2.5rem rgba(0, 0, 0, 0.5)",
        }}
      >
        {tabs.map((t) => {
          const Icon = TAB_ICONS[t.id] ?? DownloadRoundedIcon;
          const on = sheet && t.id === active;
          return (
            <ButtonBase
              key={t.id}
              onClick={() => {
                onTab(t.id);
                setSheet(true);
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.3125rem",
                py: "0.5rem",
                borderRadius: "1.125rem",
                opacity: t.blocked ? 0.45 : 1,
                backgroundColor: on ? "overlay.white08" : "transparent",
                transition: "background-color 150ms",
              }}
            >
              <Box
                sx={{
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: on ? "primary.main" : "overlay.white08",
                  color: on ? "common.white" : "common.black",
                  transition: "background-color 150ms",
                }}
              >
                <Icon sx={{ fontSize: "1.125rem" }} />
              </Box>
              <Typography noWrap sx={{ fontSize: "0.75rem", fontWeight: 600, color: "common.black", maxWidth: "100%" }}>
                {t.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
      <SwipeableDrawer
        anchor="bottom"
        open={sheet}
        onOpen={() => setSheet(true)}
        onClose={() => setSheet(false)}
        disableSwipeToOpen
        PaperProps={{
          // Lenis smooth scrolling must leave the sheet's own scroll alone.
          ...({ "data-lenis-prevent": true } as object),
          sx: {
            maxHeight: "90dvh",
            maxWidth: "36rem",
            mx: "auto",
            borderTopLeftRadius: "1.5rem",
            borderTopRightRadius: "1.5rem",
            backgroundColor: "surfaceBg.section",
            backgroundImage: "none",
            borderTop: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center", pt: "0.625rem", pb: "0.75rem" }}>
          <Box sx={{ width: "2.5rem", height: "0.3125rem", borderRadius: "999rem", backgroundColor: "overlay.white20" }} />
        </Box>
        {card}
      </SwipeableDrawer>
    </>
  );
}
