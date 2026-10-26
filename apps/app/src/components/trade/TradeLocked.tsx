"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, type Theme } from "@mui/material/styles";
import { ARROW_CIRCLE_ICON, LockedCtaIcon, LockedCtaPill } from "@/components/common/locked/LockedParts";
import { useWallet } from "@/wallet/WalletContext";

const lockedCard = (theme: Theme) => {
  const dark = theme.palette.mode === "dark";
  return {
    position: "relative" as const,
    overflow: "hidden",
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    gap: "1rem",
    padding: "1rem 3.75rem",
    borderRadius: "1.5rem",
    backgroundColor: dark ? theme.palette.overlay.white02 : theme.palette.common.white,
    border: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : theme.palette.border.main600}`,
    boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
    [theme.breakpoints.down("lg")]: { height: "auto", minHeight: "auto", padding: "2.5rem 3.75rem" },
    [theme.breakpoints.down("sm")]: { padding: "2rem 1.25rem" },
  };
};

const MarketCard = styled(Box)(({ theme }) => ({ ...lockedCard(theme), height: "39.8125rem" }));
const HistoryCard = styled(Box)(({ theme }) => ({ ...lockedCard(theme), height: "16.25rem" }));

const CardText = styled(Box)({
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
  maxWidth: "100%",
});

const MarketArt = styled("img")(({ theme }) => ({
  position: "absolute",
  top: "50%",
  right: "5.625rem",
  transform: "translateY(-50%)",
  width: "26.25rem",
  height: "auto",
  pointerEvents: "none",
  userSelect: "none",
  zIndex: 0,
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

const HistoryArt = styled("img")(({ theme }) => ({
  position: "absolute",
  top: "3.375rem",
  right: "4.875rem",
  width: "26.9375rem",
  height: "auto",
  pointerEvents: "none",
  userSelect: "none",
  zIndex: 0,
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

export function ConnectPill({ onClick, sx }: { onClick: () => void; sx?: object }) {
  return (
    <LockedCtaPill onClick={onClick} sx={sx}>
      <Typography variant="caption" color="common.black">
        Connect a Wallet
      </Typography>
      <LockedCtaIcon src={ARROW_CIRCLE_ICON} alt="" />
    </LockedCtaPill>
  );
}

export function MarketLocked({
  marketText = "Connect a wallet to load live market data, price movement, and best swap routes.",
  transactionsText = "Connect a wallet to view your completed swaps, transaction status, and network details.",
}: {
  marketText?: string;
  transactionsText?: string;
}) {
  const { openConnectModal } = useWallet();
  return (
    <>
      <MarketCard>
        <CardText>
          <Typography variant="subtitle10" color="sidebar.subText" sx={{ maxWidth: "23.0625rem" }}>
            {marketText}
          </Typography>
          <ConnectPill onClick={openConnectModal} />
        </CardText>
        <MarketArt src="/assets/swapMarketChartLocked.png" alt="" />
      </MarketCard>
      <HistoryCard>
        <CardText>
          <Typography variant="subtitle10" color="sidebar.subText" sx={{ maxWidth: "25.5625rem" }}>
            {transactionsText}
          </Typography>
          <ConnectPill onClick={openConnectModal} />
        </CardText>
        <HistoryArt src="/assets/swapTransactionsLocked.png" alt="" />
      </HistoryCard>
    </>
  );
}

const SpotRoot = styled(Box, { shouldForwardProp: (p) => p !== "bare" })<{ bare?: boolean }>(({ theme, bare }) => {
  const dark = theme.palette.mode === "dark";
  return {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: "55.625rem",
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "1rem 3.75rem",
    borderRadius: "1.5rem",
    ...(bare
      ? { backgroundColor: "transparent", border: "none", boxShadow: "none" }
      : {
          backgroundColor: dark ? theme.palette.overlay.white02 : theme.palette.common.white,
          border: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : theme.palette.border.main600}`,
          boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
        }),
    [theme.breakpoints.down("lg")]: { height: "auto", minHeight: "calc(100dvh - 12rem)", padding: "3rem 3.75rem" },
    [theme.breakpoints.down("sm")]: { padding: "2.5rem 1.25rem" },
  };
});

const SpotText = styled(Box)({
  position: "relative",
  zIndex: 1,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
  maxWidth: "100%",
});

const SpotArt = styled("img")(({ theme }) => ({
  position: "absolute",
  top: "50%",
  right: "3.75rem",
  transform: "translateY(-50%)",
  width: "36.875rem",
  height: "auto",
  pointerEvents: "none",
  userSelect: "none",
  zIndex: 0,
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

export function SpotLocked({
  text = "Connect an exchange API to view balances, sync positions, and enable secure trading access.",
  illustration = "/assets/spotExchangesLocked.svg",
  bare = false,
}: {
  text?: string;
  illustration?: string;
  bare?: boolean;
}) {
  const { openConnectModal } = useWallet();
  return (
    <SpotRoot bare={bare}>
      <SpotText>
        <Typography variant="subtitle10" color="sidebar.subText" sx={{ maxWidth: "35.125rem" }}>
          {text}
        </Typography>
        <ConnectPill onClick={openConnectModal} />
      </SpotText>
      <SpotArt src={illustration} alt="" />
    </SpotRoot>
  );
}

const PerpsGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "1fr 27.875rem",
  alignItems: "start",
  [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
}));

const Column = styled(Box)({ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" });

const SquareCard = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "27.875rem",
    maxWidth: "100%",
    height: "27.875rem",
    padding: "1rem",
    borderRadius: "1.5rem",
    backgroundColor: dark ? theme.palette.overlay.white05 : theme.palette.common.white,
    border: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : theme.palette.border.main600}`,
    boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
    [theme.breakpoints.down("lg")]: { width: "100%" },
  };
});

const SquareBody = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2rem",
});

const SquareArt = styled("img")({ height: "auto", pointerEvents: "none", userSelect: "none" });

function SquareLocked({
  illustration,
  illustrationWidth,
  text,
  textMaxWidth,
  onConnect,
}: {
  illustration: string;
  illustrationWidth: string;
  text: string;
  textMaxWidth: string;
  onConnect: () => void;
}) {
  return (
    <SquareCard>
      <SquareBody>
        <SquareArt src={illustration} alt="" sx={{ width: illustrationWidth }} />
        <Typography variant="subtitle10" color="sidebar.subText" sx={{ textAlign: "center", maxWidth: textMaxWidth }}>
          {text}
        </Typography>
        <ConnectPill onClick={onConnect} sx={{ alignSelf: "center" }} />
      </SquareBody>
    </SquareCard>
  );
}

export function PerpsLocked() {
  const { openConnectModal } = useWallet();
  return (
    <PerpsGrid>
      <Column>
        <MarketLocked
          marketText="Connect a wallet to load live perps charts, funding, and market data."
          transactionsText="Connect a wallet to view your perps orders, positions, fills, and PnL history."
        />
      </Column>
      <Column>
        <SquareLocked
          illustration="/assets/derivOrderEntryLocked.png"
          illustrationWidth="13.25rem"
          text="Connect a perps account to place limit or market orders securely."
          textMaxWidth="19.0625rem"
          onConnect={openConnectModal}
        />
        <SquareLocked
          illustration="/assets/derivAccountLocked.png"
          illustrationWidth="13.5625rem"
          text="Connect your account to view balance, margin used, leverage, and unrealized PnL."
          textMaxWidth="19.5625rem"
          onConnect={openConnectModal}
        />
      </Column>
    </PerpsGrid>
  );
}
