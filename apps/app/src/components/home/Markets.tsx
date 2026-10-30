"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import TokenLogo from "@/components/common/TokenLogo";
import { InsetCard } from "@/components/common/SectionCard";
import { SearchBox } from "@/components/earn/EarnUI";
import CompareChart from "./CompareChart";
import { assetHref, compactUsd, pctColor, pctText, priceText, useMarketAssets, type MarketAsset } from "./marketData";

const SORTS: { id: string; label: string; value: (a: MarketAsset) => number | null; asc?: boolean }[] = [
  { id: "mcap", label: "Top by market cap", value: (a) => a.marketCap },
  { id: "volume", label: "Top by 7d volume", value: (a) => a.volume7d },
  { id: "gainers", label: "Top gainers 24h", value: (a) => a.change24h },
  { id: "losers", label: "Top losers 24h", value: (a) => a.change24h, asc: true },
  { id: "holders", label: "Most held", value: (a) => a.holders },
];

/** Watchlist-style market view: ranked assets on the left, the selected one charted (and compared) on the right. */
export default function Markets() {
  const router = useRouter();
  const { assets, loading } = useMarketAssets();
  const [sort, setSort] = useState("mcap");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string>("XLM");

  const rows = useMemo(() => {
    const s = SORTS.find((x) => x.id === sort) ?? SORTS[0];
    const query = q.trim().toLowerCase();
    return assets
      .filter((a) => !query || `${a.code} ${a.name} ${a.domain ?? ""}`.toLowerCase().includes(query))
      .filter((a) => s.value(a) != null)
      .sort((x, y) => ((s.value(x) ?? 0) - (s.value(y) ?? 0)) * (s.asc ? 1 : -1));
  }, [assets, sort, q]);
  const primary = assets.find((a) => a.id === selected) ?? assets[0];

  return (
    <InsetCard sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "1fr", lg: "minmax(15rem, 22rem) minmax(0, 1fr)" } }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 }}>
        <Box sx={{ display: "flex", gap: "0.5rem", "& > div:first-of-type": { minWidth: 0, flex: 1 } }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search" />
          <Select
            size="small"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            sx={{ borderRadius: "999rem", fontSize: "0.8125rem", minWidth: "10.5rem", "& .MuiSelect-select": { py: "0.75rem" } }}
          >
            {SORTS.map((s) => (
              <MenuItem key={s.id} value={s.id} sx={{ fontSize: "0.8125rem" }}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1.75rem 1fr auto auto", gap: "0.5rem", px: "0.5rem", color: "grey.200", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <span>#</span>
          <span>Asset</span>
          <span style={{ textAlign: "right", minWidth: "4.5rem" }}>Price</span>
          <span style={{ textAlign: "right", minWidth: "4rem" }}>{sort === "volume" ? "7d vol" : sort === "mcap" ? "Mcap" : "24h"}</span>
        </Box>
        <Box sx={{ height: "22.5rem", overflowY: "auto", display: "flex", flexDirection: "column", pr: "0.25rem" }} data-lenis-prevent>
          {loading
            ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="rounded" animation="wave" sx={{ height: "2.75rem", mb: "0.25rem", borderRadius: "0.5rem" }} />)
            : rows.map((a, i) => {
                const active = a.id === primary?.id;
                return (
                  <ButtonBase
                    key={a.id}
                    onClick={() => setSelected(a.id)}
                    onDoubleClick={() => router.push(assetHref(a))}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1.75rem 1fr auto auto",
                      gap: "0.5rem",
                      alignItems: "center",
                      minHeight: "2.75rem",
                      px: "0.5rem",
                      textAlign: "left",
                      borderRadius: "0.5rem",
                      borderLeft: (t) => `0.1875rem solid ${active ? t.palette.sidebar.primary : "transparent"}`,
                      backgroundColor: active ? "overlay.white08" : "transparent",
                      "&:hover": { backgroundColor: "overlay.white04" },
                    }}
                  >
                    <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{i + 1}</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="1.5rem" />
                      <Typography sx={{ fontSize: "0.875rem", color: "common.black", fontWeight: 500 }} noWrap>
                        {a.code}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.8125rem", color: "common.black", textAlign: "right", minWidth: "4.5rem" }}>{priceText(a.price)}</Typography>
                    {sort === "volume" ? (
                      <Typography sx={{ fontSize: "0.8125rem", color: "common.black", textAlign: "right", minWidth: "4rem" }}>{compactUsd(a.volume7d)}</Typography>
                    ) : sort === "mcap" ? (
                      <Typography sx={{ fontSize: "0.8125rem", color: "common.black", textAlign: "right", minWidth: "4rem" }}>{compactUsd(a.marketCap)}</Typography>
                    ) : (
                      <Typography sx={{ fontSize: "0.8125rem", color: pctColor(a.change24h), textAlign: "right", minWidth: "4rem" }}>{pctText(a.change24h)}</Typography>
                    )}
                  </ButtonBase>
                );
              })}
          {!loading && rows.length === 0 && (
            <Typography variant="subtitle3" color="grey.200" sx={{ p: "1rem" }}>
              {assets.length ? "No asset matches your search." : "Market data is unavailable right now."}
            </Typography>
          )}
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>Select an asset to chart it; double-click to open its page.</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {primary ? (
          <CompareChart primary={primary} candidates={assets} height="24rem" />
        ) : (
          <Skeleton variant="rectangular" animation="wave" sx={{ height: "27rem", borderRadius: "0.5rem" }} />
        )}
      </Box>
    </InsetCard>
  );
}
