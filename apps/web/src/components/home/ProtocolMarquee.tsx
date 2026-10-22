"use client";

import Box from "@mui/material/Box";
import { keyframes, styled } from "@mui/material/styles";
import SectionHeader from "@/components/common/SectionHeader";
import { STELLAR_PROTOCOLS } from "@/lib/protocols";

const scroll = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

const SectionWrapper = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "24px",
  width: "100%",
  overflow: "hidden",
  marginTop: "100px",
  [theme.breakpoints.down("sm")]: { marginTop: "64px" },
}));

const MarqueeContainer = styled(Box)({
  position: "relative",
  width: "100%",
  height: "78px",
  overflow: "hidden",
});

const MarqueeTrack = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "60px",
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  animation: `${scroll} 45s linear infinite`,
  whiteSpace: "nowrap",
  [theme.breakpoints.down("sm")]: { gap: "40px" },
}));

// Matches the original 160x40 logo slots at 50% opacity, but built from mark + name.
const LogoItem = styled(Box)(({ theme }) => ({
  height: "40px",
  width: "160px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  opacity: 0.5,
  flexShrink: 0,
  [theme.breakpoints.down("sm")]: {
    height: "30px",
    width: "120px",
    gap: "8px",
  },
}));

const Fade = styled(Box, { shouldForwardProp: (prop) => prop !== "side" })<{
  side: "left" | "right";
}>(({ theme, side }) => ({
  position: "absolute",
  top: 0,
  [side]: 0,
  width: "249px",
  height: "100%",
  background: `linear-gradient(to ${side === "left" ? "right" : "left"}, ${theme.palette.primary.blackBackground} 38%, transparent)`,
  zIndex: 1,
  pointerEvents: "none",
  [theme.breakpoints.down("sm")]: { width: "60px" },
}));

// Repeat the set so one half of the track is always wider than the viewport.
const LOGOS = [
  ...STELLAR_PROTOCOLS,
  ...STELLAR_PROTOCOLS,
  ...STELLAR_PROTOCOLS,
];

export default function ProtocolMarquee() {
  return (
    <SectionWrapper>
      <SectionHeader
        text="Integrated with leading Stellar protocols"
        mobileWidth="284px"
      />
      <MarqueeContainer>
        <MarqueeTrack>
          {[...LOGOS, ...LOGOS].map((protocol, index) => (
            <LogoItem
              key={`${protocol.name}-${index}`}
              role="img"
              aria-label={protocol.name}
            >
              <Box
                component="img"
                src={protocol.mark}
                alt=""
                sx={{
                  height: { xs: "20px", sm: "28px" },
                  transform: `scale(${protocol.markScale ?? 1})`,
                }}
              />
              <Box
                component="span"
                sx={{
                  color: "#FFF",
                  fontWeight: 500,
                  fontSize: { xs: "17px", sm: "24px" },
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {protocol.name}
              </Box>
            </LogoItem>
          ))}
        </MarqueeTrack>
        <Fade side="left" />
        <Fade side="right" />
      </MarqueeContainer>
    </SectionWrapper>
  );
}
