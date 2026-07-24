"use client";

import { AnimatePresence, motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface ForgeStep {
  label: string;
  value: string;
}

export function Forge({
  steps,
  progress,
  visible,
}: {
  steps: ForgeStep[];
  progress: number;
  visible: boolean;
}) {
  const current = steps[steps.length - 1];
  const history = steps.slice(Math.max(0, steps.length - 4), steps.length - 1);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.34, ease: EASE }}
        >
          <div className="w-full max-w-[min(34rem,88vw)]">
            <div className="mb-3 flex flex-col gap-1.5">
              {history.map((s, i) => (
                <motion.div
                  key={s.label}
                  className="flex items-baseline gap-4 text-[0.72rem] tracking-[0.16em] uppercase text-dim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.45 - (history.length - 1 - i) * 0.11 }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="w-[12ch] shrink-0">{s.label}</span>
                  <span className="truncate">{s.value}</span>
                </motion.div>
              ))}
            </div>

            <div className="flex items-baseline gap-4 text-[0.86rem] tracking-[0.16em] uppercase">
              <span className="w-[12ch] shrink-0 text-mute">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={current?.label}
                    className="inline-block"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    {current?.label}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="min-w-0 flex-1 truncate text-fog">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={current?.value}
                    className="inline-block"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    {current?.value}
                  </motion.span>
                </AnimatePresence>
              </span>
            </div>

            <div className="relative mt-5 h-px w-full overflow-hidden bg-line">
              <motion.div
                className="absolute inset-y-0 left-0 bg-accent"
                initial={{ width: "0%" }}
                animate={{ width: `${Math.round(progress * 100)}%` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
              <div
                className="absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-transparent via-white/45 to-transparent"
                style={{ animation: "sweep 1.5s var(--ease-out-strong) infinite" }}
              />
            </div>

            <div className="mt-2.5 flex justify-end text-[0.68rem] tabular-nums tracking-[0.2em] text-dim">
              {String(Math.round(progress * 100)).padStart(3, "0")}%
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
