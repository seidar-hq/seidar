"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import ListItemButton from "@mui/material/ListItemButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled, useTheme, type Theme } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import WaterOutlinedIcon from "@mui/icons-material/WaterOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import HeaderWallet from "@/components/wallet/HeaderWallet";
import { DerivativesDropdownIcon, LayoutIcon, SearchIcon, SwapDropdownIcon } from "@/components/icons/HeaderIcons";
import { DOCS_URL, X_URL } from "@/lib/links";
import { useThemeMode } from "@/theme/ThemeModeContext";
import HeaderPortfolio from "./HeaderPortfolio";
import NotificationButton from "./NotificationButton";
import SearchDialog from "./SearchDialog";

const Root = styled(AppBar)(({ theme }) => ({
  position: "fixed",
  top: 0,
  zIndex: theme.zIndex.appBar,
  width: "100%",
  height: "5.5rem",
  padding: "0 2.375rem",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white02 : theme.palette.overlay.white15,
  backdropFilter: "blur(15px)",
  WebkitBackdropFilter: "blur(15px)",
  backgroundImage: "none",
  boxShadow: "none",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.5rem",
  [theme.breakpoints.down("md")]: { gap: "0.75rem" },
  [theme.breakpoints.down("sm")]: { padding: "0 1rem", height: "5rem" },
}));

const NavPill = styled(Box)(({ theme }) => {
  const line = theme.palette.mode === "light" ? theme.palette.border.main600 : theme.palette.overlay.white08;
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem",
    marginLeft: "1rem",
    borderRadius: "3.125rem",
    backgroundColor: theme.palette.surfaceBg.section,
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    minWidth: 0,
    flex: "0 1 auto",
    [theme.breakpoints.down("xl")]: { marginLeft: "0.5rem" },
  };
});

// Logo width sized for the 134px-wide Seidar wordmark.
const Logo = styled("img")({ height: "auto", width: "6.9rem", flexShrink: 0 });

const NavList = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  overflowX: "auto",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  [theme.breakpoints.down("xl")]: { gap: "0.125rem" },
}));

const NavItem = styled(ListItemButton, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(
  ({ theme, active }) => ({
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "3.125rem",
    whiteSpace: "nowrap",
    backgroundColor: active ? theme.palette.sidebar.primary : "transparent",
    color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText,
    transition: "none",
    "&:hover": { backgroundColor: active ? theme.palette.sidebar.primary : theme.palette.overlay.info08 },
    [theme.breakpoints.down("xl")]: { padding: "0.5rem 0.5rem" },
  }),
);

const MobileNavItem = styled(ListItemButton, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(
  ({ theme, active }) => ({
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    width: "100%",
    minHeight: "unset",
    padding: "0.625rem 0.875rem",
    borderRadius: "999rem",
    maxHeight: "3rem",
    whiteSpace: "nowrap",
    backgroundColor: active ? theme.palette.sidebar.primary : "transparent",
    color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText,
    "&:hover": { backgroundColor: active ? theme.palette.sidebar.primary : theme.palette.overlay.info08 },
  }),
);

const NavIconImg = styled("img")({ width: "1.25rem", height: "1.25rem" });

const RightCluster = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexShrink: 0,
  [theme.breakpoints.down("md")]: { gap: "0.5rem" },
}));

const CircleIconButton = styled(IconButton, { shouldForwardProp: (p) => p !== "bordered" })<{ bordered?: boolean }>(
  ({ theme, bordered }) => {
    const dark = theme.palette.mode === "dark";
    const bg = dark ? theme.palette.overlay.white08 : theme.palette.grey[800];
    const hover = dark ? theme.palette.overlay.white20 : theme.palette.grey[300];
    const line = dark ? theme.palette.overlay.white08 : theme.palette.border.main600;
    return {
      width: "2.75rem",
      height: "2.75rem",
      minWidth: "2.75rem",
      flexShrink: 0,
      padding: "0.625rem",
      borderRadius: "50%",
      backgroundColor: bordered ? "transparent" : bg,
      borderTop: `0.0625rem solid ${line}`,
      borderBottom: `0.0625rem solid ${line}`,
      "&:hover": { backgroundColor: hover },
    };
  },
);

const MobileMenuButton = styled(IconButton)(({ theme }) => ({
  display: "none",
  color: theme.palette.sidebar.heading,
  [theme.breakpoints.down("lg")]: { display: "inline-flex" },
}));

const DesktopOnly = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flex: "0 1 auto",
  minWidth: 0,
  [theme.breakpoints.down("lg")]: { display: "none" },
}));

