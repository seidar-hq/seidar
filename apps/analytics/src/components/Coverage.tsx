"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { int, usd } from "@/lib/format";
import { PROTOCOLS } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { Card, Loading } from "./ui";

function Stat({ title, value, sub, loading }: { title: string; value: string; sub: string; loading: boolean }) {
  return (
    <Card sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <Typography variant="body1" color="grey.200">
        {title}
      </Typography>
      {loading ? (
        <Loading h="1.75rem" w="50%" />
      ) : (
        <Typography sx={{ fontSize: "1.625rem", fontWeight: 700, color: "common.black", lineHeight: 1.15 }}>{value}</Typography>
      )}
      <Typography variant="caption" color="grey.200">
        {loading ? "" : sub}
      </Typography>
    </Card>
  );
}

/** What a Seidar user can reach from one place (live protocol data, not Seidar usage). */
export default function Coverage({ data }: { data: Summary | null }) {
  const c = data?.coverage;
  const loading = !data;
  const n = (v: number | null | undefined) => (v == null ? "—" : int(v));
  const tvl = [c?.lendTvlUsd, c?.dexTvlUsd, c?.vaultTvlUsd].filter((v): v is number => v != null);
  return (
    <>
      <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(5, 1fr)" } }}>
        <Stat loading={loading} title="Liquidity reachable" value={tvl.length ? usd(tvl.reduce((a, b) => a + b, 0)) : "—"} sub="Lending + DEX pools + vaults" />
        <Stat loading={loading} title="Lending markets" value={n(c?.lendMarkets)} sub={`${n(c?.lendPools)} pools · ${usd(c?.lendTvlUsd)} supplied`} />
        <Stat loading={loading} title="DEX pools" value={n(c?.dexPools)} sub={`${usd(c?.dexTvlUsd)} TVL across 4 DEXs`} />
        <Stat loading={loading} title="Vaults" value={n(c?.vaults)} sub={`${usd(c?.vaultTvlUsd)} TVL · DeFindex, Upshift, Sentora`} />
        <Stat loading={loading} title="Perps markets" value={n(c?.perpsMarkets)} sub="Zenex, up to 20x" />
      </Box>
      <Card sx={{ mt: "1rem" }}>
        <Typography variant="subtitle2" color="common.black" sx={{ mb: "1rem" }}>
          Integrated protocols
        </Typography>
        <Box sx={{ display: "grid", gap: "0.75rem", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" } }}>
          {PROTOCOLS.map((p) => (
            <Box
              key={p.id}
              component="a"
              href={p.url}
              target="_blank"
              rel="noopener"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                p: "0.75rem",
                borderRadius: "0.875rem",
                backgroundColor: "overlay.white04",
                border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
                minWidth: 0,
                "&:hover": { borderColor: "rgba(92,132,255,0.5)" },
              }}
            >
              <Box component="img" src={p.logo} alt="" sx={{ width: "2rem", height: "2rem", borderRadius: "50%", objectFit: "cover", flexShrink: 0, backgroundColor: "overlay.white08" }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body3" color="common.black" noWrap sx={{ display: "block" }}>
                  {p.name}
                </Typography>
                <Typography variant="caption" color="grey.200" noWrap sx={{ display: "block" }}>
                  {p.category}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Card>
    </>
  );
}
