"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useSkeletonBg } from "@/hooks/useSkeletonBg";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";

/* ---------- AI intro ---------- */

const AIIntroRoot = styled(Box)(({ theme }) => ({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  backgroundColor: theme.palette.common.white,
  backgroundImage: "url(/assets/aiBackgroundImage.png)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  boxShadow: `0 0.25rem 3.125rem 0 ${theme.palette.shadow.default}`,
  padding: "2rem 2rem 1.5rem",
  overflow: "hidden",
  [theme.breakpoints.down("sm")]: { justifyContent: "flex-start", overflowY: "auto", padding: "3.5rem 1.25rem 1.5rem" },
}));

const IntroContent = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.25rem",
  width: "100%",
  maxWidth: "50rem",
  textAlign: "center",
  zIndex: 1,
});

const BadgeWrapper = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    display: "flex",
    width: "9.375rem",
    height: "1.875rem",
    padding: "0.417rem",
    justifyContent: "center",
    alignItems: "center",
    gap: "0.298rem",
    borderRadius: dark ? "6.25rem" : "1.25rem",
    backgroundColor: dark ? theme.palette.overlay.zero : theme.palette.surfaceBg.analysis,
    boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
    border: dark ? "none" : `0.0625rem solid ${theme.palette.overlay.mutedBlue10}`,
    borderTop: dark ? `0.0625rem solid ${theme.palette.border.main600}` : undefined,
    borderBottom: dark ? `0.0625rem solid ${theme.palette.border.main600}` : undefined,
  };
});

const HeadingSection = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.625rem",
  maxWidth: "44rem",
});

const CardsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: "0.625rem",
  width: "100%",
  justifyContent: "center",
  flex: 1,
  minHeight: 0,
  marginTop: "1.5rem",
  [theme.breakpoints.down("sm")]: { flexDirection: "column", alignItems: "center" },
}));

const CardAiIcon = styled("img")({
  position: "absolute",
  top: "1rem",
  right: "0.9375rem",
  width: "0.875rem",
  height: "0.875rem",
  pointerEvents: "none",
});

const CardDesign = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    minHeight: 0,
    backgroundColor: dark ? theme.palette.surfaceBg.section : theme.palette.surfaceBg.radioIdle,
    borderRadius: dark ? "1rem" : "0.75rem",
    border: `0.0625rem solid ${dark ? theme.palette.border.main600 : theme.palette.border.tableDivider}`,
    padding: "1.875rem 0rem 0rem 0rem",
    [theme.breakpoints.down("sm")]: { width: "100%", flex: "none" },
  };
});

const CardImageWrapper = styled(Box)({
  position: "relative",
  flex: 1,
  width: "100%",
  minHeight: 0,
  overflow: "hidden",
  borderRadius: "0.75rem",
});

const CardImage = styled("img")(({ theme }) => ({
  width: "100%",
  height: "100%",
  minHeight: 0,
  objectFit: "contain",
  objectPosition: "center top",
  borderRadius: "0.75rem",
  display: "block",
  [theme.breakpoints.down("sm")]: { height: "auto" },
}));

const StartExploreLink = styled("button")(({ theme }) => ({
  background: "none",
  border: "none",
  cursor: "pointer",
  color: theme.palette.primary.main,
  fontSize: "1rem",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  marginTop: "1.5rem",
  flexShrink: 0,
  "&:hover": { textDecoration: "underline" },
}));

const CardHeading = ({ before, accent, after }: { before: string; accent: string; after: string }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
    <Typography variant="h5" color="common.black" sx={{ fontWeight: 600 }}>
      {before}{" "}
      <Typography component="span" variant="h5" color="sidebar.primary" sx={{ fontStyle: "italic", fontWeight: 600 }}>
        {accent}
      </Typography>{" "}
      {after}
    </Typography>
  </Box>
);

function IntroCard({ heading, src, alt, icon }: { heading: React.ReactNode; src: string; alt: string; icon: string }) {
  const skeletonBg = useSkeletonBg();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
  return (
    <CardDesign>
      <CardAiIcon src={icon} alt="" aria-hidden />
      {heading}
      <CardImageWrapper>
        {!loaded && (
          <Skeleton
            variant="rounded"
            animation="wave"
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "0.75rem", background: skeletonBg }}
          />
        )}
        <CardImage
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.25s ease" }}
        />
      </CardImageWrapper>
    </CardDesign>
  );
}

