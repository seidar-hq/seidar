"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Gliding page scroll for wheel, trackpad and touch (syncTouch: a swipe eases out like the wheel
// instead of the phone's own fling). Nested scroll areas (tables, the agent chat) scroll natively,
// and anything inside a MUI dialog, menu or popover is left alone so their scroll locks keep working.
const OVERLAY = ".MuiModal-root, .MuiPopover-root, .MuiPopper-root, .MuiDialog-root, [data-lenis-prevent]";

export default function SmoothScroll() {
  const lenis = useRef<Lenis | null>(null);
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
    return () => {
      l.destroy();
      lenis.current = null;
    };
  }, []);

  // New page: start at the top without gliding there.
  useEffect(() => {
    lenis.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
