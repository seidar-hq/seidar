"use client";

import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { useAlerts } from "@/components/common/Alerts";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import { shortAddress } from "@/lib/format";
import type { StatusInfo } from "./lendData";

// Shared building blocks for the Earn pages (lend & borrow, pools, vaults), after Cropr's earn UI.

export type ProtocolChip = { id: string; label: string; logo?: string };

/** "All" mark: four primary dots. */
function AllMark() {
  return (
    <Box component="svg" viewBox="0 0 24 24" sx={{ width: "1.75rem", height: "1.75rem" }}>
      <circle cx="12" cy="5.5" r="4" fill="#5C84FF" />
      <circle cx="5.5" cy="12" r="4" fill="#5C84FF" />
      <circle cx="18.5" cy="12" r="4" fill="#5C84FF" />
      <circle cx="12" cy="18.5" r="4" fill="#346CFF" />
    </Box>
  );
}

const Chip = styled(ButtonBase, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(({ theme, active }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.75rem",
  height: "3.75rem",
  padding: "0 1.375rem 0 1rem",
  borderRadius: "999rem",
  flexShrink: 0,
  fontSize: "1.0625rem",
  fontWeight: 500,
  color: theme.palette.common.black,
  backgroundColor: active ? theme.palette.overlay.white08 : theme.palette.overlay.white02,
  border: `0.0625rem solid ${active ? theme.palette.overlay.white40 : theme.palette.overlay.white08}`,
  transition: "background-color 150ms ease, border-color 150ms ease",
  "&:hover": { backgroundColor: theme.palette.overlay.white08 },
}));

/** Protocol filter row: "All" plus one logo chip per venue. */
export function ProtocolChips({ items, value, onChange }: { items: ProtocolChip[]; value: string; onChange: (id: string) => void }) {
  return (
    <Box sx={{ display: "flex", gap: "0.75rem", overflowX: "auto", pb: "0.25rem", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
      <Chip active={value === "all"} onClick={() => onChange("all")}>
        <AllMark />
        All
      </Chip>
      {items.map((p) => (
        <Chip key={p.id} active={value === p.id} onClick={() => onChange(p.id)}>
          {p.logo && <Box component="img" src={p.logo} alt="" sx={{ width: "1.875rem", height: "1.875rem", borderRadius: "50%", objectFit: "cover" }} />}
          {p.label}
        </Chip>
      ))}
    </Box>
  );
}

/** Per-venue card (logo + name heading, then that venue's tables). */
export function ProtocolSection({
  name,
  logo,
  right,
  children,
}: {
  name: string;
  logo?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ my: "0.75rem", backgroundColor: "grey.400", padding: "1.25rem", borderRadius: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", ml: "0.5rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {logo && <Box component="img" src={logo} alt="" sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", objectFit: "cover" }} />}
          <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "1.375rem", color: "common.black" }}>
            {name}
          </Typography>
        </Box>
        {right}
      </Box>
      {children}
    </Box>
  );
}

const SearchRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  height: "3rem",
  padding: "0 1.125rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.overlay.white04,
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  minWidth: "16rem",
  flex: "0 1 22rem",
}));

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <SearchRoot>
      <Box sx={{ display: "inline-flex", color: "grey.200" }}>
        <SearchIcon size="1.125rem" />
      </Box>
      <InputBase value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} sx={{ flex: 1, fontSize: "0.9375rem", color: "common.black" }} />
    </SearchRoot>
  );
}

const TONES = {
  ice: { fg: "#7CC4FF", bg: "rgba(124, 196, 255, 0.12)" },
  frozen: { fg: "#FF8A7A", bg: "rgba(255, 138, 122, 0.12)" },
  setup: { fg: "#BDBDBD", bg: "rgba(255, 255, 255, 0.08)" },
} as const;

