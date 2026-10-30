"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useRouter } from "next/navigation";
import { InsetCard } from "@/components/common/SectionCard";
import { SourceNote, compactUsd, pctColor, pctText, useMarketOverview } from "./marketData";

const SHOWN = 10;

/** Stellar DeFi protocols by TVL (DefiLlama); the ones Seidar integrates open their Seidar page. */
export default function Protocols() {
  const router = useRouter();
  const { overview, loading } = useMarketOverview();
  const list = (overview?.protocols ?? []).slice(0, SHOWN);

  return (
    <InsetCard sx={{ height: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>Protocols on Stellar</Typography>
        <Typography variant="subtitle3" color="grey.200">
          TVL
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {loading
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} variant="rounded" animation="wave" sx={{ height: "3.25rem", borderRadius: "0.75rem" }} />)
          : list.length === 0 && (
              <Typography variant="subtitle2" color="grey.200" sx={{ py: "2rem", textAlign: "center" }}>
                Protocol data is unavailable right now.
              </Typography>
            )}
        {!loading &&
          list.map((p) => {
            const open = () => (p.seidar ? router.push(p.seidar) : p.url && window.open(p.url, "_blank", "noopener,noreferrer"));
            return (
              <Tooltip key={p.name} placement="left" arrow title={p.seidar ? "Open in Seidar" : p.url ? `Not in Seidar yet: opens ${new URL(p.url).host}` : ""}>
                <ButtonBase
                  onClick={open}
                  disabled={!p.seidar && !p.url}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    px: "0.75rem",
                    py: "0.5rem",
                    borderRadius: "0.75rem",
                    textAlign: "left",
                    "&:hover": { backgroundColor: "overlay.white04" },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                    {p.logo ? (
                      <Box component="img" src={p.logo} alt="" loading="lazy" sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.625rem", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <Box sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.625rem", backgroundColor: "overlay.white08", flexShrink: 0 }} />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 500, color: "common.black" }} noWrap>
                          {p.name}
                        </Typography>
                        {!p.seidar && p.url && <OpenInNewIcon sx={{ fontSize: "0.875rem", color: "grey.200" }} />}
                      </Box>
                      <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }} noWrap>
                        {p.category}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography sx={{ fontSize: "0.9375rem", fontWeight: 500, color: "common.black" }}>{compactUsd(p.tvl)}</Typography>
                    {p.change7d != null && (
                      <Typography sx={{ fontSize: "0.75rem", color: pctColor(p.change7d) }}>{pctText(p.change7d)} 7d</Typography>
                    )}
                  </Box>
                </ButtonBase>
              </Tooltip>
            );
          })}
      </Box>
      <SourceNote text="Data: DefiLlama (TVL on Stellar; 7d change shown for Stellar-only protocols)." />
    </InsetCard>
  );
}
