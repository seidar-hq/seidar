"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import type { PolymorphicBox } from "@/theme/polymorphic";

const Root = styled(Box, {
  shouldForwardProp: (prop) => prop !== "mobileFullWidth" && prop !== "isBlackButton",
})<{ mobileFullWidth?: boolean; isBlackButton?: boolean }>(({ theme, mobileFullWidth, isBlackButton }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "16px",
  padding: "8px 16px 8px 16px",
  borderRadius: "200px",
  border: `0.5px solid ${isBlackButton ? theme.palette.primary.black : theme.palette.white.main}`,
  cursor: "pointer",
  width: "fit-content",
  transition: "opacity 0.2s ease",
  textDecoration: "none",
  "&:hover": {
    opacity: isBlackButton ? 1 : 0.8,
    background: isBlackButton ? "rgba(20, 20, 20, 0.06)" : "transparent",
  },
  ...(mobileFullWidth && {
    [theme.breakpoints.down("sm")]: { width: "100%", justifyContent: "space-between" },
  }),
}));

const IconCircle = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isBlackButton",
})<{ isBlackButton?: boolean }>(({ theme, isBlackButton }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px",
  borderRadius: "200px",
  background: isBlackButton ? theme.palette.primary.black : theme.palette.white.main,
})) as unknown as PolymorphicBox<{ isBlackButton?: boolean }>;

type Props = {
  text: string;
  handleClick?: () => void;
  isMobileFullWidth?: boolean;
  isBlackButton?: boolean;
};

export default function ArrowButton({
  text,
  handleClick,
  isMobileFullWidth = false,
  isBlackButton = false,
}: Props) {
  return (
    <Root onClick={handleClick} mobileFullWidth={isMobileFullWidth} isBlackButton={isBlackButton}>
      <Typography
        variant="body4Medium"
        sx={{ lineHeight: 1, color: isBlackButton ? "primary.black" : "white.main" }}
      >
        {text}
      </Typography>
      <IconCircle component="span" isBlackButton={isBlackButton}>
        <Box
          component="img"
          src={isBlackButton ? "/images/icons/arrow-white.svg" : "/images/icons/arrow-black.svg"}
          alt=""
          sx={{ width: 8, height: 8, display: "block" }}
        />
      </IconCircle>
    </Root>
  );
}
