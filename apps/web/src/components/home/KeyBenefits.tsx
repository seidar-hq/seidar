"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Slider from "react-slick";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import ArrowButton from "@/components/common/ArrowButton";
import { openApp } from "@/lib/links";

type Benefit = { title: string; description: string; img: string };

const BENEFITS: Benefit[] = [
  {
    title: "Institutional-Grade Reporting",
    description: "Double-entry bookkeeping, NAV, P&L and performance reporting across your on-chain stellar portfolio.",
    img: "/images/home/benefits/reporting.jpg",
  },
  {
    title: "Seamless end-to-end execution",
    description: "Trade, lend, stake and bridge assets across every major protocol on Stellar in a few clicks.",
    img: "/images/home/benefits/execution.png",
  },
  {
    title: "Built for AI Agents",
    description: "Give agents the structured data, history and context they need to operate intelligently within stellars ecosystem.",
    img: "/images/home/benefits/ai-agents.png",
  },
  {
    title: "Every Position, Fully Traceable",
    description: "Follow each balance, swap and yield back to the exact Stellar protocol and wallet it came from.",
    img: "/images/home/benefits/traceable-analysis.jpg",
  },
  {
    title: "Your Whole Stellar Portfolio at a Glance",
    description: "Tokens, RWAs, lending and yield positions in one view, with AI insights on what matters most.",
    img: "/images/home/benefits/insights-360.jpg",
  },
];

const INTRO_STRIP = "/images/home/key-benefit-screen.png";
const SLIDE_HEIGHTS = [496, 440, 395];
const COUNT = BENEFITS.length;

const CardRoot = styled(Box)({
  width: "100%",
  height: "100%",
  borderRadius: "8px",
  border: "1px solid rgba(0, 0, 0, 0.05)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
});

const CardImageWrap = styled(Box)(({ theme }) => ({
  height: "61%",
  minHeight: 0,
  overflow: "hidden",
  backgroundColor: theme.palette.primary.cardImageBackground,
  [theme.breakpoints.down("lg")]: { height: "55%" },
  [theme.breakpoints.down("md")]: { height: "70%" },
  [theme.breakpoints.down("sm")]: { height: "80%" },
}));

const CardImage = styled("img")({ width: "100%", height: "100%", objectFit: "cover", display: "block" });

const CardBody = styled(Box)(({ theme }) => ({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  backgroundColor: theme.palette.primary.blackBackground,
  padding: "28px",
  boxSizing: "border-box",
}));

function BenefitCard({ title, description, img }: Benefit) {
  return (
    <CardRoot>
      {img && (
        <CardImageWrap>
          <CardImage src={img} alt={title} />
        </CardImageWrap>
      )}
      <CardBody>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Typography
            variant="inherit"
            sx={(theme) => ({
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: theme.palette.white.main,
            })}
          >
            {title}
          </Typography>
          {description && (
            <Typography
              variant="inherit"
              sx={(theme) => ({ fontSize: 14, fontWeight: 400, color: theme.palette.white.main, opacity: 0.8, lineHeight: 1.4 })}
            >
              {description}
            </Typography>
          )}
        </Box>
      </CardBody>
    </CardRoot>
  );
}

const circularDistance = (a: number, b: number, total: number) => {
  const distance = Math.abs(a - b);
  return Math.min(distance, total - distance);
};

