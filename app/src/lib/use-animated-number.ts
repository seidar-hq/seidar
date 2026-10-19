"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smooth number transitions: animates from the currently shown value to each
 * new target with an ease-out cubic over `ms`. A `null` target never clears
 * the display — the last known value keeps showing (no 0/— flashes while a
 * refetch is in flight or fails). When `resetKey` changes (wallet switch or
 * disconnect), the display snaps to the target instantly instead of gliding.
 */
export function useAnimatedNumber(
  target: number | null,
  ms = 700,
  resetKey?: string | null,
): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const shownRef = useRef<number | null>(target);
  const keyRef = useRef(resetKey);
  useEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      shownRef.current = target;
      setShown(target);
      return;
    }
    if (target == null || !Number.isFinite(target)) return;
    const from = shownRef.current;
    if (from == null || !Number.isFinite(from)) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    if (from === target) {
      if (shown !== target) setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      shownRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms, resetKey]);
  return shown;
}
