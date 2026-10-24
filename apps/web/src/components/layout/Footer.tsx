"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { FiArrowUp } from "react-icons/fi";
import ArrowButton from "@/components/common/ArrowButton";
import ModalBox, { type ModalBoxHandle } from "@/components/common/ModalBox";
import ResponsiveTypography from "@/components/common/ResponsiveTypography";
import ContactForm from "./ContactForm";
import { DOCS_URL, DROPPO_URL, X_URL } from "@/lib/links";

const FooterRoot = styled(Box)(({ theme }) => ({
  width: "100%",
  backgroundColor: theme.palette.black.main,
  borderRadius: "8px 8px 0 0",
  padding: "40px 80px",
  display: "flex",
  flexDirection: "column",
  gap: "80px",
  [theme.breakpoints.down("lg")]: { padding: "40px 40px", gap: "60px" },
  [theme.breakpoints.down("md")]: { padding: "40px 24px", gap: "40px", borderRadius: 0 },
  [theme.breakpoints.down("sm")]: { padding: "24px", gap: "40px" },
}));

const TopRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  width: "100%",
  [theme.breakpoints.down("md")]: { flexDirection: "column", gap: "40px" },
}));

const Brand = styled(Box)({ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "490px" });

const BrandMark = styled("img")({ width: "46px", height: "33.5px", objectFit: "contain", objectPosition: "left center" });

const Columns = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: "20px",
  alignItems: "flex-start",
  [theme.breakpoints.down("lg")]: { gap: "16px" },
  [theme.breakpoints.down("md")]: { flexDirection: "column", width: "100%", gap: "16px" },
}));

const Column = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  width: "100px",
  minWidth: "100px",
  [theme.breakpoints.down("md")]: {
    width: "100%",
    minWidth: "100%",
    gap: "16px",
    paddingBottom: "16px",
    borderBottom: "0.5px solid rgba(255, 255, 255, 0.2)",
  },
  [theme.breakpoints.down("sm")]: { marginBottom: "24px" },
}));

const SubLinks = styled(Box)({ display: "flex", flexDirection: "column", gap: "12px" });

const BottomRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "16px",
  width: "100%",
  [theme.breakpoints.down("sm")]: { alignItems: "stretch" },
}));

const BottomBar = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  borderRadius: "200px",
  padding: "12px 24px",
  flex: 1,
  minWidth: 0,
  gap: "24px",
  [theme.breakpoints.down("sm")]: { flexDirection: "column", borderRadius: "16px", gap: "16px" },
}));

const Credit = styled(Box)({ display: "flex", alignItems: "center", gap: "6px" });

const LegalLinks = styled(Box)({ display: "flex", gap: "24px", alignItems: "center" });

const ScrollTopButton = styled("button")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "42px",
  height: "42px",
  borderRadius: "50%",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(16, 16, 20, 0.9)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
  color: theme.palette.white.main,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
  transition: "background 0.2s ease, border-color 0.2s ease",
  position: "fixed",
  bottom: "40px",
  right: "24px",
  zIndex: 1000,
  "&:hover": { background: "rgba(28, 28, 34, 0.95)", borderColor: "rgba(255, 255, 255, 0.24)" },
}));

type FooterLink = { link?: string; newTab?: boolean };

const FOOTER_COLUMNS: { title: string; link?: string; subLinks?: { label: string; link: string }[] }[] = [
  { title: "Home", link: "/" },
  { title: "Docs", link: DOCS_URL },
  { title: "Connect", subLinks: [{ label: "X", link: X_URL }] },
];

