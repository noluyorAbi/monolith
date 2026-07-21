import React from "react";
import { AbsoluteFill } from "remotion";
import { Monolith } from "./Monolith";

/**
 * The README banner. Same projected mesh as the share card, laid out wide.
 */
export const Banner: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#060708",
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      color: "#ecece9",
      padding: "56px 72px",
      justifyContent: "space-between",
    }}
  >
    <Monolith
      seed="banner"
      width={760}
      height={330}
      style={{ position: "absolute", right: 40, top: 34 }}
    />

    <div style={{ fontSize: 18, letterSpacing: 11, color: "#8b9096" }}>MONOLITH</div>

    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 42, lineHeight: 1.16, letterSpacing: -1 }}>
        Your commit year,
        <br />
        <span style={{ color: "#8b9096" }}>cast as an object.</span>
      </div>
    </div>

    <div style={{ display: "flex", gap: 26, fontSize: 17, color: "#5f656c" }}>
      <div>3MF · STL · slicer preset</div>
      <div>·</div>
      <div>no account, no upload</div>
      <div>·</div>
      <div>print it yourself, free</div>
    </div>
  </AbsoluteFill>
);
