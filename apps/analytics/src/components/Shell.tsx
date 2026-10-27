"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import { APP_URL, DOCS_URL, SITE_URL } from "@/lib/api";

export const HEADER_H = { xs: "3.75rem", sm: "4rem" };

const Bar = styled(Box)(({ theme }) => ({
  position: "fixed",
  left: 0,
  right: 0,
  zIndex: theme.zIndex.appBar,
  height: HEADER_H.sm,
  padding: "0 2.375rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  backgroundColor: theme.palette.overlay.white02,
  backdropFilter: "blur(15px)",
  WebkitBackdropFilter: "blur(15px)",
  borderBottom: `0.0625rem solid ${theme.palette.border.main1000}`,
  [theme.breakpoints.down("sm")]: { padding: "0 1rem", height: HEADER_H.xs },
}));

export function Header() {
  return (
    <Bar sx={{ top: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
        <Box component="a" href={SITE_URL} sx={{ display: "flex" }}>
          <Box component="img" src="/assets/seidarLogoDark.svg" alt="Seidar" sx={{ width: { xs: "5.5rem", sm: "6.25rem" }, height: "auto" }} />
        </Box>
        <Box sx={{ px: "0.625rem", py: "0.2rem", borderRadius: "999rem", backgroundColor: "rgba(52,108,255,0.16)", border: "0.0625rem solid rgba(92,132,255,0.35)" }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "sidebar.purple100" }}>Analytics</Typography>
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          pl: "0.375rem",
          pr: "0.875rem",
          height: "2.25rem",
          borderRadius: "999rem",
          backgroundColor: "surfaceBg.section",
          border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
          flexShrink: 0,
        }}
      >
        <Box component="img" src="/protocols/stellar.png" alt="" sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: "sidebar.subText", whiteSpace: "nowrap" }}>Stellar mainnet</Typography>
      </Box>
    </Bar>
  );
}

export function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        mt: "3rem",
        py: "1.5rem",
        borderTop: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <Typography variant="caption" color="grey.200">
        Seidar © {new Date().getFullYear()}. Non-custodial DeFi on Stellar.
      </Typography>
      <Box sx={{ display: "flex", gap: "1.25rem" }}>
        {[
          ["App", APP_URL],
          ["Docs", DOCS_URL],
          ["Website", SITE_URL],
        ].map(([l, h]) => (
          <Box key={l} component="a" href={h} target="_blank" rel="noopener" sx={{ fontSize: "0.8125rem", color: "grey.200", "&:hover": { color: "#fff" } }}>
            {l}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
