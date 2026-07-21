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
import { PROJECT } from "@/lib/project";
import type { BuiltMesh, Variant } from "@/lib/types";

const EASE = [0.16, 1, 0.3, 1] as const;

/** The finishes the story walks through, in the order the dock lists them. */
const FINISHES = PALETTES.slice(0, 4);

/**
 * What each panel says about its form, beyond the one-line blurb the dock
 * shows. The fact line states only what the geometry does; anything about how
 * it prints belongs to the print chapter, which has real numbers to back it.
 */
const FORM_COPY: Record<Variant, { body: string; fact: string }> = {
  skyline: {
    body: "The contribution graph stood up, one tower per day.",
    fact: "365 towers · one per day",
  },
  ring: {
    body: "The year curls until the last week lands beside the first and the loop closes. From above, twelve months in one glance.",
    fact: "week 52 meets week 01",
  },
  wave: {
    body: "The same days smoothed into a single terrain. Ridges where you shipped, valleys where you rested.",
    fact: "one unbroken surface",
  },
  spine: {
    body: "Each month collapsed into a single tower. The coarsest read of a year, and the boldest one across a room.",
    fact: "one tower per month",
  },
};

/**
 * What each finish is like to live with. The ramp chips beside this copy are
 * the palette's own level colours, so the claim that the object is sliced in
 * four shades is shown rather than asserted.
 */
const FINISH_COPY: Record<string, string> = {
  signal: "The colours the graph already taught you, poured into filament.",
  obsidian:
    "Matte black on black. The graph survives as relief: you read the year by its shadows, not its colours.",
  bone: "Warm white over bone. The kind of object a museum shop would sell, except the shape is your year.",
  titanium:
    "Four greys under a brushed sheen, the closest a filament gets to machined metal.",
};

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
    <p className="mb-5 flex items-center gap-3 text-[0.6rem] tracking-[0.24em] uppercase text-dim">
      <span className="text-accent">{index}</span>
      {label}
      {/* The rule runs to the column's edge, so a chapter head reads as a
        heading with a margin rather than two words afloat in the void. */}
      <span aria-hidden className="ml-1 h-px flex-1 bg-line" />
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
 * A mid-chapter panel's copy, set like the engraved plate beside an exhibit:
 * a counter, a name in the display face, a sentence or two, and a hairline
 * holding the whole thing to a left edge. These panels used to be one caption
 * in a corner, which read as an empty screen whenever the object was between
 * two of them.
 */
function Plate({
  index,
  total,
  name,
  children,
}: {
  index: string;
  total: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l border-line pl-6 min-[900px]:pl-8">
      <p className="flex items-baseline gap-2 text-[0.58rem] tracking-[0.24em] uppercase">
        <span className="text-accent">{index}</span>
        <span className="text-dim">/ {total}</span>
      </p>
      <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.35rem,3vw,1.9rem)] leading-[1.1] tracking-[-0.025em] text-fog">
        {name}
      </h3>
      {children}
    </div>
  );
}

/**
 * The four level colours of a finish, straight from the palette the mesh is
 * actually sliced with. The finish chapter claims the colour is not a render
 * trick; these are the four filaments of that claim, shown instead of stated.
 */
