"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import type { TokenRef } from "@/lib/tokens";
import TokenLogo from "./TokenLogo";

type Props = {
  header?: string;
  subtitle?: string;
  /** Explicit image URL; otherwise the icon comes from `token` (shared resolver) or a letter badge. */
  image?: string;
  token?: TokenRef;
  icon?: React.ReactNode;
  chainLogo?: string;
  variant?: TypographyProps["variant"];
  subtitleVariant?: TypographyProps["variant"];
  isTypography?: boolean;
  width?: string;
  height?: string;
  isSubtitle?: boolean;
  isHeader?: boolean;
  isTooltip?: boolean;
  maxTextWidth?: string;
};

const capitalize = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

export default function TokenComponent({
  header,
  subtitle,
  image,
  token,
  icon,
  chainLogo,
  variant = "body3",
  subtitleVariant = "caption",
  isTypography = true,
  width = "2.5rem",
  height = "2.5rem",
  isSubtitle = true,
  isHeader = true,
  isTooltip = false,
  maxTextWidth,
}: Props) {
  const clamp = maxTextWidth
    ? { maxWidth: maxTextWidth, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }
    : {};

  return (
    <Box display="flex" alignItems="center" gap="0.625rem" sx={{ minWidth: 0 }}>
      <Box sx={{ position: "relative", width, height, flexShrink: 0 }}>
        {icon ? (
          <Box
            sx={{
              width,
              height,
              borderRadius: "50%",
              backgroundColor: "border.iconBg",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </Box>
        ) : (
          <TokenLogo code={token?.code ?? header ?? "?"} issuer={token?.issuer} contract={token?.contract} src={image} size={width} />
        )}
        {chainLogo && (
          <Avatar
            src={chainLogo}
            sx={{
              width: "0.875rem",
              height: "0.875rem",
              position: "absolute",
              bottom: -2,
              right: -2,
              border: "0.094rem solid",
              borderColor: "background.paper",
              "& img": { width: "100%", height: "100%", objectFit: "contain" },
            }}
          />
        )}
      </Box>
      {isTypography && (
        <Box display="flex" flexDirection="column" gap="0.250rem" sx={{ overflow: "hidden" }}>
          {isHeader && (
            <Tooltip
              title={isTooltip ? `${capitalize(header)} (${subtitle})` : ""}
              arrow
              placement="top"
              disableHoverListener={!isTooltip}
            >
              <Typography
                variant={variant}
                sx={{
                  color: "common.black",
                  fontWeight: 400,
                  ...clamp,
                  ...(maxTextWidth && { cursor: isTooltip ? "pointer" : "default" }),
                }}
              >
                {capitalize(header)}
              </Typography>
            </Tooltip>
          )}
          {isSubtitle && (
            <Typography
              variant={subtitleVariant}
              sx={{ textTransform: "uppercase", color: "grey.200", fontWeight: 400, ...clamp }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