/** Blend pool status pill with an explainer on hover. */
export function StatusPill({ info, small }: { info: StatusInfo | null; small?: boolean }) {
  if (!info) return null;
  const t = TONES[info.tone];
  return (
    <Tooltip title={info.tip} arrow placement="top">
      <Box
        component="span"
        onClick={(e) => e.stopPropagation()}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          height: small ? "1.375rem" : "1.75rem",
          px: small ? "0.5rem" : "0.75rem",
          borderRadius: "999rem",
          fontSize: small ? "0.6875rem" : "0.8125rem",
          fontWeight: 500,
          color: t.fg,
          backgroundColor: t.bg,
          whiteSpace: "nowrap",
          cursor: "help",
        }}
      >
        {info.label}
        <InfoOutlinedIcon sx={{ fontSize: small ? "0.75rem" : "0.875rem" }} />
      </Box>
    </Tooltip>
  );
}

/** Small uppercase row action ("SUPPLY", "BORROW"), same size everywhere. */
export function RowAction({
  label,
  onClick,
  disabled,
  tip,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tip?: string | null;
}) {
  const btn = (
    <ButtonBase
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        width: "6.5rem",
        height: "2.75rem",
        borderRadius: "999rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color: "common.black",
        backgroundColor: "overlay.white08",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        transition: "background-color 150ms ease",
        "&:hover": { backgroundColor: "overlay.white20" },
        "&.Mui-disabled": { opacity: 0.4 },
      }}
    >
      {label}
    </ButtonBase>
  );
  return tip ? (
    <Tooltip title={tip} arrow placement="top">
      <span onClick={(e) => e.stopPropagation()}>{btn}</span>
    </Tooltip>
  ) : (
    btn
  );
}

/** "Show all assets" style labelled switch with an info tip. */
export function LabeledSwitch({ label, tip, checked, onChange }: { label: string; tip: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <Typography variant="body1" sx={{ fontSize: "1rem", color: "common.black" }}>
        {label}
      </Typography>
      <Tooltip title={tip} arrow placement="top">
        <InfoOutlinedIcon sx={{ color: "primary.main", fontSize: "1.25rem", cursor: "help" }} />
      </Tooltip>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Box>
  );
}

/** Round back button + "Earn › Lend & Borrow › …" trail. */
export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
      <IconButton
        aria-label="Back"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(trail[1]?.href ?? "/earn"))}
        sx={{
          width: "2.25rem",
          height: "2.25rem",
          backgroundColor: "overlay.white05",
          borderTop: `0.0625rem solid ${theme.palette.overlay.white08}`,
          borderBottom: `0.0625rem solid ${theme.palette.overlay.white08}`,
          "&:hover": { backgroundColor: "overlay.white08" },
        }}
      >
        <ArrowBackRoundedIcon sx={{ fontSize: "1.125rem", color: "grey.200" }} />
      </IconButton>
      {trail.map((t, i) => {
        const last = i === trail.length - 1;
        return (
          <Box key={`${t.label}${i}`} sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            {i > 0 && <ChevronRightRoundedIcon sx={{ fontSize: "1rem", color: "grey.200" }} />}
            {t.href && !last ? (
              <ButtonBase onClick={() => router.push(t.href!)} sx={{ fontSize: "0.875rem", color: "grey.200", whiteSpace: "nowrap", "&:hover": { color: "common.black" } }}>
                {t.label}
              </ButtonBase>
            ) : (
              <Typography sx={{ fontSize: "0.875rem", fontWeight: last ? 600 : 400, color: last ? "common.black" : "grey.200", whiteSpace: "nowrap" }}>{t.label}</Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** Bordered stat card (label on top, value below). */
export function StatCard({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  return (
    <Box
      sx={{
        flex: "1 1 12rem",
        minWidth: 0,
        backgroundColor: "grey.400",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        borderRadius: "0.875rem",
        padding: "1.125rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
      }}
    >
      <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>{label}</Typography>
      <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: "0.75rem", color: "grey.200", mt: "-0.5rem" }}>{sub}</Typography>}
    </Box>
  );
}

/** Small pill with a protocol logo and name (e.g. next to a market title). */
export function ProtocolBadge({ name, logo }: { name: string; logo?: string }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        height: "1.875rem",
        px: "0.75rem",
        borderRadius: "999rem",
        backgroundColor: "overlay.white08",
      }}
    >
      {logo && <Box component="img" src={logo} alt="" sx={{ width: "1.125rem", height: "1.125rem", borderRadius: "50%" }} />}
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: "common.black" }}>{name}</Typography>
    </Box>
  );
}

