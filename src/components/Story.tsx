"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { Ticker } from "./Ticker";
import { SIZES, VARIANTS } from "@/lib/build";
import { PALETTES } from "@/lib/palettes";
import {
  DEFAULT_PRINTER_ID,
  estimate,
  materialById,
  printerById,
  qualityById,
} from "@/lib/print";
import { printableParts } from "@/lib/parts";
import type { BuiltMesh, Variant } from "@/lib/types";

const EASE = [0.16, 1, 0.3, 1] as const;

/** The finishes the story walks through, in the order the dock lists them. */
const FINISHES = PALETTES.slice(0, 4);

export interface SceneState {
  variant: Variant;
  paletteId: string;
}

/**
 * One panel of the story.
 *
 * Each panel owns a scene state, and claims it while it is the panel in front
 * of you. That is the whole mechanism: the object is not animated by scroll
 * position, it is told what to be, and its own build animation carries it
 * there. Tying the geometry to a scroll offset would mean rebuilding the mesh
 * on every frame of a flick, and would leave the object mid-morph whenever a
 * scroll stopped between two panels.
 */
function Panel({
  id,
  applyVariant,
  applyPalette,
  chapter,
  onEnter,
  onChapter,
  children,
  className = "",
}: {
  id?: string;
  /**
   * What this panel claims, one dimension at a time and as plain values.
   * Passing an object here instead made a fresh identity on every render of
   * the story, so the effect below fired continuously and stamped the scrolled
   * state over anything a pointer was previewing.
   */
  applyVariant?: Variant;
  applyPalette?: string;
  /** Which of the three headings this panel belongs under, for the rail. */
  chapter?: Chapter;
  onEnter: (next: Partial<SceneState>) => void;
  onChapter?: (chapter: Chapter) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  // Half the panel, measured against the middle of the screen: the state
  // changes as a panel takes the frame, not as its first pixel appears.
  const inView = useInView(ref, { amount: 0.5 });

  useEffect(() => {
    if (!inView) return;
    if (applyVariant) onEnter({ variant: applyVariant });
    if (applyPalette) onEnter({ paletteId: applyPalette });
    if (chapter) onChapter?.(chapter);
  }, [inView, applyVariant, applyPalette, chapter, onEnter, onChapter]);

  return (
    <section
      ref={ref}
      id={id}
      // The copy floats over the stage rather than covering it: the object is
      // draggable everywhere the page is not actually offering a control, so
      // the panels pass their pointer events straight through to the canvas.
      className={`pointer-events-none relative flex min-h-svh snap-start flex-col items-center justify-end px-6 pt-24 pb-[12vh] min-[900px]:min-h-0 min-[900px]:items-start min-[900px]:justify-center min-[900px]:px-[max(3rem,6vw)] min-[900px]:pb-0 ${className}`}
    >
      <motion.div
        className="w-full max-w-[min(36rem,88vw)] min-[900px]:max-w-[34rem]"
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.55, once: false }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        {children}
      </motion.div>
    </section>
  );
}

