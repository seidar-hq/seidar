"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";

const Section = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  textAlign: "center",
  marginTop: "120px",
  overflow: "hidden",
  [theme.breakpoints.down("md")]: { marginTop: "60px" },
  [theme.breakpoints.down("sm")]: { marginTop: "20px" },
}));

const Copy = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "24px",
  width: "100%",
  padding: "0px 285px",
  [theme.breakpoints.down("lg")]: { padding: "0px 60px" },
  [theme.breakpoints.down("md")]: {
    padding: "64px 20px 0px 20px",
    alignItems: "flex-start",
    textAlign: "left",
    gap: "18px",
  },
}));

const Screenshot = styled(Box)(({ theme }) => ({
  width: "100%",
  height: "auto",
  marginTop: "75px",
  borderRadius: "12px",
  alignSelf: "flex-end",
  [theme.breakpoints.down("md")]: { marginTop: "25px" },
})) as typeof Box;

export default function Fragmented() {
  return (
    <Section>
      <Copy>
        <Typography variant="h2" sx={{ letterSpacing: "-0.02em" }}>
          Stellar&apos;s DeFi is Fragmented, Seidar brings it together{" "}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            opacity: 0.9,
            letterSpacing: "-0.048px",
            lineHeight: 1.5,
            background: "linear-gradient(135deg, #FFF 25.05%, rgba(255, 255, 255, 0.00) 162.18%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            maxWidth: "800px",
          }}
        >
          Assets and positions are scattered across Stellar protocols. Seidar brings your portfolio together, turns
          on-chain activity into actionable insights, and makes it easier to navigate the entire ecosystem.
        </Typography>
      </Copy>
      <Screenshot component="img" src="/images/home/desktop-view.png" alt="Seidar Desktop View" />
    </Section>
  );
}