export default function Footer() {
  const theme = useTheme();
  const router = useRouter();
  const contactModal = useRef<ModalBoxHandle>(null);
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "lg"));
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navigate = ({ link, newTab }: FooterLink) => {
    if (!link) return;
    if (link.startsWith("http")) window.open(link, "_blank", "noopener,noreferrer");
    else if (newTab) window.open(link, "_blank", "noopener,noreferrer");
    else {
      router.push(link);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openContact = () => contactModal.current?.openModal();

  return (
    <FooterRoot id="site-footer">
      <TopRow>
        <Brand>
          <BrandMark src="/logos/seidar-mark-white.svg" alt="Seidar Logo" />
          <ResponsiveTypography variant="subtitle1" smallFontSize={16} sx={{ lineHeight: 1.4, maxWidth: "400px" }}>
            Execute transactions, turn portfolio data into intelligence, and power agentic workflows across Stellar
            DeFi protocols.
          </ResponsiveTypography>
          {isTablet && <ArrowButton text="Contact Us" handleClick={openContact} />}
        </Brand>

        <Columns>
          {FOOTER_COLUMNS.map((column) => (
            <Column key={column.title}>
              <ResponsiveTypography
                variant="subtitle1SemiBold"
                smallFontSize={16}
                sx={{ lineHeight: 1.4, ...(column.link && { cursor: "pointer", "&:hover": { opacity: 0.8 } }) }}
                onClick={() => navigate(column)}
              >
                {column.title}
              </ResponsiveTypography>
              {column.subLinks && (
                <SubLinks>
                  {column.subLinks.map((sub) => (
                    <ResponsiveTypography
                      key={sub.label}
                      variant="subtitle1"
                      smallFontSize={16}
                      sx={{ lineHeight: 1.4, opacity: 0.8, cursor: "pointer", "&:hover": { opacity: 1 } }}
                      onClick={() => navigate(sub)}
                    >
                      {sub.label}
                    </ResponsiveTypography>
                  ))}
                </SubLinks>
              )}
            </Column>
          ))}
          {!isTablet && <ArrowButton text="Contact Us" handleClick={openContact} isMobileFullWidth />}
        </Columns>
      </TopRow>

      <BottomRow>
        <BottomBar>
          <Credit
            onClick={() => navigate({ link: DROPPO_URL })}
            sx={{ cursor: DROPPO_URL ? "pointer" : "default" }}
          >
            <ResponsiveTypography variant="caption" smallFontSize={12} sx={{ lineHeight: 1.3 }}>
              Built by
            </ResponsiveTypography>
            <ResponsiveTypography variant="captionSemiBold" smallFontSize={12} sx={{ lineHeight: 1.3 }}>
              Droppo
            </ResponsiveTypography>
          </Credit>
          <LegalLinks>
            <ResponsiveTypography variant="caption" smallFontSize={12} sx={{ lineHeight: 1.3 }}>
              ©{new Date().getFullYear()} Seidar.
            </ResponsiveTypography>
            <ResponsiveTypography
              variant="captionMedium"
              smallFontSize={12}
              sx={{ lineHeight: 1.3, cursor: "pointer", "&:hover": { opacity: 0.8 } }}
              onClick={() => navigate({ link: "/terms-of-use", newTab: true })}
            >
              Terms of Use
            </ResponsiveTypography>
            <ResponsiveTypography
              variant="captionMedium"
              smallFontSize={12}
              sx={{ lineHeight: 1.3, cursor: "pointer", "&:hover": { opacity: 0.8 } }}
              onClick={() => navigate({ link: "/privacy-policy", newTab: true })}
            >
              Privacy Policy
            </ResponsiveTypography>
          </LegalLinks>
        </BottomBar>
        {showScrollTop && (
          <ScrollTopButton type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <FiArrowUp size={20} />
          </ScrollTopButton>
        )}
      </BottomRow>

      <ModalBox
        size="md"
        ref={contactModal}
        disablePadding
        hideCloseButton
        modalStyle={{ background: theme.palette.black.main, borderRadius: "10px" }}
      >
        <ContactForm onClose={() => contactModal.current?.closeModal()} />
      </ModalBox>
    </FooterRoot>
  );
}