function Shades({ ramp }: { ramp: readonly string[] }) {
  return (
    <div className="mt-6 flex items-center gap-1.5">
      {ramp.slice(1).map((shade, i) => (
        <motion.span
          key={shade}
          aria-hidden
          className="h-3.5 w-3.5 rounded-[2px]"
          style={{ background: shade, border: "1px solid rgba(255,255,255,0.14)" }}
          initial={{ opacity: 0, y: 5 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ amount: 0.6, once: false }}
          transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease: EASE }}
        />
      ))}
      <span className="ml-2 text-[0.55rem] tracking-[0.22em] uppercase text-dim">
        the four intensities
      </span>
    </div>
  );
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
  /** A swatch makes the dot the material's own colour rather than the accent. */
  items: { id: string; name: string; swatch?: string }[];
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
                  backgroundColor:
                    item.swatch ?? (on ? "var(--color-accent)" : "var(--color-edge)"),
                  opacity: item.swatch && !on ? 0.55 : 1,
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
  login,
  year,
  state,
  onState,
  onPreview,
  onTop,
}: {
  /** The object as currently built, so the print figures describe what is shown. */
  mesh: BuiltMesh;
  /** Whose year the shown object is, so the kit manifest names real files. */
  login: string;
  year: number;
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
  const quality = qualityById("standard");

  const numbers = useMemo(
    () => estimate(printableParts(mesh), material, quality, printer),
    [mesh, material, quality, printer],
  );

  const shelf = SIZES.find((s) => s.id === "shelf") ?? SIZES[1];

  // The same stem the download routes use, built from the object on screen, so
  // picking a different form upstream renames the files down here.
  const stem = `monolith-${login}-${year}-${state.variant}-${shelf.mm}mm`;
  const kitFiles = [
    { name: `${stem}.3mf`, role: "colours assigned" },
    { name: `${stem}.stl`, role: "raw geometry" },
    {
      name: `presets/MONOLITH ${quality.layerHeightMm.toFixed(2)}mm @BBL ${printer.presetSuffix}.json`,
      role: "slicer profile",
    },
    { name: "PRINT-ME.txt", role: "the numbers, on paper" },
  ];

  const finishOf = (id: string) => FINISHES.find((f) => f.id === id) ?? FINISHES[0];

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

      {VARIANTS.slice(1).map((form, i) => (
        <Panel
          key={form.id}
          chapter="form"
          onChapter={setChapter}
          applyVariant={form.id}
          onEnter={onState}
          className="min-[900px]:min-h-[72svh]"
        >
          <Plate index={`0${i + 2}`} total={`0${VARIANTS.length}`} name={form.name}>
            <p className="mt-3 max-w-[26rem] text-[0.85rem] leading-relaxed text-mute">
              {FORM_COPY[form.id].body}
            </p>
            <p className="mt-5 text-[0.58rem] tracking-[0.22em] uppercase text-dim">
              {FORM_COPY[form.id].fact}
            </p>
          </Plate>
        </Panel>
      ))}

      <Panel
        id="story-finish"
        chapter="finish"
        onChapter={setChapter}
        applyVariant="skyline"
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
        <Shades ramp={finishOf(state.paletteId).ramp} />
        <Marks
          items={FINISHES.map((f) => ({ id: f.id, name: f.name, swatch: f.ramp[3] }))}
          activeId={state.paletteId}
          onPreview={(id) => onPreview(id ? { paletteId: id } : null)}
          onPick={(id) => onState({ paletteId: id })}
        />
      </Panel>

      {FINISHES.slice(1).map((finish, i) => (
        <Panel
          key={finish.id}
          chapter="finish"
          onChapter={setChapter}
          // Each finish arrives on a different form, so by the end of the
          // chapter every colourway has been seen on more than the skyline
          // and every form has been seen in more than green.
          applyVariant={VARIANTS[i + 1].id}
          applyPalette={finish.id}
          onEnter={onState}
          className="min-[900px]:min-h-[72svh]"
        >
          <Plate index={`0${i + 2}`} total={`0${FINISHES.length}`} name={finish.name}>
            <p className="mt-3 max-w-[26rem] text-[0.85rem] leading-relaxed text-mute">
              {FINISH_COPY[finish.id] ?? finish.note}
            </p>
            <Shades ramp={finish.ramp} />
          </Plate>
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
          {material.name}, a 0.4 mm nozzle at {quality.layerHeightMm} mm layers,
          on a {printer.name}. That is the slow end: a core-XY machine like the
          P1S or X1 Carbon takes hours off these numbers. Nothing here is a
          placeholder.
        </Body>

        <dl className="mt-9 grid max-w-[27rem] grid-cols-2 border-y border-line tabular-nums">
          {[
            {
              // The same span the print sheet quotes. A single figure would be
              // the estimator's low end presented as a promise, and the machine
              // is named because the number is only true of it.
              term: `Print time · ${printer.presetSuffix}`,
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
          ].map((row, i) => (
            <div
              key={row.term}
              className={`flex flex-col gap-2 py-5 ${
                i % 2 === 1 ? "border-l border-line pl-6" : "pr-6"
              } ${i >= 2 ? "border-t border-line" : ""}`}
            >
              <dt className="text-[0.58rem] tracking-[0.2em] uppercase text-dim">{row.term}</dt>
              <dd className="font-[family-name:var(--font-display)] text-[clamp(1.2rem,2.6vw,1.7rem)] tracking-[-0.02em] text-fog">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* The kit by name rather than by promise. The stem is the one the
          download routes actually use, so the form chosen a few screens up
          renames these files in place. */}
        <div className="mt-9 max-w-[27rem]">
          <p className="text-[0.58rem] tracking-[0.2em] uppercase text-dim">In the kit</p>
          <ul className="mt-3 border-t border-line">
            {kitFiles.map((file) => (
              <li
                key={file.role}
                className="flex items-baseline justify-between gap-4 border-b border-line py-2.5"
              >
                <span className="min-w-0 truncate text-[0.72rem] text-mute">{file.name}</span>
                <span className="shrink-0 text-[0.55rem] tracking-[0.18em] uppercase text-dim">
                  {file.role}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
        <p className="mt-5 text-[0.6rem] tracking-[0.2em] uppercase text-dim">
          or press{" "}
          <kbd className="hairline mx-1 rounded-[3px] px-1.5 py-0.5 font-[inherit] text-fog">
            /
          </kbd>{" "}
          anywhere on this page
        </p>
        <p className="mt-8 text-[0.62rem] tracking-[0.18em] uppercase text-dim">
          No account · no upload · no charge
        </p>

        {/* The colophon: who made this and where it lives. The last panel is
          the one place on the landing the reader has finished with, which is
          exactly where a signature belongs. */}
        <p className="mt-12 flex flex-wrap items-center gap-2 border-t border-line pt-5 text-[0.6rem] tracking-[0.18em] uppercase">
          <a
            href={PROJECT.authorSite}
            target="_blank"
            rel="noreferrer noopener"
            className="hairline pointer-events-auto flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog"
          >
            created by {PROJECT.authorSiteName}
            <span aria-hidden className="text-accent">
              ↗
            </span>
          </a>
          <a
            href={PROJECT.url}
            target="_blank"
            rel="noreferrer noopener"
            className="hairline pointer-events-auto flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-mute transition-colors duration-150 hover:border-accent hover:text-fog"
          >
            source on github
            <span aria-hidden className="text-accent">
              ↗
            </span>
          </a>
        </p>
      </Panel>
    </div>
  );
}
