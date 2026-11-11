"use client";

import Box from "@mui/material/Box";
import Link from "next/link";
import { Measured } from "@/components/common/Skeleton";
import TokenLogo from "@/components/common/TokenLogo";
import { compactUsd } from "@/components/home/marketData";
import { VAULT_PROTOCOLS, apyText, useVaultList, vaultHref, vaultProtocol, type VaultListRow } from "@/components/earn/vaultData";
import { C } from "./parts";

const SAMPLE: VaultListRow[] = Array.from({ length: 3 }, (_, i) => ({
  protocol: "defindex",
  address: "sample-" + i,
  name: "Sample vault name",
  asset: "",
  assetCode: "USDC",
  assetDecimals: 7,
  tvlUsd: 12_340_000,
  apyPct: 8.12,
}));

/** Wide strip naming the curators, standing in for a partner cover. */
function Banner() {
  return (
    <Box
      component={Link}
      href="/earn/vaults"
      aria-label="Open all vaults"
      sx={{
        position: "relative",
        isolation: "isolate",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: "1rem", sm: "2rem" },
        height: { xs: "4.5rem", sm: "5rem" },
        overflow: "hidden",
        borderRadius: "1.25rem",
        textDecoration: "none",
        bgcolor: "#17110b",
        // As on the reference: the backdrop grows slowly on hover, the logos stay put.
        "&:hover .banner-bg, &:focus-visible .banner-bg": { transform: "scale(1.02)" },
      }}
    >
      <Box
        aria-hidden
        className="banner-bg"
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          background:
            "repeating-linear-gradient(100deg, rgba(255,255,255,0.05) 0 2px, rgba(255,255,255,0) 2px 26px), radial-gradient(120% 180% at 15% 0%, rgba(120,90,255,0.35) 0%, rgba(0,0,0,0) 55%), radial-gradient(100% 160% at 90% 100%, rgba(255,170,90,0.25) 0%, rgba(0,0,0,0) 60%), #17110b",
          transition: "transform .7s ease-out",
        }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: "1rem", sm: "2.25rem" } }}>
        {Object.values(VAULT_PROTOCOLS).map((p) => (
          <Box key={p.name} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#fff", fontSize: { xs: "1rem", sm: "1.5rem" }, letterSpacing: "-0.04em" }}>
            <Box component="img" src={p.logo} alt="" sx={{ width: { xs: "1.25rem", sm: "1.75rem" }, height: { xs: "1.25rem", sm: "1.75rem" }, borderRadius: "50%", objectFit: "contain" }} />
            {p.name}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function VaultCard({ v }: { v: VaultListRow }) {
  const p = vaultProtocol(v.protocol);
  return (
    <Box
      component={Link}
      href={vaultHref(v.address)}
      aria-label={`${v.name}, ${apyText(v)} APY`}
      sx={{ display: "block", textDecoration: "none", "&:hover article": { transform: "translateY(-2px)" } }}
    >
      <Box
        component="article"
        sx={{
          borderRadius: "1.25rem",
          border: "1px solid rgba(255,255,255,0.12)",
          bgcolor: "rgba(255,255,255,0.04)",
          p: "1rem",
          boxShadow: "0 0 10px rgba(255,255,255,0.04), 0 6px 18px rgba(0,0,0,0.24)",
          transition: "transform .2s",
        }}
      >
        <Box
          sx={{
            position: "relative",
            isolation: "isolate",
            overflow: "hidden",
            borderRadius: "1.25rem",
            aspectRatio: "745 / 340",
            bgcolor: "#101010",
            boxShadow: "0 18px 24px rgba(0,0,0,0.35)",
          }}
        >
          {/* Big blurred asset logo as the card's artwork, a sharp copy on top of it. */}
          <Box aria-hidden sx={{ position: "absolute", right: "-12%", top: "-30%", width: "75%", aspectRatio: "1", filter: "blur(28px) saturate(1.4)", opacity: 0.7, zIndex: -1 }}>
            <TokenLogo code={v.assetCode} contract={v.asset || null} size="100%" />
          </Box>
          <Box aria-hidden sx={{ position: "absolute", right: "8%", top: "50%", transform: "translateY(-50%)", opacity: 0.9 }}>
            <TokenLogo code={v.assetCode} contract={v.asset || null} size="4.5rem" />
          </Box>
          <Box sx={{ position: "absolute", left: "1.1rem", top: "1rem", display: "flex", alignItems: "center", gap: "0.4rem", color: "rgba(255,255,255,0.75)", fontSize: "0.8rem" }}>
            {p.logo && <Box component="img" src={p.logo} alt="" sx={{ width: "1rem", height: "1rem", borderRadius: "50%" }} />}
            {p.name}
          </Box>
          <Box
            sx={{
              position: "absolute",
              left: "1.1rem",
              right: "38%",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#fff",
              fontSize: { xs: "1.35rem", md: "1.6rem" },
              lineHeight: 0.95,
              letterSpacing: "-0.06em",
              textShadow: "0 0.25rem 1rem rgba(0,0,0,0.5)",
            }}
          >
            {v.name}
          </Box>
          <Box sx={{ position: "absolute", left: "1.1rem", bottom: "0.9rem", display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
            <Box component="span" sx={{ color: C.up }}>
              {apyText(v)} APY
            </Box>
            <Box component="span" sx={{ color: "rgba(255,255,255,0.7)" }}>
              {compactUsd(v.tvlUsd)} TVL
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** Vault curators: a banner to all vaults, then the three largest open vaults by TVL. */
export default function VaultCurators() {
  const { rows, loading } = useVaultList();
  // Largest open vaults with a published APY, one per asset first so the cards don't all look alike.
  const ranked = [...rows].filter((r) => !r.paused && r.apyPct != null).sort((a, b) => b.tvlUsd - a.tvlUsd);
  const distinct = ranked.filter((r, i) => ranked.findIndex((x) => x.assetCode === r.assetCode) === i);
  const top = loading ? SAMPLE : [...distinct, ...ranked.filter((r) => !distinct.includes(r))].slice(0, 3);
  return (
    <Box sx={{ pb: "2.5rem" }}>
      <Banner />
      <Measured loading={loading} id="explore-vaults">
        <Box sx={{ mt: "1.25rem", display: "grid", gap: "1.25rem", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
          {top.map((v) => (
            <VaultCard key={v.address} v={v} />
          ))}
        </Box>
      </Measured>
    </Box>
  );
}
