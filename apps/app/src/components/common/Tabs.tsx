"use client";

import { memo, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";

export const SEGMENT_VARIANT = "segment";

export type TabItem = {
  id: string;
  label: string;
  path?: string;
  icon?: string;
  disabled?: boolean;
  padding?: string;
};

export const TabsTrack = styled(Box, {
  shouldForwardProp: (p) => !["color", "fullWidth"].includes(String(p)),
})<{ color?: string; fullWidth?: boolean }>(({ theme, color, fullWidth }) => {
  const dark = theme.palette.mode === "dark";
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.375rem",
    backgroundColor: color || (dark ? theme.palette.overlay.white04 : theme.palette.border.main600),
    borderTop: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : "transparent"}`,
    borderBottom: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : "transparent"}`,
    borderRadius: "12.5rem",
    width: fullWidth ? "100%" : "fit-content",
    boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.elevated}` : "none",
  };
});

type TabProps = {
  isActiveTab?: boolean;
  padding?: string;
  color?: string;
  minWidth?: string;
  height?: string;
  fullWidth?: boolean;
  tabVariant?: string;
};

export const TabButton = styled(Box, {
  shouldForwardProp: (p) =>
    !["isActiveTab", "padding", "color", "minWidth", "height", "isDarkMode", "fullWidth", "tabVariant"].includes(String(p)),
})<TabProps>(({ isActiveTab = false, padding, theme, color, minWidth, height, fullWidth = false, tabVariant }) => {
  const segment = tabVariant === SEGMENT_VARIANT;
  return {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: padding || "0rem 0.5rem",
    height: height || "2.187rem",
    minWidth: minWidth || "auto",
    backgroundColor: segment ? "transparent" : isActiveTab ? color || theme.palette.sidebar.primary : "transparent",
    borderRadius: isActiveTab ? "12.5rem" : "0.5rem",
    border: segment ? "none" : `0.0625rem solid ${isActiveTab ? theme.palette.overlay.white40 : "transparent"}`,
    cursor: "pointer",
    whiteSpace: "nowrap",
    ...(fullWidth ? { flex: 1 } : {}),
  };
});

const SegmentDot = styled(Box)(({ theme }) => ({
  width: "0.375rem",
  height: "0.375rem",
  borderRadius: "50%",
  flexShrink: 0,
  backgroundColor: theme.palette.primary.main,
}));

type Props = {
  tabs: TabItem[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  isPathProvided?: boolean;
  color?: string;
  minWidth?: string;
  height?: string;
  fullWidth?: boolean;
  variant?: string;
};

function Tabs({
  tabs,
  activeTab,
  setActiveTab,
  isPathProvided = true,
  color,
  minWidth = "auto",
  height = "2.187rem",
  fullWidth = false,
  variant,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const dark = useTheme().palette.mode === "dark";

  // Path-driven tabs follow the URL; the longest matching path wins.
  useEffect(() => {
    if (!isPathProvided) return;
    const match = [...tabs]
      .filter((t) => t.path)
      .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))
      .find((t) => t.path && pathname.startsWith(t.path));
    if (match) {
      setActiveTab(match.id);
      return;
    }
    const nested = tabs.some((t) => {
      if (!t.path) return false;
      const rest = pathname.replace(t.path, "");
      return rest.startsWith("/") && rest.length > 1;
    });
    if (!nested && tabs[0]?.path) {
      setActiveTab(tabs[0].id);
      router.replace(tabs[0].path);
    }
  }, [pathname, router, tabs, setActiveTab, isPathProvided]);

  const select = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.disabled) return;
    setActiveTab(id);
    if (tab.path) router.push(tab.path);
  };

  const segment = variant === SEGMENT_VARIANT;

  return (
    <Box sx={{ mb: 0 }}>
      <TabsTrack color={color} fullWidth={fullWidth}>
        {tabs.map((t) => (
          <TabButton
            key={t.id}
            color={color}
            isActiveTab={activeTab === t.id}
            padding={t.padding || "0rem 0.500rem"}
            minWidth={minWidth}
            height={height}
            fullWidth={fullWidth}
            tabVariant={variant}
            onClick={() => select(t.id)}
            sx={{
              cursor: t.disabled ? "default" : "pointer",
              pointerEvents: t.disabled ? "none" : "auto",
              opacity: t.disabled ? 0.5 : 1,
              gap: segment ? "0.625rem" : t.icon ? "0.5rem" : 0,
            }}
          >
            {t.icon && (
              <Box
                component="img"
                src={t.icon}
                alt=""
                aria-hidden
                sx={{
                  width: "1.25rem",
                  height: "1.25rem",
                  filter:
                    activeTab === t.id
                      ? "brightness(0) invert(1)"
                      : dark
                        ? "brightness(0) saturate(100%) invert(70%)"
                        : "brightness(0) saturate(100%) invert(35%)",
                }}
              />
            )}
            {segment && activeTab === t.id && <SegmentDot />}
            <Typography
              variant="body1"
              sx={{
                color:
                  activeTab === t.id
                    ? segment
                      ? "primary.main"
                      : "sidebar.white"
                    : dark
                      ? "grey.200"
                      : "sidebar.black100",
              }}
            >
              {t.label}
            </Typography>
          </TabButton>
        ))}
      </TabsTrack>
    </Box>
  );
}

export default memo(Tabs);
