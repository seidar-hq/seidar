"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import InputBase from "@mui/material/InputBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ContentPasteRoundedIcon from "@mui/icons-material/ContentPasteRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import { addressHues, resolveQuery, type RiskLevel } from "./discoverData";
import { riskColor } from "./risk";

/** Gradient disc derived from the address: the same wallet always looks the same. */
export function WalletAvatar({ address, size = "2.5rem" }: { address: string; size?: string }) {
  const [a, b] = addressHues(address);
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: `radial-gradient(circle at 30% 25%, hsl(${a} 85% 70%), transparent 60%), linear-gradient(135deg, hsl(${a} 70% 52%), hsl(${b} 75% 38%))`,
        boxShadow: `inset 0 0 0 0.0625rem ${alpha("#fff", 0.14)}`,
      }}
    />
  );
}

export function RiskPill({ level, reasons, label, small }: { level: RiskLevel | "very high"; reasons?: string[]; label?: string; small?: boolean }) {
  const c = riskColor(level);
  const pill = (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        px: small ? "0.5rem" : "0.625rem",
        height: small ? "1.375rem" : "1.625rem",
        borderRadius: "999rem",
        fontSize: small ? "0.6875rem" : "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: c,
        backgroundColor: alpha(c, 0.12),
        border: `0.0625rem solid ${alpha(c, 0.28)}`,
        cursor: reasons?.length ? "help" : "default",
      }}
    >
      <Box component="span" sx={{ width: "0.375rem", height: "0.375rem", borderRadius: "50%", backgroundColor: c }} />
      {label ?? `${level.charAt(0).toUpperCase()}${level.slice(1)} risk`}
    </Box>
  );
  if (!reasons?.length) return pill;
  return (
    <Tooltip
      arrow
      title={
        <Box component="ul" sx={{ m: 0, pl: "1rem", py: "0.25rem" }}>
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </Box>
      }
    >
      {pill}
    </Tooltip>
  );
}

export function CardTitle({ children, sub, right }: { children: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", px: "0.25rem" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>{children}</Typography>
        {sub && (
          <Typography variant="subtitle3" color="grey.200" component="div" sx={{ mt: "0.125rem" }}>
            {sub}
          </Typography>
        )}
      </Box>
      {right}
    </Box>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
      <Typography variant="subtitle3" color="grey.200" noWrap>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: "1.0625rem", fontWeight: 600, color: color ?? "common.black", lineHeight: 1.25 }} noWrap>
        {value}
      </Typography>
      {sub && (
        <Typography component="div" variant="caption" color="grey.200" noWrap>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** Small segmented control (pills in a track). */
export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <Box sx={{ display: "inline-flex", p: "0.1875rem", gap: "0.125rem", borderRadius: "999rem", backgroundColor: "surfaceBg.softInset", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <ButtonBase
            key={o.value}
            onClick={() => onChange(o.value)}
            sx={{
              px: size === "sm" ? "0.625rem" : "0.875rem",
              height: size === "sm" ? "1.625rem" : "2rem",
              borderRadius: "999rem",
              fontSize: size === "sm" ? "0.75rem" : "0.8125rem",
              fontWeight: 500,
              color: on ? "#fff" : "grey.200",
              backgroundColor: on ? "sidebar.primary" : "transparent",
              transition: "background-color 150ms ease, color 150ms ease",
              "&:hover": { color: on ? "#fff" : "common.black" },
            }}
          >
            {o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/** Address / federation-name box that opens the wallet's profile. */
export function AddressSearch({ autoFocus, compact }: { autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (value = q) => {
    const s = value.trim();
    if (!s || busy) return;
    setBusy(true);
    setError(null);
    const r = await resolveQuery(s);
    setBusy(false);
    if (r.address) {
      setQ("");
      router.push(`/discover?address=${r.address}`);
    } else setError(r.error ?? "Not found.");
  };

  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) {
        setQ(t);
        void go(t);
      }
    } catch {
      setError("Your browser blocked reading the clipboard: paste with Ctrl+V instead.");
    }
  };

  const h = compact ? "2.75rem" : "3.5rem";
  return (
    <Box sx={{ width: "100%" }}>
      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          void go();
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          height: h,
          pl: "1rem",
          pr: "0.375rem",
          borderRadius: "999rem",
          backgroundColor: "surfaceBg.softInset",
          border: (t) => `0.0625rem solid ${error ? t.palette.error.main : t.palette.overlay.white08}`,
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          "&:focus-within": { borderColor: "primary.main", boxShadow: (t) => `0 0 0 0.25rem ${alpha(t.palette.sidebar.primary, 0.18)}` },
        }}
      >
        <SearchIcon />
        <InputBase
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setError(null);
          }}
          placeholder="Paste a Stellar address (G…) or name*domain.com"
          inputProps={{ "aria-label": "Wallet address", spellCheck: false, autoCapitalize: "characters" }}
          sx={{ flex: 1, fontSize: compact ? "0.875rem" : "0.9375rem", color: "common.black", fontFamily: q ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined, minWidth: 0 }}
        />
        {!q && (
          <Tooltip title="Paste from clipboard">
            <ButtonBase onClick={paste} sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", color: "grey.200", "&:hover": { color: "common.black", backgroundColor: "overlay.white08" } }}>
              <ContentPasteRoundedIcon sx={{ fontSize: "1.125rem" }} />
            </ButtonBase>
          </Tooltip>
        )}
        <ButtonBase
          type="submit"
          disabled={!q.trim() || busy}
          aria-label="View wallet"
          sx={{
            height: compact ? "2rem" : "2.75rem",
            px: compact ? "0.875rem" : "1.25rem",
            gap: "0.375rem",
            borderRadius: "999rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#fff",
            backgroundColor: "sidebar.primary",
            opacity: !q.trim() ? 0.5 : 1,
            transition: "opacity 150ms ease, transform 150ms ease",
            "&:hover": { transform: "translateY(-0.0625rem)" },
          }}
        >
          {busy ? <CircularProgress size="1rem" sx={{ color: "#fff" }} /> : <ArrowForwardRoundedIcon sx={{ fontSize: "1.125rem" }} />}
          {!compact && "View"}
        </ButtonBase>
      </Box>
      {error && (
        <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: "0.5rem", px: "1rem" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
