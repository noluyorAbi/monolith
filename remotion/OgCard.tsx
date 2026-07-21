import React from "react";
import { AbsoluteFill } from "remotion";
import { Monolith } from "./Monolith";
import { PROJECT } from "../src/lib/project";

/**
 * The default share card.
 *
 * Rather than drawing a picture of the object, this projects the real mesh:
 * the same buildMonolith the site and the exporters use, run through a plain
 * isometric projection. The card therefore cannot drift from the product, and
 * changing the geometry changes the marketing image for free.
 */

export const OgCard: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#060708",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        color: "#ecece9",
        padding: 60,
        justifyContent: "space-between",
      }}
    >
      {/* The object gets the right two thirds and is never behind the type. */}
      <Monolith
        width={720}
        height={430}
        style={{ position: "absolute", right: 24, top: 108 }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 19, letterSpacing: 10, color: "#8b9096" }}>MONOLITH</div>
        <div
          style={{
            fontSize: 17,
            color: "#060708",
            backgroundColor: "#d7ff45",
            padding: "10px 18px",
            borderRadius: 6,
            letterSpacing: 2,
          }}
        >
          FREE · SOURCE AVAILABLE
        </div>
      </div>

      <div style={{ maxWidth: 470, marginBottom: 8 }}>
        <div style={{ fontSize: 52, lineHeight: 1.14, letterSpacing: -1 }}>
          Your commit year,
          <br />
          <span style={{ color: "#8b9096" }}>cast as an object.</span>
        </div>
        <div style={{ fontSize: 19, color: "#8b9096", marginTop: 22, lineHeight: 1.5 }}>
          Any public GitHub handle.
          <br />
          3MF, STL and a slicer preset.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 18,
          color: "#5f656c",
        }}
      >
        <div>No account · no upload · source available</div>
        <div>{PROJECT.site.replace("https://", "")}</div>
      </div>
    </AbsoluteFill>
  );
};
