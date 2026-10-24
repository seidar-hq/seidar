"use client";

import { motion } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { reveal } from "./reveal";

const Section = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  width: "100%",
  position: "relative",
  overflowX: "clip",
  padding: "98px 80px",
  background: "#FFFFFF",
  [theme.breakpoints.down("lg")]: { padding: "80px 40px" },
  [theme.breakpoints.down("md")]: { padding: "40px 20px", background: "#F6F6F7" },
}));

const Row = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "88px",
  width: "100%",
  maxWidth: "1280px",
  [theme.breakpoints.down("lg")]: { flexDirection: "column-reverse", gap: "32px" },
  [theme.breakpoints.down("md")]: { flexDirection: "column", alignItems: "stretch" },
}));

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

const Copy = styled(motion.div)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "32px",
  flex: "0 1 544px",
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
  background: "rgba(52, 108, 255, 0.1)",
});

const bodyStyle = (theme: Theme) => ({
  color: "#5B5B5B",
  lineHeight: 1.2,
  letterSpacing: "-0.36px",
  [theme.breakpoints.down("md")]: {
    color: "#68686E",
    fontSize: "16px !important",
    lineHeight: 1.45,
    letterSpacing: "-0.24px",
  },
});

const PARAGRAPHS = [
  "An agent is only as smart as the context you give it. So we built that context.",
  "Seidar turns Stellar activity into structured, reconciled data through the Seidar MCP: positions, transactions, balances, yields and market data, shaped so agents can actually reason over it.",
  "And it goes beyond data. Seidar gives you the skills and tools to build teams of specialised agents for Stellar DeFi, inside the agent framework and models you already use.",
];

export default function AboutAgents() {
  return (
    <Section>
      <Row>
        <ImageFrame {...reveal(0)}>
          <picture>
            <source media="(max-width: 899.95px)" srcSet="/images/about/agents-visual-mobile.png" />
            <Picture src="/images/about/agents-visual.png" alt="A glass AI core orbited by rings" />
          </picture>
        </ImageFrame>
        <Copy {...reveal(0.15)}>
          <Tag>
            <Typography variant="subtitle1" sx={{ color: "primary.main", lineHeight: 1.2, letterSpacing: "-0.28px" }}>
              The Intelligence Layer for Stellar Agents
            </Typography>
          </Tag>
          <Typography
            component="p"
            sx={(theme) => ({
              margin: 0,
              fontFamily: 'Geist, "Public Sans", sans-serif',
              fontSize: "1.75rem",
              fontWeight: 600,
              lineHeight: "120%",
              letterSpacing: "-0.07rem",
              background: "linear-gradient(155deg, #141414 50%, #7A7A7A 88.18%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              [theme.breakpoints.down("lg")]: { fontSize: "1.375rem" },
              [theme.breakpoints.down("md")]: {
                fontSize: "28px",
                lineHeight: 1.08,
                letterSpacing: "-1.12px",
                background: "none",
                WebkitTextFillColor: "#141414",
              },
            })}
          >
            Agents are starting to manage portfolios. They can scan yields, flag risks and plan moves faster than any
            person, but only when the data they read is clean. Raw Stellar ledger data is spread out, inconsistent and
            hard for an agent to make sense of.
          </Typography>
          {PARAGRAPHS.map((text) => (
            <Typography key={text} variant="body3" sx={bodyStyle}>
              {text}
            </Typography>
          ))}
        </Copy>
      </Row>
    </Section>
  );
}
