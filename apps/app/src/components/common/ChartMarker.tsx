// Last-value marker for line/area charts: a short dashed line from the latest point to the price
// axis and a filled tag on that (right-hand) axis. Use it as a <ReferenceLine label={...}>, directly in the
// chart: Recharts 2 only sees chart children that are its own elements (no wrappers or fragments).

/** Extra room after the last point so the line stops short of the price axis. */
export const timeDomainWithGap = (times: number[], gap = 0.05): [number, number] => {
  if (!times.length) return [0, 1];
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  return [lo, hi + Math.max((hi - lo) * gap, 1)];
};

/** ReferenceLine segment from the last point to the right edge of a timeDomainWithGap domain. */
export const tailSegment = (times: number[], value: number, gap = 0.05) => {
  const [, hi] = timeDomainWithGap(times, gap);
  return [{ x: times[times.length - 1] ?? hi, y: value }, { x: hi, y: value }];
};

type ViewBox = { x?: number; y?: number; width?: number };

/** Label renderer for a horizontal ReferenceLine: a tag just right of the plot, over the axis. */
export function axisTag(color: string, text: string, axisWidth: number) {
  return function AxisTag({ viewBox }: { viewBox?: ViewBox }) {
    const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) + 2;
    const y = viewBox?.y ?? 0;
    const w = Math.max(axisWidth - 4, 24);
    return (
      <g>
        <rect x={x} y={y - 10} width={w} height={20} rx={5} fill={color} />
        <text x={x + 6} y={y + 4} fill="#FFFFFF" fontSize={11} fontWeight={600}>
          {text}
        </text>
      </g>
    );
  };
}