export function AIIntroStep({ handleNext }: { handleNext: () => void }) {
  const { isDarkMode } = useThemeMode();
  const icon = isDarkMode ? "/assets/ai/aiIcon.svg" : "/assets/ai/aiIconLight.svg";
  return (
    <AIIntroRoot>
      <IntroContent>
        <BadgeWrapper>
          <Box component="img" src={icon} alt="" aria-hidden sx={{ width: "0.875rem", height: "0.875rem" }} />
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 400, color: "textColor.mutedOnCard" }}>
            Manage with AI
          </Typography>
        </BadgeWrapper>
        <HeadingSection>
          <Typography variant="h1" sx={{ fontWeight: 700, color: "common.black", lineHeight: 1.2 }}>
            Introducing AI-Powered{" "}
            <Typography component="span" variant="h1" color="sidebar.primary" sx={{ fontWeight: 700, fontStyle: "italic" }}>
              Insights
            </Typography>
            {" & "}
            <Typography component="span" variant="h1" color="sidebar.primary" sx={{ fontWeight: 700, fontStyle: "italic" }}>
              Reports
            </Typography>
          </Typography>
          <Typography variant="subtitle8" sx={{ color: "textColor.mutedOnCard", lineHeight: 1.5, maxWidth: "34rem" }}>
            Analyze your portfolio, explore token signals, and make smarter investment decisions with powerful AI
            insights.
          </Typography>
        </HeadingSection>
        <CardsContainer>
          <IntroCard
            heading={<CardHeading before="AI" accent="Portfolio" after="Report" />}
            src={isDarkMode ? "/assets/portfolioReportDark.png" : "/assets/portfolioReportLight.png"}
            alt="AI Portfolio Report"
            icon={icon}
          />
          <IntroCard
            heading={<CardHeading before="AI" accent="Token" after="Insights" />}
            src={isDarkMode ? "/assets/tokenInsightDark.png" : "/assets/tokenInsightLight.png"}
            alt="AI Token Insights"
            icon={icon}
          />
        </CardsContainer>
        <StartExploreLink onClick={handleNext}>
          Start Explore
          <ChevronRightIcon sx={{ fontSize: "1.25rem" }} />
        </StartExploreLink>
      </IntroContent>
    </AIIntroRoot>
  );
}

/* ---------- Welcome / final ---------- */

const WelcomeRoot = styled(Box)({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  backgroundImage: "url(/assets/tourCover.webp)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  padding: "2rem",
});

const WelcomeContent = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.5rem",
  maxWidth: "28rem",
  textAlign: "center",
});

const ActionWrapper = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1.25rem",
  width: "100%",
  maxWidth: "25rem",
});

const StartTourButton = styled(Button)({
  width: "100%",
  height: "3rem",
  borderRadius: "0.625rem",
  textTransform: "none",
  fontSize: "1rem",
  fontWeight: 500,
});

const DividerRow = styled(Box)({ display: "flex", alignItems: "center", gap: "1rem", width: "100%" });
const DividerLine = styled(Box)(({ theme }) => ({ flex: 1, height: "1px", backgroundColor: theme.palette.border.main400 }));

const OutlineWalletButton = styled(Button)(({ theme }) => ({
  width: "100%",
  height: "3rem",
  borderRadius: "0.625rem",
  textTransform: "none",
  fontSize: "0.875rem",
  fontWeight: 500,
  border: `1px solid ${theme.palette.primary.main}`,
  color: theme.palette.primary.main,
  "&:hover": { border: `0.0625rem solid ${theme.palette.primary.main}`, backgroundColor: theme.palette.overlay.primary04 },
}));

const SkipTourLink = styled("button")(({ theme }) => ({
  background: "none",
  border: "none",
  cursor: "pointer",
  color: theme.palette.primary.main,
  fontSize: "0.875rem",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  "&:hover": { textDecoration: "underline" },
}));

const WELCOME_COPY =
  "With Seidar you have everything in place to manage your Stellar DeFi portfolio across all your wallets. Directly interact with a constantly growing number of Stellar protocols and trading venues.";

const WelcomeHeading = () => (
  <Typography variant="h1" sx={{ fontWeight: 700, fontStyle: "italic" }}>
    Welcome to{" "}
    <Typography component="span" variant="h1" color="sidebar.primary">
      Seidar
    </Typography>
  </Typography>
);

