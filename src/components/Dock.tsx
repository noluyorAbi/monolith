"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { parseRepoInput } from "@/lib/request";
import { SIZES, VARIANTS, fitsBed, sizeById, type SizeId } from "@/lib/build";
import { printerById } from "@/lib/print";
import { PALETTES, type Palette } from "@/lib/palettes";
import type { StudioLights, Variant } from "@/lib/types";
import { play } from "@/lib/sound";
import { Hint } from "./Hint";

/**
 * The studio's switches, in the order a photographer would name them.
 * Each entry is one light, so the map below stays honest about what exists.
 */
const STUDIO_SWITCHES: { id: keyof StudioLights; name: string; hint: string }[] = [
  { id: "key", name: "Key", hint: "Key light · the one that casts the shadow" },
  { id: "fill", name: "Fill", hint: "Fill light · cool blue from the left" },
  { id: "rim", name: "Rim", hint: "Rim light · separates the far edge" },
  { id: "front", name: "Front", hint: "Front light · flat, reads the colours" },
  { id: "glow", name: "Glow", hint: "Emissive · busy days carry their own light" },
];

/**
 * A switch rather than a pick: several can be on at once, so no shared
 * layout highlight, just a lamp dot that takes the accent while it burns.
 */
function Toggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Hint label={title}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`flex min-h-9 items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 text-[0.68rem] tracking-[0.1em] uppercase transition-colors duration-150 active:scale-[0.97] sm:min-h-0 ${
          active
            ? "border-edge text-fog"
            : "border-line text-dim hover:border-edge hover:text-mute"
        }`}
      >
        <span
          aria-hidden
          className={`h-1 w-1 rounded-full transition-colors duration-150 ${
            active ? "bg-accent" : "bg-edge"
          }`}
        />
        {children}
      </button>
    </Hint>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <span className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  layoutGroup,
  title,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  layoutGroup: string;
  title?: string;
  disabled?: boolean;
}) {
  const button = (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative min-h-9 rounded-[5px] border px-2.5 py-1.5 text-[0.68rem] tracking-[0.1em] uppercase transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 ${
        active ? "border-transparent" : "border-line hover:border-edge"
      }`}
    >
      {active && (
        <motion.span
          layoutId={layoutGroup}
          className="absolute inset-0 rounded-[5px] bg-fog"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className={`relative z-10 ${active ? "text-void" : "text-mute hover:text-fog"}`}>
        {children}
      </span>
    </button>
  );

  return title ? <Hint label={title}>{button}</Hint> : button;
}

export interface DockProps {
  year: number;
  years: number[];
  onYear: (y: number) => void;
  subject: "user" | "repo";
  onSubject: (s: "user" | "repo") => void;
  repoOwner: string;
  onRepoOwner: (v: string) => void;
  repoName: string;
  onRepoName: (v: string) => void;
  span: "year" | "lifetime" | "range";
  onSpan: (s: "year" | "lifetime" | "range") => void;
  rangeFrom: string;
  onRangeFrom: (v: string) => void;
  rangeTo: string;
  onRangeTo: (v: string) => void;
  variant: Variant;
  onVariant: (v: Variant) => void;
  palette: Palette;
  onPalette: (id: string) => void;
  sizeId: SizeId;
  onSize: (id: SizeId) => void;
  printerId: string;
  onPrinter: (id: string) => void;
  dampening: number;
  onDampening: (v: number) => void;
  total: number;
  onPrint: () => void;
  spin: boolean;
  onSpin: (next: boolean) => void;
  sound: boolean;
  onSound: (next: boolean) => void;
  studio: StudioLights;
  onStudio: (next: StudioLights) => void;
  /** Re-run the forge with the current subject/span/repo (repo inputs commit on Enter). */
  onRebuild: (over?: {
    subject?: "user" | "repo";
    span?: "year" | "lifetime" | "range";
    repoOwner?: string;
    repoName?: string;
    rangeFrom?: string;
    rangeTo?: string;
  }) => void;
  visible: boolean;
}

export function Dock(props: DockProps) {
  const size = sizeById(props.sizeId);
  const yearIndex = props.years.indexOf(props.year);
  /**
   * One field for the repository, because nobody remembers "owner slash name"
   * as two boxes: they paste the URL off the address bar. Parsed live into the
   * owner/name the app state actually speaks; Enter rebuilds.
   */
  const [repoInput, setRepoInput] = useState(
    props.repoOwner && props.repoName ? `${props.repoOwner}/${props.repoName}` : "",
  );
  const repoParsed = parseRepoInput(repoInput);

  const commitRepo = () => {
    if (!repoParsed) {
      play("error");
      return;
    }
    props.onRepoOwner(repoParsed.owner);
    props.onRepoName(repoParsed.name);
    props.onRebuild({ subject: "repo", repoOwner: repoParsed.owner, repoName: repoParsed.name });
  };

  const stepYear = (delta: number) => {
    const next = props.years[yearIndex + delta];
    if (next === undefined) {
      play("error");
      return;
    }
    play("step");
    props.onYear(next);
  };

  return (
    <AnimatePresence>
      {props.visible && (
        <motion.div
          className="absolute inset-x-0 bottom-0 z-30 border-t border-edge bg-ink/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* The settings scroll sideways; the actions never do. Kept in one
            row they pushed "Get the files" past the right edge of anything
            narrower than about 1400 px, which on a phone meant the one button
            the whole page exists for was off screen. */}
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <div className="relative min-w-0 flex-1">
              <div className="flex items-end gap-7 overflow-x-auto px-5 py-4 sm:px-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Group label="Subject">
                  <Pill
                    layoutGroup="dock-subject"
                    active={props.subject === "user"}
                    onClick={() => {
                      props.onSubject("user");
                      props.onRebuild({ subject: "user" });
                    }}
                  >
                    user
                  </Pill>
                  <Pill
                    layoutGroup="dock-subject"
                    active={props.subject === "repo"}
                    title="Render a repository's last-52-week commit skyline (M14)"
                    onClick={() => {
                      props.onSubject("repo");
                      // Only rebuild when a repository is already known;
                      // otherwise just reveal the field and wait for a paste.
                      if (props.repoOwner && props.repoName) {
                        props.onRebuild({ subject: "repo", repoOwner: props.repoOwner, repoName: props.repoName });
                      }
                    }}
                  >
                    repo
                  </Pill>
                </Group>

                {props.subject === "repo" ? (
                  <Group label={repoParsed ? `Repository · ${repoParsed.owner}/${repoParsed.name}` : "Repository · paste the URL"}>
                    <input
                      type="text"
                      value={repoInput}
                      placeholder="github.com/owner/repo"
                      onChange={(e) => setRepoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRepo();
                      }}
                      className={`h-9 w-[24ch] rounded-[5px] border bg-transparent px-2 text-[0.68rem] text-fog outline-none placeholder:text-dim focus:border-edge sm:h-auto ${
                        repoInput && !repoParsed ? "border-danger/50" : "border-line"
                      }`}
                    />
                    <Hint label="Build this repository">
                      <button
                        type="button"
                        onClick={commitRepo}
                        disabled={!repoParsed}
                        aria-label="Build repository"
                        className="grid h-9 w-8 place-items-center rounded-[4px] border border-line text-mute transition-colors duration-150 hover:border-edge hover:text-fog active:scale-[0.97] disabled:opacity-40 sm:h-auto sm:w-auto sm:px-1.5 sm:py-1"
                      >
                        →
                      </button>
                    </Hint>
                  </Group>
                ) : (
                  <Group label="Span">
                    <Pill
                      layoutGroup="dock-span"
                      active={props.span === "year"}
                      onClick={() => {
                        props.onSpan("year");
                        props.onRebuild({ span: "year" });
                      }}
                    >
                      year
                    </Pill>
                    <Pill
                      layoutGroup="dock-span"
                      active={props.span === "lifetime"}
                      title="Every year the account has, side by side (M12)"
                      onClick={() => {
                        props.onSpan("lifetime");
                        props.onRebuild({ span: "lifetime" });
                      }}
                    >
                      lifetime
                    </Pill>
                    <Pill
                      layoutGroup="dock-span"
                      active={props.span === "range"}
                      title='An arbitrary window, e.g. "last 12 months" (M11)'
                      onClick={() => {
                        props.onSpan("range");
                        props.onRebuild({ span: "range" });
                      }}
                    >
                      range
                    </Pill>
                  </Group>
                )}

                {props.subject === "user" && props.span === "year" && (
                  <>
                    <Hint label="Earlier year">
                    <button
                      type="button"
                      onClick={() => stepYear(1)}
                      aria-label="Previous year"
                      className="grid h-9 w-8 place-items-center rounded-[4px] border border-line text-mute transition-colors duration-150 hover:border-edge hover:text-fog active:scale-[0.97] disabled:opacity-40 sm:h-auto sm:w-auto sm:px-1.5 sm:py-1"
                      disabled={yearIndex >= props.years.length - 1}
                    >
                      ‹
                    </button>
                    </Hint>
                    <span className="w-[4ch] text-center text-[0.78rem] tabular-nums text-fog">
                      {props.year}
                    </span>
                    <Hint label="Later year">
                    <button
                      type="button"
                      onClick={() => stepYear(-1)}
                      aria-label="Next year"
                      className="grid h-9 w-8 place-items-center rounded-[4px] border border-line text-mute transition-colors duration-150 hover:border-edge hover:text-fog active:scale-[0.97] disabled:opacity-40 sm:h-auto sm:w-auto sm:px-1.5 sm:py-1"
                      disabled={yearIndex <= 0}
                    >
                      ›
                    </button>
                    </Hint>
                  </>
                )}

                {props.subject === "user" && props.span === "range" && (
                  <Group label="Window">
                    {/* The windows people actually mean, one press each. The
                      date fields stay for the rest; presets pass the fresh
                      dates through the rebuild so nothing waits on state. */}
                    {(
                      [
                        ["12 mo", 1],
                        ["3 yr", 3],
                        ["5 yr", 5],
                      ] as const
                    ).map(([name, back]) => {
                      const to = new Date().toISOString().slice(0, 10);
                      const d = new Date();
                      d.setUTCFullYear(d.getUTCFullYear() - back);
                      const from = d.toISOString().slice(0, 10);
                      const active = props.rangeFrom === from && props.rangeTo === to;
                      return (
                        <Pill
                          key={name}
                          layoutGroup="dock-range-preset"
                          active={active}
                          title={`${from} to today`}
                          onClick={() => {
                            play("step");
                            props.onRangeFrom(from);
                            props.onRangeTo(to);
                            props.onRebuild({ span: "range", rangeFrom: from, rangeTo: to });
                          }}
                        >
                          {name}
                        </Pill>
                      );
                    })}
                    <input
                      type="date"
                      value={props.rangeFrom}
                      max={props.rangeTo}
                      aria-label="From"
                      onChange={(e) => props.onRangeFrom(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") props.onRebuild({ span: "range" });
                      }}
                      className="h-9 rounded-[5px] border border-line bg-transparent px-2 text-[0.62rem] text-fog outline-none focus:border-edge sm:h-auto"
                    />
                    <span aria-hidden className="text-[0.6rem] uppercase text-dim">to</span>
                    <input
                      type="date"
                      value={props.rangeTo}
                      min={props.rangeFrom}
                      aria-label="To"
                      onChange={(e) => props.onRangeTo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") props.onRebuild({ span: "range" });
                      }}
                      className="h-9 rounded-[5px] border border-line bg-transparent px-2 text-[0.62rem] text-fog outline-none focus:border-edge sm:h-auto"
                    />
                    <Hint label="Rebuild for this window">
                      <button
                        type="button"
                        onClick={() => props.onRebuild({ span: "range" })}
                        aria-label="Apply date range"
                        className="grid h-9 w-8 place-items-center rounded-[4px] border border-line text-mute transition-colors duration-150 hover:border-edge hover:text-fog active:scale-[0.97] sm:h-auto sm:w-auto sm:px-1.5 sm:py-1"
                      >
                        →
                      </button>
                    </Hint>
                  </Group>
                )}

                <Group label="Form">
                  {VARIANTS.map((v) => (
                    <Pill
                      key={v.id}
                      layoutGroup="dock-variant"
                      active={props.variant === v.id}
                      title={v.blurb}
                      onClick={() => {
                        if (props.variant !== v.id) play("step");
                        props.onVariant(v.id);
                      }}
                    >
                      {v.name}
                    </Pill>
                  ))}
                </Group>

                <Group label="Colours">
                  {PALETTES.map((f) => {
                    const locked = f.unlockAt !== undefined && props.total < f.unlockAt;
                    const active = props.palette.id === f.id;
                    return (
                      <Hint
                        key={f.id}
                        label={
                          locked
                            ? `${f.name} · locked until ${f.unlockAt?.toLocaleString("en-GB")} contributions`
                            : `${f.name} · ${f.note}`
                        }
                      >
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={`${f.name} palette`}
                        disabled={locked}
                        onClick={() => {
                          play("step");
                          props.onPalette(f.id);
                        }}
                        className="relative grid h-9 w-9 place-items-center rounded-full border border-line transition-all duration-150 sm:h-7 sm:w-7 hover:border-edge active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${f.ramp[4]} 0%, ${f.ramp[2]} 55%, ${f.base} 100%)`,
                          }}
                        />
                        {active && (
                          <motion.span
                            layoutId="dock-finish"
                            className="absolute inset-0 rounded-full border-2 border-fog"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        )}
                        {locked && <span className="absolute -bottom-0.5 text-[0.5rem] text-dim">·</span>}
                      </button>
                      </Hint>
                    );
                  })}
                </Group>

                <Group label={`Size · ${size.mm}mm`}>
                  {SIZES.map((s) => {
                    // F16: a size the chosen printer cannot print is marked, not
                    // silently offered. Picking it would queue a print that fails
                    // on the first layer, so we show why instead of enabling it.
                    const fits = fitsBed(printerById(props.printerId), s.mm);
                    return (
                      <Pill
                        key={s.id}
                        layoutGroup="dock-size"
                        active={props.sizeId === s.id}
                        title={fits ? s.blurb : `${s.blurb} · too big for this printer`}
                        disabled={!fits}
                        onClick={() => {
                          if (!fits) return;
                          if (props.sizeId !== s.id) play("step");
                          props.onSize(s.id);
                        }}
                      >
                        {s.name}
                        {!fits ? " · bed" : ""}
                      </Pill>
                    );
                  })}
                </Group>

                <Group label={`Outlier compression · ${Math.round(props.dampening * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={props.dampening}
                    onChange={(e) => props.onDampening(Number(e.target.value))}
                    title="Flatten the busiest days so one spike does not tower over the year"
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-edge accent-fog"
                  />
                </Group>

                <Group label="Studio">
                  {STUDIO_SWITCHES.map((s) => (
                    <Toggle
                      key={s.id}
                      active={props.studio[s.id]}
                      title={s.hint}
                      onClick={() => {
                        play("tick");
                        props.onStudio({ ...props.studio, [s.id]: !props.studio[s.id] });
                      }}
                    >
                      {s.name}
                    </Toggle>
                  ))}
                </Group>
              </div>
              {/* The row scrolls with nothing to say so. A fade off the right
                edge is the cheapest honest signal that there is more of it. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink to-transparent"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3 sm:border-l sm:border-t-0 sm:px-7 sm:py-4">
              <Hint
                label={
                  props.spin
                    ? "Turntable on · click to hold it still"
                    : "Turntable off · click to let it turn"
                }
              >
              <button
                type="button"
                onClick={() => {
                  play("tick");
                  props.onSpin(!props.spin);
                }}
                aria-label="Turntable"
                aria-pressed={props.spin}
                className={`h-10 w-10 shrink-0 rounded-[5px] border border-line text-[0.9rem] transition-colors duration-150 hover:border-edge hover:text-fog sm:h-8 sm:w-8 ${props.spin ? "text-fog" : "text-dim"}`}
              >
                <span aria-hidden>⟳</span>
              </button>
              </Hint>
              <Hint
                label={
                  props.sound
                    ? "Interface sound on · click to mute"
                    : "Interface sound off · click to unmute"
                }
              >
              <button
                type="button"
                onClick={() => props.onSound(!props.sound)}
                aria-label="Sound"
                aria-pressed={props.sound}
                className={`h-10 w-10 shrink-0 rounded-[5px] border border-line text-[0.85rem] transition-colors duration-150 hover:border-edge hover:text-fog sm:h-8 sm:w-8 ${props.sound ? "text-fog" : "text-dim"}`}
              >
                <span aria-hidden>{props.sound ? "◉" : "◎"}</span>
              </button>
              </Hint>
              <Hint label="3MF, STL and a slicer preset">
              <button
                type="button"
                onClick={() => {
                  play("lock");
                  props.onPrint();
                }}
                className="h-10 flex-1 rounded-[5px] bg-accent px-4 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-void transition-transform duration-150 hover:brightness-110 active:scale-[0.97] sm:h-auto sm:flex-none sm:py-2"
              >
                Get the files
              </button>
              </Hint>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
