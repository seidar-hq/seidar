"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { KpiCard, KpiFooterRow, KpiHeader, KpiSection, KpiTop, KpiValueRow } from "@/components/common/SectionCard";

const InfoIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8.0026 14.6673C11.6845 14.6673 14.6693 11.6825 14.6693 8.00065C14.6693 4.31875 11.6845 1.33398 8.0026 1.33398C4.32071 1.33398 1.33594 4.31875 1.33594 8.00065C1.33594 11.6825 4.32071 14.6673 8.0026 14.6673Z"
      fill="currentColor"
      fillOpacity="0.2"
    />
    <path d="M8 11.334V7.33398" stroke="currentColor" strokeLinecap="round" />
    <path
      d="M8 4C8.55228 4 9 4.44772 9 5C9 5.55228 8.55228 6 8 6C7.44772 6 7 5.55228 7 5C7 4.44772 7.44772 4 8 4Z"
      fill="currentColor"
    />
  </svg>
);

type Kpi = {
  heading: string;
  infoTooltip: string;
  value: string;
  subtext?: string;
  subValue?: string;
  breakdown?: { label: string; value: string; dotColor: string }[];
};

// Values stay at zero until a wallet is connected.
const KPIS: Kpi[] = [
  {
    heading: "Total Balance",
    infoTooltip: "Includes both wallet and exchange balances.",
    value: "$0",
    breakdown: [
      { label: "Wallet", value: "$0", dotColor: "border.main800" },
      { label: "Exchange", value: "$0", dotColor: "sidebar.primary" },
    ],
  },
  {
    heading: "Performance %",
    infoTooltip: "Shows performance for wallet assets only. Exchange assets are excluded.",
    value: "0%",
    subtext: "Change 24h",
    subValue: "$0",
  },
  {
    heading: "Total Utilised",
    infoTooltip: "Shows utilisation for wallet assets only. Exchange assets are excluded.",
    value: "$0",
    subtext: "Utilisation %",
    subValue: "0%",
  },
  {
    heading: "Total Rewards",
    infoTooltip: "Shows rewards earned from wallet assets only. Exchange assets are excluded.",
    value: "$0.00",
  },
];

export default function PortfolioKpis() {
  const dark = useTheme().palette.mode === "dark";
  const small = dark ? "subtitle5" : "subtitle3";
  const detail = dark ? "subtitle3" : "body3";

  return (
    <KpiSection>
      <KpiHeader sx={{ justifyContent: "space-between" }}>
        <Typography variant="h6" color="common.black">
          All Portfolios
        </Typography>
      </KpiHeader>
      <Grid size={12} spacing="1rem" container>
        {KPIS.map((k) => (
          <KpiCard
            key={k.heading}
            size={{ xs: 12, sm: 6, md: 3 }}
            sx={k.breakdown ? { height: "auto", minHeight: "8.875rem" } : undefined}
          >
            <KpiTop>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Typography variant={small}>{k.heading}</Typography>
                <Tooltip placement="top" arrow title={k.infoTooltip}>
                  <Box sx={{ display: "flex", cursor: "default", color: "grey.200" }}>
                    <InfoIcon size={14} />
                  </Box>
                </Tooltip>
              </Box>
              <KpiValueRow>
                <Typography variant="body4" color="common.black">
                  {k.value}
                </Typography>
              </KpiValueRow>
            </KpiTop>
            {k.subtext && (
              <KpiFooterRow>
                <Typography variant={small}>{k.subtext}</Typography>
                <Typography variant={detail}>{k.subValue}</Typography>
              </KpiFooterRow>
            )}
            {k.breakdown && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
                {k.breakdown.map((b) => (
                  <Box key={b.label} sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Box sx={{ width: "0.625rem", height: "0.625rem", borderRadius: "50%", backgroundColor: b.dotColor, flexShrink: 0 }} />
                    <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Typography variant={detail}>{b.label}:</Typography>
                      <Typography variant={detail}>{b.value}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </KpiCard>
        ))}
      </Grid>
    </KpiSection>
  );
}
