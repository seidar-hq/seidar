"use client";

import type { CSSProperties } from "react";

const SPOKES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Activity spinner: 12 fading spokes (iOS-style activity indicator).
 *  Bars are real elements (not pseudo-elements) so every renderer paints
 *  them identically. Use next to any loading text, anywhere:
 *  <LoadingMark size={14} />. */
export function LoadingMark({ size = 16 }: { size?: number }) {
  return (
    <span
      className="load-mark"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      {SPOKES.map((i) => (
        <i key={i} style={{ "--i": i } as CSSProperties} aria-hidden="true">
          <b aria-hidden="true" />
        </i>
      ))}
    </span>
  );
}
