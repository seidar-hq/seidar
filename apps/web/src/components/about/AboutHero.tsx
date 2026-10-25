"use client";

import Box from "@mui/material/Box";
import { alpha, keyframes, styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import ResponsiveTypography from "@/components/common/ResponsiveTypography";

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Full viewport height on every screen (svh so mobile browser chrome doesn't push it past the fold).
const Section = styled(Box)(({ theme }) => ({
  position: "relative",
  width: "100%",
  height: "100vh",
  minHeight: "600px",
  overflow: "hidden",
  background: "linear-gradient(159.7deg, #346CFF 40.69%, #8DE8FF 136.69%)",
  "@supports (height: 100svh)": { height: "100svh" },
  [theme.breakpoints.down("lg")]: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minHeight: "560px",
    padding: "120px 24px 60px",
  },
  [theme.breakpoints.down("md")]: {
    justifyContent: "flex-start",
    padding: "130px 20px 54px",
    background: "linear-gradient(93deg, #346CFF 7.69%, #5D9BFF 56.95%, #8DE8FF 92.62%)",
  },
}));

const ArtSlot = styled(Box)(({ theme }) => ({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  userSelect: "none",
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

const MobileArtSlot = styled(Box)(({ theme }) => ({
  display: "none",
  position: "absolute",
  left: "-60px",
  bottom: "-120px",
  width: "520px",
  height: "476px",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  userSelect: "none",
  [theme.breakpoints.down("md")]: { display: "flex" },
}));

const Art = styled("img")({ display: "block", objectFit: "contain" });

const Content = styled(Box)(({ theme }) => ({
  position: "absolute",
  zIndex: 1,
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "848px",
  maxWidth: "calc(100% - 48px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "24px",
  animation: `${fadeIn} 0.8s ease-out both`,
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  [theme.breakpoints.down("lg")]: {
    position: "relative",
    left: "auto",
    top: "auto",
    transform: "none",
    width: "100%",
    maxWidth: "none",
  },
  [theme.breakpoints.down("md")]: { gap: "18px", zIndex: 2 },
}));

const SubtextWrap = styled(Box)(({ theme }) => ({
  width: "582px",
  maxWidth: "100%",
  textAlign: "center",
  "& > *": { textAlign: "center" },
  [theme.breakpoints.down("md")]: { width: "326px" },
}));

const ART = "/images/about/hero-glass.png";

export default function AboutHero() {
  return (
    <Section>
      <ArtSlot sx={{ right: "-470px", top: "-300px", width: "1000px", height: "1000px" }}>
        <Art src={ART} alt="" aria-hidden="true" sx={{ width: "900px", height: "900px", transform: "rotate(-24deg)" }} />
      </ArtSlot>
      <ArtSlot sx={{ left: "-640px", top: "-160px", width: "1400px", height: "1400px" }}>
        <Art src={ART} alt="" aria-hidden="true" sx={{ width: "1300px", height: "1300px", transform: "rotate(18deg)" }} />
      </ArtSlot>
      <MobileArtSlot>
        <Art src={ART} alt="" aria-hidden="true" sx={{ width: "520px", height: "520px", transform: "rotate(-14deg)" }} />
      </MobileArtSlot>

      <Content>
        <Typography
          component="p"
          sx={(theme) => ({
            margin: 0,
            width: "620px",
            maxWidth: "100%",
            fontFamily: '"Geist", "Public Sans", sans-serif',
            fontWeight: 600,
            fontSize: "64px",
            lineHeight: 1,
            letterSpacing: "-1.28px",
            textAlign: "center",
            background: `linear-gradient(160deg, ${theme.palette.white.main} 37.7%, ${alpha(theme.palette.white.main, 0)} 163%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            [theme.breakpoints.down("lg")]: { fontSize: "48px" },
            [theme.breakpoints.down("md")]: {
              width: "300px",
              fontSize: "42px",
              lineHeight: 0.98,
              letterSpacing: "-2.1px",
              background: "none",
              WebkitTextFillColor: theme.palette.white.main,
            },
          })}
        >
          Built for capital <Box component="br" sx={{ display: { xs: "none", md: "inline" } }} />
          that moves on Stellar
        </Typography>
        <SubtextWrap>
          <ResponsiveTypography
            variant="body4"
            sx={(theme) => ({
              opacity: 0.9,
              lineHeight: 1.2,
              letterSpacing: "-0.32px",
              textAlign: "center",
              [theme.breakpoints.down("md")]: {
                opacity: 0.86,
                fontSize: "16px !important",
                lineHeight: 1.42,
                letterSpacing: "-0.24px",
              },
            })}
          >
            Stellar&apos;s protocols are powerful but scattered. Seidar brings them together, so you and your agents
            can see the full picture before you move money.
          </ResponsiveTypography>
        </SubtextWrap>
      </Content>
    </Section>
  );
}