const MobileDrawerList = styled(Box)(({ theme }) => ({
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  backgroundColor: theme.palette.surfaceBg.main,
  height: "100%",
  justifyContent: "flex-start",
  overflowY: "auto",
}));

type NavEntry = { title: string; value: string; lightIcon: string; darkIcon: string; IconComponent?: SvgIconComponent };
type SubEntry = { title: string; subtitle: string; path: string; Icon: SvgIconComponent | typeof SwapDropdownIcon };

const NAV: NavEntry[] = [
  { title: "Dashboard", value: "/dashboard", lightIcon: "/assets/nav/dashboardIcon.svg", darkIcon: "/assets/nav/dashboardDarkIcon.svg" },
  { title: "Trade", value: "/trade-swap", lightIcon: "/assets/nav/tradeSwapLightIcon.svg", darkIcon: "/assets/nav/tradeSwapDarkIcon.svg" },
  { title: "Earn", value: "/earn", lightIcon: "/assets/nav/earnLightIcon.svg", darkIcon: "/assets/nav/earnDarkIcon.svg" },
  { title: "Bridge", value: "/bridge", lightIcon: "/assets/nav/bridgeIconLight.svg", darkIcon: "/assets/nav/bridgeIconDark.svg" },
  { title: "History", value: "/transactions", lightIcon: "/assets/nav/transactionsIcon.svg", darkIcon: "/assets/nav/transactionsDarkIcon.svg" },
  {
    title: "Settings",
    value: "/settings",
    lightIcon: "/assets/nav/dashboardIcon.svg",
    darkIcon: "/assets/nav/dashboardDarkIcon.svg",
    IconComponent: SettingsOutlinedIcon,
  },
];

const TRADE_ITEMS: SubEntry[] = [
  { title: "Swap", subtitle: "Best route across Stellar DEXs", path: "/trade-swap/dex", Icon: SwapDropdownIcon },
  { title: "Perps", subtitle: "Perpetual futures on Zenex", path: "/trade-swap/perps", Icon: DerivativesDropdownIcon },
];

const EARN_ITEMS: SubEntry[] = [
  { title: "Lend & Borrow", subtitle: "Lend or borrow with ease.", path: "/earn/lending&borrow", Icon: HandshakeOutlinedIcon },
  { title: "Pools", subtitle: "Provide liquidity to DEX pools.", path: "/earn/pools", Icon: WaterOutlinedIcon },
  { title: "Vaults", subtitle: "Automated yield strategies.", path: "/earn/vaults", Icon: SavingsOutlinedIcon },
];

const HISTORY_ITEMS: SubEntry[] = [
  { title: "Transactions", subtitle: "Swaps, bridges, transfers.", path: "/transactions?tab=transaction", Icon: SwapHorizOutlinedIcon },
  { title: "Positions", subtitle: "Staking, lending, liquidity.", path: "/transactions?tab=positions", Icon: ShowChartOutlinedIcon },
];

const menuPaperSx = (theme: Theme, minWidth: string) => ({
  pointerEvents: "auto",
  mt: "0.5rem",
  mb: "0.5rem",
  minWidth,
  backgroundColor: theme.palette.overlay.white08,
  backgroundImage: "none",
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  borderRadius: "1.25rem",
  backdropFilter: "blur(2.6875rem)",
  WebkitBackdropFilter: "blur(2.6875rem)",
  boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
});

type HoverTimer = React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

