"use client";

import { useEffect, useRef } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * The stipple behind everything, plus a small pool of light that follows the
 * pointer through it.
 *
 * The dots were a flat field at forty percent, which is a texture; a texture
 * does nothing when you move. Lighting a disc of them under the pointer costs
 * one masked copy of the same background and turns the page into something
 * that notices you. It lags the pointer deliberately, because a light that
 * tracks exactly reads as a cursor rather than as a lamp being carried.
 *
 * Written straight to CSS variables from a frame loop. Routing a pointer
 * position through React state would re-render the whole landing at the
 * refresh rate to move a gradient.
 */
export function CursorField() {
  const lit = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const fine = useMediaQuery("(pointer: fine)");

  useEffect(() => {
    if (reduced || !fine) return;
    const nodes = [lit.current, glow.current].filter(Boolean) as HTMLDivElement[];
    if (!nodes.length) return;

    let x = window.innerWidth * 0.7;
    let y = window.innerHeight * 0.5;
    let toX = x;
    let toY = y;
    let raf = 0;
    let seen = false;

    const frame = () => {
      x += (toX - x) * 0.12;
      y += (toY - y) * 0.12;
      for (const node of nodes) {
        node.style.setProperty("--x", `${x}px`);
        node.style.setProperty("--y", `${y}px`);
      }
      raf = requestAnimationFrame(frame);
    };

    const move = (e: PointerEvent) => {
      toX = e.clientX;
      toY = e.clientY;
      if (seen) return;
      seen = true;
      // First sighting: put the light where the pointer already is rather than
      // sliding it across the page from wherever it was parked.
      x = toX;
      y = toY;
      for (const node of nodes) node.style.opacity = "1";
    };

    const leave = () => {
      for (const node of nodes) node.style.opacity = "0";
      seen = false;
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [reduced, fine]);

  return (
    <>
      <div className="field pointer-events-none fixed inset-0 z-10 opacity-40" />
      <div
        ref={lit}
        aria-hidden
        className="field pointer-events-none fixed inset-0 z-10 opacity-0 transition-opacity duration-500"
        style={{
          maskImage:
            "radial-gradient(15rem circle at var(--x) var(--y), #000 0%, rgba(0,0,0,0.35) 45%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(15rem circle at var(--x) var(--y), #000 0%, rgba(0,0,0,0.35) 45%, transparent 72%)",
        }}
      />
      <div
        ref={glow}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 opacity-0 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(22rem circle at var(--x) var(--y), rgba(215,255,69,0.045), rgba(215,255,69,0.012) 40%, transparent 70%)",
        }}
      />
    </>
  );
}
