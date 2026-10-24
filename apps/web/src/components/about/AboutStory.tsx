"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, styled } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { reveal } from "./reveal";

const Section = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  width: "100%",
  padding: "100px 80px",
  background: theme.palette.primary.blackBackground,
  [theme.breakpoints.down("lg")]: { padding: "80px 40px" },
  [theme.breakpoints.down("md")]: { padding: "40px 20px" },
}));

const Row = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: "85px",
  width: "100%",
  maxWidth: "1280px",
  [theme.breakpoints.down("lg")]: { flexDirection: "column", gap: "40px" },
  [theme.breakpoints.down("md")]: { alignItems: "stretch", gap: "32px" },
}));

const TextColumn = styled(motion.div)(({ theme }) => ({
  position: "relative",
  flex: "0 1 524px",
  minWidth: 0,
  [theme.breakpoints.down("lg")]: { flex: "none", width: "100%" },
}));

// The copy scrolls inside its own column on desktop so the image and text stay side by side.
const Scroller = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "32px",
  maxHeight: "667px",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  [theme.breakpoints.down("lg")]: { maxHeight: "440px" },
  [theme.breakpoints.down("md")]: { maxHeight: "none", overflowY: "visible", gap: "20px" },
}));

const BottomFade = styled(Box, { shouldForwardProp: (prop) => prop !== "visible" })<{ visible: boolean }>(
  ({ theme, visible }) => ({
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "96px",
    pointerEvents: "none",
    background: `linear-gradient(to bottom, transparent, ${theme.palette.primary.blackBackground})`,
    opacity: visible ? 1 : 0,
    transition: "opacity 0.25s ease",
    [theme.breakpoints.down("md")]: { display: "none" },
  }),
);

const Tag = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: "200px",
  width: "fit-content",
  background: alpha(theme.palette.white.main, 0.1),
}));

const ImageFrame = styled(motion.div)(({ theme }) => ({
  flexShrink: 0,
  width: "46.4%",
  maxWidth: "594px",
  borderRadius: "16px",
  overflow: "hidden",
  [theme.breakpoints.down("lg")]: { width: "100%", maxWidth: "440px" },
  [theme.breakpoints.down("md")]: {
    position: "relative",
    maxWidth: "480px",
    alignSelf: "center",
    aspectRatio: "350 / 342",
    borderRadius: "22px",
  },
}));

const DesktopImage = styled("img")(({ theme }) => ({
  display: "block",
  width: "100%",
  height: "auto",
  [theme.breakpoints.down("md")]: { display: "none" },
}));

const MobileImage = styled("img")(({ theme }) => ({
  display: "none",
  width: "100%",
  height: "100%",
  objectFit: "cover",
  [theme.breakpoints.down("md")]: { display: "block" },
}));

const headingStyle = (theme: Theme, angle: number) => ({
  margin: 0,
  fontFamily: '"Geist", "Public Sans", sans-serif',
  fontWeight: 600,
  fontSize: "36px",
  lineHeight: 1.2,
  letterSpacing: "-1.44px",
  background: `linear-gradient(${angle}deg, ${theme.palette.white.main} 51.4%, ${alpha(theme.palette.white.main, 0)} 160.33%)`,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  [theme.breakpoints.down("lg")]: { fontSize: "28px" },
  [theme.breakpoints.down("md")]: {
    lineHeight: 1.08,
    letterSpacing: "-1.12px",
    background: `linear-gradient(120deg, ${theme.palette.white.main} 16.67%, #A6A6B3 91.67%)`,
    WebkitBackgroundClip: "text",
  },
});

const bodyStyle = (theme: Theme, weight: number) => ({
  margin: 0,
  color: "#E8E8E8",
  fontFamily: '"Geist", "Public Sans", sans-serif',
  fontWeight: weight,
  fontSize: "24px",
  lineHeight: 1.2,
  letterSpacing: "-0.48px",
  [theme.breakpoints.down("lg")]: { fontSize: "18px" },
  [theme.breakpoints.down("md")]: {
    color: "#A3A3A9",
    fontWeight: 400,
    fontSize: "16px",
    lineHeight: 1.45,
    letterSpacing: "-0.24px",
  },
});

const PARAGRAPHS = [
  {
    weight: 500,
    text: "Stellar has grown into a home for payments, stablecoins, real-world assets and a fast-moving set of DeFi protocols. But using it well still means hopping between apps, tracking positions by hand and guessing where the best opportunities are.",
  },
  {
    weight: 400,
    text: "If you're new, it's hard to know where to start. If you manage digital assets or RWAs professionally, from treasuries to yield strategies, the tooling you'd expect from traditional finance simply isn't there yet.",
  },
  {
    weight: 400,
    text: "Positions sit across Blend, Aquarius, Soroswap, Phoenix and more. Rates change by the hour. Risk is hard to see when your portfolio is split across a dozen protocols and wallets, and there's no single view you can trust.",
  },
];

export default function AboutStory() {
  const scroller = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const overflowing = el.scrollHeight - el.clientHeight > 4;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    setMoreBelow(overflowing && !atEnd);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  return (
    <Section>
      <Row>
        <ImageFrame {...reveal(0)}>
          <DesktopImage src="/images/about/story-visual.png" alt="The Seidar mark over Stellar light trails" />
          <MobileImage src="/images/about/story-visual-mobile.png" alt="The Seidar mark over Stellar light trails" />
        </ImageFrame>
        <TextColumn {...reveal(0.15)}>
          <Scroller ref={scroller} onScroll={update}>
            <Tag>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.2, letterSpacing: "-0.28px" }}>
                Why Seidar
              </Typography>
            </Tag>
            <Typography component="p" sx={(theme) => headingStyle(theme, 137)}>
              Seidar exists to make Stellar DeFi simple to navigate, for people and for the agents working with them.
            </Typography>
            {PARAGRAPHS.map((p) => (
              <Typography key={p.text} component="p" sx={(theme) => bodyStyle(theme, p.weight)}>
                {p.text}
              </Typography>
            ))}
            <Typography
              component="p"
              sx={(theme) => ({
                ...headingStyle(theme, 167),
                background: "linear-gradient(90deg, #4F8BFF 0%, #8DE8FF 48%, #FFFFFF 100%)",
                WebkitBackgroundClip: "text",
                width: "fit-content",
                [theme.breakpoints.down("md")]: {
                  lineHeight: 1.08,
                  letterSpacing: "-1.12px",
                  background: "linear-gradient(90deg, #4F8BFF 0%, #8DE8FF 48%, #FFFFFF 100%)",
                  WebkitBackgroundClip: "text",
                  alignSelf: "center",
                  textAlign: "center",
                },
              })}
            >
              Seidar gives you that view.
            </Typography>
          </Scroller>
          <BottomFade visible={moreBelow} />
        </TextColumn>
      </Row>
    </Section>
  );
}
