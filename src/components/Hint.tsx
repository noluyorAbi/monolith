"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

interface At {
  /** Distance from whichever window edge `align` names. */
  x: number;
  y: number;
  below: boolean;
  /**
   * Which edge the label lines up with. Centring on the control is the nicest
   * of the three and the wrong one at the ends of a row: the wordless controls
   * that need a label most sit at the right end of the dock, where half of a
   * centred label hangs off the screen.
   */
  align: "left" | "centre" | "right";
}

/**
 * A label for a control that cannot say what it is in the space it has.
 *
 * The dock used the browser's own `title`, which waits about a second, renders
 * in the operating system's font, cannot be styled, and never appears on a
 * touch device or for a keyboard user. Two of the controls it was explaining
 * are single glyphs, so in practice they were unexplained.
 *
 * Rendered into the body rather than beside the trigger: the dock scrolls
 * sideways on a narrow screen, and anything positioned inside that scroller is
 * clipped by it.
 */
export function Hint({
  label,
  children,
  delay = 140,
}: {
  label: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const [at, setAt] = useState<At | null>(null);

  const place = useCallback(() => {
    const box = anchor.current?.firstElementChild?.getBoundingClientRect();
    if (!box) return;
    // Above by default. Near the top of the window there is no room, so it
    // drops under the control rather than off the screen.
    const below = box.top < 72;
    const edge = window.innerWidth * 0.26;
    const align = box.right > window.innerWidth - edge ? "right" : box.left < edge ? "left" : "centre";
    setAt({
      x:
        align === "right"
          ? window.innerWidth - box.right
          : align === "left"
            ? box.left
            : box.left + box.width / 2,
      y: below ? box.bottom + 10 : box.top - 10,
      below,
      align,
    });
  }, []);

  const open = useCallback(
    (wait: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(place, wait);
    },
    [place],
  );

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    setAt(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <span
        ref={anchor}
        className="contents"
        onPointerEnter={(e) => {
          if (e.pointerType === "touch") return;
          open(delay);
        }}
        onPointerLeave={close}
        onPointerDown={close}
        // Keyboard users get it without the wait: they cannot hover to ask.
        onFocus={() => open(0)}
        onBlur={close}
      >
        {children}
      </span>

      {typeof document === "undefined"
        ? null
        : createPortal(
            <AnimatePresence>
              {at && (
                <motion.span
                  aria-hidden
                  role="presentation"
                  className="pointer-events-none fixed z-[80] whitespace-nowrap rounded-[4px] border border-line bg-ink/95 px-2 py-1 text-[0.55rem] tracking-[0.16em] uppercase text-mute shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm"
                  style={{
                    left: at.align === "right" ? undefined : at.x,
                    right: at.align === "right" ? at.x : undefined,
                    top: at.y,
                    transform: `translate(${at.align === "centre" ? "-50%" : "0"}, ${
                      at.below ? "0" : "-100%"
                    })`,
                  }}
                  initial={{ opacity: 0, y: at.below ? -3 : 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: at.below ? -3 : 3 }}
                  transition={{ duration: 0.16, ease: EASE }}
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>,
            document.body,
          )}
    </>
  );
}
