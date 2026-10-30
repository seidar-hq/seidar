"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { HOME_ENABLED } from "@/lib/features";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import WaterOutlinedIcon from "@mui/icons-material/WaterOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { GlassPaper } from "@/components/common/GlassDialog";
import TokenComponent from "@/components/common/TokenComponent";
import { SearchIcon } from "@/components/icons/HeaderIcons";

const ResultsScroller = styled(Box)({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  margin: "0 -1rem",
  padding: "0 1rem",
});

const SearchRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flex: 1,
  minWidth: 0,
  padding: "0.5rem 0.75rem",
  height: "2.625rem",
  borderRadius: "6.25rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  borderTop: `0.0625rem solid ${theme.palette.border.main700}`,
  borderBottom: `0.0625rem solid ${theme.palette.border.main700}`,
  flexShrink: 0,
}));

const SearchInputField = styled(InputBase)(({ theme }) => ({
  flex: 1,
  color: theme.palette.common.black,
  "& input": { padding: 0, "&::placeholder": { color: theme.palette.grey[200], opacity: 1 } },
}));

const CloseButton = styled(IconButton)(({ theme }) => {
  const line = theme.palette.mode === "dark" ? theme.palette.overlay.white08 : theme.palette.border.main1000;
  return {
    width: "2rem",
    height: "2rem",
    color: theme.palette.common.black,
    backgroundColor: theme.palette.grey[800],
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    "&:hover": { backgroundColor: theme.palette.grey[300] },
    "& svg": { fontSize: "1.125rem" },
    flexShrink: 0,
  };
});

const EscChip = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.125rem 0.25rem",
  borderRadius: "0.25rem",
  border: `0.03125rem solid ${theme.palette.border.main700}`,
  lineHeight: 1,
}));

const SuggestionsRow = styled(Box)({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" });

const SuggestionChip = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "1.875rem",
  padding: "0.5rem 0.75rem",
  borderRadius: "6.25rem",
  color: theme.palette.common.black,
  backgroundColor: theme.palette.surfaceBg.softInset,
  borderTop: `0.0625rem solid ${theme.palette.border.main700}`,
  borderBottom: `0.0625rem solid ${theme.palette.border.main700}`,
  cursor: "pointer",
  transition: "background-color 0.15s ease",
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
}));

const ResultRow = styled(Box, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(
  ({ theme, active }) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "1rem",
    borderRadius: "0.5rem",
    backgroundColor: active ? theme.palette.surfaceBg.pill : theme.palette.surfaceBg.softInset,
    borderTop: `0.0625rem solid ${active ? theme.palette.border.main700 : "transparent"}`,
    borderBottom: `0.0625rem solid ${active ? theme.palette.border.main700 : "transparent"}`,
    cursor: "pointer",
    transition: "background-color 0.15s ease, border-color 0.15s ease",
    "&:hover": {
      backgroundColor: theme.palette.surfaceBg.pill,
      borderTopColor: theme.palette.border.main700,
      borderBottomColor: theme.palette.border.main700,
    },
  }),
);

const SUGGESTIONS = [
  ...(HOME_ENABLED ? [{ label: "Home", route: "/" }] : []),
  { label: "Portfolio", route: "/portfolio" },
  { label: "Bridge", route: "/bridge" },
  { label: "Swap", route: "/trade-swap/dex" },
  { label: "Perps", route: "/trade-swap/perps" },
  { label: "Pools", route: "/earn/pools" },
  { label: "Vaults", route: "/earn/vaults" },
];

type Page = { id: string; name: string; route: string; Icon: SvgIconComponent };

