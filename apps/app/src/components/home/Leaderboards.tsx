"use client";

import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import { useRouter } from "next/navigation";
import TokenLogo from "@/components/common/TokenLogo";
import { TopList } from "@/components/earn/EarnUI";
import { assetHref, compactNum, compactUsd, useMarketAssets, type MarketAsset } from "./marketData";

const BOARDS: { title: string; valueLabel: string; rank: (a: MarketAsset) => number | null; value: (a: MarketAsset) => string }[] = [
  { title: "Most Traded", valueLabel: "7d DEX volume", rank: (a) => a.volume7d, value: (a) => compactUsd(a.volume7d) },
  { title: "Top Market Cap", valueLabel: "Market cap", rank: (a) => a.marketCap, value: (a) => compactUsd(a.marketCap) },
  { title: "Most Held", valueLabel: "Holders", rank: (a) => a.holders, value: (a) => compactNum(a.holders) },
];

/** Three top-5 lists: most traded, largest and most widely held Stellar assets. */
export default function Leaderboards() {
  const router = useRouter();
  const { assets, loading } = useMarketAssets();
  return (
    <Grid container spacing="1rem">
      {BOARDS.map((b) => {
        const top = [...assets].filter((a) => (b.rank(a) ?? 0) > 0).sort((x, y) => (b.rank(y) ?? 0) - (b.rank(x) ?? 0)).slice(0, 5);
        return (
          <Grid key={b.title} size={{ xs: 12, md: 4 }}>
            {loading ? (
              <Skeleton variant="rounded" animation="wave" sx={{ height: "29rem", borderRadius: "1.25rem" }} />
            ) : (
              <TopList
                title={b.title}
                nameLabel="Asset"
                valueLabel={b.valueLabel}
                emptyText="Market data is unavailable right now."
                items={top.map((a) => ({
                  key: a.id,
                  icon: <TokenLogo code={a.code} issuer={a.issuer} contract={a.contract} src={a.icon} size="2.5rem" />,
                  title: a.code,
                  subtitle: a.domain ?? a.name,
                  value: b.value(a),
                  onClick: () => router.push(assetHref(a)),
                }))}
              />
            )}
          </Grid>
        );
      })}
    </Grid>
  );
}
