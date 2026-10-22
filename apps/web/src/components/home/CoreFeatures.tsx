"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import SectionHeader from "@/components/common/SectionHeader";

const Section = styled(Box)(({ theme }) => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "43px",
  padding: "80px 0px 0px",
  background: "linear-gradient(158deg, rgba(16, 16, 16, 0.00) 40%, #346CFF 85%, #8DE8FF 100.37%)",
  [theme.breakpoints.down("sm")]: { padding: "48px 16px", gap: "20px" },
}));

const FeatureTabs = styled(Tabs)(({ theme }) => ({
  borderRadius: "1000px",
  background: "rgba(255, 255, 255, 0.10)",
  padding: "4px",
  minHeight: "unset",
  marginTop: "5px",
  "& .MuiTabs-indicator": { display: "none" },
  "& .MuiTabs-flexContainer": { gap: "0px" },
  "& .MuiTabs-scrollButtons": { color: theme.palette.white.main },
}));

const FeatureTab = styled(Tab)(({ theme }) => ({
  textTransform: "none",
  fontFamily: theme.typography.fontFamily,
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "rgba(255, 255, 255, 0.70)",
  borderRadius: "1000px",
  padding: "10px 24px",
  minHeight: "unset",
  minWidth: "unset",
  transition: "all 0.2s ease",
  "&.Mui-selected": { color: theme.palette.white.main, background: theme.palette.primary.main, outline: "none" },
  "&:focus": { outline: "none" },
  "&:focus-visible": { outline: "none" },
  "&:hover": { color: theme.palette.white.main },
  [theme.breakpoints.down("sm")]: { padding: "8px 16px" },
}));

const Panel = styled(Box)({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  overflow: "hidden",
});

const Heading = styled(Box)({ maxWidth: "600px", textAlign: "center" });

const ImageStack = styled(Box)({ width: "100%", margin: "34px 0px", position: "relative" });

const TabImage = styled("img")(({ theme }) => ({
  width: "100%",
  borderRadius: "14px",
  maxWidth: 1066,
  display: "block",
  margin: "0 auto",
  [theme.breakpoints.down("lg")]: { maxWidth: "80%" },
}));

const FEATURES = [
  {
    tabName: "Portfolio Management",
    heading: "Track, trade and manage every position across Stellar, all in one place.",
    image: "/images/home/tabs/portfolio.png",
  },
  {
    tabName: "Trade",
    heading: "Swap tokens, trade perps and access full market potential across Stellar.",
    image: "/images/home/tabs/trade.png",
  },
  {
    tabName: "Earn",
    heading: "Put all your assets to work with the best yields across staking, lending and AMMs, every time.",
    image: "/images/home/tabs/earn.png",
  },
  {
    tabName: "Bridge",
    heading: "Move your tokens seamlessly from other chains into Stellar for the best trading and yield opportunities.",
    image: "/images/home/tabs/bridge.png",
  },
];

