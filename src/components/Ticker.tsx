"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Counts to a value instead of snapping to it. Writes straight to the DOM so a
 * row of these does not push sixty re-renders a second through React.
 */
export function Ticker({
  value,
  duration = 0.9,
  format = (n: number) => Math.round(n).toLocaleString("en-GB"),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced) {
      node.textContent = format(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v);
      },
      onComplete: () => {
        from.current = value;
      },
    });
    return () => controls.stop();
  }, [value, duration, format, reduced]);

  return <span ref={ref} className={className} suppressHydrationWarning />;
}