function BenefitsCarousel({ initialSlide = 0, autoplay = false }: { initialSlide?: number; autoplay?: boolean }) {
  const [current, setCurrent] = useState(initialSlide);
  const isAnimating = useRef(false);
  const slider = useRef<Slider>(null);
  const autoplayEnabled = useRef(false);

  useEffect(() => {
    if (autoplay && slider.current) {
      autoplayEnabled.current = true;
      slider.current.slickPlay();
    }
  }, [autoplay]);

  const pause = useCallback(() => {
    if (autoplayEnabled.current) slider.current?.slickPause();
  }, []);

  const resume = useCallback(() => {
    if (autoplayEnabled.current) slider.current?.slickPlay();
  }, []);

  // Clicking a side card glides there through the shortest direction, one slide at a time.
  const goTo = useCallback(
    (index: number) => {
      if (isAnimating.current || index === current) return;
      if ((index - current + COUNT) % COUNT <= (current - index + COUNT) % COUNT) {
        slider.current?.slickGoTo((index - 1 + COUNT) % COUNT, true);
        setTimeout(() => slider.current?.slickNext(), 20);
      } else {
        slider.current?.slickGoTo((index + 1) % COUNT, true);
        setTimeout(() => slider.current?.slickPrev(), 20);
      }
    },
    [current],
  );

  return (
    <Box
      sx={{
        width: "100vw",
        marginLeft: "calc(-50vw + 50%)",
        overflow: "hidden",
        "& .slick-track": { display: "flex", alignItems: "flex-end" },
        "& .slick-slide": { padding: "0 1px", cursor: "pointer" },
        "& .slick-slide > div": { transition: "height 0.5s ease", cursor: "pointer" },
      }}
    >
      <Slider
        ref={slider}
        centerMode
        centerPadding="12%"
        slidesToShow={3}
        infinite
        initialSlide={initialSlide}
        arrows={false}
        dots={false}
        swipeToSlide
        focusOnSelect={false}
        speed={1200}
        cssEase="cubic-bezier(0.25, 0.1, 0.25, 1)"
        autoplay={false}
        autoplaySpeed={1000}
        pauseOnHover={false}
        beforeChange={(_, next) => {
          setCurrent(next);
          isAnimating.current = true;
        }}
        afterChange={() => {
          isAnimating.current = false;
        }}
        responsive={[
          { breakpoint: 1200, settings: { slidesToShow: 1, centerPadding: "20%" } },
          { breakpoint: 900, settings: { slidesToShow: 1, centerPadding: "15%" } },
          { breakpoint: 600, settings: { slidesToShow: 1, centerPadding: "8%" } },
        ]}
      >
        {BENEFITS.map((benefit, index) => {
          const distance = circularDistance(index, current, COUNT);
          return (
            <Box
              key={benefit.title}
              sx={{
                height: SLIDE_HEIGHTS[Math.min(distance, SLIDE_HEIGHTS.length - 1)],
                px: distance === 0 ? "1px" : "2px",
                transition: "padding 0.5s ease",
                cursor: "pointer",
              }}
              onClick={() => goTo(index)}
              onMouseEnter={pause}
              onMouseLeave={resume}
            >
              <BenefitCard {...benefit} />
            </Box>
          );
        })}
      </Slider>
    </Box>
  );
}

