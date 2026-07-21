"use client";

import { AnimatePresence, motion } from "motion/react";
import { SIZES, VARIANTS, type SizeId } from "@/lib/build";
import { PALETTES, type Palette } from "@/lib/products";
import type { Variant } from "@/lib/types";
import { play } from "@/lib/sound";

const EASE = [0.16, 1, 0.3, 1] as const;

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
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  layoutGroup: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`relative rounded-[5px] border px-2.5 py-1.5 text-[0.68rem] tracking-[0.1em] uppercase transition-colors duration-150 active:scale-[0.97] ${
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
}

export interface DockProps {
  year: number;
  years: number[];
  onYear: (y: number) => void;
  variant: Variant;
  onVariant: (v: Variant) => void;
  palette: Palette;
  onPalette: (id: string) => void;
  sizeId: SizeId;
  onSize: (id: SizeId) => void;
  total: number;
  onPrint: () => void;
  spin: boolean;
  onSpin: (next: boolean) => void;
  sound: boolean;
  onSound: (next: boolean) => void;
  visible: boolean;
}

export function Dock(props: DockProps) {
  const size = SIZES.find((s) => s.id === props.sizeId) ?? SIZES[1];
  const yearIndex = props.years.indexOf(props.year);

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
          className="absolute inset-x-0 bottom-0 z-30 border-t border-edge bg-ink/94 backdrop-blur-xl"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="flex items-end gap-7 overflow-x-auto px-5 py-4 sm:px-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Group label="Year">
              <button
                type="button"
                onClick={() => stepYear(1)}
                aria-label="Previous year"
                className="rounded-[4px] border border-line px-1.5 py-1 text-mute transition-colors duration-150 hover:border-edge hover:text-fog active:scale-[0.97] disabled:opacity-40"
                disabled={yearIndex >= props.years.length - 1}
              >
                ‹
              </button>
              <span className="w-[4ch] text-center text-[0.78rem] tabular-nums text-fog">
                {props.year}
              </span>
              <button
                type="button"
                onClick={() => stepYear(-1)}
                aria-label="Next year"
                className="rounded-[4px] border border-line px-1.5 py-1 text-mute transition-colors duration-150 hover:border-edge hover:text-fog active:scale-[0.97] disabled:opacity-40"
                disabled={yearIndex <= 0}
              >
                ›
              </button>
            </Group>

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
                  <button
                    key={f.id}
                    type="button"
                    title={locked ? `${f.name} · locked until ${f.unlockAt?.toLocaleString("en-GB")} contributions` : `${f.name} · ${f.note}`}
                    disabled={locked}
                    onClick={() => {
                      play("step");
                      props.onPalette(f.id);
                    }}
                    className="relative grid h-7 w-7 place-items-center rounded-full border border-line transition-all duration-150 hover:border-edge active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40"
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
                );
              })}
            </Group>

            <Group label={`Size · ${size.mm}mm`}>
              {SIZES.map((s) => (
                <Pill
                  key={s.id}
                  layoutGroup="dock-size"
                  active={props.sizeId === s.id}
                  title={s.blurb}
                  onClick={() => {
                    if (props.sizeId !== s.id) play("step");
                    props.onSize(s.id);
                  }}
                >
                  {s.name}
                </Pill>
              ))}
            </Group>

            <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
              <button
                type="button"
                onClick={() => {
                  play("tick");
                  props.onSpin(!props.spin);
                }}
                title={props.spin ? "Stop turntable" : "Start turntable"}
                className={`h-8 w-8 rounded-[5px] border border-line text-[0.9rem] transition-colors duration-150 hover:border-edge hover:text-fog ${props.spin ? "text-fog" : "text-dim"}`}
              >
                ⟳
              </button>
              <button
                type="button"
                onClick={() => props.onSound(!props.sound)}
                title={props.sound ? "Mute" : "Unmute"}
                className={`h-8 w-8 rounded-[5px] border border-line text-[0.85rem] transition-colors duration-150 hover:border-edge hover:text-fog ${props.sound ? "text-fog" : "text-dim"}`}
              >
                {props.sound ? "◉" : "◎"}
              </button>
              <button
                type="button"
                onClick={() => {
                  play("lock");
                  props.onPrint();
                }}
                className="rounded-[5px] bg-accent px-4 py-2 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-void transition-transform duration-150 hover:brightness-110 active:scale-[0.97]"
              >
                Get the files
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
