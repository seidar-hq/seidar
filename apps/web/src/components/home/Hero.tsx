"use client";

import { useEffect, useRef } from "react";
import Slider, { type Settings } from "react-slick";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { openApp, openDocs } from "@/lib/links";
import type { PolymorphicBox } from "@/theme/polymorphic";

const Section = styled(Box)(({ theme }) => ({
  position: "relative",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "56px",
  padding: "170px 80px 0",
  overflow: "hidden",
  backgroundColor: theme.palette.primary.blackBackground,
  [theme.breakpoints.down("md")]: { padding: "150px 24px 48px", gap: "40px" },
  [theme.breakpoints.between("sm", "md")]: { padding: "145px 48px 64px" },
})) as unknown as PolymorphicBox<object>;

const Content = styled(Box)(({ theme }) => ({
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: "956px",
  margin: "0 auto",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "20px",
  [theme.breakpoints.down("sm")]: { maxWidth: "334px", gap: "16px" },
}));

const Carousel = styled(Box)(({ theme }) => ({
  position: "relative",
  zIndex: 1,
  width: "calc(100% + 160px)",
  margin: "0 -80px",
  padding: "60px 0",
  overflow: "hidden",
  maskImage: "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)",
  WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)",
  "& .slick-list": { margin: "0 -8px", overflow: "visible" },
  "& .slick-slide > div": { padding: "0 8px", height: "100%" },
  "& .slick-track": { display: "flex", alignItems: "center", transformStyle: "preserve-3d" },
  "& .slick-slide": {
    opacity: 0,
    zIndex: 1,
    transformOrigin: "center center",
    transform: "perspective(500px) rotateY(0deg) scale(0.75) skewY(0deg) translateZ(-120px)",
    transition: "transform 0.9s ease, opacity 0.9s ease, transform-origin 0.9s ease",
  },
  "& img": { width: "100%", height: "420px", objectFit: "cover", borderRadius: "24px", display: "block" },
  [theme.breakpoints.up("md")]: {
    "& .slick-slide[data-pos='-1'], & .slick-slide[data-pos='0']": {
      opacity: 1,
      zIndex: 3,
      transformOrigin: "center center",
      transform: "perspective(500px) rotateY(0deg) scale(1) skewY(0deg) translateZ(0px)",
    },
    "& .slick-slide[data-pos='1']": {
      opacity: 0.85,
      zIndex: 2,
      transformOrigin: "left center",
      transform: "perspective(500px) rotateY(-15deg) scale(1) skewY(-6deg) translateZ(0px)",
    },
    "& .slick-slide[data-pos='-2']": {
      opacity: 0.85,
      zIndex: 2,
      transformOrigin: "right center",
      transform: "perspective(500px) rotateY(15deg) scale(1) skewY(6deg) translateZ(0px)",
    },
    "& .slick-slide[data-pos='-3']": {
      opacity: 0,
      zIndex: 2,
      transformOrigin: "right center",
      transform: "perspective(500px) rotateY(15deg) scale(1) skewY(6deg) translateZ(0px)",
    },
    "& .slick-slide[data-pos='2']": {
      opacity: 0,
      zIndex: 2,
      transformOrigin: "left center",
      transform: "perspective(500px) rotateY(-15deg) scale(1) skewY(-6deg) translateZ(0px)",
    },
  },
  [theme.breakpoints.between("md", "lg")]: {
    "& .slick-slide[data-pos='-1']": {
      opacity: 0.85,
      zIndex: 2,
      transformOrigin: "right center",
      transform: "perspective(500px) rotateY(15deg) scale(1) skewY(6deg) translateZ(0px)",
    },
    "& .slick-slide[data-pos='-2']": { opacity: 0 },
  },
  [theme.breakpoints.between("lg", "xl")]: { "& img": { height: "320px" } },
  [theme.breakpoints.down("md")]: {
    width: "calc(100% + 48px)",
    margin: "0 -24px",
    padding: "24px 0",
    maskImage: "none",
    WebkitMaskImage: "none",
    "& .slick-slide": { opacity: 1, transform: "none" },
    "& img": { height: "500px", borderRadius: "24px" },
  },
  [theme.breakpoints.down("sm")]: { "& img": { padding: "10px", height: "350px", borderRadius: "24px" } },
  [theme.breakpoints.down(400)]: {
    "& img": { width: "100%", padding: "10px", height: "255px", borderRadius: "24px" },
  },
}));

