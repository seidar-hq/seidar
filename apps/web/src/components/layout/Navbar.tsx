"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import SeidarLogo from "@/components/common/SeidarLogo";
import { DOCS_URL, openApp, openInNewTab } from "@/lib/links";
import type { PolymorphicBox } from "@/theme/polymorphic";

const NavRoot = styled(Box, { shouldForwardProp: (prop) => prop !== "isScrolled" })<{ isScrolled: boolean }>(
  ({ theme, isScrolled }) => ({
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 40px",
    background: isScrolled ? "rgba(10, 10, 16, 0.92)" : "transparent",
    backdropFilter: isScrolled ? "blur(60px)" : "none",
    borderBottom: isScrolled ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
    transition: "background 0.3s, backdrop-filter 0.3s, border-color 0.3s",
    [theme.breakpoints.down("md")]: { padding: "24px" },
  }),
) as unknown as PolymorphicBox<{ isScrolled: boolean }>;

const NavPill = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "12px",
  padding: "4px 16px",
  height: 46,
  background: "rgba(255, 255, 255, 0.05)",
  border: `1px solid ${theme.palette.border.dark}`,
  borderRadius: "1000px",
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
}));

const NavItem = styled(Box, { shouldForwardProp: (prop) => prop !== "isActive" })<{ isActive: boolean }>(
  ({ theme, isActive }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: "4px",
    padding: "4px 12px",
    fontWeight: 500,
    fontSize: 13,
    lineHeight: 1,
    color: theme.palette.white.main,
    opacity: isActive ? 1 : 0.85,
    textDecoration: "none",
    height: "26px",
    background: "transparent",
    borderRadius: "0px",
    border: "none",
    outline: "none",
    cursor: "pointer",
    "&:hover": { opacity: 1 },
    "&:focus": { outline: "none" },
    "&:focus-visible": { outline: "none" },
  }),
) as unknown as PolymorphicBox<{ isActive: boolean }>;

const DrawerHeader = styled(Box)({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "24px 20px",
  height: 72,
});

const DrawerBody = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "40px",
  padding: "0 20px",
  marginTop: 56,
  width: "100%",
});

const DrawerLinks = styled(Box)({ display: "flex", flexDirection: "column", gap: "24px", width: "100%" });

const DrawerLink = styled(Box)(({ theme }) => ({
  fontWeight: 500,
  fontSize: "28px",
  lineHeight: 1,
  letterSpacing: "-0.56px",
  color: theme.palette.white.main,
  opacity: 0.8,
  cursor: "pointer",
  "&:hover": { opacity: 1 },
}));

const Divider = styled(Box)(({ theme }) => ({
  width: "100%",
  height: 0,
  borderBottom: `0.5px solid ${theme.palette.border.dark}`,
}));

type NavLink =
  | { label: string; type: "scroll"; target: string }
  | { label: string; type: "blank"; href: string }
  | { label: string; type: "link"; href: string };

const NAV_LINKS: NavLink[] = [
  { label: "Our Features", type: "scroll", target: "our-features" },
  { label: "Docs", type: "blank", href: DOCS_URL },
  { label: "About Seidar", type: "link", href: "/about" },
];

const SCROLL_KEY = "seidar:scrollTo";

