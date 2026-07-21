import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Monolith, assetYear } from "./Monolith";
import { buildMonolith, SIZES } from "../src/lib/build";
import { computeStats } from "../src/lib/contributions";
import { printableParts } from "../src/lib/parts";
import {
  estimate,
  formatPrice,
  materialById,
  DEFAULT_PRINTER_ID,
  printerById,
  qualityById,
} from "../src/lib/print";
import { PALETTES } from "../src/lib/palettes";
import type { Variant } from "../src/lib/types";

/**
 * The README demo: everything the site actually does, in the order you meet it.
 * Type a handle, watch it build, turn it into the four forms, pick a size and a
 * finish, then take the print kit.
 *
 * Every object is the real mesh from buildMonolith and every number comes from
 * the same estimator the print sheet uses, so this video cannot advertise
 * behaviour the app does not have.
 */

const FPS = 30;
const s = (seconds: number) => Math.round(seconds * FPS);

const VOID = "#060708";
const FOG = "#ecece9";
const DIM = "#8b9096";
const FAINT = "#5f656c";
const GHOST = "#3a3f45";
const ACCENT = "#d7ff45";

const FORMS: { variant: Variant; label: string; note: string }[] = [
  { variant: "skyline", label: "SKYLINE", note: "the calendar, extruded" },
  { variant: "ring", label: "RING", note: "the year closed into a loop" },
  { variant: "wave", label: "WAVE", note: "one continuous ribbon" },
  { variant: "spine", label: "SPINE", note: "weeks stacked along a rib" },
];

/** Read off the object the video actually draws, never typed by hand. */
const YEAR = assetYear();
const HANDLE = YEAR.login;
const MESH = buildMonolith(YEAR, { variant: "skyline", sizeMm: 180, label: true });
const STATS = computeStats(YEAR);
const NUM = (n: number) => n.toLocaleString("en-GB");
const DIMS = `${MESH.size.x.toFixed(0)} x ${MESH.size.y.toFixed(0)} mm`;

const LOG: [string, string][] = [
  ["resolving", HANDLE],
  ["fetching", `${YEAR.days.length} days of ${YEAR.year}`],
  ["found", `${NUM(STATS.total)} contributions`],
  ["extruding", `${NUM(MESH.triangles)} triangles`],
  ["welding", "base plate and signature"],
  ["ready", DIMS],
];

/** The chrome every scene shares: wordmark, and a caption for what is on show. */
const Frame: React.FC<{
  step: string;
  caption: string;
  children: React.ReactNode;
}> = ({ step, caption, children }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: VOID,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        color: FOG,
        padding: 56,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 15, letterSpacing: 10, color: DIM }}>MONOLITH</div>
        <div style={{ fontSize: 13, letterSpacing: 5, color: GHOST }}>{step}</div>
      </div>

      <div
        style={{
          flex: 1,
          opacity: enter,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {children}
      </div>

      <div style={{ fontSize: 15, letterSpacing: 3, color: FAINT }}>{caption}</div>
    </AbsoluteFill>
  );
};

/** A row of choices, drawn the way the dock draws them. */
const Chips: React.FC<{ items: string[]; activeIndex: number }> = ({ items, activeIndex }) => (
  <div style={{ display: "flex", gap: 12, fontSize: 15, letterSpacing: 3 }}>
    {items.map((item, i) => (
      <div
        key={item}
        style={{
          padding: "6px 13px",
          borderRadius: 5,
          color: i === activeIndex ? VOID : FAINT,
          backgroundColor: i === activeIndex ? FOG : "transparent",
          border: `1px solid ${i === activeIndex ? FOG : "#20262c"}`,
        }}
      >
        {item}
      </div>
    ))}
  </div>
);

const Typing: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = HANDLE.slice(0, Math.min(HANDLE.length, Math.floor(frame / (s(1.7) / HANDLE.length))));

  return (
    <Frame step="01 · HANDLE" caption="any public GitHub account, nothing to sign up for">
      <div style={{ fontSize: 46, letterSpacing: -0.5 }}>
        <span style={{ color: FAINT }}>github.com/</span>
        {typed}
        <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0.15, color: ACCENT }}>▌</span>
      </div>
      <div style={{ marginTop: 26, fontSize: 16, letterSpacing: 4, color: FAINT }}>
        PICK A YEAR · 2020 TO 2025
      </div>
    </Frame>
  );
};

