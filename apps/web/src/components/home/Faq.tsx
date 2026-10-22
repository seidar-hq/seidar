"use client";

import { useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import SectionHeader from "@/components/common/SectionHeader";

const HOVER_GRADIENT = "linear-gradient(136deg, #1E1D25 24.73%, #346CFF 219.32%)";

const Section = styled(Box)(({ theme }) => ({
  width: "100%",
  maxWidth: "1064px",
  margin: "0 auto",
  display: "flex",
  alignItems: "flex-start",
  padding: "80px 0",
  gap: "40px",
  [theme.breakpoints.down("lg")]: { padding: "60px 40px" },
  [theme.breakpoints.down("md")]: { flexDirection: "column", padding: "48px 24px", gap: "32px" },
  [theme.breakpoints.down("sm")]: { padding: "40px 16px" },
}));

const Intro = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  width: "35%",
  flexShrink: 0,
  [theme.breakpoints.down("md")]: { width: "100%" },
}));

const List = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  width: "65%",
  flexShrink: 0,
  [theme.breakpoints.down("md")]: { width: "100%" },
}));

const Item = styled(Accordion)(({ theme }) => ({
  background: theme.palette.primary.cardBackground,
  borderRadius: "8px !important",
  boxShadow: "none",
  outline: "none",
  border: "none",
  "&:before": { display: "none" },
  "&.Mui-expanded": { margin: 0, background: HOVER_GRADIENT },
  "&:hover": { background: HOVER_GRADIENT },
}));

const Question = styled(AccordionSummary)(({ theme }) => ({
  padding: "8px 16px",
  minHeight: "unset",
  outline: "none",
  "&:focus": { outline: "none" },
  "&:focus-visible": { outline: "none" },
  "& .MuiAccordionSummary-content": { margin: "12px 0", "&.Mui-expanded": { margin: "12px 0" } },
  "& .MuiAccordionSummary-expandIconWrapper": { color: theme.palette.white.main },
  "&.Mui-expanded": { minHeight: "unset" },
}));

const Answer = styled(AccordionDetails)({ padding: "0 16px 16px" });

const FAQS = [
  {
    question: "What is Seidar?",
    answer:
      "Seidar is the Digital Asset Copilot for Stellar DeFi. It helps teams monitor positions, understand risk, approve actions, execute with control, and report on digital asset activity across Stellar wallets and protocols.",
  },
  {
    question: "Who is Seidar built for?",
    answer:
      "Seidar is built for teams managing digital assets professionally, including funds, trading teams, treasury teams, vault curators, family offices and institutional operators.",
  },
  {
    question: "How is Seidar different from a portfolio tracker?",
    answer:
      "Beyond viewing your portfolio, Seidar is built around the complete workflows institutions need to understand risk, decide what to do, approve actions, execute through connected protocols, and keep a clear record afterwards.",
  },
  {
    question: "How does Seidar help me understand risk?",
    answer:
      "Seidar brings together signals related to your positions, exposure, liquidity, PnL, concentration and portfolio changes across connected wallets and protocols so you can make informed decisions.",
  },
  {
    question: "Which wallets and protocols are supported?",
    answer:
      "Seidar is building integrations across Stellar wallets and protocols. See our current documentation for an up-to-date list.",
  },
  {
    question: "How does Seidar use AI?",
    answer:
      "Today, Seidar uses AI to help teams make sense of fragmented digital asset activity by building context around the assets, protocols and strategies that are relevant to you.",
  },
  {
    question: "How can I get started?",
    answer:
      "You can request a demo, or join the public beta where key features are being tested in a live environment. Please note the public beta is not representative of the complete Seidar solution, and is for testing purposes.",
  },
];

export default function Faq() {
  const [expanded, setExpanded] = useState<number | false>(false);

  return (
    <Section>
      <Intro>
        <SectionHeader text="FAQ's" />
        <Typography variant="h3" sx={{ lineHeight: 1.1, letterSpacing: "-0.02em", color: "white.light" }}>
          Questions?
          <br />
          We&apos;re Here to Help.
        </Typography>
        <Typography variant="subtitle1" sx={{ lineHeight: 1.4, opacity: 0.9 }}>
          Browse through our most asked questions and find what you&apos;re looking for.
        </Typography>
      </Intro>
      <List>
        {FAQS.map((faq, index) => (
          <Item
            key={faq.question}
            expanded={expanded === index}
            onChange={(_, isExpanded) => setExpanded(isExpanded ? index : false)}
            disableGutters
          >
            <Question
              expandIcon={
                expanded === index ? (
                  <RemoveIcon sx={{ fontSize: 20, color: "white.main" }} />
                ) : (
                  <AddIcon sx={{ fontSize: 20, color: "white.main" }} />
                )
              }
            >
              <Typography variant="body4SemiBold" sx={{ lineHeight: 1.3, letterSpacing: "-0.02em" }}>
                {faq.question}
              </Typography>
            </Question>
            <Answer>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.6, opacity: 0.8 }}>
                {faq.answer}
              </Typography>
            </Answer>
          </Item>
        ))}
      </List>
    </Section>
  );
}
