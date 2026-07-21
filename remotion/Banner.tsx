import React from "react";
import { AbsoluteFill } from "remotion";
import { Monolith } from "./Monolith";

/**
 * The README banner. Same projected mesh as the share card.
 *
 * Two columns on one centre line: the claim on the left, the object on the
 * right, inside a box with real margin on every side. The previous layout
 * absolutely positioned the object against the right edge, which cropped the
 * far corner of the plate at this canvas size.
 */
export const Banner: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#060708",
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      color: "#ecece9",
      padding: "44px 76px",
      flexDirection: "row",
      alignItems: "center",
      gap: 40,
    }}
  >
    <div style={{ flex: "0 0 500px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ fontSize: 14, letterSpacing: 11, color: "#8b9096" }}>MONOLITH</div>

      <div style={{ fontSize: 44, lineHeight: 1.14, letterSpacing: -1.4 }}>
        Your commit year,
        <br />
        <span style={{ color: "#8b9096" }}>cast as an object.</span>
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 15, color: "#5f656c" }}
      >
        <div style={{ letterSpacing: 1 }}>3MF · STL · Bambu and Orca preset</div>
        <div style={{ letterSpacing: 1 }}>no account, no upload, no charge</div>
      </div>
    </div>

    <div
      style={{
        flex: 1,
        alignSelf: "stretch",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Monolith seed="banner" width={700} height={324} />
    </div>
  </AbsoluteFill>
);
