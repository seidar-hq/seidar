"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import GlassDialog from "@/components/common/GlassDialog";
import TokenLogo from "@/components/common/TokenLogo";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";

export type SwapToken = {
  code: string;
  contract: string;
  decimals: number;
  name: string | null;
  issuer: string | null;
  balance: number;
  usd: number;
  price: number | null;
};

const SearchRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  height: "2.75rem",
  padding: "0 0.875rem",
  borderRadius: "6.25rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  borderTop: `0.0625rem solid ${theme.palette.border.main700}`,
  borderBottom: `0.0625rem solid ${theme.palette.border.main700}`,
}));

const Row = styled(ButtonBase, { shouldForwardProp: (p) => p !== "selected" })<{ selected?: boolean }>(({ theme, selected }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  width: "100%",
  padding: "0.625rem 0.75rem",
  borderRadius: "0.75rem",
  textAlign: "left",
  backgroundColor: selected ? theme.palette.surfaceBg.pill : "transparent",
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
}));

const QuickChip = styled(ButtonBase)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  padding: "0.375rem 0.625rem 0.375rem 0.375rem",
  borderRadius: "999rem",
  border: `0.0625rem solid ${theme.palette.border.main700}`,
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
}));

const QUICK = ["XLM", "USDC", "EURC", "AQUA", "BLND"];

/** "Select a token" modal: search by code, name, issuer or contract; wallet balances first. */
export default function TokenSelectDialog({
  open,
  onClose,
  tokens,
  selected,
  onSelect,
  onlyHeld = false,
}: {
  open: boolean;
  onClose: () => void;
  tokens: SwapToken[];
  selected?: string | null;
  onSelect: (t: SwapToken) => void;
  /** Send: only tokens the wallet actually holds. */
  onlyHeld?: boolean;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tokens
      .filter((t) => !onlyHeld || t.balance > 0)
      .filter(
        (t) =>
          !s ||
          t.code.toLowerCase().includes(s) ||
          (t.name ?? "").toLowerCase().includes(s) ||
          t.contract.toLowerCase() === s ||
          (t.issuer ?? "").toLowerCase() === s,
      )
      .sort((a, b) => b.usd - a.usd || b.balance - a.balance)
      .slice(0, 200);
  }, [tokens, q, onlyHeld]);

  const pick = (t: SwapToken) => {
    onSelect(t);
    setQ("");
    onClose();
  };

  return (
    <GlassDialog open={open} onClose={onClose} title="Select a token" actions={null} maxWidth="27rem">
      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <SearchRow>
          <Box sx={{ display: "inline-flex", color: "grey.200" }}>
            <SearchIcon size="1.125rem" />
          </Box>
          <InputBase
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code or contract"
            sx={{ flex: 1, color: "common.black", fontSize: "0.875rem" }}
          />
        </SearchRow>
        {!onlyHeld && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {QUICK.map((code) => {
              const t = tokens.find((x) => x.code === code);
              return t ? (
                <QuickChip key={code} onClick={() => pick(t)}>
                  <TokenLogo code={t.code} issuer={t.issuer} size="1.25rem" />
                  <Typography variant="subtitle3" color="common.black">
                    {t.code}
                  </Typography>
                </QuickChip>
              ) : null;
            })}
          </Box>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "24rem", overflowY: "auto", mx: "-0.5rem" }}>
          {list.map((t) => (
            <Row key={t.contract} selected={t.contract === selected} onClick={() => pick(t)}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <TokenLogo code={t.code} issuer={t.issuer} size="2rem" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" color="common.black">
                    {t.code}
                  </Typography>
                  <Typography variant="caption" color="grey.200" noWrap sx={{ display: "block" }}>
                    {t.name ?? (t.issuer ? shortAddress(t.issuer) : shortAddress(t.contract))}
                  </Typography>
                </Box>
              </Box>
              {t.balance > 0 && (
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="subtitle1" color="common.black">
                    {formatAmount(t.balance, 4)}
                  </Typography>
                  <Typography variant="caption" color="grey.200">
                    {t.price ? formatUsd(t.usd) : ""}
                  </Typography>
                </Box>
              )}
            </Row>
          ))}
          {list.length === 0 && (
            <Typography variant="subtitle3" color="grey.200" sx={{ textAlign: "center", py: "2rem" }}>
              {onlyHeld ? "No tokens in this wallet." : "No tokens found."}
            </Typography>
          )}
        </Box>
      </Box>
    </GlassDialog>
  );
}