const BuildLog: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.max(1, Math.min(LOG.length, Math.floor(frame / s(0.5)) + 1));

  return (
    <Frame step="02 · BUILD" caption="geometry generated in your browser, nothing uploaded">
      {/* Flow layout, so the progress bar can never land on top of a line. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {LOG.slice(0, shown).map(([label, value], i) => {
          const last = i === shown - 1;
          return (
            <div key={label} style={{ display: "flex", gap: 26, fontSize: 21, letterSpacing: 3 }}>
              <div style={{ width: 200, color: last ? DIM : GHOST }}>{label.toUpperCase()}</div>
              <div style={{ color: last ? FOG : "#4a5057" }}>{value}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 40, height: 2, width: "100%", backgroundColor: "#20262c" }}>
        <div
          style={{
            width: `${(shown / LOG.length) * 100}%`,
            height: "100%",
            backgroundColor: ACCENT,
          }}
        />
      </div>
    </Frame>
  );
};

const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const reveal = interpolate(frame, [0, s(2.0)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Frame step="03 · OBJECT" caption={`${NUM(STATS.total)} contributions · ${YEAR.days.length} days · ${DIMS}`}>
      <div style={{ fontSize: 40, letterSpacing: -1 }}>{HANDLE}</div>
      <div style={{ marginTop: 8, fontSize: 15, letterSpacing: 4, color: DIM }}>2025 · SKYLINE</div>
      <Monolith
        reveal={reveal}
        width={width - 180}
        height={380}
        style={{ margin: "0 auto" }}
      />
    </Frame>
  );
};

const Forms: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const index = Math.min(FORMS.length - 1, Math.floor(frame / s(1.35)));
  const form = FORMS[index];

  return (
    <Frame step="04 · FORM" caption={`${form.label.toLowerCase()} · ${form.note}`}>
      <Chips items={FORMS.map((f) => f.label)} activeIndex={index} />
      <Monolith
        key={form.variant}
        variant={form.variant}
        width={width - 200}
        height={400}
        style={{ margin: "0 auto" }}
      />
    </Frame>
  );
};

const Sizes: React.FC = () => {
  const frame = useCurrentFrame();
  const index = Math.min(SIZES.length - 1, Math.floor(frame / s(1.1)));

  return (
    <Frame step="05 · SIZE" caption={`${SIZES[index].name.toLowerCase()} · ${SIZES[index].blurb.toLowerCase()}`}>
      <Chips items={SIZES.map((size) => `${size.name.toUpperCase()} ${size.mm}`)} activeIndex={index} />

      {/* Drawn to each other's scale, so 120 beside 260 reads the way it will
          read on a desk. The isometric skyline is about 1.7 wide per 1 tall. */}
      <div
        style={{
          marginTop: 34,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 26,
        }}
      >
        {SIZES.map((size, i) => {
          const tall = (size.mm / 260) * 250;
          return (
            <div key={size.id} style={{ opacity: i === index ? 1 : 0.24, textAlign: "center" }}>
              <Monolith width={tall * 1.7} height={tall} />
              <div style={{ fontSize: 14, letterSpacing: 3, color: i === index ? FOG : GHOST }}>
                {size.mm} MM
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

const Finishes: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const shown = PALETTES.slice(0, 4);
  const index = Math.min(shown.length - 1, Math.floor(frame / s(0.95)));
  const palette = shown[index];

  return (
    <Frame step="06 · FINISH" caption={`${palette.name.toLowerCase()} · ${(palette.note ?? "").toLowerCase()}`}>
      <Chips items={shown.map((p) => p.name.toUpperCase())} activeIndex={index} />
      <Monolith
        key={palette.id}
        palette={palette}
        width={width - 200}
        height={380}
        style={{ margin: "0 auto" }}
      />
    </Frame>
  );
};

const PrintSheet: React.FC = () => {
  const numbers = useMemo(() => {
    const mesh = MESH;
    const material = materialById("pla");
    const quality = qualityById("standard");
    const printer = printerById(DEFAULT_PRINTER_ID);
    const est = estimate(printableParts(mesh), material, quality, printer);
    return [
      ["Printer", printer.name],
      ["Filament", `${material.name} · ${formatPrice(material.pricePerKg)}/kg`],
      ["Layer", `${quality.name} · ${quality.layerHeightMm.toFixed(2)} mm`],
      ["Colours", "4 slots · one per intensity"],
      ["Filament used", `about ${est.grams.toFixed(0)} g`],
      ["Print time", `${est.hoursLow.toFixed(1)} to ${est.hoursHigh.toFixed(1)} h`],
      ["Filament cost", formatPrice(est.filamentCost)],
      ["Engraved pixel", `${mesh.print.engravePixelMm.toFixed(2)} mm`],
    ] as [string, string][];
  }, []);

  const frame = useCurrentFrame();
  const shown = Math.min(numbers.length, Math.floor(frame / s(0.24)) + 2);

  return (
    <Frame step="07 · PRINT" caption="estimates calibrated against real Bambu Studio slices of this model">
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        {numbers.slice(0, shown).map(([key, value], i) => (
          <div
            key={key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 19,
              paddingBottom: 13,
              borderBottom: `1px solid ${i === 3 ? "#20262c" : "transparent"}`,
            }}
          >
            <span style={{ letterSpacing: 3, color: DIM }}>{key.toUpperCase()}</span>
            <span style={{ color: FOG }}>{value}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
};

const Kit: React.FC = () => {
  const frame = useCurrentFrame();
  const files: [string, string][] = [
    [".3mf", "one part per intensity, ready for a multi colour slot"],
    [".stl", "the same object welded into one solid"],
    ["preset.json", "Bambu and Orca, inherits your stock profile"],
    ["PRINT-ME.txt", "every setting, and why it is set that way"],
  ];
  const shown = Math.min(files.length, Math.floor(frame / s(0.3)) + 1);
  const pop = interpolate(frame, [s(1.6), s(1.9)], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Frame step="08 · KIT" caption="one zip, no account, no upload, no charge">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {files.slice(0, shown).map(([name, note]) => (
          <div key={name} style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
            <div style={{ width: 200, fontSize: 20, color: FOG }}>{name}</div>
            <div style={{ fontSize: 16, color: FAINT }}>{note}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 44, display: "flex", gap: 14, transform: `scale(${pop})`, transformOrigin: "left center" }}>
        <div
          style={{
            backgroundColor: ACCENT,
            color: VOID,
            padding: "13px 22px",
            borderRadius: 5,
            fontSize: 15,
            letterSpacing: 3,
          }}
        >
          DOWNLOAD PRINT KIT
        </div>
        <div
          style={{
            border: "1px solid #20262c",
            color: FOG,
            padding: "13px 22px",
            borderRadius: 5,
            fontSize: 15,
            letterSpacing: 3,
          }}
        >
          OPEN IN BAMBU STUDIO ↗
        </div>
      </div>
    </Frame>
  );
};

const Close: React.FC = () => {
  const { width } = useVideoConfig();
  return (
    <Frame step="09 · YOURS" caption="source available under PolyForm Noncommercial · models CC BY 4.0">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Monolith width={width - 320} height={300} />
      </div>
      <div style={{ fontSize: 30, letterSpacing: -0.5, marginBottom: 14 }}>
        Your commit year, <span style={{ color: DIM }}>cast as an object.</span>
      </div>
      <div style={{ fontSize: 19, color: ACCENT, letterSpacing: 2 }}>
        github.com/noluyorAbi/monolith
      </div>
    </Frame>
  );
};

/** Start frame and length of every scene, in one place, in seconds. */
const SCENES: { at: number; length: number; component: React.FC }[] = [
  { at: 0, length: 2.6, component: Typing },
  { at: 2.6, length: 3.8, component: BuildLog },
  { at: 6.4, length: 2.8, component: Reveal },
  { at: 9.2, length: 5.4, component: Forms },
  { at: 14.6, length: 3.4, component: Sizes },
  { at: 18.0, length: 3.8, component: Finishes },
  { at: 21.8, length: 4.2, component: PrintSheet },
  { at: 26.0, length: 3.8, component: Kit },
  { at: 29.8, length: 3.4, component: Close },
];

/** 33.2 seconds. Root.tsx holds the matching durationInFrames. */
export const DEMO_SECONDS = SCENES[SCENES.length - 1].at + SCENES[SCENES.length - 1].length;

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: VOID }}>
    {SCENES.map(({ at, length, component: Scene }) => (
      <Sequence key={at} from={s(at)} durationInFrames={s(length)}>
        <Scene />
      </Sequence>
    ))}
  </AbsoluteFill>
);
