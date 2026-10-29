"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount, formatUsd } from "@/lib/format";
import type { TokenRef } from "@/lib/tokens";

// Right-column action card on market / vault / pool pages:
// action tabs, an amount box with balance + USD, detail rows and one full-width button.

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
          disabled={!onMax || !balance}
          onClick={onMax}
          sx={{ height: "1.75rem", px: "0.75rem", borderRadius: "999rem", backgroundColor: "overlay.white08", fontSize: "0.75rem", color: over ? "error.main" : "grey.200" }}
        >
          {balanceLabel}: {balance == null ? "—" : formatAmount(balance, 6)} {token.code}
          {onMax && !!balance && (
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
  const tab = tabs.find((t) => t.id === active);
  const reason = tab?.blocked ?? blocker;
  return (
    <Box
      sx={{
        borderRadius: "1.25rem",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        backgroundColor: "surfaceBg.section",
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>{title}</Typography>
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
            onClick={onSubmit}
            sx={{ height: "3.25rem", borderRadius: "999rem", fontSize: "0.9375rem", fontWeight: 600, textTransform: "uppercase" }}
          >
            {busy ? "Working…" : reason ? (reason.length > 28 ? "Unavailable" : reason) : cta}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}
