"use client";

import { useEffect, useId, useState } from "react";
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
  /** Two columns of giant faded words that scroll vertically behind the title. */
  words: [string[], string[]];
  /** Scroll direction of this banner's word columns (alternates between banners, as on the reference). */
  drift: "up" | "down";
  /** Light or dark banner: sets the grain strength, as the reference does per banner. */
  tone: "light" | "dark";
  /** Dark banners: bottom, middle, top colours painted under the grain (see Grain). */
  grainBase?: [string, string, string];
  bg: string;
  wordColor: string;
  spheres: { src?: string | null; color: string; size: string; left?: string; right?: string; top?: string; bottom?: string }[];
};

/**
 * A column of faded giant words scrolling forever. The list is rendered twice and moved by exactly
 * one copy (50%), so the loop has no visible seam.
 */
function WordColumn({ list, side, color, drift, seconds }: { list: string[]; side: "left" | "right"; color: string; drift: "up" | "down"; seconds: number }) {
  return (
    <Box sx={{ position: "absolute", top: "-22%", bottom: 0, [side]: 0, width: { xs: "45%", md: "34%" }, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: side === "left" ? "flex-start" : "flex-end",
          px: "0.75rem",
          fontSize: { xs: "3rem", sm: "4.5rem", md: "6.5rem" },
          lineHeight: 0.79,
          letterSpacing: "-0.06em",
          fontWeight: 600,
          color,
          whiteSpace: "nowrap",
          userSelect: "none",
          willChange: "transform",
          animation: `explore-words-${drift} ${seconds}s linear infinite`,
          "@keyframes explore-words-up": { from: { transform: "translateY(0)" }, to: { transform: "translateY(-50%)" } },
          "@keyframes explore-words-down": { from: { transform: "translateY(-50%)" }, to: { transform: "translateY(0)" } },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {[...list, ...list].map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Film grain over a banner, the reference's own recipe and strength (measured against it): fine
 * fractal noise (frequency 5, 3 octaves) cut to on/off specks on about half the pixels, tinted dark,
 * the layer at about a third opacity. Light banners use 15% specks at 0.34, dark ones 18% at 0.32,
 * as on the reference. Dark specks barely show on near-black, which is how the reference looks too.
 */
function Grain({ tone, base }: { tone: "light" | "dark"; base?: [string, string, string] }) {
  const id = useId().replace(/:/g, "");
  const table = Array.from({ length: 100 }, (_, i) => (i < 51 ? 1 : 0)).join(" ");
  const [alpha, opacity] = tone === "dark" ? [0.18, 0.32] : [0.15, 0.34];
  return (
    <Box
      component="svg"
      aria-hidden
      viewBox="0 0 1320 265"
      preserveAspectRatio="none"
      sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity }}
    >
      <defs>
        {/* Dark banners: like the reference, the specks sit on a bottom-lit gradient painted in the same
            layer, which lifts the middle a little and makes the grain readable there. */}
        {base && (
          <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="660" x2="660" y1="265" y2="0">
            <stop stopColor={base[0]} />
            <stop offset="0.45" stopColor={base[1]} />
            <stop offset="1" stopColor={base[2]} />
          </linearGradient>
        )}
        <filter id={id} x="0" y="0" width="1320" height="265" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="5 5" numOctaves={3} seed={873} stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
          <feComponentTransfer in="alphaNoise" result="mask">
            <feFuncA type="discrete" tableValues={table} />
          </feComponentTransfer>
          <feFlood floodColor={`rgba(0,0,0,${alpha})`} result="tint" />
          <feComposite in="tint" in2="mask" operator="in" result="specks" />
          <feMerge>
            {base && <feMergeNode in="SourceGraphic" />}
            <feMergeNode in="specks" />
          </feMerge>
        </filter>
      </defs>
      <rect width="1320" height="265" fill={base ? `url(#${id}-g)` : "#000"} filter={`url(#${id})`} />
    </Box>
  );
}

function SlideView({ s, active }: { s: Slide; active: boolean }) {
  return (
    <Box
      component={Link}
      href={s.href}
      tabIndex={active ? 0 : -1}
      sx={{
        position: "relative",
        display: "block",
        height: "100%",
        background: s.bg,
        textDecoration: "none",
        overflow: "hidden",
        // Hover: the artwork (words and spheres) grows a touch, slowly; the title stays still.
        "&:hover .slide-art, &:focus-visible .slide-art": { transform: "scale(1.03)" },
      }}
    >
      <Box
        aria-hidden
        className="slide-art"
        sx={{ position: "absolute", inset: 0, transition: "transform .7s ease-out", "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}
      >
        {/* Under the words and spheres, as on the reference: the grain textures the backdrop only. */}
        <Grain tone={s.tone} base={s.grainBase} />
        <WordColumn list={s.words[0]} side="left" color={s.wordColor} drift={s.drift} seconds={24} />
        <WordColumn list={s.words[1]} side="right" color={s.wordColor} drift={s.drift} seconds={28} />
        {s.spheres.map((p, i) => (
          <Sphere key={i} src={p.src} color={p.color} size={p.size} sx={{ left: p.left, right: p.right, top: p.top, bottom: p.bottom, display: { xs: "none", md: "grid" } }} />
        ))}
      </Box>
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
          pointerEvents: "none",
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
      words: [
        ["BLEND", "AQUARIUS", "SOROSWAP", "DEFINDEX", "ZENEX", "PHOENIX", "SDEX", "XOXNO"],
        ["SENTORA", "UPSHIFT", "FXDAO", "SUSHI", "COMET", "ETHERFUSE", "REFLECTOR", "ALLBRIDGE"],
      ],
      drift: "up",
      tone: "light",
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
      words: [
        ["USDY", "USTRY", "CETES", "TESOURO", "BENJI", "deJTRSY", "deJAAA"],
        ["T-BILLS", "BONDS", "CREDIT", "FUNDS", "YIELD", "GOLD", "PESOS"],
      ],
      drift: "down",
      tone: "dark",
      grainBase: ["#E5E5E5", "#4E4E4E", "#111111"],
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
      words: [
        ["XLM", "LONG", "SHORT", "20×", "PERPS", "LEVERAGE"],
        ["USDC", "TAKE PROFIT", "STOP LOSS", "FUNDING", "MARGIN", "ZENEX"],
      ],
      drift: "up",
      tone: "dark",
      grainBase: ["#c9d3e0", "#3a4a66", "#1b2230"],
      bg: "linear-gradient(180deg, #1b2230 0%, #2c3a52 55%, #c9d3e0 100%)",
      wordColor: "rgba(255,255,255,0.08)",
      spheres: [
        { src: "/protocols/zenex.png", color: "#101010", size: "8rem", left: "18%", bottom: "-2rem" },
        { src: "/tokens/xlm.png", color: "#d9e3ef", size: "5.5rem", right: "19%", top: "-1.5rem" },
      ],
    },
  ];

  // Track position. One extra copy of the first banner sits at the end, so the last banner slides on
  // to "the first" in the same direction; when that slide finishes the track jumps back to 0 unseen.
  const n = slides.length;
  const [pos, setPos] = useState(0);
  const [instant, setInstant] = useState(false);
  const [paused, setPaused] = useState(false);
  const active = pos % n;

  const go = (k: number) => {
    setInstant(false);
    setPos(k);
  };
  const next = () => go(pos + 1);
  const onSlid = () => {
    if (pos === n) {
      setInstant(true);
      setPos(0);
    }
  };
  // Re-enable the slide transition after an unseen jump has been painted.
  useEffect(() => {
    if (!instant) return;
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    return () => cancelAnimationFrame(f);
  }, [instant]);

  const track = [...slides, slides[0]];

  return (
    <Box>
      <Box
        // Hovering (or tabbing into) the banner stops it; the active dot's progress stops with it.
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        sx={{ position: "relative", borderRadius: "1.25rem", overflow: "hidden", height: { xs: "13.75rem", md: "16rem" }, bgcolor: "#111" }}
      >
        <Box
          onTransitionEnd={(e) => e.target === e.currentTarget && onSlid()}
          sx={{
            display: "flex",
            height: "100%",
            transform: `translate3d(${-pos * 100}%, 0, 0)`,
            transition: instant ? "none" : "transform .7s cubic-bezier(.22,.61,.36,1)",
          }}
        >
          {track.map((s, k) => (
            <Box key={s.key + k} aria-hidden={k % n !== active || k === n} sx={{ flex: "0 0 100%", minWidth: 0, height: "100%" }}>
              <SlideView s={s} active={k === pos && k < n} />
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "center", gap: "0.5rem", pt: "0.75rem" }}>
        {slides.map((s, k) => (
          <ButtonBase
            key={s.key}
            aria-label={`Go to slide ${k + 1}`}
            aria-current={k === active}
            onClick={() => go(k)}
            sx={{
              position: "relative",
              height: "0.5rem",
              width: k === active ? "2.5rem" : "0.5rem",
              borderRadius: "9999px",
              overflow: "hidden",
              bgcolor: "rgba(250,250,250,0.2)",
              transition: "width .3s",
            }}
          >
            {k === active && (
              <Box
                key={active}
                // The fill is the timer: when it completes the banner advances, and pausing it pauses the carousel.
                onAnimationEnd={next}
                sx={{
                  position: "absolute",
                  inset: 0,
                  bgcolor: "#fafafa",
                  borderRadius: "9999px",
                  transformOrigin: "left",
                  animation: `explore-dot ${SLIDE_MS}ms linear forwards`,
                  animationPlayState: paused ? "paused" : "running",
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
