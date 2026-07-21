import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Monolith } from "./Monolith";
import type { Variant } from "../src/lib/types";

/**
 * The README demo: the actual sequence the site puts you through, at the pace
 * it happens. Typing, the build log, the object rising, then the four forms.
 * The object is the real mesh, so this cannot show something the app does not.
 */

const HANDLE = "noluyorAbi";
const FORMS: { variant: Variant; label: string }[] = [
  { variant: "skyline", label: "SKYLINE" },
  { variant: "ring", label: "RING" },
  { variant: "wave", label: "WAVE" },
  { variant: "spine", label: "SPINE" },
];

const LOG = [
  ["resolving", HANDLE],
  ["fetching", "365 days of 2025"],
  ["found", "1,745 contributions"],
  ["extruding", "4,608 triangles"],
  ["welding", "base plate and signature"],
  ["ready", "180 x 29 mm"],
];

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: "#060708",
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      color: "#ecece9",
      padding: 56,
    }}
  >
    <div style={{ fontSize: 15, letterSpacing: 10, color: "#8b9096" }}>MONOLITH</div>
    {children}
  </AbsoluteFill>
);

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = (seconds: number) => Math.round(seconds * fps);

  // 0-2.4s type, 2.4-5.6s build log, 5.6-8s reveal, 8-14s the four forms.
  const typed = HANDLE.slice(0, Math.min(HANDLE.length, Math.floor(frame / (s(2.0) / HANDLE.length))));
  const inLog = frame >= s(2.4) && frame < s(5.8);
  const logLines = Math.max(0, Math.min(LOG.length, Math.floor((frame - s(2.4)) / s(0.52)) + 1));
  const reveal = interpolate(frame, [s(5.8), s(7.8)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const formIndex = frame < s(8.4) ? 0 : Math.min(FORMS.length - 1, Math.floor((frame - s(8.4)) / s(1.5)) + 1);
  const form = FORMS[formIndex];

  if (frame < s(2.4)) {
    return (
      <Frame>
        <div style={{ marginTop: height * 0.3, fontSize: 44, letterSpacing: -0.5 }}>
          <span style={{ color: "#5f656c" }}>github.com/</span>
          {typed}
          <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0.15, color: "#d7ff45" }}>▌</span>
        </div>
        <div style={{ marginTop: 26, fontSize: 17, letterSpacing: 3, color: "#5f656c" }}>
          ANY PUBLIC ACCOUNT
        </div>
      </Frame>
    );
  }

  if (inLog) {
    return (
      <Frame>
        <div style={{ marginTop: height * 0.26, display: "flex", flexDirection: "column", gap: 14 }}>
          {LOG.slice(0, logLines).map(([label, value], i) => {
            const last = i === logLines - 1;
            return (
              <div key={label} style={{ display: "flex", gap: 26, fontSize: 21, letterSpacing: 3 }}>
                <div style={{ width: 190, color: last ? "#8b9096" : "#3a3f45" }}>
                  {label.toUpperCase()}
                </div>
                <div style={{ color: last ? "#ecece9" : "#4a5057" }}>{value}</div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            top: height * 0.26 + LOG.length * 36 + 46,
            height: 2,
            backgroundColor: "#20262c",
          }}
        >
          <div
            style={{
              width: `${(logLines / LOG.length) * 100}%`,
              height: "100%",
              backgroundColor: "#d7ff45",
            }}
          />
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div style={{ marginTop: 22, fontSize: 40, letterSpacing: -1 }}>{HANDLE}</div>
      <div style={{ marginTop: 8, fontSize: 16, letterSpacing: 4, color: "#8b9096" }}>
        2025 · {form.label}
      </div>

      <Monolith
        key={form.variant}
        seed={HANDLE}
        variant={form.variant}
        reveal={form.variant === "skyline" ? reveal : 1}
        width={width - 112}
        height={height * 0.56}
        style={{ position: "absolute", left: 56, top: height * 0.28 }}
      />

      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          bottom: 46,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 16,
          letterSpacing: 3,
          color: "#5f656c",
        }}
      >
        <div style={{ display: "flex", gap: 22 }}>
          {FORMS.map((f) => (
            <div key={f.variant} style={{ color: f.variant === form.variant ? "#060708" : "#5f656c", backgroundColor: f.variant === form.variant ? "#ecece9" : "transparent", padding: "5px 11px", borderRadius: 5 }}>
              {f.label}
            </div>
          ))}
        </div>
        <div style={{ color: "#060708", backgroundColor: "#d7ff45", padding: "5px 13px", borderRadius: 5 }}>
          GET THE FILES
        </div>
      </div>
    </Frame>
  );
};
