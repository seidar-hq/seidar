"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import GlassDialog, { MODAL } from "@/components/common/GlassDialog";
import TokenLogo from "@/components/common/TokenLogo";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import { chainLogo, type SourceChain, type SourceToken } from "./BridgeForm";

// Source-token picker for the bridge: every token on every supported chain, with chain filters.

const ICON_ALIAS: Record<string, string> = { POL: "matic", "USD₮0": "usdt", USDT0: "usdt", USDT: "usdt", USDt: "usdt" };

/** Logo for a non-Stellar token (cryptocurrency-icons on jsDelivr; letter badge when missing). */
export const sourceTokenLogo = (symbol: string) =>
  `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${(ICON_ALIAS[symbol] ?? symbol).toLowerCase()}.png`;

/** Token logo with the chain's logo as a small badge. */
export function ChainTokenLogo({ symbol, chain, size = "2.25rem" }: { symbol: string; chain: string; size?: string }) {
  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <TokenLogo code={symbol} src={sourceTokenLogo(symbol)} size={size} />
      <Box
        component="img"
        src={chainLogo(chain)}
        alt=""
        sx={{ position: "absolute", right: "-0.2rem", bottom: "-0.2rem", width: "45%", height: "45%", borderRadius: "50%", border: `0.125rem solid ${MODAL.bg}` }}
      />
    </Box>
  );
}

/** The chip inside the amount box that opens the picker. */
export function TokenChip({ symbol, chain, onClick, stellar }: { symbol: string; chain: string; onClick: () => void; stellar?: boolean }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        height: "2.75rem",
        pl: "0.375rem",
        pr: "0.75rem",
        borderRadius: "999rem",
        backgroundColor: "overlay.white08",
        flexShrink: 0,
        "&:hover": { backgroundColor: "overlay.white20" },
      }}
    >
      {stellar ? (
        <Box sx={{ position: "relative", width: "2rem", height: "2rem" }}>
          <TokenLogo code={symbol} issuer={symbol === "USDC" ? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" : null} size="2rem" />
          <Box component="img" src={chainLogo("SRB")} alt="" sx={{ position: "absolute", right: "-0.2rem", bottom: "-0.2rem", width: "45%", height: "45%", borderRadius: "50%" }} />
        </Box>
      ) : (
        <ChainTokenLogo symbol={symbol} chain={chain} size="2rem" />
      )}
      <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>{symbol}</Typography>
      <KeyboardArrowDown sx={{ fontSize: "1.125rem", color: "grey.200" }} />
    </ButtonBase>
  );
}

export default function BridgeTokenDialog({
  open,
  onClose,
  sources,
  current,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  sources: SourceChain[];
  current: { chain?: string; token?: string };
  onSelect: (chain: SourceChain, token: SourceToken) => void;
}) {
  const [q, setQ] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return sources
      .filter((c) => chainFilter === "all" || c.chain === chainFilter)
      .flatMap((c) => c.tokens.map((t) => ({ c, t })))
      .filter(({ c, t }) => !query || `${t.symbol} ${t.name} ${c.name}`.toLowerCase().includes(query));
  }, [sources, q, chainFilter]);

  return (
    <GlassDialog open={open} onClose={onClose} title="Select a token" subtitle="Any token below arrives on Stellar as USDC or XLM." actions={null}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem", height: "3rem", px: "1rem", borderRadius: "999rem", backgroundColor: MODAL.inset }}>
        <Box sx={{ color: MODAL.muted, display: "inline-flex" }}>
          <SearchIcon size="1.125rem" />
        </Box>
        <InputBase autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search token or network" sx={{ flex: 1, fontSize: "0.9375rem", color: "#E3E3E3" }} />
      </Box>
      <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {[{ chain: "all", name: "All" }, ...sources].map((c) => {
          const active = chainFilter === c.chain;
          return (
            <ButtonBase
              key={c.chain}
              onClick={() => setChainFilter(c.chain)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "2.25rem",
                px: "0.75rem",
                borderRadius: "999rem",
                fontSize: "0.8125rem",
                color: active ? "sidebar.white" : "#E3E3E3",
                backgroundColor: active ? "sidebar.primary" : MODAL.inset,
              }}
            >
              {c.chain !== "all" && <Box component="img" src={chainLogo(c.chain)} alt="" sx={{ width: "1.125rem", height: "1.125rem", borderRadius: "50%" }} />}
              {c.name}
            </ButtonBase>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "22rem", overflowY: "auto", overflowX: "hidden" }}>
        {rows.length === 0 && (
          <Typography sx={{ color: MODAL.muted, fontSize: "0.875rem", p: "1rem", textAlign: "center" }}>No tokens match.</Typography>
        )}
        {rows.map(({ c, t }) => {
          const selected = current.chain === c.chain && current.token === t.tokenAddress;
          return (
            <ButtonBase
              key={`${c.chain}:${t.tokenAddress}`}
              onClick={() => {
                onSelect(c, t);
                onClose();
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                p: "0.625rem 0.75rem",
                borderRadius: "0.875rem",
                textAlign: "left",
                backgroundColor: selected ? MODAL.insetHover : "transparent",
                "&:hover": { backgroundColor: MODAL.inset },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <ChainTokenLogo symbol={t.symbol} chain={c.chain} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "#E3E3E3" }}>{t.symbol}</Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: MODAL.muted }} noWrap>
                    {t.name} · {c.name}
                  </Typography>
                </Box>
              </Box>
              {t.usdPrice != null && (
                <Typography sx={{ fontSize: "0.8125rem", color: MODAL.muted, flexShrink: 0 }}>
                  ${t.usdPrice >= 100 ? t.usdPrice.toFixed(0) : t.usdPrice.toFixed(t.usdPrice >= 1 ? 2 : 4)}
                </Typography>
              )}
            </ButtonBase>
          );
        })}
      </Box>
    </GlassDialog>
  );
}
