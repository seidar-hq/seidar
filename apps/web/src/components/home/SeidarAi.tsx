"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, styled } from "@mui/material/styles";
import sparkleAnimation from "@/assets/ai-sparkle.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const Section = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  width: "100%",
  padding: "120px 80px",
  background: theme.palette.primary.blackBackground,
  [theme.breakpoints.down("lg")]: { padding: "80px 40px" },
  [theme.breakpoints.down("md")]: { padding: "40px 20px" },
}));

const Container = styled(Box)({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "1280px",
  gap: "16px",
});

const Intro = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "24px",
  margin: "0 auto",
  padding: "108px 0",
  [theme.breakpoints.down("md")]: {
    alignItems: "flex-start",
    textAlign: "left",
    gap: "16px",
    padding: "24px 0 16px",
  },
}));

const AiPill = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "10px",
  padding: "8px 16px",
  borderRadius: "50px",
  color: theme.palette.white.main,
  border: "1px solid #2B6DEF",
  background: "rgba(255, 255, 255, 0.05)",
  boxShadow: "0px 4px 40px 0px rgba(0, 0, 0, 0.3)",
  whiteSpace: "nowrap",
  flexShrink: 0,
}));

const AiIcon = styled(Box)({
  width: "20px",
  height: "20px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  overflow: "hidden",
  "& > div": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
});

const HeroCard = styled(Box)(({ theme }) => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  borderRadius: "8px",
  border: `1px solid ${theme.palette.primary.main}`,
  background: "linear-gradient(127deg, rgba(52, 108, 255, 0.10) 28.4%, rgba(38, 68, 146, 0.10) 61.33%), #0A0A10",
  padding: "24px 32px",
  minHeight: "521px",
  [theme.breakpoints.down("lg")]: {
    flexDirection: "column-reverse",
    minHeight: "auto",
    padding: 0,
    gap: 0,
    border: "none",
    background: theme.palette.primary.cardBackground,
  },
}));

const HeroBackground = styled("img")(({ theme }) => ({
  position: "absolute",
  zIndex: 0,
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  pointerEvents: "none",
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

const HeroCopy = styled(Box)(({ theme }) => ({
  position: "relative",
  zIndex: 2,
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  maxWidth: "560px",
  paddingRight: "62px",
  [theme.breakpoints.down("lg")]: {
    maxWidth: "none",
    padding: "24px",
    gap: "16px",
    background: theme.palette.primary.cardBackground,
  },
}));

const StatusPill = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 12px",
  borderRadius: "1000px",
  whiteSpace: "nowrap",
  flexShrink: 0,
  color: alpha(theme.palette.white.main, 0.7),
  background: alpha(theme.palette.white.main, 0.05),
  border: `1px solid ${theme.palette.white.alpha19}`,
}));

const HeroMockupWrap = styled(Box)(({ theme }) => ({
  position: "absolute",
  zIndex: 1,
  top: 0,
  right: 0,
  bottom: 0,
  width: "60%",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  [theme.breakpoints.down("lg")]: {
    position: "static",
    width: "100%",
    justifyContent: "center",
    padding: 0,
    background:
      "radial-gradient(circle at 50% 30%, rgba(52,108,255,0.20) 0%, rgba(10,10,16,0) 60%), linear-gradient(180deg, #111828 0%, #0B0E15 100%)",
  },
}));

const HeroMockup = styled("img")(({ theme }) => ({
  display: "block",
  width: "auto",
  height: "100%",
  maxWidth: "none",
  objectFit: "contain",
  objectPosition: "right center",
  transform: "translate(-32px, -62px)",
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

const HeroMockupMobile = styled("img")(({ theme }) => ({
  display: "none",
  [theme.breakpoints.down("lg")]: { display: "block", width: "100%", height: "auto", maxWidth: "100%" },
}));

const FeatureGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1.42fr 1fr",
  alignItems: "stretch",
  gap: "16px",
  [theme.breakpoints.down("md")]: { display: "none" },
}));

const MobileCarousel = styled(Box)(({ theme }) => ({
  display: "none",
  [theme.breakpoints.down("md")]: { display: "block", width: "100%" },
}));

const SwipeArea = styled("div")({ width: "100%", overflow: "hidden", touchAction: "pan-y" });

const Dots = styled(Box)({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "8px",
  height: 24,
  marginTop: "32px",
});