export function WelcomeStep({ handleNext, handleClose }: { handleNext: () => void; handleClose: () => void }) {
  const { isConnected, openConnectModal } = useWallet();
  return (
    <WelcomeRoot>
      <WelcomeContent>
        <WelcomeHeading />
        <Typography variant="subtitle1" sx={{ color: "grey.200" }}>
          {WELCOME_COPY}
        </Typography>
        <ActionWrapper>
          <StartTourButton variant="solid" color="primary" size="large" onClick={handleNext}>
            Start Tour
          </StartTourButton>
          {!isConnected && (
            <OutlineWalletButton variant="outlined" onClick={openConnectModal}>
              Connect your Wallet Directly
            </OutlineWalletButton>
          )}
          <DividerRow>
            <DividerLine />
            <Typography variant="subtitle1" sx={{ color: "grey.200", fontSize: "0.75rem" }}>
              OR
            </Typography>
            <DividerLine />
          </DividerRow>
          <SkipTourLink onClick={handleClose}>Skip User Tour&nbsp;&nbsp;›</SkipTourLink>
        </ActionWrapper>
      </WelcomeContent>
    </WelcomeRoot>
  );
}

export function FinalStep({ handleCloseAndNavigate }: { handleCloseAndNavigate: () => void }) {
  const { isConnected, openConnectModal } = useWallet();
  useEffect(() => {
    if (isConnected) handleCloseAndNavigate();
  }, [isConnected, handleCloseAndNavigate]);
  return (
    <WelcomeRoot>
      <WelcomeContent>
        <WelcomeHeading />
        <Typography variant="subtitle1" sx={{ color: "grey.200" }}>
          {WELCOME_COPY}
        </Typography>
        <ActionWrapper>
          <OutlineWalletButton variant="outlined" onClick={openConnectModal}>
            Connect your Wallet
          </OutlineWalletButton>
        </ActionWrapper>
      </WelcomeContent>
    </WelcomeRoot>
  );
}

/* ---------- Step page ---------- */

const StepRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "1.125rem",
  padding: "0.5rem",
  minWidth: 0,
  overflow: "hidden",
  flex: 1,
  minHeight: 0,
  [theme.breakpoints.down("sm")]: { overflowY: "auto" },
}));

const HeaderBlock = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  flexShrink: 0,
  minWidth: 0,
  [theme.breakpoints.down("sm")]: {
    "& .MuiTypography-h1": { fontSize: "1.5rem", lineHeight: 1.2, overflowWrap: "anywhere" },
  },
}));

const StepContent = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: "1.5rem",
  flex: 1,
  minHeight: 0,
  alignItems: "flex-start",
  overflow: "hidden",
  marginTop: "0.375rem",
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  [theme.breakpoints.down("sm")]: { flexDirection: "column" },
}));

const StepImageWrapper = styled(Box, { shouldForwardProp: (p) => p !== "hasDetails" })<{ hasDetails?: boolean }>(
  ({ hasDetails, theme }) => ({
    position: "relative",
    width: hasDetails ? "65%" : "100%",
    height: "100%",
    flexShrink: 0,
    minHeight: 0,
    borderRadius: "1.25rem",
    overflow: "hidden",
    [theme.breakpoints.down("md")]: { width: hasDetails ? "55%" : "100%" },
    [theme.breakpoints.down("sm")]: { width: "100%", height: "auto", flex: "1 1 auto", minHeight: "10rem" },
  }),
);

const StepImage = styled("img")({
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center center",
  borderRadius: "1.25rem",
  display: "block",
  transition: "opacity 0.25s ease",
});

const DetailsList = styled("ul")(({ theme }) => ({
  paddingTop: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  paddingLeft: "1.75rem",
  margin: 0,
  listStyle: "disc",
  "& li::marker": { fontSize: "1.875rem", color: theme.palette.sidebar.primary },
}));

const StepFooter = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexShrink: 0,
  gap: "0.5rem",
  [theme.breakpoints.down("sm")]: { gap: "0.375rem" },
}));

const StepDotsWrapper = styled(Box)({ display: "flex", alignItems: "center", gap: "0.375rem", alignSelf: "center" });

