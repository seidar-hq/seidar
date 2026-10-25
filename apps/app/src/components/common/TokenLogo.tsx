"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { API_BASE } from "@/lib/api";
import { STELLAR_LOGO } from "@/lib/wallets";

export const tokenLogoUrl = (code: string, issuer: string | null | undefined) =>
  !issuer && code.toUpperCase() === "XLM"
    ? STELLAR_LOGO
    : issuer
      ? `${API_BASE}/token/logo?asset=${encodeURIComponent(`${code}:${issuer}`)}`
      : null;

/** Round token logo with a letter fallback when no image is published. */
export default function TokenLogo({
  code,
  issuer,
  src,
  size = "2rem",
}: {
  code: string;
  issuer?: string | null;
  src?: string | null;
  size?: string;
}) {
  const url = src ?? tokenLogoUrl(code, issuer);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (!url || failed)
    return (
      <Box
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "grey.300",
          color: "common.black",
          fontSize: `calc(${size} * 0.38)`,
          fontWeight: 600,
        }}
      >
        {code.slice(0, 2).toUpperCase()}
      </Box>
    );
  return (
    <Box
      component="img"
      src={url}
      alt={code}
      onError={() => setFailed(true)}
      sx={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", objectFit: "cover", backgroundColor: "grey.300" }}
    />
  );
}
