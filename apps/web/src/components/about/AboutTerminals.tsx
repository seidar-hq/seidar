"use client";

import { motion } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, styled } from "@mui/material/styles";
import { reveal } from "./reveal";

const Section = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  width: "100%",
  padding: "120px 80px",
  background: theme.palette.primary.blackBackground,
  [theme.breakpoints.down("lg")]: { padding: "0 40px 80px" },
  [theme.breakpoints.down("md")]: { padding: "40px 20px" },
}));

const Row = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "46px",
  justifyContent: "flex-end",
  width: "100%",
  maxWidth: "1280px",
  [theme.breakpoints.down("lg")]: { flexDirection: "column", gap: "32px" },
  [theme.breakpoints.down("md")]: { alignItems: "stretch" },
}));

const Copy = styled(motion.div)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "32px",
  flex: "0 1 541px",
  minWidth: 0,
  [theme.breakpoints.down("lg")]: { flex: "none", width: "100%" },
  [theme.breakpoints.down("md")]: { gap: "20px" },
}));

const Tag = styled(Box)({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: "200px",
  width: "fit-content",
  background: "rgba(255, 255, 255, 0.1)",
});

const ImageFrame = styled(motion.div)(({ theme }) => ({
  flexShrink: 0,
  width: "46.4%",
  maxWidth: "594px",
  borderRadius: "16px",
  overflow: "hidden",
  [theme.breakpoints.down("lg")]: { width: "100%", maxWidth: "440px" },
  [theme.breakpoints.down("md")]: { maxWidth: "480px", alignSelf: "center", borderRadius: 0 },
}));

const Picture = styled("img")({ display: "block", width: "100%", height: "auto" });

export default function AboutTerminals() {
  return (
    <Section>
      <Row>
        <Copy {...reveal(0)}>
          <Tag>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.2, letterSpacing: "-0.28px" }}>
              Seidar Lives Where You Work
            </Typography>
          </Tag>
          <Typography
            component="p"
            sx={(theme) => ({
              margin: 0,
              fontFamily: '"Geist", "Public Sans", sans-serif',
              fontWeight: 600,
              fontSize: "36px",
              lineHeight: 1.2,
              letterSpacing: "-1.44px",
              background: `linear-gradient(127deg, ${theme.palette.white.main} 51.4%, ${alpha(theme.palette.white.main, 0)} 160.33%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              [theme.breakpoints.down("lg")]: { fontSize: "28px" },
              [theme.breakpoints.down("md")]: {
                lineHeight: 1.08,
                letterSpacing: "-1.12px",
                background: `linear-gradient(106deg, ${theme.palette.white.main} 16.67%, #A6A6B3 91.67%)`,
                WebkitBackgroundClip: "text",
              },
            })}
          >
            More of the work now happens in an AI terminal. Instead of clicking through dashboards, people ask Claude,
            Codex, OpenCode or their own agents to get it done.
          </Typography>
          <Typography
            variant="body3"
            sx={(theme) => ({
              color: "white.light",
              lineHeight: 1.2,
              letterSpacing: "-0.36px",
              [theme.breakpoints.down("md")]: {
                color: "#A3A3A9",
                fontSize: "16px !important",
                lineHeight: 1.45,
                letterSpacing: "-0.24px",
              },
            })}
          >
            So Seidar isn&apos;t just another app to open. Through the Seidar MCP, the tools you already use get live
            Stellar context on your positions, transactions, balances and protocol activity, so they can answer
            accurately and act with confidence.
          </Typography>
        </Copy>
        <ImageFrame {...reveal(0.15)}>
          <picture>
            <source media="(max-width: 899.95px)" srcSet="/images/about/terminals-visual-mobile.png" />
            <Picture src="/images/about/terminals-visual.png" alt="Seidar connected to Claude, Codex, OpenCode and Hermes Agent" />
          </picture>
        </ImageFrame>
      </Row>
    </Section>
  );
}
