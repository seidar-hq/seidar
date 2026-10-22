"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import ArrowButton from "@/components/common/ArrowButton";
import ResponsiveTypography from "@/components/common/ResponsiveTypography";
import SectionHeader from "@/components/common/SectionHeader";
import { openDocs } from "@/lib/links";

const Section = styled(Box)(({ theme }) => ({
  width: "100%",
  display: "flex",
  alignItems: "flex-start",
  padding: "80px 188px",
  gap: "16px",
  [theme.breakpoints.down("lg")]: { padding: "60px 40px" },
  [theme.breakpoints.down("md")]: { flexDirection: "column", padding: "48px 24px", gap: "32px" },
  [theme.breakpoints.down("sm")]: { padding: "40px 16px" },
}));

const Intro = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "32px",
  justifyContent: "center",
  width: "50%",
  flexShrink: 0,
  [theme.breakpoints.down("md")]: { width: "100%" },
}));

const Heading = styled(Box)({ display: "flex", flexDirection: "column", gap: "24px" });

const Cards = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  width: "50%",
  flexShrink: 0,
  [theme.breakpoints.down("md")]: { width: "100%" },
}));

const Card = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  padding: "16px 40px 24px 16px",
  borderRadius: "8px",
  background: theme.palette.primary.cardBackground,
  "&:hover": { background: "linear-gradient(136deg, #1E1D25 24.73%, #346CFF 219.32%)" },
  [theme.breakpoints.down("sm")]: { padding: "16px 16px 20px 16px" },
}));

const CardTitleRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "20px",
  [theme.breakpoints.down("sm")]: { flexDirection: "column", alignItems: "flex-start", gap: "24px" },
}));

const IconTile = styled(Box)({
  width: "40px",
  height: "40px",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  overflow: "hidden",
});

const FEATURES = [
  {
    icon: "/images/icons/key-icon.svg",
    title: "Non-custodial by default",
    description:
      "Seidar connects to your existing wallets and supported custody setup. Assets always remain under your control.",
    color: "primary.main",
  },
  {
    icon: "/images/icons/stack.svg",
    title: "No Extra Smart Contract Layers",
    description:
      "No wrappers or intermediary contracts. Every action, swaps, lending, staking, bridging, is executed directly with the underlying protocol.",
    color: "primary.mutedBlue",
  },
  {
    icon: "/images/icons/zig-zag.svg",
    title: "Zero Counterparty Risk",
    description:
      "Seidar never holds your assets or routes them through internal systems. No middlemen. No extra trust required. Just direct, onchain Digital Assets.",
    color: "primary.purple",
  },
  {
    icon: "/images/icons/eye-icon.svg",
    title: "Full Transparency, Always onchain",
    description:
      "See exactly which protocol you're interacting with, what you're signing, and where every asset sits. Nothing moves without your approval.",
    color: "primary.frostedBlue",
  },
];

export default function SecureInfrastructure() {
  return (
    <Section>
      <Intro>
        <Heading>
          <SectionHeader text="Secure Protocol Infrastructure" />
          <Typography
            variant="h3"
            sx={{
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "white.light",
              maxWidth: { xs: "150px", sm: "200px", lg: "240px" },
            }}
          >
            Your Assets. Your Wallets. Your Control. Always.
          </Typography>
        </Heading>
        <ArrowButton text="View Documentation" handleClick={openDocs} />
      </Intro>
      <Cards>
        {FEATURES.map((feature) => (
          <Card key={feature.title}>
            <CardTitleRow>
              <IconTile sx={{ bgcolor: feature.color }}>
                <Box component="img" src={feature.icon} alt={feature.title} sx={{ width: 20, height: 20 }} />
              </IconTile>
              <ResponsiveTypography
                variant="body4SemiBold"
                smallFontSize={18}
                mediumFontSize={16}
                sx={{ lineHeight: 1.3, letterSpacing: "-0.02em" }}
              >
                {feature.title}
              </ResponsiveTypography>
            </CardTitleRow>
            <ResponsiveTypography
              variant="subtitle1"
              smallFontSize={14}
              mediumFontSize={14}
              sx={{ lineHeight: 1.4, opacity: 0.8 }}
            >
              {feature.description}
            </ResponsiveTypography>
          </Card>
        ))}
      </Cards>
    </Section>
  );
}
