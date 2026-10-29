"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Gliding page scroll for wheel, trackpad and touch (syncTouch: a swipe eases out like the wheel
// instead of the phone's own fling). Nested scroll areas (tables, the agent chat) scroll natively,
// and anything inside a MUI dialog, menu or popover is left alone so their scroll locks keep working.
const OVERLAY = ".MuiModal-root, .MuiPopover-root, .MuiPopper-root, .MuiDialog-root, [data-lenis-prevent]";

/** Phones draw their overlay scrollbar only for native scrolling, so touch gets its own indicator. */
const TOUCH = "(pointer: coarse)";
const IDLE_MS = 900;

export default function SmoothScroll() {
  const lenis = useRef<Lenis | null>(null);
  const thumb = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const l = new Lenis({
      autoRaf: true,
      lerp: 0.085,
      wheelMultiplier: 1,
      syncTouch: true,
      syncTouchLerp: 0.075,
      touchInertiaExponent: 1.7,
      touchMultiplier: 1,
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
      prevent: (node) => !!node.closest?.(OVERLAY),
    });
    lenis.current = l;

    // Scroll indicator on touch screens: shown while the page moves, faded out when it rests.
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const el = thumb.current;
      if (!el || !window.matchMedia(TOUCH).matches) return;
      const view = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total <= view + 1) return;
      const h = Math.max(32, (view / total) * view);
      const top = (window.scrollY / (total - view)) * (view - h);
      el.style.height = `${h}px`;
      el.style.transform = `translateY(${Math.min(view - h, Math.max(0, top))}px)`;
      el.style.opacity = "1";
      clearTimeout(idle);
      idle = setTimeout(() => {
        if (thumb.current) thumb.current.style.opacity = "0";
      }, IDLE_MS);
    };
    l.on("scroll", onScroll);

    return () => {
      clearTimeout(idle);
      l.destroy();
      lenis.current = null;
    };
  }, []);

  // New page: start at the top without gliding there.
  useEffect(() => {
    lenis.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return (
    <div
      ref={thumb}
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        right: 2,
        width: 3,
        height: 0,
        borderRadius: 3,
        background: "rgba(255, 255, 255, 0.45)",
        opacity: 0,
        transition: "opacity 250ms ease",
        pointerEvents: "none",
        zIndex: 2000,
      }}
    />
  );
}