const SLIDES = [
  { src: "/images/vision/slider-1.png", alt: "Research chart" },
  { src: "/images/vision/slider-2.png", alt: "XLM coin" },
  { src: "/images/vision/slider-3.png", alt: "Top contributors" },
  { src: "/images/vision/slider-4.png", alt: "Seidar dashboard" },
];

const BASE_SETTINGS: Settings = {
  infinite: true,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 2500,
  speed: 900,
  cssEase: "cubic-bezier(0.4, 0, 0.2, 1)",
  arrows: false,
  dots: false,
  pauseOnHover: false,
};

// Tags every slide with its offset from the current one (data-pos) so the 3D fan styles above can target it.
function useSlidePositions(containerRef: React.RefObject<HTMLDivElement | null>, layout: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const track = container.querySelector<HTMLElement>(".slick-track");
    if (!track) return;

    let offset: number | null = null;
    let slideWidth: number | null = null;
    let lastIndex: number | null = null;
    const resetWidth = () => {
      slideWidth = null;
    };
    window.addEventListener("resize", resetWidth);

    const update = () => {
      const currentSlide = container.querySelector<HTMLElement>(".slick-slide.slick-current");
      if (!currentSlide) return;
      const currentIndex = Number(currentSlide.dataset.index);
      const slides = [...container.querySelectorAll<HTMLElement>(".slick-slide")];
      if (!slides.length) return;

      let index = currentIndex;
      if (slideWidth === null) {
        slideWidth = slides[0].offsetWidth;
        offset = null;
      }
      const match = /translate3d\((-?[\d.]+)px/.exec(track.style.transform || "");
      const settled = !track.style.transition;
      if (slideWidth && match) {
        const translate = parseFloat(match[1]);
        if (settled) offset = -translate - currentIndex * slideWidth;
        if (offset !== null) index = Math.round(-(translate + offset) / slideWidth);
      }

      const jumped = settled && lastIndex !== null && index !== lastIndex;
      lastIndex = index;
      if (jumped) {
        slides.forEach((slide) => (slide.style.transition = "none"));
        void track.offsetHeight;
      }
      slides.forEach((slide) => slide.setAttribute("data-pos", String(Number(slide.dataset.index) - index)));
      if (jumped) {
        void track.offsetHeight;
        setTimeout(() => slides.forEach((slide) => (slide.style.transition = "")), 50);
      }
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(track, {
      attributes: true,
      attributeFilter: ["class", "data-index", "style"],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resetWidth);
    };
  }, [containerRef, layout, enabled]);
}

export default function Hero() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const carouselRef = useRef<HTMLDivElement>(null);

  let layout = "desktop";
  let settings: Settings = { ...BASE_SETTINGS, slidesToShow: 2, centerMode: true, centerPadding: "17%" };
  if (isMobile) {
    layout = "mobile";
    settings = { ...BASE_SETTINGS, slidesToShow: 1, centerMode: false };
  } else if (isTablet) {
    layout = "tablet";
    settings = { ...BASE_SETTINGS, slidesToShow: 1, centerMode: true, centerPadding: "15%" };
  }

  useSlidePositions(carouselRef, layout, !!settings.centerMode);

  return (
    <Section component="section">
      <Content>
        <Typography
          component="h1"
          className="gradient"
          sx={(t) => ({
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-1.28px",
            fontSize: "64px !important",
            [t.breakpoints.down("md")]: { fontSize: "40px !important", letterSpacing: "-0.8px" },
            [t.breakpoints.down("sm")]: { fontSize: "34px !important", letterSpacing: "-0.68px" },
          })}
        >
          Stellar DeFi, all in one place
        </Typography>
        <Typography variant="body3" sx={{ maxWidth: { xs: "330px", sm: "450px", md: "500px", lg: "640px" } }}>
          Discover protocols, manage portfolios, and turn portfolio data into intelligence. Power agentic workflows
          across Stellar DeFi.
        </Typography>
        <Box sx={{ display: "flex", gap: "16px", flexDirection: { xs: "column", sm: "row" }, width: "auto", minWidth: { xs: "190px", sm: "auto" } }}>
          <Button variant="primary" size="large" sx={{ width: { xs: "100%", sm: "200px" } }} onClick={openApp}>
            Launch Seidar
          </Button>
          <Button variant="success" size="large" sx={{ width: { xs: "100%", sm: "200px" } }} onClick={openDocs}>
            Read the Docs
          </Button>
        </Box>
      </Content>

      <Carousel ref={carouselRef}>
        <Slider key={layout} {...settings}>
          {SLIDES.map((slide) => (
            <Box key={slide.src} component="img" src={slide.src} alt={slide.alt} />
          ))}
        </Slider>
      </Carousel>
    </Section>
  );
}
