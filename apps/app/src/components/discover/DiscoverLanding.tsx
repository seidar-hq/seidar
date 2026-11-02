"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { SectionCard } from "@/components/common/SectionCard";
import TokenLogo from "@/components/common/TokenLogo";
import { formatUsdCompact, shortAddress } from "@/lib/format";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";
import { timeAgo, useFeatured, useSavedWallets, type FeaturedWallet, type SavedWallet } from "./discoverData";
import { AddressSearch, CardTitle, Segmented, WalletAvatar } from "./parts";

type Sort = "active" | "value" | "recent";

const STEPS = [
  { Icon: TravelExploreRoundedIcon, title: "Find a wallet", text: "Paste any address, or start from wallets active on Stellar DeFi right now." },
  { Icon: TuneRoundedIcon, title: "Read it", text: "Holdings, positions, risk score and profit history, from live on-chain data." },
  { Icon: ContentCopyRoundedIcon, title: "Copy what you like", text: "Pick positions, enter an amount, sign each step in your wallet." },
];

function Hero() {
  return (
    <SectionCard
      sx={(t) => ({
        position: "relative",
        overflow: "hidden",
        p: { xs: "1.5rem 1rem", sm: "2.5rem 2rem" },
        gap: "1.5rem",
        background: `radial-gradient(60rem 18rem at 85% -20%, ${alpha(t.palette.sidebar.primary, 0.28)}, transparent 60%), radial-gradient(30rem 14rem at 0% 120%, ${alpha("#8DE8FF", 0.12)}, transparent 60%), ${t.palette.surfaceBg.section}`,
      })}
    >
      <Box sx={{ maxWidth: "40rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 600, color: "common.black", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
          See how any Stellar wallet invests. Copy the moves you like.
        </Typography>
        <Typography sx={{ fontSize: "0.9375rem", color: "grey.200", maxWidth: "34rem" }}>
          Every token, lending position, pool and vault a wallet holds, with its risk and its profit over time. Pick what you want and copy it into your own wallet.
        </Typography>
      </Box>
      <Box sx={{ maxWidth: "40rem" }}>
        <AddressSearch autoFocus />
      </Box>
      <Box sx={{ display: "grid", gap: "0.75rem", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, mt: "0.5rem" }}>
        {STEPS.map(({ Icon, title, text }, i) => (
          <Box key={title} sx={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <Box sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.75rem", flexShrink: 0, display: "grid", placeItems: "center", color: "primary.main", backgroundColor: "overlay.white08" }}>
              <Icon sx={{ fontSize: "1.125rem" }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>
                {i + 1}. {title}
              </Typography>
              <Typography variant="caption" color="grey.200">
                {text}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

function SavedChip({ w, onOpen, onRemove, icon }: { w: SavedWallet; onOpen: () => void; onRemove?: () => void; icon?: React.ReactNode }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", borderRadius: "999rem", backgroundColor: "surfaceBg.softInset", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, pr: onRemove ? "0.25rem" : "0.75rem", "&:hover": { borderColor: "primary.main" } }}>
      <ButtonBase onClick={onOpen} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", py: "0.375rem", pl: "0.375rem", borderRadius: "999rem" }}>
        <WalletAvatar address={w.address} size="1.5rem" />
        <Typography sx={{ fontSize: "0.8125rem", color: "common.black", fontWeight: 500 }}>{w.name ?? shortAddress(w.address)}</Typography>
        {icon}
      </ButtonBase>
      {onRemove && (
        <IconButton size="small" onClick={onRemove} aria-label="Remove" sx={{ ml: "0.25rem", color: "grey.200" }}>
          <CloseRoundedIcon sx={{ fontSize: "0.875rem" }} />
        </IconButton>
      )}
    </Box>
  );
}

function ActionBar({ a }: { a: FeaturedWallet["actions"] }) {
  const parts = [
    { k: "Supplied", v: a.supply, c: "#17B26A" },
    { k: "Borrowed", v: a.borrow, c: "#F5B83D" },
    { k: "Repaid", v: a.repay, c: "#5C84FF" },
    { k: "Withdrew", v: a.withdraw, c: "#9E9E9E" },
  ].filter((p) => p.v > 0);
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <Tooltip title={parts.map((p) => `${p.k} ${p.v}×`).join(" · ")}>
      <Box sx={{ display: "flex", height: "0.375rem", borderRadius: "999rem", overflow: "hidden", gap: "0.125rem", backgroundColor: "overlay.white08" }}>
        {parts.map((p) => (
          <Box key={p.k} sx={{ width: `${(p.v / total) * 100}%`, backgroundColor: p.c }} />
        ))}
      </Box>
    </Tooltip>
  );
}

function WalletCard({ w, watched, onOpen, onStar }: { w: FeaturedWallet; watched: boolean; onOpen: () => void; onStar: () => void }) {
  const { byContract } = useTokenCatalogue();
  const total = w.actions.supply + w.actions.borrow + w.actions.repay + w.actions.withdraw;
  const tokens = [...new Set(w.assets.map((c) => byContract.get(c)).filter(Boolean).map((t) => `${t!.code}|${t!.issuer ?? ""}`))].slice(0, 5);
  return (
    <ButtonBase
      component="div"
      onClick={onOpen}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        gap: "0.875rem",
        p: "1rem",
        borderRadius: "1rem",
        backgroundColor: "surfaceBg.softInset",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        transition: "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
        "&:hover": { transform: "translateY(-0.125rem)", borderColor: (t) => alpha(t.palette.sidebar.primary, 0.6), boxShadow: (t) => `0 0.75rem 2rem ${alpha(t.palette.sidebar.primary, 0.12)}` },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <WalletAvatar address={w.address} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }} noWrap>
            {w.label ?? shortAddress(w.address, 5, 5)}
          </Typography>
          <Typography variant="caption" color="grey.200">
            Active {timeAgo(w.lastActive)}
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          sx={{ color: watched ? "#F5B83D" : "grey.200" }}
        >
          <StarRoundedIcon sx={{ fontSize: "1.25rem" }} />
        </IconButton>
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "0.5rem" }}>
        <Box>
          <Typography variant="caption" color="grey.200">
            In wallet
          </Typography>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: "common.black", lineHeight: 1.2 }}>{w.walletUsd != null ? formatUsdCompact(w.walletUsd) : "—"}</Typography>
        </Box>
        <Box sx={{ display: "flex" }}>
          {tokens.map((t, i) => {
            const [code, issuer] = t.split("|");
            return (
              <Box key={t} sx={{ ml: i ? "-0.375rem" : 0, borderRadius: "50%", border: (th) => `0.125rem solid ${th.palette.surfaceBg.softInset}` }}>
                <TokenLogo code={code} issuer={issuer || null} size="1.5rem" />
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <Typography variant="caption" color="grey.200" noWrap>
          {total} lending move{total === 1 ? "" : "s"} · 30d
        </Typography>
        <ActionBar a={w.actions} />
        <Box sx={{ display: "flex", gap: "0.25rem", flexWrap: "nowrap", overflow: "hidden", mt: "0.125rem" }}>
          {w.pools.map((p) => (
            <Box key={p.id} component="span" sx={{ px: "0.5rem", height: "1.25rem", display: "inline-flex", alignItems: "center", borderRadius: "999rem", fontSize: "0.6875rem", color: "grey.200", backgroundColor: "overlay.white08", whiteSpace: "nowrap" }}>
              {p.name}
            </Box>
          ))}
        </Box>
      </Box>
    </ButtonBase>
  );
}

export default function DiscoverLanding() {
  const router = useRouter();
  const featured = useFeatured();
  const saved = useSavedWallets();
  const [sort, setSort] = useState<Sort>("active");
  const open = (a: string) => router.push(`/discover?address=${a}`);

  const wallets = useMemo(() => {
    const ws = [...featured.wallets];
    const moves = (w: FeaturedWallet) => w.actions.supply * 2 + w.actions.borrow * 2 + w.actions.repay + w.actions.withdraw;
    if (sort === "value") ws.sort((a, b) => (b.walletUsd ?? -1) - (a.walletUsd ?? -1));
    else if (sort === "recent") ws.sort((a, b) => b.lastActive - a.lastActive);
    else ws.sort((a, b) => moves(b) - moves(a));
    return ws;
  }, [featured.wallets, sort]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "100vh" }}>
      <Hero />

      {(saved.watch.length > 0 || saved.recent.length > 0) && (
        <SectionCard sx={{ gap: "1rem" }}>
          {saved.watch.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <CardTitle sub="Wallets you starred, kept in this browser">Watchlist</CardTitle>
              <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {saved.watch.map((w) => (
                  <SavedChip key={w.address} w={w} onOpen={() => open(w.address)} onRemove={() => saved.toggleWatch(w.address)} icon={<StarRoundedIcon sx={{ fontSize: "0.875rem", color: "#F5B83D" }} />} />
                ))}
              </Box>
            </Box>
          )}
          {saved.recent.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <CardTitle
                right={
                  <ButtonBase onClick={saved.clearRecent} sx={{ fontSize: "0.75rem", color: "grey.200", "&:hover": { color: "common.black" } }}>
                    Clear
                  </ButtonBase>
                }
              >
                Recently viewed
              </CardTitle>
              <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {saved.recent.map((w) => (
                  <SavedChip key={w.address} w={{ ...w, name: saved.watch.find((x) => x.address === w.address)?.name }} onOpen={() => open(w.address)} icon={<HistoryRoundedIcon sx={{ fontSize: "0.875rem", color: "grey.200" }} />} />
                ))}
              </Box>
            </Box>
          )}
        </SectionCard>
      )}

      <SectionCard>
        <CardTitle
          sub="Wallets lending and borrowing in Stellar's largest open Blend pools over the last 30 days. Exchanges and services are left out."
          right={
            <Segmented<Sort>
              value={sort}
              onChange={setSort}
              options={[
                { value: "active", label: "Most active" },
                { value: "value", label: "Largest" },
                { value: "recent", label: "Latest" },
              ]}
            />
          }
        >
          Active on Stellar DeFi
        </CardTitle>
        {featured.loading ? (
          <Box sx={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(16.5rem, 1fr))" }}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} variant="rounded" animation="wave" sx={{ height: "11.5rem", borderRadius: "1rem" }} />
            ))}
          </Box>
        ) : wallets.length === 0 ? (
          <Box sx={{ py: "3rem", textAlign: "center" }}>
            <Typography color="grey.200">{featured.failed ? "Couldn't load active wallets right now. Paste an address above, or try again in a minute." : "No active wallets found in the last 30 days."}</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(16.5rem, 1fr))" }}>
            {wallets.map((w) => (
              <WalletCard key={w.address} w={w} watched={saved.isWatched(w.address)} onOpen={() => open(w.address)} onStar={() => saved.toggleWatch(w.address, w.label ?? undefined)} />
            ))}
          </Box>
        )}
        {featured.source && (
          <Typography variant="caption" color="grey.200" sx={{ px: "0.25rem" }}>
            Source: {featured.source}. Being active is not a recommendation: check each wallet&apos;s risk before copying.
          </Typography>
        )}
      </SectionCard>
    </Box>
  );
}
