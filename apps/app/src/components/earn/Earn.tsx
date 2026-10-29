"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { ConnectPill } from "@/components/trade/TradeLocked";
import { useWallet } from "@/wallet/WalletContext";
import LendBorrow from "./LendBorrow";
import Pools from "./Pools";
import Vaults from "./Vaults";

type EarnTab = "lending&borrow" | "pools" | "vaults";

const COPY: Record<EarnTab, { promoText: string; promoIllustration: string; topTitle: string; topText: string }> = {
  "lending&borrow": {
    promoText: "Connect a wallet to lend assets, borrow liquidity, and manage DeFi credit positions.",
    promoIllustration: "/assets/earnLendLocked.svg",
    topTitle: "Top Markets",
    topText: "Connect a wallet to discover the highest APY lending and borrowing markets.",
  },
  pools: {
    promoText: "Connect a wallet to provide liquidity, manage LP positions, and track pool rewards.",
    promoIllustration: "/assets/earnLiquidityLocked.svg",
    topTitle: "Top Pools",
    topText: "Connect a wallet to discover the highest-performing liquidity pools.",
  },
  vaults: {
    promoText: "Connect a wallet to deposit into vaults and track your automated yield.",
    promoIllustration: "/assets/earnStakingLocked.svg",
    topTitle: "Top Vaults",
    topText: "Connect a wallet to discover the highest APY vaults.",
  },
};

const TABS: TabItem[] = [
  { id: "lending&borrow", label: "Lend & Borrow", path: "/earn/lending&borrow", padding: "0rem 0.625rem" },
  { id: "pools", label: "Pools", path: "/earn/pools", padding: "0rem 0.625rem" },
  { id: "vaults", label: "Vaults", path: "/earn/vaults", padding: "0rem 0.625rem" },
];

const PromoRoot = styled(Box)(({ theme }) => ({
  position: "relative",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  height: "100%",
  minHeight: "44rem",
  width: "100%",
  [theme.breakpoints.down("lg")]: { height: "auto", minHeight: "auto", padding: "2.5rem 0" },
}));

const PromoText = styled(Box)(({ theme }) => ({
  position: "relative",
  zIndex: 1,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
  paddingLeft: "2.5rem",
  maxWidth: "100%",
  [theme.breakpoints.down("sm")]: { paddingLeft: 0, gap: "1.5rem" },
}));

const PromoArt = styled("img")(({ theme }) => ({
  position: "absolute",
  top: "50%",
  right: "3.8125rem",
  transform: "translateY(-50%)",
  width: "36.125rem",
  height: "auto",
  pointerEvents: "none",
  userSelect: "none",
  zIndex: 0,
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

const PoolCard = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "1.25rem",
    backgroundColor: theme.palette.surfaceBg.section,
    border: `0.0625rem solid ${dark ? theme.palette.border.main1000 : theme.palette.border.main600}`,
  };
});

const PoolHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "1rem",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white05 : theme.palette.common.white,
}));

const PoolIcon = styled("img")({ width: "1.5625rem", height: "1.5625rem", flexShrink: 0 });

const PoolBody = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  minHeight: "27.4375rem",
  padding: "1rem",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white05 : theme.palette.common.white,
}));

const PoolContent = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2rem",
  maxWidth: "100%",
  "& > *": { maxWidth: "100%" },
});

const PoolArt = styled("img")({ width: "13.25rem", height: "auto", pointerEvents: "none", userSelect: "none" });

function EarnPromoLocked({ tab }: { tab: EarnTab }) {
  const { openConnectModal } = useWallet();
  const { promoText, promoIllustration } = COPY[tab];
  return (
    <PromoRoot>
      <PromoText>
        <Typography variant="subtitle10" color="sidebar.subText" sx={{ maxWidth: "23.0625rem" }}>
          {promoText}
        </Typography>
        <ConnectPill onClick={openConnectModal} />
      </PromoText>
      <PromoArt src={promoIllustration} alt="" />
    </PromoRoot>
  );
}

function PoolLocked({
  title,
  icon,
  illustration,
  text,
  textMaxWidth,
  onConnect,
}: {
  title: string;
  icon: string;
  illustration: string;
  text: string;
  textMaxWidth: string;
  onConnect: () => void;
}) {
  return (
    <PoolCard>
      <PoolHeader>
        <PoolIcon src={icon} alt="" />
        <Typography variant="subtitle2" color="common.black">
          {title}
        </Typography>
      </PoolHeader>
      <PoolBody>
        <PoolContent>
          <PoolArt src={illustration} alt="" />
          <Typography variant="subtitle10" color="sidebar.subText" sx={{ textAlign: "center", maxWidth: textMaxWidth }}>
            {text}
          </Typography>
          <ConnectPill onClick={onConnect} sx={{ alignSelf: "center" }} />
        </PoolContent>
      </PoolBody>
    </PoolCard>
  );
}

function TopLocked({ tab }: { tab: EarnTab }) {
  const { openConnectModal } = useWallet();
  const { topTitle, topText } = COPY[tab];
  return (
    <PoolLocked
      title={topTitle}
      icon="/assets/topPools.svg"
      illustration="/assets/earnTopPoolsGraphic.svg"
      text={topText}
      textMaxWidth="23.3125rem"
      onConnect={openConnectModal}
    />
  );
}

const tabFromPath = (path: string): EarnTab =>
  path.startsWith("/earn/pools") ? "pools" : path.startsWith("/earn/vaults") ? "vaults" : "lending&borrow";

export default function Earn() {
  const theme = useTheme();
  const pathname = usePathname();
  const [tab, setTab] = useState<string>(() => tabFromPath(pathname));

  useEffect(() => {
    const next = tabFromPath(decodeURIComponent(pathname));
    setTab(next);
    try {
      localStorage.setItem("earnActiveTab", next);
    } catch {}
  }, [pathname]);

  const current = (TABS.some((t) => t.id === tab) ? tab : "lending&borrow") as EarnTab;
  const { isConnected } = useWallet();

  if (isConnected) {
    const tabs = <Tabs tabs={TABS} activeTab={current} setActiveTab={setTab} />;
    return (
      <Box sx={{ minHeight: "100vh" }}>
        {current === "lending&borrow" && <LendBorrow tabs={tabs} />}
        {current === "pools" && <Pools tabs={tabs} />}
        {current === "vaults" && <Vaults tabs={tabs} />}
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box
        sx={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "1fr 28.5625rem",
          mt: "0.4rem",
          flex: 1,
          minHeight: 0,
          alignContent: "start",
          "@media (max-width: 75rem)": { gridTemplateColumns: "1fr", flex: "unset", minHeight: "auto", alignItems: "start" },
        }}
      >
        <Box
          sx={{
            backgroundColor: theme.palette.surfaceBg.section,
            borderRadius: "1.500rem",
            padding: "1.25rem",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
          }}
        >
          <Box sx={{ mb: "1rem" }}>
            <Tabs tabs={TABS} activeTab={current} setActiveTab={setTab} />
          </Box>
          <Box sx={{ mt: 0, flex: 1, minHeight: 0, overflow: "auto" }}>
            <EarnPromoLocked tab={current} />
          </Box>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", "@media (max-width: 75rem)": { alignSelf: "start" } }}>
          <TopLocked tab={current} />
        </Box>
      </Box>
    </Box>
  );
}
