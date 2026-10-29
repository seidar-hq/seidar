"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import ConnectAlert from "@/components/common/ConnectAlert";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { PlainCard } from "@/components/common/SectionCard";
import {
  LockedCopy,
  LockedTableArt,
  LockedTableImage,
  LockedTableRoot,
  LockedTableText,
  WATERMARK_ICON,
} from "@/components/common/locked/LockedParts";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";

const Root = styled(PlainCard)({ position: "relative" });

const Content = styled(Box)({ position: "relative", zIndex: 1, width: "100%" });

const HeaderRow = styled(Box)({
  width: "100%",
  marginBottom: "1rem",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  justifyContent: "space-between",
  alignItems: "center",
});

const Watermark = styled("img")(({ theme }) => ({
  position: "absolute",
  right: "1rem",
  bottom: "1rem",
  width: "1.0625rem",
  height: "1.0625rem",
  zIndex: 1,
  pointerEvents: "none",
  ...(theme.palette.mode !== "dark" && { filter: "invert(1)" }),
}));

const TABLE_TABS: TabItem[] = [
  { id: "assets", label: "Assets" },
  { id: "yields", label: "Yields" },
  { id: "perps", label: "Perps" },
  { id: "borrow", label: "Borrow" },
];

function AssetsLocked({ onConnect }: { onConnect: () => void }) {
  const { isDarkMode } = useThemeMode();
  return (
    <LockedTableRoot>
      <LockedTableText>
        <LockedCopy
          titleLead="Manage Your "
          titleAccent="Entire Stellar Portfolio"
          description="Monitor assets, optimize allocations, uncover opportunities, and receive AI-powered insights designed to help you make better decisions."
          ctaLabel="See What Seidar Can Do"
          onConnect={onConnect}
        />
      </LockedTableText>
      <LockedTableArt aria-hidden>
        <LockedTableImage src={isDarkMode ? "/assets/tokenTableLocked.png" : "/assets/tokenTableLockedLight.png"} alt="" />
      </LockedTableArt>
    </LockedTableRoot>
  );
}

export default function WalletTableLocked() {
  const [tab] = useState("assets");
  const { openConnectModal } = useWallet();

  return (
    <Root overflow="hidden" padding={2} mt="1rem" width="100%">
      <Content>
        <HeaderRow>
          <Box sx={{ pointerEvents: "none", opacity: 0.75 }}>
            <Tabs tabs={TABLE_TABS} activeTab={tab} setActiveTab={() => {}} isPathProvided={false} />
          </Box>
        </HeaderRow>
        {tab === "assets" && (
          <Box role="tabpanel">
            <AssetsLocked onConnect={openConnectModal} />
          </Box>
        )}
        {tab === "yields" && (
          <Box role="tabpanel">
            <ConnectAlert message="Connect your wallet to view your yield positions." />
          </Box>
        )}
        {tab === "perps" && (
          <Box role="tabpanel">
            <ConnectAlert message="Connect your wallet to view your Perps positions." />
          </Box>
        )}
        {tab === "borrow" && (
          <Box role="tabpanel">
            <Box sx={{ mb: "2.5rem" }}>
              <ConnectAlert message="Connect your wallet to view your borrow positions." />
            </Box>
          </Box>
        )}
      </Content>
      <Watermark src={WATERMARK_ICON} alt="" />
    </Root>
  );
}