// Desktop intro: one wide dashboard splits into five panels that morph into the carousel cards.
function BenefitsIntro() {
  const theme = useTheme();
  const [stage, setStage] = useState(0);
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <Box
      component={motion.div}
      onViewportEnter={() => {
        if (started.current) return;
        started.current = true;
        timers.current = [
          setTimeout(() => setStage(1), 500),
          setTimeout(() => setStage(2), 1800),
          setTimeout(() => setStage(3), 3200),
          setTimeout(() => setStage(4), 3800),
        ];
      }}
      viewport={{ once: true, amount: 0.1 }}
      sx={{ position: "relative" }}
    >
      <BenefitsCarousel initialSlide={2} autoplay={stage >= 4} />
      {stage < 4 && (
        <motion.div
          animate={{ opacity: stage >= 3 ? 0 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 2, pointerEvents: "none", overflow: "visible" }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "100vw",
              marginLeft: "calc(-50vw + 50%)",
              backgroundColor: theme.palette.white.main100,
            }}
          />
          <div
            style={{
              position: "relative",
              width: stage >= 2 ? "100vw" : "100%",
              marginLeft: stage >= 2 ? "calc(-50vw + 50%)" : "0px",
              transition:
                "width 1.2s cubic-bezier(0.4, 0, 0.2, 1), margin-left 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              {BENEFITS.map((benefit, index) => {
                const isEdge = index === 0 || index === COUNT - 1;
                return (
                  <motion.div
                    key={benefit.title}
                    animate={{
                      marginLeft: index === 0 || stage < 1 ? 0 : 4,
                      height:
                        stage < 2 ? 496 : SLIDE_HEIGHTS[Math.min(Math.abs(index - 2), SLIDE_HEIGHTS.length - 1)],
                    }}
                    transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
                    style={{
                      flexGrow: stage >= 2 && isEdge ? 0.47 : 1,
                      flexShrink: 1,
                      flexBasis: 0,
                      borderRadius: stage >= 1 ? 8 : 0,
                      overflow: "hidden",
                      position: "relative",
                      transition: "flex-grow 1.2s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s ease",
                    }}
                  >
                    <motion.div
                      animate={{ opacity: stage >= 2 ? 0 : 1 }}
                      transition={{ duration: 1.2, ease: "easeInOut" }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${INTRO_STRIP})`,
                        backgroundSize: `${100 * COUNT}% 100%`,
                        backgroundPosition: `${(index / (COUNT - 1)) * 100}% 0`,
                        zIndex: 1,
                      }}
                    />
                    <motion.div
                      animate={{ opacity: stage >= 2 ? 1 : 0 }}
                      transition={{ duration: 1.2, ease: "easeInOut" }}
                      style={{
                        width: isEdge ? "213%" : "100%",
                        height: "100%",
                        ...(index === 0 && { marginLeft: "-113%" }),
                      }}
                    >
                      <BenefitCard {...benefit} />
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </Box>
  );
}

const Section = styled(Box)(({ theme }) => ({
  width: "100%",
  padding: "80px 187px",
  display: "flex",
  flexDirection: "column",
  gap: "64px",
  backgroundColor: theme.palette.white.main100,
  overflow: "hidden",
  [theme.breakpoints.down("lg")]: { padding: "60px 40px", gap: "48px" },
  [theme.breakpoints.down("sm")]: { padding: "40px 20px", gap: "40px" },
}));

const Header = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "24px",
  width: "100%",
  boxSizing: "border-box",
  [theme.breakpoints.up("md")]: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "nowrap",
  },
}));

const HeaderCopy = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  maxWidth: "100%",
  gap: "16px",
  width: "100%",
  [theme.breakpoints.up("md")]: { maxWidth: 725, gap: "24px" },
}));

const Tag = styled(Box)(({ theme }) => ({
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "10px",
  padding: "8px 12px",
  background: theme.palette.primary.black,
  borderRadius: "200px",
  width: "fit-content",
}));

export default function KeyBenefits() {
  return (
    <Section>
      <Header>
        <HeaderCopy>
          <Tag>
            <Typography
              variant="subtitle1SemiBold"
              sx={(theme) => ({ lineHeight: 1.4, color: theme.palette.white.main, textAlign: "center" })}
            >
              Key Benefits
            </Typography>
          </Tag>
          <Typography
            variant="h2"
            sx={(theme) => ({
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: theme.palette.primary.black,
              margin: 0,
              textAlign: "left",
              background: "none",
              WebkitBackgroundClip: "unset",
              WebkitTextFillColor: theme.palette.primary.black,
              maxWidth: { xs: "100%", md: "500px", lg: "600px" },
              [theme.breakpoints.down("md")]: { fontSize: "28px", letterSpacing: "-0.56px" },
            })}
          >
            From portfolio context to controlled execution{" "}
          </Typography>
        </HeaderCopy>
        <ArrowButton text="Explore the App" handleClick={openApp} isBlackButton />
      </Header>
      <Box sx={{ display: { xs: "none", lg: "block" } }}>
        <BenefitsIntro />
      </Box>
      <Box
        sx={{
          display: { xs: "grid", lg: "none" },
          gridTemplateColumns: { xs: "1fr", md: "repeat(6, 1fr)" },
          gap: "10px",
          width: "100%",
        }}
      >
        {BENEFITS.map((benefit, index) => (
          <Box
            key={benefit.title}
            sx={{
              height: { xs: 400, sm: 550, md: 450 },
              gridColumn: { md: index < 2 ? "span 3" : "span 2" },
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <BenefitCard {...benefit} />
          </Box>
        ))}
      </Box>
    </Section>
  );
}