/** Contract address row with copy + explorer link. */
export function ContractRow({ icon, label, address }: { icon?: React.ReactNode; label: string; address: string }) {
  const { successAlert } = useAlerts();
  const isContract = address.startsWith("C");
  const href = `https://stellar.expert/explorer/public/${isContract ? "contract" : "account"}/${address}`;
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: "4rem", flexShrink: 0 }}>
        {icon}
        <Typography sx={{ fontSize: "0.875rem", color: "common.black", whiteSpace: "nowrap" }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
        <ButtonBase
          onClick={() => {
            void navigator.clipboard?.writeText(address);
            successAlert({ message: "Address copied" });
          }}
          sx={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", height: "1.875rem", px: "0.75rem", borderRadius: "999rem", backgroundColor: "overlay.white08", fontSize: "0.75rem", color: "common.black" }}
        >
          {shortAddress(address, 5, 4)}
          <ContentCopyOutlinedIcon sx={{ fontSize: "0.875rem", color: "grey.200" }} />
        </ButtonBase>
        <IconButton component="a" href={href} target="_blank" rel="noreferrer" size="small" sx={{ width: "1.875rem", height: "1.875rem", backgroundColor: "overlay.white08" }}>
          <OpenInNewRoundedIcon sx={{ fontSize: "0.875rem", color: "grey.200" }} />
        </IconButton>
      </Box>
    </Box>
  );
}

export type TopItem = { key: string; icon: React.ReactNode; title: string; subtitle?: string; badge?: { name: string; logo?: string }; value: string; onClick: () => void };

/** Right-column "Top …" list: icon, name, venue badge and a green figure per row. */
export function TopList({ title, items, emptyText, valueLabel, nameLabel }: { title: string; items: TopItem[]; emptyText: string; valueLabel: string; nameLabel: string }) {
  return (
    <Box
      sx={{
        borderRadius: "1.25rem",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        backgroundColor: "overlay.white05",
        boxShadow: (t) => `0 0.25rem 2.5rem 0 ${t.palette.shadow.elevated}`,
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem", mb: "0.5rem" }}>
        <Box component="img" src="/assets/topPools.svg" alt="" sx={{ width: "1.75rem", height: "1.75rem" }} />
        <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: "common.black", whiteSpace: "nowrap" }}>{title}</Typography>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", px: "1.25rem" }}>
        <Typography sx={{ fontSize: "1rem", fontWeight: 500, color: "common.black" }}>{nameLabel}</Typography>
        <Typography sx={{ fontSize: "1rem", fontWeight: 500, color: "common.black" }}>{valueLabel}</Typography>
      </Box>
      {items.length === 0 ? (
        <Typography variant="subtitle3" sx={{ color: "grey.200", px: "1.25rem", py: "1rem" }}>
          {emptyText}
        </Typography>
      ) : (
        items.map((it) => (
          <ButtonBase
            key={it.key}
            onClick={it.onClick}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              minHeight: "4.75rem",
              px: "1rem",
              borderRadius: "1rem",
              backgroundColor: "overlay.white04",
              border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
              textAlign: "left",
              "&:hover": { backgroundColor: "overlay.white08" },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
              {it.icon}
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "1.0625rem", fontWeight: 500, color: "common.black", maxWidth: "8rem" }} noWrap>
                  {it.title}
                </Typography>
                {it.subtitle && (
                  <Typography sx={{ fontSize: "0.75rem", color: "grey.200", maxWidth: "8rem" }} noWrap>
                    {it.subtitle}
                  </Typography>
                )}
              </Box>
              {it.badge && <ProtocolBadge name={it.badge.name} logo={it.badge.logo} />}
            </Box>
            <Typography sx={{ fontSize: "1.0625rem", color: "green.main", flexShrink: 0 }}>{it.value}</Typography>
          </ButtonBase>
        ))
      )}
    </Box>
  );
}
