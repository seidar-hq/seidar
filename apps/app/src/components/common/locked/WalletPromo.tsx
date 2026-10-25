"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import {
  WalletIconRow,
  WalletPromoButton,
  WalletPromoButtonIcon,
  WalletPromoNote,
  WalletPromoNoteIcon,
  WalletPromoRoot,
  WalletPromoText,
} from "./LockedParts";

// Stellar wallets supported through the wallet kit, shown as overlapping bubbles.
const WALLETS = [
  { name: "Freighter", src: "/assets/wallets/freighter-logo.svg" },
  { name: "xBull", src: "/assets/wallets/xbull-logo.png" },
  { name: "LOBSTR", src: "/assets/wallets/lobstr-logo.png" },
  { name: "Albedo", src: "/assets/wallets/albedo-logo.png" },
  { name: "Rabet", src: "/assets/wallets/rabet-logo.png" },
  { name: "Hana", src: "/assets/wallets/hana-logo.png" },
];

const Bubble = styled(Box)(({ theme }) => ({
  width: "3.4375rem",
  height: "3.4375rem",
  flexShrink: 0,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.mode === "dark" ? "#1c1c22" : "#f0f0f4",
  boxShadow: `inset 0 0 0 1px ${theme.palette.overlay.white05}`,
  "&:not(:first-of-type)": { marginLeft: "-1.0625rem" },
  "& img": { width: "1.6rem", height: "1.6rem", borderRadius: "0.4rem", objectFit: "contain" },
}));

export default function WalletPromo({ onConnect }: { onConnect: () => void }) {
  return (
    <WalletPromoRoot>
      <WalletIconRow>
        {WALLETS.map((w) => (
          <Bubble key={w.name} title={w.name}>
            <img src={w.src} alt="" />
          </Bubble>
        ))}
      </WalletIconRow>
      <WalletPromoText>
        <Typography variant="subtitle6" component="p" color="common.black">
          Connect your{" "}
          <Box component="span" sx={{ color: "primary.main" }}>
            Wallet
          </Box>
        </Typography>
        <Typography variant="subtitle9" color="sidebar.subText" sx={{ maxWidth: "16.375rem" }}>
          Choose a supported Stellar wallet to start swapping, bridging, sending, and receiving assets securely.
        </Typography>
      </WalletPromoText>
      <WalletPromoNote>
        <WalletPromoNoteIcon src="/assets/locked/shield.svg" alt="" />
        <Typography variant="subtitle9" color="sidebar.subText">
          Your Wallet stays in your control
        </Typography>
      </WalletPromoNote>
      <WalletPromoButton variant="solid" color="primary" onClick={onConnect}>
        Connect Now
        <WalletPromoButtonIcon src="/assets/locked/walletGradient.svg" alt="" />
      </WalletPromoButton>
    </WalletPromoRoot>
  );
}
