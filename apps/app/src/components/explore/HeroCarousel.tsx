"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "next/link";
import { compactUsd, swapHref, useMarketAssets, useMarketOverview } from "@/components/home/marketData";
import { Sphere } from "./parts";

const SLIDE_MS = 7000;

type Slide = {
  key: string;
  href: string;
  title: [string, string];
  sub: React.ReactNode;
  words: string[];
  bg: string;
  wordColor: string;
  spheres: { src?: string | null; color: string; size: string; left?: string; right?: string; top?: string; bottom?: string }[];
};

/** Faded giant words filling the banner behind the title, two columns of three lines. */
function Words({ words, color }: { words: string[]; color: string }) {
  const col = (list: string[], side: "left" | "right") => (
    <Box
      sx={{
        position: "absolute",
        top: "-1.5rem",
        [side]: "1rem",
        display: "flex",
        flexDirection: "column",
        alignItems: side === "left" ? "flex-start" : "flex-end",
        fontSize: { xs: "4.5rem", md: "7.5rem" },
        lineHeight: 0.79,
        letterSpacing: "-0.06em",
        fontWeight: 600,
        color,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {list.map((w, i) => (
        <span key={i}>{w}</span>
      ))}
    </Box>
  );
  return (
    <Box aria-hidden sx={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {col(words.slice(0, 3), "left")}
      {col(words.slice(3, 6), "right")}
    </Box>
  );
}

function SlideView({ s }: { s: Slide }) {
  return (
    <Box
      component={Link}
      href={s.href}
      sx={{ position: "absolute", inset: 0, display: "block", background: s.bg, textDecoration: "none", overflow: "hidden" }}
    >
      <Words words={s.words} color={s.wordColor} />
      {s.spheres.map((p, i) => (
        <Sphere key={i} src={p.src} color={p.color} size={p.size} sx={{ left: p.left, right: p.right, top: p.top, bottom: p.bottom, display: { xs: "none", md: "grid" } }} />
      ))}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          px: "1rem",
          gap: { xs: "0.6rem", md: "0.9rem" },
          zIndex: 1,
        }}
      >
        <Box
          component="h3"
          sx={{
            m: 0,
            color: "#fff",
            fontWeight: 600,
            textTransform: "uppercase",
            fontSize: { xs: "1.6rem", md: "2.35rem" },
            lineHeight: 0.85,
            letterSpacing: "-0.06em",
            textShadow: "0 0.25rem 1.5rem rgba(0,0,0,0.35)",
          }}
        >
          {s.title[0]}
          <br />
          {s.title[1]}
        </Box>
        <Box
          sx={{
            width: { xs: "11rem", md: "16rem" },
            height: "1px",
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 18%, rgba(255,255,255,0.5) 82%, rgba(255,255,255,0) 100%)",
          }}
        />
        <Box sx={{ color: "rgba(255,255,255,0.92)", fontSize: { xs: "0.8rem", md: "1rem" }, lineHeight: 1.3, letterSpacing: "-0.03em", maxWidth: "26rem" }}>
          {s.sub}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Three banners that rotate every 7 s, built from live data: Stellar DeFi's total value locked,
 * the market cap of tokenised real-world assets, and perps on Zenex. The active dot fills as its
 * banner's time runs out; clicking a dot jumps there.
 */
export default function HeroCarousel() {
  const { overview } = useMarketOverview();
  const { assets } = useMarketAssets();
  const [i, setI] = useState(0);

  const rwa = assets.filter((a) => a.cats.includes("rwa"));
  const rwaCap = rwa.reduce((s, a) => s + (a.marketCap ?? 0), 0);
  const topRwa = [...rwa].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const tvl = overview?.tvl?.current ?? null;

  const slides: Slide[] = [
    {
      key: "defi",
      href: "/earn/lending&borrow",
      title: ["Stellar DeFi,", "all in one place"],
      sub: (
        <>
          {tvl ? `${compactUsd(tvl)} locked across Stellar's protocols.` : "Every Stellar protocol in one app."}
          <br />
          Lend, swap, provide liquidity and earn from one wallet.
        </>
      ),
      words: ["BLEND", "AQUARIUS", "SOROSWAP", "DEFINDEX", "ZENEX", "PHOENIX"],
      bg: "linear-gradient(0deg, #e9e3cf 0%, #6f6a58 52%, #2a2822 100%)",
      wordColor: "rgba(255,255,255,0.09)",
      spheres: [
        { src: "/protocols/blend.png", color: "#1d1d1d", size: "9.5rem", left: "21%", top: "-2.5rem" },
        { src: "/protocols/aqua.png", color: "#3b2ad1", size: "7.5rem", right: "17%", bottom: "-2.5rem" },
        { src: "/protocols/soroswap.png", color: "#5b2bd8", size: "5rem", right: "30%", top: "-1.25rem" },
      ],
    },
    {
      key: "rwa",
      href: topRwa[0] ? swapHref(topRwa[0]) : "/trade-swap/dex",
      title: ["Real-world assets", "on Stellar"],
      sub: (
        <>
          {rwaCap ? `${compactUsd(rwaCap)} of tokenized treasuries and funds.` : "Tokenized treasuries and funds."}
          <br />
          Swap into them from any Stellar asset.
        </>
      ),
      words: ["USDY", "USTRY", "CETES", "deJTRSY", "TESOURO", "deJAAA"],
      bg: "linear-gradient(180deg, #111 0%, #151515 48%, #e5e5e5 100%)",
      wordColor: "rgba(255,255,255,0.07)",
      spheres: topRwa.slice(0, 5).map((a, k) => ({
        src: a.icon,
        color: ["#0d0d0d", "#e9e9e9", "#2f6f3a", "#c25a17", "#2a63c9"][k],
        size: "8.5rem",
        left: `calc(50% - ${(2.5 - k) * 7.6}rem - 4.25rem)`,
        bottom: "-4.5rem",
      })),
    },
    {
      key: "perps",
      href: "/trade-swap/perps",
      title: ["Long or short XLM", "up to 20×"],
      sub: (
        <>
          Perpetual futures on Zenex, settled in USDC.
          <br />
          Take profit and stop loss on every position.
        </>
      ),
      words: ["XLM", "LONG", "SHORT", "XLM", "20×", "USDC"],
      bg: "linear-gradient(180deg, #1b2230 0%, #2c3a52 55%, #c9d3e0 100%)",
      wordColor: "rgba(255,255,255,0.08)",
      spheres: [
        { src: "/protocols/zenex.png", color: "#101010", size: "8rem", left: "18%", bottom: "-2rem" },
        { src: "/tokens/xlm.png", color: "#d9e3ef", size: "5.5rem", right: "19%", top: "-1.5rem" },
      ],
    },
  ];

  useEffect(() => {
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, slides.length]);

  return (
    <Box>
      <Box sx={{ position: "relative", borderRadius: "1.25rem", overflow: "hidden", height: { xs: "13.75rem", md: "16rem" }, bgcolor: "#111" }}>
        {slides.map((s, k) => (
          <Box
            key={s.key}
            aria-hidden={k !== i}
            sx={{ position: "absolute", inset: 0, opacity: k === i ? 1 : 0, transition: "opacity .6s ease", pointerEvents: k === i ? "auto" : "none" }}
          >
            <SlideView s={s} />
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "center", gap: "0.5rem", pt: "0.75rem" }}>
        {slides.map((s, k) => (
          <ButtonBase
            key={s.key}
            aria-label={`Go to slide ${k + 1}`}
            aria-current={k === i}
            onClick={() => setI(k)}
            sx={{
              position: "relative",
              height: "0.5rem",
              width: k === i ? "2.5rem" : "0.5rem",
              borderRadius: "9999px",
              overflow: "hidden",
              bgcolor: "rgba(250,250,250,0.2)",
              transition: "width .3s",
            }}
          >
            {k === i && (
              <Box
                key={i}
                sx={{
                  position: "absolute",
                  inset: 0,
                  bgcolor: "#fafafa",
                  borderRadius: "9999px",
                  transformOrigin: "left",
                  animation: `explore-dot ${SLIDE_MS}ms linear forwards`,
                  "@keyframes explore-dot": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
                }}
              />
            )}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}
