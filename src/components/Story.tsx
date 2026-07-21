"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useInView } from "motion/react";
import { Ticker } from "./Ticker";
import { SIZES, VARIANTS } from "@/lib/build";
import { PALETTES } from "@/lib/palettes";
import { estimate, materialById, printerById, qualityById } from "@/lib/print";
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
  state,
  onEnter,
  children,
  className = "",
}: {
  state?: SceneState;
  onEnter: (state: SceneState) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  // Half the panel, measured against the middle of the screen: the state
  // changes as a panel takes the frame, not as its first pixel appears.
  const inView = useInView(ref, { amount: 0.5 });

  useEffect(() => {
    if (inView && state) onEnter(state);
  }, [inView, state, onEnter]);

  return (
    <section
      ref={ref}
      className={`relative flex min-h-svh snap-start flex-col items-center justify-end px-6 pt-24 pb-[12vh] min-[900px]:min-h-0 min-[900px]:items-start min-[900px]:justify-center min-[900px]:px-[max(3rem,6vw)] min-[900px]:pb-0 ${className}`}
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

/** The row of names for a set, with the one the object is wearing marked. */
function Marks({
  items,
  activeId,
}: {
  items: { id: string; name: string }[];
  activeId: string;
}) {
  return (
    <ul className="mt-7 flex flex-wrap gap-x-4 gap-y-2 text-[0.62rem] tracking-[0.2em] uppercase">
      {items.map((item) => {
        const on = item.id === activeId;
        return (
          <li key={item.id} className="flex items-center gap-2">
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
              animate={{ color: on ? "var(--color-fog)" : "var(--color-dim)" }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              {item.name}
            </motion.span>
          </li>
        );
      })}
    </ul>
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
  onTop,
}: {
  /** The object as currently built, so the print figures describe what is shown. */
  mesh: BuiltMesh;
  state: SceneState;
  onState: (next: SceneState) => void;
  /** Back to the field at the top, focused and ready to be typed into. */
  onTop: () => void;
}) {
  const numbers = useMemo(() => {
    const material = materialById("pla");
    const quality = qualityById("standard");
    return estimate(printableParts(mesh), material, quality);
  }, [mesh]);

  const shelf = SIZES.find((s) => s.id === "shelf") ?? SIZES[1];

  return (
    <div className="relative z-20">
      <Panel
        state={{ variant: "skyline", paletteId: state.paletteId }}
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
        <Marks items={VARIANTS} activeId={state.variant} />
      </Panel>

      {VARIANTS.slice(1).map((form) => (
        <Panel
          key={form.id}
          state={{ variant: form.id, paletteId: state.paletteId }}
          onEnter={onState}
          className="min-[900px]:min-h-[72svh]"
        >
          <p className="text-[0.62rem] tracking-[0.24em] uppercase text-dim">{form.name}</p>
          <p className="mt-3 text-[0.95rem] text-mute">{form.blurb}.</p>
        </Panel>
      ))}

      <Panel
        state={{ variant: state.variant, paletteId: FINISHES[0].id }}
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
        <Marks items={FINISHES} activeId={state.paletteId} />
      </Panel>

      {FINISHES.slice(1).map((finish) => (
        <Panel
          key={finish.id}
          state={{ variant: state.variant, paletteId: finish.id }}
          onEnter={onState}
          className="min-[900px]:min-h-[72svh]"
        >
          <p className="text-[0.62rem] tracking-[0.24em] uppercase text-dim">{finish.name}</p>
          <p className="mt-3 text-[0.95rem] text-mute">{finish.note}.</p>
        </Panel>
      ))}

      <Panel onEnter={onState} className="min-[900px]:min-h-[112svh]">
        <Step index="03" label="Print" />
        <Title>It is a real print, with real numbers.</Title>
        <Body>
          Measured against Bambu Studio on the profile the kit ships, for the{" "}
          {shelf.mm} mm size in {materialById("pla").name}. Nothing here is a
          placeholder.
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
          preset for {printerById("p1s").name} and Orca.
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
