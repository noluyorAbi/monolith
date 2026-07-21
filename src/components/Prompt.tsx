"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LOGIN_RE, normaliseLogin } from "@/lib/contributions";
import { play } from "@/lib/sound";
import { useMediaQuery } from "@/lib/useMediaQuery";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Real accounts, so the example is something you can actually press. */
const EXAMPLES = ["noluyorAbi", "mvritz"];

const TYPE_MS = 90;
const DELETE_MS = 45;
const HOLD_MS = 1800;

/**
 * Types an example handle into the placeholder, holds it, deletes it and moves
 * to the next. An empty box does not tell you what belongs in it; watching one
 * fill itself in does, without spending the field, which stays yours to type
 * into the moment you touch it.
 */
function useTypedHint(active: boolean): string {
  const [shown, setShown] = useState("");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    if (!active || reduced) return;
    let timer = 0;
    let word = 0;
    let count = 0;
    let deleting = false;

    const tick = () => {
      const target = EXAMPLES[word];
      if (!deleting) {
        count += 1;
        setShown(target.slice(0, count));
        if (count === target.length) {
          deleting = true;
          timer = window.setTimeout(tick, HOLD_MS);
          return;
        }
        timer = window.setTimeout(tick, TYPE_MS);
        return;
      }
      count -= 1;
      setShown(target.slice(0, count));
      if (count === 0) {
        deleting = false;
        word = (word + 1) % EXAMPLES.length;
      }
      timer = window.setTimeout(tick, count === 0 ? 420 : DELETE_MS);
    };

    timer = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timer);
  }, [active, reduced]);

  // Reduced motion still needs the example, just without it moving.
  return reduced ? EXAMPLES[0] : shown;
}

export function Prompt({
  onSubmit,
  error,
  hidden,
}: {
  onSubmit: (login: string) => void;
  error: string | null;
  hidden: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hint = useTypedHint(!hidden);

  useEffect(() => {
    if (!hidden) inputRef.current?.focus();
  }, [hidden]);

  const clean = normaliseLogin(value);
  const valid = LOGIN_RE.test(clean);

  function submit() {
    if (!valid) {
      play("error");
      return;
    }
    play("lock");
    onSubmit(clean);
  }

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6"
      animate={{ opacity: hidden ? 0 : 1, filter: hidden ? "blur(6px)" : "blur(0px)" }}
      transition={{ duration: hidden ? 0.32 : 0.5, ease: EASE }}
      style={{ pointerEvents: hidden ? "none" : undefined }}
      aria-hidden={hidden}
      // Kept mounted for the blur transition, so it has to be taken out of the
      // tab order too. Without this, tabbing after a build lands on an
      // invisible input inside an aria-hidden subtree.
      inert={hidden}
    >
      <motion.h1
        className="mb-10 max-w-[22ch] text-center font-[family-name:var(--font-display)] text-[clamp(1.6rem,4.4vw,2.9rem)] leading-[1.08] tracking-[-0.03em] text-fog"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
      >
        Your commit year,
        <br />
        <span className="text-mute">cast as an object.</span>
      </motion.h1>

      <motion.div
        className="pointer-events-auto w-full max-w-[min(34rem,88vw)]"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.14 }}
      >
        <div className="flex items-baseline gap-0 text-[clamp(1.05rem,3.4vw,1.6rem)]">
          <span className="select-none text-dim">github.com/</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              if (next.length > value.length) play("tick");
              setValue(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={hint ? `${hint}\u2588` : "handle"}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="GitHub handle"
            className="min-w-0 flex-1 text-fog [caret-color:var(--color-accent)]"
          />
        </div>

        <div className="relative mt-3 h-px w-full bg-edge">
          <motion.div
            className="absolute inset-0 origin-center bg-accent"
            initial={false}
            animate={{ scaleX: focused ? 1 : 0, opacity: focused ? 1 : 0 }}
            transition={{ duration: 0.42, ease: EASE }}
          />
        </div>

        <div className="mt-3 flex h-5 items-center justify-between text-[0.7rem] tracking-[0.14em] uppercase">
          <AnimatePresence mode="wait" initial={false}>
            {error ? (
              <motion.span
                key={error}
                className="text-danger"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {error}
              </motion.span>
            ) : (
              <motion.span
                key="hint"
                className="text-dim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                try
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {!valid && (
              <motion.span
                key="examples"
                className="flex items-center gap-2 text-dim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24, ease: EASE }}
              >
                {EXAMPLES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      play("lock");
                      setValue(name);
                      onSubmit(name);
                    }}
                    className="normal-case tracking-normal text-mute underline decoration-edge underline-offset-4 transition-colors duration-150 hover:text-fog hover:decoration-mute"
                  >
                    {name}
                  </button>
                ))}
              </motion.span>
            )}
            {valid && (
              <motion.button
                type="button"
                onClick={submit}
                className="flex items-center gap-2 text-accent transition-opacity duration-150 hover:opacity-70 active:scale-[0.97]"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.24, ease: EASE }}
              >
                <span className="hairline rounded-[3px] px-1.5 py-0.5 leading-none">↵</span>
                build
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <motion.ul
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.62rem] tracking-[0.14em] uppercase text-dim sm:justify-start"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.28 }}
        >
          {[
            "3MF, STL and a slicer preset",
            "no account, no upload",
            "source available, noncommercial",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}
