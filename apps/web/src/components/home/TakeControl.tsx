"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { styled } from "@mui/material/styles";
import ResponsiveTypography from "@/components/common/ResponsiveTypography";
import { openApp, openDocs } from "@/lib/links";

const Section = styled(Box)(({ theme }) => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "140px 188px 0",
  gap: "24px",
  overflow: "hidden",
  background: "linear-gradient(165deg, rgba(16, 16, 16, 0.00) 40%, #346CFF 75%, #8DE8FF 100%)",
  [theme.breakpoints.down("lg")]: { padding: "60px 40px 0" },
  [theme.breakpoints.down("md")]: { padding: "48px 24px 0" },
  [theme.breakpoints.down("sm")]: { padding: "40px 26px 0", gap: "61px" },
}));

const Content = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "24px",
  textAlign: "center",
  [theme.breakpoints.down("md")]: { gap: "16px" },
}));

// Keeps the height the (now removed) rotating artwork occupied so the gradient keeps its original flow.
const GradientSpace = styled(Box)(({ theme }) => ({
  width: "100%",
  height: "360px",
  [theme.breakpoints.down("sm")]: { height: "220px" },
}));

const buttonSx = {
  width: { xs: "auto", sm: "200px" },
  height: "48px",
  px: "24px",
  fontFamily: { xs: '"Geist", "Public Sans", sans-serif', md: undefined },
  letterSpacing: { xs: "-0.32px", md: undefined },
  whiteSpace: "nowrap",
} as const;

const DEFAULT_COPY = {
  title: "Take control of your digital asset portfolio.",
  description: "See your positions, understand the risk and execute with confidence.",
};

export default function TakeControl() {
  return (
    <Section>
      <Content>
        <ResponsiveTypography
          variant="h2"
          smallFontSize={28}
          sx={(t) => ({
            lineHeight: 1.1,
            letterSpacing: "-0.8px",
            background: "linear-gradient(110deg, #FFF 36.59%, rgba(255, 255, 255, 0.00) 172.47%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            [t.breakpoints.down("md")]: {
              fontFamily: '"Geist", "Public Sans", sans-serif',
              fontWeight: 500,
              fontSize: "32px !important",
              lineHeight: 1.08,
              letterSpacing: "-1.28px",
              background: "none",
              WebkitTextFillColor: t.palette.white.main,
            },
          })}
        >
          {DEFAULT_COPY.title}
        </ResponsiveTypography>
        <ResponsiveTypography
          variant="body4"
          smallFontSize={16}
          mediumFontSize={16}
          sx={(t) => ({
            opacity: 0.9,
            lineHeight: 1.3,
            letterSpacing: "-0.32px",
            maxWidth: { xs: "320px", sm: "440px", lg: "500px" },
            [t.breakpoints.down("md")]: {
              opacity: 1,
              color: "#A3A3A9",
              fontFamily: '"Geist", "Public Sans", sans-serif',
              fontSize: "14px !important",
              lineHeight: 1.4,
              letterSpacing: 0,
              maxWidth: "304px",
            },
          })}
        >
          {DEFAULT_COPY.description}
        </ResponsiveTypography>
        <Box
          sx={{
            display: "flex",
            gap: { xs: "6px", sm: "16px" },
            marginTop: "8px",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          <Button variant="primary" size="large" sx={buttonSx} onClick={openApp}>
            Launch App
          </Button>
          <Button
            variant="secondary"
            size="large"
            sx={{
              ...buttonSx,
              color: "#F1F1F1",
              borderColor: "rgba(255, 255, 255, 0.19)",
              "&:hover": { borderColor: "white.main" },
            }}
            onClick={openDocs}
          >
            Read the Docs
          </Button>
        </Box>
      </Content>
      <GradientSpace aria-hidden />
    </Section>
  );
}