const PAGES: Page[] = [
  ...(HOME_ENABLED ? [{ id: "home", name: "Home", route: "/", Icon: HomeOutlinedIcon }] : []),
  { id: "portfolio", name: "Portfolio", route: "/portfolio", Icon: SpaceDashboardOutlinedIcon },
  { id: "trade-swap", name: "Trade / Swap", route: "/trade-swap", Icon: SwapHorizOutlinedIcon },
  { id: "dex", name: "Swap", route: "/trade-swap/dex", Icon: SwapHorizOutlinedIcon },
  { id: "perps", name: "Perps", route: "/trade-swap/perps", Icon: ShowChartOutlinedIcon },
  { id: "bridge", name: "Bridge", route: "/bridge", Icon: AltRouteOutlinedIcon },
  { id: "transactions", name: "History", route: "/transactions", Icon: ReceiptLongOutlinedIcon },
  { id: "earn", name: "Earn", route: "/earn", Icon: SavingsOutlinedIcon },
  { id: "lend-borrow", name: "Lend & Borrow", route: "/earn/lending&borrow", Icon: HandshakeOutlinedIcon },
  { id: "pools", name: "Pools", route: "/earn/pools", Icon: WaterOutlinedIcon },
  { id: "vaults", name: "Vaults", route: "/earn/vaults", Icon: SavingsOutlinedIcon },
  { id: "settings", name: "Settings", route: "/settings", Icon: SettingsOutlinedIcon },
];

const matchesQuery = (query: string, ...fields: string[]) => {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  return fields.some((f) => f.toLowerCase().includes(q));
};

export default function SearchDialog({ open, handleClose }: { open: boolean; handleClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const activeId = useMemo(() => {
    const match = [...PAGES]
      .sort((a, b) => b.route.length - a.route.length)
      .find((p) => pathname === p.route || pathname.startsWith(`${p.route}/`));
    return match?.id;
  }, [pathname]);

  const results = useMemo(() => PAGES.filter((p) => matchesQuery(query, p.name, p.route)), [query]);

  const go = (route: string) => {
    router.push(route);
    handleClose();
  };

  return (
    <GlassPaper
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && handleClose()}
      maxWidth={false}
      PaperProps={{ sx: { maxWidth: "38.75rem", gap: "1rem", maxHeight: "80vh", overflow: "hidden" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%" }}>
        <SearchRow>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "inline-flex", color: "grey.200", flexShrink: 0 }}>
              <SearchIcon size="1.125rem" />
            </Box>
            <SearchInputField
              placeholder="Search pages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              inputProps={{ "aria-label": "Search pages..." }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
            <Typography variant="subtitle3" color="grey.200">
              Press
            </Typography>
            <EscChip>
              <Typography variant="caption" color="grey.200">
                ESC
              </Typography>
            </EscChip>
          </Box>
        </SearchRow>
        <CloseButton onClick={handleClose}>
          <CloseIcon />
        </CloseButton>
      </Box>
      <SuggestionsRow>
        <Typography variant="caption" color="grey.200">
          Try these
        </Typography>
        {SUGGESTIONS.map((s) => (
          <SuggestionChip key={s.label} onClick={() => go(s.route)}>
            <Typography variant="caption" color="common.black">
              {s.label}
            </Typography>
          </SuggestionChip>
        ))}
      </SuggestionsRow>
      <ResultsScroller>
        {results.length > 0 && (
          <>
            <Typography variant="caption" color="common.black" sx={{ textTransform: "uppercase" }}>
              Pages
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {results.map((p) => (
                <ResultRow key={p.id} active={p.id === activeId} onClick={() => go(p.route)}>
                  <TokenComponent
                    header={p.name}
                    icon={<p.Icon sx={{ fontSize: "1.25rem", color: "grey.200" }} />}
                    isSubtitle={false}
                    variant="body1"
                  />
                </ResultRow>
              ))}
            </Box>
          </>
        )}
        {results.length === 0 && (
          <Box sx={{ display: "flex", justifyContent: "center", py: "1rem" }}>
            <Typography variant="caption" color="grey.200">
              No results for &quot;{query}&quot;
            </Typography>
          </Box>
        )}
      </ResultsScroller>
    </GlassPaper>
  );
}