export default function Header() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isDarkMode } = useThemeMode();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourcesAnchor, setResourcesAnchor] = useState<HTMLElement | null>(null);
  const [earnAnchor, setEarnAnchor] = useState<HTMLElement | null>(null);
  const [tradeAnchor, setTradeAnchor] = useState<HTMLElement | null>(null);
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const earnTimer: HoverTimer = useRef(null);
  const tradeTimer: HoverTimer = useRef(null);
  const historyTimer: HoverTimer = useRef(null);
  const resourcesTimer: HoverTimer = useRef(null);

  const scheduleClose = (timer: HoverTimer, close: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(close, 150);
  };
  const cancelClose = (timer: HoverTimer) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const isActive = useCallback(
    (value: string) => {
      if (value === "/dashboard") return pathname === "/" || pathname.startsWith("/dashboard") || pathname.startsWith("/asset");
      return pathname.startsWith(value);
    },
    [pathname],
  );

  const navigate = (value: string) => {
    if (!isActive(value)) router.push(value);
    setDrawerOpen(false);
  };

  const historyTab = searchParams.get("tab") === "positions" ? "positions" : "transaction";
  const isHistoryItemActive = (path: string) => pathname.startsWith("/transactions") && path.includes(`tab=${historyTab}`);

  const activeSubLabel = (value: string) => {
    if (value === "/trade-swap") return TRADE_ITEMS.find((i) => pathname.startsWith(i.path))?.title ?? null;
    if (value === "/earn") return EARN_ITEMS.find((i) => pathname.startsWith(i.path))?.title ?? null;
    if (value === "/transactions") return historyTab === "positions" ? "Positions" : "Transactions";
    return null;
  };

  const subMenu = (
    anchor: HTMLElement | null,
    close: () => void,
    timer: HoverTimer,
    items: SubEntry[],
    selected: (path: string) => boolean,
  ) => (
    <Menu
      anchorEl={anchor}
      open={!!anchor}
      onClose={close}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        root: { sx: { pointerEvents: "none" } },
        paper: {
          elevation: 0,
          onMouseEnter: () => cancelClose(timer),
          onMouseLeave: () => scheduleClose(timer, close),
          sx: menuPaperSx(theme, "15rem"),
        },
        list: { sx: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" } },
      }}
    >
      {items.map(({ title, subtitle, path, Icon }) => {
        const active = selected(path);
        return (
          <Box key={path}>
            <MenuItem
              selected={active}
              onClick={() => {
                router.push(path);
                close();
              }}
              sx={{
                gap: "0.5rem",
                padding: "0.75rem",
                minHeight: 0,
                alignItems: "flex-start",
                borderRadius: "0.5rem",
                "&:hover": { backgroundColor: theme.palette.overlay.white04 },
                "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: theme.palette.overlay.white04 },
              }}
            >
              <Icon sx={{ fontSize: "1.25rem", color: theme.palette.sidebar.subText, mt: "0.125rem" }} />
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                <Typography variant="subtitle1" color={theme.palette.sidebar.subText}>
                  {title}
                </Typography>
                <Typography variant="subtitle3" color={theme.palette.grey[200]}>
                  {subtitle}
                </Typography>
              </Box>
            </MenuItem>
          </Box>
        );
      })}
    </Menu>
  );

  const navIcon = (item: NavEntry, active: boolean) =>
    item.IconComponent ? (
      <item.IconComponent
        sx={{ fontSize: "1.25rem", color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText }}
      />
    ) : (
      <NavIconImg src={isDarkMode || active ? item.lightIcon : item.darkIcon} alt="" />
    );

  const logoSrc = isDarkMode ? "/assets/seidarLogoDark.svg" : "/assets/seidarLogo.svg";
  const resourceItemSx = { gap: "0.5rem", padding: 0, minHeight: 0, "&:hover": { backgroundColor: "transparent" } };

  return (
    <>
      <Root position="fixed" className="mui-fixed">
        <DesktopOnly>
          <Logo
            src={logoSrc}
            alt="Seidar"
            onClick={() => pathname !== "/" && router.push("/")}
            sx={{ cursor: pathname === "/" ? "default" : "pointer" }}
          />
          <NavPill>
            <NavList>
              {NAV.map((item) => {
                const active = isActive(item.value);
                const isEarn = item.value === "/earn";
                const isTrade = item.value === "/trade-swap";
                const isHistory = item.value === "/transactions";
                const sub = active ? activeSubLabel(item.value) : null;
                const open = (isEarn && earnAnchor) || (isTrade && tradeAnchor) || (isHistory && historyAnchor);
                return (
                  <NavItem
                    key={item.value}
                    active={active}
                    onMouseEnter={(e) => {
                      if (isEarn) {
                        cancelClose(earnTimer);
                        setEarnAnchor(e.currentTarget);
                      } else if (isTrade) {
                        cancelClose(tradeTimer);
                        setTradeAnchor(e.currentTarget);
                      } else if (isHistory) {
                        cancelClose(historyTimer);
                        setHistoryAnchor(e.currentTarget);
                      }
                    }}
                    onMouseLeave={() => {
                      if (isEarn) scheduleClose(earnTimer, () => setEarnAnchor(null));
                      else if (isTrade) scheduleClose(tradeTimer, () => setTradeAnchor(null));
                      else if (isHistory) scheduleClose(historyTimer, () => setHistoryAnchor(null));
                    }}
                    onClick={(e) => {
                      if (isEarn) setEarnAnchor(e.currentTarget);
                      else if (isTrade) setTradeAnchor(e.currentTarget);
                      else if (isHistory) setHistoryAnchor(e.currentTarget);
                      else navigate(item.value);
                    }}
                  >
                    {navIcon(item, active)}
                    <Typography
                      variant="body1"
                      sx={{ color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText }}
                    >
                      {item.title}
                    </Typography>
                    {sub && (
                      <>
                        <Box
                          sx={{
                            width: "0.25rem",
                            height: "0.25rem",
                            borderRadius: "50%",
                            backgroundColor: theme.palette.sidebar.white,
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: "0.625rem",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                            color: theme.palette.sidebar.white,
                          }}
                        >
                          {sub}
                        </Typography>
                      </>
                    )}
                    {(isEarn || isTrade || isHistory) && (
                      <KeyboardArrowDownRoundedIcon
                        sx={{
                          fontSize: "1rem",
                          color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText,
                          transition: "transform 0.2s ease",
                          transform: open ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    )}
                  </NavItem>
                );
              })}
            </NavList>
          </NavPill>
        </DesktopOnly>

        <MobileMenuButton onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <MenuRoundedIcon />
        </MobileMenuButton>

        <RightCluster>
          <Tooltip title="Search" arrow placement="bottom">
            <CircleIconButton
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              sx={{ color: theme.palette.sidebar.heading }}
            >
              <SearchIcon size="1.25rem" />
            </CircleIconButton>
          </Tooltip>
          <CircleIconButton
            onClick={(e) => setResourcesAnchor(e.currentTarget)}
            onMouseEnter={(e) => {
              cancelClose(resourcesTimer);
              setResourcesAnchor(e.currentTarget);
            }}
            onMouseLeave={() => scheduleClose(resourcesTimer, () => setResourcesAnchor(null))}
            aria-label="Resources menu"
            sx={{ color: theme.palette.sidebar.heading }}
          >
            <LayoutIcon size="1.25rem" />
          </CircleIconButton>
          <NotificationButton />
          <Box sx={{ display: { xs: "none", sm: "flex" } }}>
            <HeaderPortfolio />
          </Box>
          <HeaderWallet />
        </RightCluster>

        <Menu
          anchorEl={resourcesAnchor}
          open={!!resourcesAnchor}
          onClose={() => setResourcesAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            root: { sx: { pointerEvents: "none" } },
            paper: {
              elevation: 0,
              onMouseEnter: () => cancelClose(resourcesTimer),
              onMouseLeave: () => scheduleClose(resourcesTimer, () => setResourcesAnchor(null)),
              sx: menuPaperSx(theme, "8.5rem"),
            },
            list: { sx: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" } },
          }}
        >
          <MenuItem
            component={Link}
            href={DOCS_URL}
            target="_blank"
            underline="none"
            onClick={() => setResourcesAnchor(null)}
            sx={resourceItemSx}
          >
            <DescriptionOutlinedIcon sx={{ fontSize: "1.25rem", color: theme.palette.sidebar.subText }} />
            <Typography variant="subtitle1" color={theme.palette.sidebar.subText}>
              Docs
            </Typography>
          </MenuItem>
          <MenuItem
            component={Link}
            href={X_URL}
            target="_blank"
            underline="none"
            onClick={() => setResourcesAnchor(null)}
            sx={resourceItemSx}
          >
            <ArticleOutlinedIcon sx={{ fontSize: "1.25rem", color: theme.palette.sidebar.subText }} />
            <Typography variant="subtitle1" color={theme.palette.sidebar.subText}>
              Insights
            </Typography>
          </MenuItem>
        </Menu>

        {subMenu(earnAnchor, () => setEarnAnchor(null), earnTimer, EARN_ITEMS, (p) => pathname.startsWith(p))}
        {subMenu(historyAnchor, () => setHistoryAnchor(null), historyTimer, HISTORY_ITEMS, isHistoryItemActive)}
        {subMenu(tradeAnchor, () => setTradeAnchor(null), tradeTimer, TRADE_ITEMS, (p) => pathname.startsWith(p))}

      </Root>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", lg: "none" },
          "& .MuiDrawer-paper": {
            width: "min(17.5rem, 85vw)",
            backgroundColor: theme.palette.surfaceBg.main,
            backgroundImage: "none",
            borderRight: 0,
          },
        }}
      >
        <Toolbar sx={{ pt: "1rem", backgroundColor: "transparent" }}>
          <Box component="img" src={logoSrc} alt="Seidar" sx={{ width: "9.4rem" }} />
        </Toolbar>
        <MobileDrawerList>
          {NAV.map((item) => {
            const active = isActive(item.value);
            return (
              <MobileNavItem key={item.value} active={active} onClick={() => navigate(item.value)}>
                {navIcon(item, active)}
                <Typography
                  variant="body1"
                  sx={{ color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText }}
                >
                  {item.title}
                </Typography>
              </MobileNavItem>
            );
          })}
        </MobileDrawerList>
      </Drawer>

      <SearchDialog open={searchOpen} handleClose={() => setSearchOpen(false)} />
    </>
  );
}