const Dot = styled(Box, { shouldForwardProp: (prop) => prop !== "isActive" })<{ isActive: boolean }>(
  ({ theme, isActive }) => ({
    width: isActive ? 55 : 8,
    height: 8,
    borderRadius: isActive ? "100px" : "50%",
    background: theme.palette.white.main,
    opacity: isActive ? 1 : 0.25,
    transition: "width 0.3s ease, opacity 0.3s ease",
    cursor: "pointer",
    flexShrink: 0,
  }),
);

const Column = styled(Box)({ display: "flex", flexDirection: "column", gap: "16px" });

const FeatureCard = styled(Box, { shouldForwardProp: (prop) => prop !== "hasMockup" })<{ hasMockup?: boolean }>(
  ({ theme, hasMockup }) => ({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px",
    borderRadius: "8px",
    overflow: "hidden",
    background: alpha(theme.palette.white.main, 0.05),
    ...(hasMockup && { flex: "1 1 auto" }),
    [theme.breakpoints.down("md")]: { padding: "24px" },
  }),
);

const TitleRow = styled(Box)({ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" });

const MockupWrap = styled(Box)({
  position: "relative",
  flex: "1 1 auto",
  minHeight: "180px",
  marginTop: "8px",
  marginInline: "-24px",
  marginBottom: "-24px",
  overflow: "hidden",
});

const Mockup = styled("img")({
  position: "absolute",
  top: 0,
  left: "50%",
  transform: "translateX(-50%)",
  width: "92%",
  height: "auto",
  display: "block",
});

const MobileMockupWrap = styled(Box)({
  position: "relative",
  aspectRatio: "698 / 480",
  marginTop: "-24px",
  marginInline: "-24px",
  marginBottom: "8px",
  overflow: "hidden",
  order: -1,
});

const MobileMockup = styled("img")({ display: "block", width: "100%", height: "100%", objectFit: "cover" });

type Feature = {
  title: string;
  status?: string;
  description: string;
  mockup: string | null;
  mobileMockup: string;
  alt: string;
};

const FEATURES: Feature[] = [
  {
    title: "Portfolio Analytics",
    status: "Live Today",
    description:
      "Explore performance, exposure, concentration and allocation with answers grounded in your actual positions.",
    mockup: "/images/home/copilot-portfolio-mockup.png",
    mobileMockup: "/images/home/mobile-portfolio.png",
    alt: "Portfolio analytics preview",
  },
  {
    title: "Research in Context",
    status: "Live Today",
    description:
      "Connect market, token and protocol developments to the positions, objectives and constraints that make them relevant.",
    mockup: "/images/home/copilot-research-mockup.png",
    mobileMockup: "/images/home/mobile-research.png",
    alt: "Research in context preview",
  },
  {
    title: "Agent Toolkit",
    description:
      "Build AI agents that act across Stellar protocols. Seidar MCP provides context and the Toolkit gives you the capabilities and controls.",
    mockup: null,
    mobileMockup: "/images/home/mobile-agentic.png",
    alt: "Agentic workflows preview",
  },
];

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

const gradientHeading = (maxWidth: Record<string, string> | string) => ({
  lineHeight: 1.2,
  letterSpacing: "-1.44px",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  fontSize: "2.25rem",
  maxWidth,
});

const FeatureTitle = ({ title, status }: { title: string; status?: string }) => (
  <TitleRow>
    <Typography variant="body1SemiBold" sx={{ lineHeight: 1.3, letterSpacing: "-0.48px" }}>
      {title}
    </Typography>
    {status && (
      <StatusPill>
        <Typography variant="subtitle1" sx={{ lineHeight: 1.3, letterSpacing: "-0.24px" }}>
          {status}
        </Typography>
      </StatusPill>
    )}
  </TitleRow>
);

const FeatureDescription = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body4" sx={{ opacity: 0.7, lineHeight: 1.4, letterSpacing: "-0.32px" }}>
    {children}
  </Typography>
);

const FeatureCardView = ({ feature, mobile = false }: { feature: Feature; mobile?: boolean }) =>
  mobile ? (
    <FeatureCard hasMockup>
      {feature.mobileMockup && (
        <MobileMockupWrap>
          <MobileMockup src={feature.mobileMockup} alt={feature.alt} />
        </MobileMockupWrap>
      )}
      <FeatureTitle title={feature.title} status={feature.status} />
      <FeatureDescription>{feature.description}</FeatureDescription>
    </FeatureCard>
  ) : (
    <FeatureCard hasMockup={!!feature.mockup}>
      <FeatureTitle title={feature.title} status={feature.status} />
      <FeatureDescription>{feature.description}</FeatureDescription>
      {feature.mockup && (
        <MockupWrap>
          <Mockup src={feature.mockup} alt={feature.alt} />
        </MockupWrap>
      )}
    </FeatureCard>
  );

export default function SeidarAi() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = FEATURES.length;

  const restartTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setDirection(1);
      setActive((current) => (current + 1) % count);
    }, 5000);
  }, [count]);

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > active ? 1 : -1);
      setActive(index);
      restartTimer();
    },
    [active, restartTimer],
  );

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = event.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(delta) <= 50) return;
      setDirection(delta < 0 ? 1 : -1);
      setActive((current) => (delta < 0 ? (current + 1) % count : (current - 1 + count) % count));
      restartTimer();
    },
    [count, restartTimer],
  );

  useEffect(() => {
    restartTimer();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [restartTimer]);

  return (
    <Section>
      <Container>
        <Intro>
          <AiPill>
            <AiIcon>
              <Lottie animationData={sparkleAnimation} loop autoplay />
            </AiIcon>
            <Typography
              variant="subtitle1"
              sx={{
                lineHeight: 1.2,
                letterSpacing: "-0.32px",
                fontWeight: 500,
                background: "linear-gradient(113deg, #2B6DEF 7.26%, #33D9FF 92.63%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Seidar AI
            </Typography>
          </AiPill>
          <Typography
            variant="h2"
            sx={(theme) => ({
              background: `linear-gradient(169.45deg, ${theme.palette.white.main} 51.41%, ${alpha(theme.palette.white.main, 0)} 160.33%)`,
              ...gradientHeading("680px"),
              [theme.breakpoints.down("md")]: { lineHeight: 1.1, letterSpacing: "-0.96px" },
            })}
          >
            An Intelligent Workspace for Digital Assets
          </Typography>
          <Typography variant="body4" sx={{ opacity: 0.7, lineHeight: 1.4, letterSpacing: "-0.32px", maxWidth: "620px" }}>
            Ask questions grounded in your connected positions, market data and objectives. Analyse exposure, research
            opportunities, test scenarios and prepare actions for review in one workspace.
          </Typography>
        </Intro>

        <HeroCard>
          <HeroBackground src="/images/home/background-circle.png" alt="" aria-hidden="true" />
          <HeroCopy>
            <Typography
              variant="h2"
              sx={(theme) => ({
                lineHeight: 1.1,
                letterSpacing: "-1.44px",
                background: `linear-gradient(169.45deg, ${theme.palette.white.main} 51.41%, ${alpha(theme.palette.white.main, 0)} 160.33%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontSize: "2.25rem",
                width: "400px",
                [theme.breakpoints.down("md")]: { fontSize: "28px", width: "100%", letterSpacing: "-0.96px" },
              })}
            >
              Always-on portfolio intelligence
            </Typography>
            <Typography variant="body3" sx={{ opacity: 0.8, lineHeight: 1.4, letterSpacing: "-0.36px" }}>
              Ask questions about your positions, monitor risks, create alerts, receive market updates, and schedule
              reports for your team.
            </Typography>
          </HeroCopy>
          <HeroMockupWrap>
            <HeroMockup src="/images/home/copilot-hero-mockup.png" alt="Seidar AI interface" />
            <HeroMockupMobile src="/images/home/mobile-hero-mockup.png" alt="Seidar AI interface" />
          </HeroMockupWrap>
        </HeroCard>

        <FeatureGrid>
          <FeatureCardView feature={FEATURES[0]} />
          <Column>
            <FeatureCardView feature={FEATURES[1]} />
            <FeatureCardView feature={FEATURES[2]} />
          </Column>
        </FeatureGrid>

        <MobileCarousel>
          <SwipeArea onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={active}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: "easeInOut" }}
              >
                <FeatureCardView feature={FEATURES[active]} mobile />
              </motion.div>
            </AnimatePresence>
          </SwipeArea>
          <Dots>
            {FEATURES.map((feature, index) => (
              <Dot key={feature.title} isActive={index === active} onClick={() => goTo(index)} />
            ))}
          </Dots>
        </MobileCarousel>
      </Container>
    </Section>
  );
}