function Step({ index, label }: { index: string; label: string }) {
  return (
    <p className="mb-4 flex items-center gap-3 text-[0.6rem] tracking-[0.24em] uppercase text-dim">
      <span className="text-accent">{index}</span>
      {label}
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-[family-name:var(--font-display)] text-[clamp(1.5rem,3.6vw,2.3rem)] leading-[1.08] tracking-[-0.03em] text-fog">
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[30rem] text-[0.82rem] leading-relaxed text-mute">{children}</p>;
}

/**
 * The row of names for a set, with the one the object is wearing marked.
 *
 * These were labels. They are controls now: pointing at one puts it on the
 * object for as long as you are pointing, and pressing it keeps it. A list of
 * four finishes next to an object wearing one of them is an invitation to try
 * the other three, and refusing that invitation to keep the row decorative
 * would be the wrong kind of restraint.
 */
function Marks({
  items,
  activeId,
  onPreview,
  onPick,
}: {
  items: { id: string; name: string }[];
  activeId: string;
  onPreview: (id: string | null) => void;
  onPick: (id: string) => void;
}) {
  return (
    <ul
      className="pointer-events-auto mt-7 flex flex-wrap gap-x-1 gap-y-1 text-[0.62rem] tracking-[0.2em] uppercase"
      onPointerLeave={() => onPreview(null)}
    >
      {items.map((item) => {
        const on = item.id === activeId;
        return (
          <li key={item.id}>
            <button
              type="button"
              onPointerEnter={(e) => {
                if (e.pointerType === "touch") return;
                onPreview(item.id);
              }}
              onFocus={() => onPreview(item.id)}
              onBlur={() => onPreview(null)}
              onClick={() => onPick(item.id)}
              aria-pressed={on}
              // Buttons do not inherit text-transform: the browser sets it to none.
              className="group -mx-1 flex items-center gap-2 rounded-[3px] px-2 py-1.5 uppercase"
            >
              <motion.span
                aria-hidden
                className="h-1 w-1 rounded-full"
                animate={{
                  backgroundColor: on ? "var(--color-accent)" : "var(--color-edge)",
                  scale: on ? 1.5 : 1,
                }}
                transition={{ duration: 0.32, ease: EASE }}
              />
              <motion.span
                className="transition-colors duration-150 group-hover:text-fog"
                animate={{ color: on ? "var(--color-fog)" : "var(--color-dim)" }}
                transition={{ duration: 0.32, ease: EASE }}
              >
                {item.name}
              </motion.span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const CHAPTERS = [
  { id: "form", index: "01", label: "Form" },
  { id: "finish", index: "02", label: "Finish" },
  { id: "print", index: "03", label: "Print" },
] as const;

type Chapter = (typeof CHAPTERS)[number]["id"];

/**
 * Where you are in the story, and a way to skip to the part you came for.
 *
 * Eight panels of scrolling with no map is a corridor. This is the map, and it
 * stays out of the way: three lines on the right margin, only once the hero
 * has been left behind.
 */
function Rail({ active }: { active: Chapter | null }) {
  return (
    <motion.div
      className="pointer-events-none fixed right-[max(1.6rem,3vw)] top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-4 min-[900px]:flex"
      // Nothing to be in the middle of until the hero has been left behind.
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      inert={!active}
    >
      {CHAPTERS.map((chapter) => {
        const on = chapter.id === active;
        return (
          <button
            key={chapter.id}
            type="button"
            onClick={() =>
              document.getElementById(`story-${chapter.id}`)?.scrollIntoView({ behavior: "smooth" })
            }
            className="pointer-events-auto group flex items-center justify-end gap-3 text-[0.55rem] tracking-[0.24em] uppercase"
          >
            <motion.span
              className="text-right transition-colors duration-150 group-hover:text-fog"
              animate={{
                color: on ? "var(--color-fog)" : "var(--color-dim)",
                opacity: on ? 1 : 0.55,
              }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {chapter.label}
            </motion.span>
            <motion.span
              aria-hidden
              className="block h-px"
              animate={{
                width: on ? 26 : 12,
                backgroundColor: on ? "var(--color-accent)" : "var(--color-edge)",
              }}
              transition={{ duration: 0.36, ease: EASE }}
            />
          </button>
        );
      })}
    </motion.div>
  );
}

/**
 * What is under the hero: the same object, told what to be by whichever panel
 * has the screen. The landing used to end at the fold with a claim and a
 * field, and everything that answers "what do I actually get" lived behind a
 * build nobody had run yet.
 */
export function Story({
  mesh,
  state,
  onState,
  onPreview,
  onTop,
}: {
  /** The object as currently built, so the print figures describe what is shown. */
  mesh: BuiltMesh;
  state: SceneState;
  onState: (next: Partial<SceneState>) => void;
  /** A form or a finish held up to the object without committing to it. */
  onPreview: (next: Partial<SceneState> | null) => void;
  /** Back to the field at the top, focused and ready to be typed into. */
  onTop: () => void;
}) {
  const [chapter, setChapter] = useState<Chapter | null>(null);

  const printer = printerById(DEFAULT_PRINTER_ID);
  const material = materialById("pla");

  const numbers = useMemo(
    () => estimate(printableParts(mesh), material, qualityById("standard"), printer),
    [mesh, material, printer],
  );

  const shelf = SIZES.find((s) => s.id === "shelf") ?? SIZES[1];

  return (
    <div className="pointer-events-none relative z-20">
      <Rail active={chapter} />
      <Panel
        id="story-form"
        chapter="form"
        onChapter={setChapter}
        applyVariant="skyline"
        onEnter={onState}
        className="min-[900px]:min-h-[88svh]"
      >
        <Step index="01" label="Form" />
        <Title>Four ways to read the same year.</Title>
        <Body>
          A skyline is the contribution graph stood up, one tower per day. The
          others fold the same 365 numbers differently, and each one prints
          without supports.
        </Body>
        <Marks
          items={VARIANTS}
          activeId={state.variant}
          onPreview={(id) => onPreview(id ? { variant: id as Variant } : null)}
          onPick={(id) => onState({ variant: id as Variant })}
        />
      </Panel>

      {VARIANTS.slice(1).map((form) => (
        <Panel
          key={form.id}
          chapter="form"
          onChapter={setChapter}
          applyVariant={form.id}
          onEnter={onState}
          className="min-[900px]:min-h-[72svh]"
        >
          <p className="text-[0.62rem] tracking-[0.24em] uppercase text-dim">{form.name}</p>
          <p className="mt-3 text-[0.95rem] text-mute">{form.blurb}.</p>
        </Panel>
      ))}

      <Panel
        id="story-finish"
        chapter="finish"
        onChapter={setChapter}
        applyPalette={FINISHES[0].id}
        onEnter={onState}
        className="min-[900px]:min-h-[88svh]"
      >
        <Step index="02" label="Finish" />
        <Title>Pick what it is made of.</Title>
        <Body>
          Every finish is a filament you can buy, and the exported kit names the
          one you chose. The colour is not a render trick: the object is sliced
          in four shades, one per intensity of the graph.
        </Body>
        <Marks
          items={FINISHES}
          activeId={state.paletteId}
          onPreview={(id) => onPreview(id ? { paletteId: id } : null)}
          onPick={(id) => onState({ paletteId: id })}
        />
      </Panel>

      {FINISHES.slice(1).map((finish) => (
        <Panel
          key={finish.id}
          chapter="finish"
          onChapter={setChapter}
          applyPalette={finish.id}
          onEnter={onState}
          className="min-[900px]:min-h-[72svh]"
        >
          <p className="text-[0.62rem] tracking-[0.24em] uppercase text-dim">{finish.name}</p>
          <p className="mt-3 text-[0.95rem] text-mute">{finish.note}.</p>
        </Panel>
      ))}

      <Panel
        id="story-print"
        chapter="print"
        onChapter={setChapter}
        onEnter={onState}
        className="min-[900px]:min-h-[112svh]"
      >
        <Step index="03" label="Print" />
        <Title>It is a real print, with real numbers.</Title>
        <Body>
          Sliced in Bambu Studio on the profile the kit ships: {shelf.mm} mm,{" "}
          {material.name}, a 0.4 mm nozzle at 0.16 mm layers, on a{" "}
          {printer.name}. Nothing here is a placeholder.
        </Body>

        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-6">
          {[
            {
              // The same span the print sheet quotes. A single figure would be
              // the estimator's low end presented as a promise.
              term: "Print time",
              value: (
                <span className="whitespace-nowrap">
                  <Ticker value={numbers.hoursLow} format={(n) => n.toFixed(1)} />
                  <span className="text-mute"> to </span>
                  <Ticker value={numbers.hoursHigh} format={(n) => `${n.toFixed(1)} h`} />
                </span>
              ),
            },
            {
              term: "Filament",
              value: <Ticker value={numbers.grams} format={(n) => `${Math.round(n)} g`} />,
            },
            {
              term: "Cost",
              value: (
                <Ticker
                  value={numbers.filamentCost}
                  format={(n) => `€${n.toFixed(2)}`}
                />
              ),
            },
            {
              term: "Triangles",
              value: <Ticker value={mesh.triangles} />,
            },
          ].map((row) => (
            <div key={row.term}>
              <dt className="text-[0.58rem] tracking-[0.2em] uppercase text-dim">{row.term}</dt>
              <dd className="mt-2 font-[family-name:var(--font-display)] text-[clamp(1.2rem,2.6vw,1.7rem)] tracking-[-0.02em] text-fog">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-[0.72rem] leading-relaxed text-dim">
          Downloads a 3MF with the colours already assigned, an STL, and a
          preset for {printer.name} and Orca.
        </p>
      </Panel>

      <Panel onEnter={onState} className="min-[900px]:min-h-[95svh]">
        <Title>Now do it with your year.</Title>
        <button
          type="button"
          onClick={onTop}
          className="group mt-6 flex items-center gap-3 text-[0.72rem] tracking-[0.2em] uppercase text-accent"
        >
          <span className="hairline rounded-[3px] px-2 py-1 leading-none transition-colors duration-150 group-hover:border-accent">
            ↑
          </span>
          <span className="transition-opacity duration-150 group-hover:opacity-70">
            Type a handle
          </span>
        </button>
        <p className="mt-8 text-[0.62rem] tracking-[0.18em] uppercase text-dim">
          No account · no upload · no charge
        </p>
      </Panel>
    </div>
  );
}