export default function Navbar() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHome = pathname === "/";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [isScrolled, setIsScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [featuresInView, setFeaturesInView] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const features = document.getElementById("our-features");
    if (!features) return;
    const observer = new IntersectionObserver(([entry]) => setFeaturesInView(entry.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(features);
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    setFeaturesInView(false);
  }, [pathname]);

  const scrollToElement = (element: HTMLElement) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  };

  useEffect(() => {
    if (!isHome) return;
    let target: string | null = null;
    try {
      target = sessionStorage.getItem(SCROLL_KEY);
    } catch {}
    if (!target) return;
    try {
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {}
    const element = document.getElementById(target);
    if (element) setTimeout(() => scrollToElement(element), 100);
  }, [isHome, pathname]);

  useEffect(() => {
    if (!isHome) return;
    const target = searchParams?.get("scrollTo");
    if (!target) return;
    const element = document.getElementById(target);
    if (element) setTimeout(() => scrollToElement(element), 300);
    router.replace("/");
  }, [searchParams, isHome, router]);

  const goToFeatures = () => {
    if (isHome) {
      const features = document.getElementById("our-features");
      if (features) scrollToElement(features);
    } else {
      try {
        sessionStorage.setItem(SCROLL_KEY, "our-features");
      } catch {}
      router.push("/");
    }
    setDrawerOpen(false);
  };

  const toggleDrawer = (open: boolean) => (event: React.KeyboardEvent | React.MouseEvent | object) => {
    const keyEvent = event as React.KeyboardEvent;
    if (keyEvent.type === "keydown" && (keyEvent.key === "Tab" || keyEvent.key === "Shift")) return;
    setDrawerOpen(open);
  };

  const isActive = (link: NavLink) =>
    link.type === "scroll" ? featuresInView : link.type === "link" && pathname === link.href;

  const handleLogoClick = () => {
    if (isHome) {
      if (isScrolled) window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push("/");
    }
  };

  const handleLinkClick = (link: NavLink) => {
    if (link.type === "scroll") goToFeatures();
    else if (link.type === "blank") openInNewTab(link.href);
    else router.push(link.href);
  };

  return (
    <NavRoot
      component={motion.nav}
      isScrolled={isScrolled}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <SeidarLogo
        onClick={handleLogoClick}
        sx={{
          cursor: isHome && !isScrolled ? "default" : "pointer",
          "&:hover": { opacity: isHome && !isScrolled ? 1 : 0.9 },
        }}
      />

      {!isMobile && (
        <NavPill>
          {NAV_LINKS.map((link) => (
            <NavItem key={link.label} component="button" isActive={isActive(link)} onClick={() => handleLinkClick(link)}>
              {link.label}
            </NavItem>
          ))}
        </NavPill>
      )}

      {isMobile ? (
        <IconButton onClick={toggleDrawer(true)} sx={{ color: "white.main", padding: "8px" }} aria-label="Open menu">
          <Box component="img" src="/images/icons/hamburger-menu.svg" alt="Menu" sx={{ width: 24, height: 24 }} />
        </IconButton>
      ) : (
        <Button variant="secondary" size="small" sx={{ height: 42, textTransform: "none" }} onClick={openApp}>
          Launch Seidar
        </Button>
      )}

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={toggleDrawer(false)}
        sx={{ "& .MuiDrawer-paper": { width: "100%", backgroundColor: "primary.blackBackground" } }}
      >
        <DrawerHeader>
          <SeidarLogo
            onClick={() => {
              handleLogoClick();
              setDrawerOpen(false);
            }}
            sx={{ cursor: "pointer" }}
          />
          <IconButton onClick={toggleDrawer(false)} sx={{ color: "white.main", padding: "8px" }} aria-label="Close menu">
            <Box component="img" src="/images/icons/menu-cross.svg" alt="Close" sx={{ width: 40, height: 40 }} />
          </IconButton>
        </DrawerHeader>
        <DrawerBody>
          <DrawerLinks>
            {NAV_LINKS.map((link) => (
              <Box key={link.label} sx={{ display: "contents" }}>
                <DrawerLink
                  onClick={() => {
                    handleLinkClick(link);
                    setDrawerOpen(false);
                  }}
                >
                  {link.label}
                </DrawerLink>
                <Divider />
              </Box>
            ))}
          </DrawerLinks>
          <Button
            variant="secondary"
            size="large"
            sx={{ width: "100%", height: 48, borderRadius: "1000px" }}
            onClick={openApp}
          >
            Launch Seidar
          </Button>
        </DrawerBody>
      </Drawer>
    </NavRoot>
  );
}
