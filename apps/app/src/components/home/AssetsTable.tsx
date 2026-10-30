"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import DataTable, { type Column } from "@/components/common/DataTable";
import TokenLogo from "@/components/common/TokenLogo";
import { ProtocolChips, RowAction, SearchBox } from "@/components/earn/EarnUI";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";
import {
  CATEGORIES,
  SourceNote,
  Sparkline,
  assetHref,
  categoryLabel,
  compactNum,
  compactUsd,
  pctColor,
  pctText,
  priceText,
  swapHref,
  useMarketAssets,
  type MarketAsset,
} from "./marketData";

const Num = ({ children, color = "common.black" }: { children: React.ReactNode; color?: string }) => (
  <Typography sx={{ fontSize: "0.9375rem", color, whiteSpace: "nowrap" }} component="div">
    {children}
  </Typography>
);

const Head = ({ label, tip }: { label: string; tip: string }) => (
  <Tooltip placement="top" arrow title={tip}>
    <span>{label}</span>
  </Tooltip>
);

/** Every listed Stellar asset with category chips, search and sortable market figures. */
export default function AssetsTable() {
  const router = useRouter();
  const { assets, counts, loading } = useMarketAssets();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  // Swap is offered for tokens the aggregator routes (the swap token catalogue).
  const { tokens } = useTokenCatalogue();
  const tradable = useMemo(
    () => new Set(tokens.flatMap((t) => [t.contract, t.issuer ? `${t.code}:${t.issuer}` : t.code === "XLM" ? "XLM" : ""])),
    [tokens],
  );
  const canSwap = (a: MarketAsset) => tradable.has(a.contract ?? a.id);

  const rows = useMemo(
    () =>
      assets.filter(
        (a) =>
          (cat === "all" || a.cats.includes(cat as MarketAsset["cats"][number])) &&
          (!query || `${a.code} ${a.name} ${a.domain ?? ""}`.toLowerCase().includes(query)),
      ),
    [assets, cat, query],
  );

  const columns: Column<MarketAsset>[] = [
    {
      id: "asset",
      header: "Asset",
      cell: (a) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: "13rem" }}>
          <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="2.25rem" />
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Typography sx={{ fontSize: "0.9375rem", fontWeight: 500, color: "common.black" }}>{a.code}</Typography>
              {a.cats
                .filter((c) => c !== "other")
                .map((c) => (
                  <Box
                    key={c}
                    sx={{ fontSize: "0.6875rem", px: "0.4375rem", py: "0.0625rem", borderRadius: "999rem", backgroundColor: "overlay.white08", color: "grey.200", whiteSpace: "nowrap" }}
                  >
                    {categoryLabel(c)}
                  </Box>
                ))}
            </Box>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200", maxWidth: "16rem" }} noWrap>
              {a.name !== a.code ? a.name : (a.domain ?? "")}
              {a.name !== a.code && a.domain ? ` · ${a.domain}` : ""}
            </Typography>
          </Box>
        </Box>
      ),
      sortValue: (a) => a.code,
    },
    {
      id: "price",
      header: "Price",
      align: "right",
      cell: (a) => (
        <Tooltip placement="top" arrow title={a.priceSource === "nav" ? "Net asset value: this fund token has no market price on the DEX." : ""}>
          <Box>
            <Num>
              {priceText(a.price)}
              {a.priceSource === "nav" ? " NAV" : ""}
            </Num>
          </Box>
        </Tooltip>
      ),
      sortValue: (a) => a.price,
    },
    { id: "change24h", header: "24h", align: "right", cell: (a) => <Num color={pctColor(a.change24h)}>{pctText(a.change24h)}</Num>, sortValue: (a) => a.change24h },
    { id: "spark", header: "7d", align: "center", cell: (a) => <Sparkline values={a.spark} /> },
    {
      id: "mcap",
      header: <Head label="Market cap" tip="Supply on Stellar × price (XLM: circulating market cap from CoinGecko). Issued supply can include tokens the issuer still holds." />,
      align: "right",
      cell: (a) => <Num>{compactUsd(a.marketCap)}</Num>,
      sortValue: (a) => a.marketCap,
    },
    {
      id: "volume",
      header: <Head label="7d DEX volume" tip="Traded on the Stellar DEX over the last 7 days, in USD (Stellar Expert)." />,
      align: "right",
      cell: (a) => <Num>{compactUsd(a.volume7d)}</Num>,
      sortValue: (a) => a.volume7d,
    },
    {
      id: "holders",
      header: <Head label="Holders" tip="Accounts holding a non-zero balance (funded trustlines). Not published for Soroban-only tokens." />,
      align: "right",
      cell: (a) => <Num>{compactNum(a.holders)}</Num>,
      sortValue: (a) => a.holders,
    },
    { id: "action", header: "", align: "center", cell: (a) => (
        <RowAction
          label="Swap"
          onClick={() => router.push(swapHref(a))}
          disabled={tokens.length > 0 && !canSwap(a)}
          tip={tokens.length > 0 && !canSwap(a) ? "Not routed by the swap aggregator yet." : null}
        />
      ),
    },
  ];

  const hint = CATEGORIES.find((c) => c.id === cat)?.hint;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <ProtocolChips
        items={CATEGORIES.filter((c) => c.id !== "all").map((c) => ({ id: c.id, label: counts[c.id] != null ? `${c.label} ${counts[c.id]}` : c.label }))}
        value={cat}
        onChange={setCat}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <Typography variant="subtitle3" color="grey.200">
          {hint}
        </Typography>
        <SearchBox value={q} onChange={setQ} placeholder="Search token, name or domain" />
      </Box>
      <DataTable
        variant="inset"
        title="Stellar Assets"
        columns={columns}
        rows={rows}
        isLoading={loading}
        emptyDataText={assets.length ? "No assets match your filters" : "Market data is unavailable right now."}
        emptyMinHeight="12rem"
        getRowId={(a) => a.id}
        onRowClick={(a) => router.push(assetHref(a))}
        pageSize={15}
        defaultSort={{ id: "mcap", dir: "desc" }}
      />
      <SourceNote text="Data: Stellar Expert (prices, supply, holders, DEX volume), CoinGecko (XLM market cap). Categories and issuers are verified by Seidar." />
    </Box>
  );
}