const StepDot = styled(Box, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(({ theme, active }) => ({
  width: "0.8125rem",
  height: "0.25rem",
  borderRadius: "6.25rem",
  backgroundColor: active ? theme.palette.sidebar.primary : theme.palette.grey[300],
  transition: "all 0.3s ease",
}));

const NavButton = styled(Button, { shouldForwardProp: (p) => p !== "isBack" })<{ isBack?: boolean }>(
  ({ theme, isBack }) => {
    const dark = theme.palette.mode === "dark";
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.625rem",
      padding: "1.25rem 0.875rem",
      borderRadius: "12.5rem",
      backgroundColor: dark || isBack ? theme.palette.overlay.white05 : theme.palette.primary.main,
      boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
      color: isBack ? theme.palette.grey[200] : dark ? theme.palette.common.black : theme.palette.common.white,
      fontSize: "1rem",
      fontWeight: 400,
      letterSpacing: "-0.02em",
      textTransform: "none",
      border: !dark && isBack ? `0.0625rem solid ${theme.palette.border.main600}` : "none",
      borderTop: dark ? `0.0625rem solid ${theme.palette.border.main600}` : undefined,
      borderBottom: dark ? `0.0625rem solid ${theme.palette.border.main600}` : undefined,
      width: "6.875rem",
      height: "3rem",
      minWidth: "unset",
      flexShrink: 0,
      [theme.breakpoints.down("sm")]: {
        width: "auto",
        height: "2.25rem",
        padding: "0.375rem 0.625rem",
        fontSize: "0.8125rem",
        gap: "0.25rem",
        "& .MuiButton-startIcon, & .MuiButton-endIcon": { margin: 0 },
        "& .MuiSvgIcon-root": { fontSize: "1rem !important" },
      },
      "&:hover": dark
        ? { backgroundColor: theme.palette.overlay.white08, boxShadow: `0 0.25rem 2.5rem 0 ${theme.palette.shadow.deep}` }
        : {},
    };
  },
);

type StepPageProps = {
  headingComponent: React.ReactNode;
  description: string;
  image: string;
  handlePrevious: () => void;
  handleNextAndNavigate?: () => void;
  handleClose: () => void;
  detailsArray: string[];
  isFinishButton: boolean;
  currentStep: number;
  totalSteps: number;
};

export function StepPage({
  headingComponent,
  description,
  image,
  handlePrevious,
  handleNextAndNavigate,
  handleClose,
  detailsArray,
  isFinishButton,
  currentStep,
  totalSteps,
}: StepPageProps) {
  const hasDetails = detailsArray.length > 0;
  const { isDarkMode } = useThemeMode();
  const skeletonBg = useSkeletonBg();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [image]);

  return (
    <StepRoot>
      <HeaderBlock>
        {headingComponent}
        <Typography variant="subtitle1" sx={{ fontWeight: 400, color: "grey.200", lineHeight: 1.4 }}>
          {description}
        </Typography>
      </HeaderBlock>
      <StepContent>
        <StepImageWrapper hasDetails={hasDetails}>
          {!loaded && (
            <Skeleton
              variant="rounded"
              animation="wave"
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "1.25rem", background: skeletonBg }}
            />
          )}
          <StepImage
            src={image}
            alt="step-image"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        </StepImageWrapper>
        {hasDetails && (
          <DetailsList>
            {detailsArray.map((d, i) => (
              <li key={i}>
                <Typography variant="subtitle2" sx={{ color: isDarkMode ? "grey.200" : "black.main300", fontWeight: 400 }}>
                  {d}
                </Typography>
              </li>
            ))}
          </DetailsList>
        )}
      </StepContent>
      <StepDotsWrapper>
        {Array.from({ length: totalSteps }, (_, i) => (
          <StepDot key={i} active={i === currentStep} />
        ))}
      </StepDotsWrapper>
      <StepFooter>
        <NavButton isBack onClick={handlePrevious} startIcon={<ArrowBackIcon sx={{ fontSize: "1.25rem", color: "grey.200" }} />}>
          Back
        </NavButton>
        <Typography
          variant="body3"
          onClick={handleClose}
          sx={{ color: "primary.main", fontStyle: "italic", cursor: "pointer" }}
        >
          Skip User Tour
        </Typography>
        {handleNextAndNavigate && (
          <NavButton
            onClick={handleNextAndNavigate}
            endIcon={isFinishButton ? undefined : <ArrowForwardIcon sx={{ fontSize: "1.25rem" }} />}
          >
            {isFinishButton ? "Finish" : "Next"}
          </NavButton>
        )}
      </StepFooter>
    </StepRoot>
  );
}
