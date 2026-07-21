"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LOGIN_RE, normaliseLogin } from "@/lib/contributions";
import { play } from "@/lib/sound";
import { useMediaQuery } from "@/lib/useMediaQuery";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Real accounts, so the example is something you can actually press. */
const EXAMPLES = ["noluyorAbi", "mvritz"];

/** Typing. Averages, because a fixed interval reads as a machine. */
const TYPE_MS = 92;
const TYPE_JITTER = 58;
/** Roughly one keystroke in eight lands after a beat of thought. */
const PAUSE_CHANCE = 0.13;
const PAUSE_MS = 210;

/** Deleting. A backspace starts deliberate and runs away with itself. */
const DELETE_SLOW_MS = 125;
const DELETE_FAST_MS = 32;

const HOLD_FULL_MS = 2000;
const HOLD_EMPTY_MS = 480;

/**
 * Types an example handle into the placeholder, holds it, deletes it and moves
 * to the next. An empty box does not tell you what belongs in it; watching one
 * fill itself in does, without spending the field, which stays yours to type
 * into the moment you touch it.
 *
 * The timings are jittered rather than fixed. At a constant interval the eye
 * reads a marquee; at a varying one it reads someone typing.
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

    const typeDelay = () =>
      TYPE_MS +
      (Math.random() - 0.4) * TYPE_JITTER +
      (Math.random() < PAUSE_CHANCE ? PAUSE_MS : 0);

    const tick = () => {
      const target = EXAMPLES[word];
      if (!deleting) {
        count += 1;
        setShown(target.slice(0, count));
        if (count === target.length) {
          deleting = true;
          timer = window.setTimeout(tick, HOLD_FULL_MS);
          return;
        }
        timer = window.setTimeout(tick, typeDelay());
        return;
      }

      // Accelerating backspace: slowest at the first character removed,
      // fastest as the field empties.
      const left = count / target.length;
      count -= 1;
      setShown(target.slice(0, count));
      if (count === 0) {
        deleting = false;
        word = (word + 1) % EXAMPLES.length;
        timer = window.setTimeout(tick, HOLD_EMPTY_MS);
        return;
      }
      timer = window.setTimeout(tick, DELETE_FAST_MS + (DELETE_SLOW_MS - DELETE_FAST_MS) * left);
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
  /** Handed up so the story's closing call can put the caret back in here. */
  inputRef,
}: {
  onSubmit: (login: string) => void;
  error: string | null;
  hidden: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const field = inputRef ?? ownRef;
  const hint = useTypedHint(!hidden);

  useEffect(() => {
    if (!hidden) field.current?.focus();
  }, [hidden, field]);

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
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-end px-6 pb-[14vh] min-[900px]:items-start min-[900px]:justify-center min-[900px]:px-[max(3rem,6vw)] min-[900px]:pb-0"
      animate={{ opacity: hidden ? 0 : 1, filter: hidden ? "blur(6px)" : "blur(0px)" }}
      transition={{ duration: hidden ? 0.32 : 0.5, ease: EASE }}
      style={{ pointerEvents: hidden ? "none" : undefined }}
      aria-hidden={hidden}
      // Kept mounted for the blur transition, so it has to be taken out of the
      // tab order too. Without this, tabbing after a build lands on an
      // invisible input inside an aria-hidden subtree.
      inert={hidden}
    >
      {/* One column, one alignment axis. The headline used to be centred over a
        left aligned field, which left the two reading as separate screens. */}
      <div className="relative w-full max-w-[min(36rem,88vw)] min-[900px]:max-w-[34rem]">
        {/* On a narrow screen the object still passes under this copy, so the
          copy carries its own darkness. A soft ellipse rather than a panel, so
          there is no edge to notice. Wide, the object has its own column and
          the scrim would only grey out the page for nothing. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-16 -inset-y-12 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(6,7,8,0.94)_38%,rgba(6,7,8,0.62)_66%,transparent_100%)] min-[900px]:opacity-45"
        />
        <motion.p
          className="mb-5 text-[0.62rem] tracking-[0.24em] uppercase text-dim"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          A year of commits, as a printable object
        </motion.p>

        <motion.h1
          className="mb-9 font-[family-name:var(--font-display)] text-[clamp(1.9rem,5.2vw,3.1rem)] leading-[1.04] tracking-[-0.035em] text-fog"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
        >
          Your commit year,
          <br />
          <span className="text-mute">cast as an object.</span>
        </motion.h1>

      <motion.div
        className="pointer-events-auto w-full"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.14 }}
      >
        <div className="flex items-baseline gap-0 text-[clamp(1.05rem,3.4vw,1.6rem)]">
          <span className="select-none text-dim">github.com/</span>
          <span className="relative min-w-0 flex-1">
            <input
              ref={field}
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
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="GitHub handle"
              // While the field is empty the browser caret sits at position
              // zero, in front of the hint being typed, which reads as two
              // cursors arguing. The drawn caret rides the hint instead, and
              // the real one takes over with the first character.
              className={`w-full text-fog ${
                value === ""
                  ? "[caret-color:transparent]"
                  : "[caret-color:var(--color-accent)]"
              }`}
            />
            {/* The hint used to be a placeholder string ending in a block
              character, which rendered as a dead grey slab. This is a drawn
              caret instead: a thin accent bar that blinks like the real one
              the field shows once focused, and steps aside for it on focus.
              Between two examples the hint is empty for a beat, and the beat
              shows only the caret, so it never reads as a third example. */}
            {value === "" && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden whitespace-nowrap text-dim"
              >
                {hint}
                <span className="caret ml-px inline-block h-[1.1em] w-[2px] shrink-0 bg-accent motion-reduce:animate-none" />
              </span>
            )}
          </span>
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
                    // The two accounts on the page that can be pressed. They
                    // used to be underlined text that changed colour, which is
                    // what a link does; these fill the field and build, so they
                    // lift very slightly to say they are buttons.
                    className="inline-block normal-case tracking-normal text-mute underline decoration-edge underline-offset-4 transition-all duration-150 hover:-translate-y-px hover:text-fog hover:decoration-accent active:translate-y-0"
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
        <motion.div
          className="mt-9 flex flex-col gap-3 border-t border-line pt-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.28 }}
        >
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[0.62rem] tracking-[0.14em] uppercase text-dim">
            {["3MF, STL and a slicer preset", "no account, no upload", "free"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
          {/* The spread, not one machine's midpoint. Bambu Studio's own slices
            of the 180 mm skyline of a real year: about five hours on a stock
            A1, 4h00 on a P1S, and a fast X1C profile lands near two. Quoting
            only the A1 figure overstated a core-XY machine by roughly double.
            The 22 g and sixty cents hold across all of them. */}
          <p className="text-[0.72rem] leading-relaxed text-mute">
            A 180 mm shelf piece uses about 22 g of filament, around sixty
            cents. Printing takes two to six hours depending on the machine,
            the nozzle and the layer height.
          </p>
        </motion.div>
      </motion.div>
      </div>
    </motion.div>
  );
}