const headingVariants = {
  enter: { opacity: 0, y: 15 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

function DesktopPanel({ activeTab, onHoverChange }: { activeTab: number; onHoverChange: (hovering: boolean) => void }) {
  const enter = () => onHoverChange(true);
  const leave = () => onHoverChange(false);

  return (
    <Panel>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeTab}-text`}
          variants={headingVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.45 }}
        >
          <Heading onMouseEnter={enter} onMouseLeave={leave}>
            <Typography
              variant="body1SemiBold"
              sx={(theme) => ({
                background: "linear-gradient(109deg, #FFF 51.41%, rgba(255, 255, 255, 0.00) 160.33%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: theme.palette.white.main,
                lineHeight: 1.2,
                letterSpacing: "-0.96px",
              })}
            >
              {FEATURES[activeTab].heading}
            </Typography>
          </Heading>
        </motion.div>
      </AnimatePresence>
      <ImageStack sx={{ position: "relative" }}>
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.tabName}
            animate={{ opacity: activeTab === index ? 1 : 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: index === 0 ? "relative" : "absolute",
              top: 0,
              left: 0,
              width: "100%",
              pointerEvents: activeTab === index ? "auto" : "none",
            }}
          >
            <TabImage src={feature.image} alt={feature.tabName} onMouseEnter={enter} onMouseLeave={leave} />
          </motion.div>
        ))}
      </ImageStack>
    </Panel>
  );
}

const MobileRoot = styled(Box)({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "40px",
  padding: "40px 20px",
});

const MobileHeader = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "16px",
  width: "100%",
});

const MobileBody = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "32px",
  width: "100%",
});

const MobileCard = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  borderRadius: "8px",
  overflow: "hidden",
  background: theme.palette.primary.cardBackground,
}));

const MobileImageFrame = styled(Box)(({ theme }) => ({
  width: "100%",
  aspectRatio: "1830 / 1254",
  boxSizing: "border-box",
  overflow: "hidden",
  padding: "41px 29px",
  background: `linear-gradient(153deg, ${theme.palette.primary.main} 17.2%, ${theme.palette.primary.frostedBlue} 91.6%)`,
}));

const MobileImage = styled("img")({
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "contain",
  boxShadow: "0px 2px 10px rgba(0, 0, 0, 0.05)",
});

const MobileCopy = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  padding: "32px 16px",
  width: "100%",
});

const MobileTag = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "6px 12px",
  borderRadius: "8px",
  background: theme.palette.primary.main,
}));

const Dots = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  height: 24,
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

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

function MobileFeatures() {
  const theme = useTheme();
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

  const next = useCallback(() => {
    setDirection(1);
    setActive((current) => (current + 1) % count);
    restartTimer();
  }, [count, restartTimer]);

  const previous = useCallback(() => {
    setDirection(-1);
    setActive((current) => (current - 1 + count) % count);
    restartTimer();
  }, [count, restartTimer]);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = event.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(delta) > 50) {
        if (delta < 0) next();
        else previous();
      }
    },
    [next, previous],
  );

  useEffect(() => {
    restartTimer();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [restartTimer]);

  const feature = FEATURES[active];

  return (
    <MobileRoot id="our-features">
      <MobileHeader>
        <SectionHeader text="Core Features" />
      </MobileHeader>
      <MobileBody>
        <div
          style={{ width: "100%", position: "relative", overflow: "hidden", touchAction: "pan-y" }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={active}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: "easeInOut" }}
              style={{ willChange: "transform, opacity", backfaceVisibility: "hidden" }}
            >
              <MobileCard>
                <MobileImageFrame>
                  <MobileImage src={feature.image} alt={feature.tabName} />
                </MobileImageFrame>
                <MobileCopy>
                  <MobileTag>
                    <Typography
                      variant="inherit"
                      sx={{ fontWeight: 500, fontSize: "14px", lineHeight: 1.4, color: theme.palette.white.main }}
                    >
                      {feature.tabName}
                    </Typography>
                  </MobileTag>
                  <Typography
                    variant="inherit"
                    sx={{
                      fontSize: "20px",
                      fontWeight: 600,
                      lineHeight: 1.2,
                      letterSpacing: "-0.8px",
                      color: theme.palette.white.main,
                    }}
                  >
                    {feature.heading}
                  </Typography>
                </MobileCopy>
              </MobileCard>
            </motion.div>
          </AnimatePresence>
        </div>
        <Dots>
          {FEATURES.map((item, index) => (
            <Dot key={item.tabName} isActive={index === active} onClick={() => goTo(index)} />
          ))}
        </Dots>
      </MobileBody>
    </MobileRoot>
  );
}

export default function CoreFeatures() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [activeTab, setActiveTab] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const hovering = useRef(false);

  useEffect(() => {
    FEATURES.forEach((feature) => {
      new window.Image().src = feature.image;
    });
  }, []);

  const restartTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      if (!hovering.current) setActiveTab((current) => (current + 1) % FEATURES.length);
    }, 5000);
  }, []);

  const setHovering = useCallback((value: boolean) => {
    hovering.current = value;
  }, []);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) {
      restartTimer();
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          setActiveTab(0);
          restartTimer();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer.current) clearInterval(timer.current);
    };
  }, [restartTimer, isMobile]);

  if (isMobile) return <MobileFeatures />;

  return (
    <Section id="our-features" ref={sectionRef}>
      <SectionHeader text="Core Features" />
      <FeatureTabs
        value={activeTab}
        onChange={(_, value: number) => {
          setActiveTab(value);
          restartTimer();
        }}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {FEATURES.map((feature) => (
          <FeatureTab key={feature.tabName} label={feature.tabName} />
        ))}
      </FeatureTabs>
      <DesktopPanel activeTab={activeTab} onHoverChange={setHovering} />
    </Section>
  );
}
