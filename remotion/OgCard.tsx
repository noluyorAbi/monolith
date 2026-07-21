import React from "react";
import { AbsoluteFill } from "remotion";
import { buildMonolith } from "../src/lib/build";
import { syntheticYear } from "../src/lib/github";
import { PROJECT } from "../src/lib/project";
import type { BuiltMesh } from "../src/lib/types";

/**
 * The default share card.
 *
 * Rather than drawing a picture of the object, this projects the real mesh:
 * the same buildMonolith the site and the exporters use, run through a plain
 * isometric projection. The card therefore cannot drift from the product, and
 * changing the geometry changes the marketing image for free.
 */

const RAMP = ["#1b2126", "#12603a", "#12894a", "#2fc45f", "#4dee7c"];

interface Face {
  points: string;
  depth: number;
  fill: string;
}

/** Isometric projection. No perspective, which keeps a wide object readable. */
function project(x: number, y: number, z: number): [number, number] {
  const a = Math.PI / 6;
  return [(x - z) * Math.cos(a), (x + z) * Math.sin(a) - y];
}

function faces(mesh: BuiltMesh): Face[] {
  const out: Face[] = [];
  const p = mesh.positions;
  for (let t = 0; t < mesh.triangles; t++) {
    const i = t * 9;
    const level = Math.round(mesh.levels[t * 3]);
    // Backface cull in projected space, so only the visible shell is drawn.
    const [ax, ay] = project(p[i], p[i + 1], p[i + 2]);
    const [bx, by] = project(p[i + 3], p[i + 4], p[i + 5]);
    const [cx, cy] = project(p[i + 6], p[i + 7], p[i + 8]);
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 0) continue;

    const normalUp = p[i + 1] === p[i + 4] && p[i + 4] === p[i + 7];
    const base = level < 0 ? "#20262c" : RAMP[Math.max(0, Math.min(4, level))];
    out.push({
      points: `${ax},${ay} ${bx},${by} ${cx},${cy}`,
      // Painter's algorithm: nearest last.
      depth: p[i + 2] + p[i + 5] + p[i + 8] + (p[i] + p[i + 3] + p[i + 6]),
      fill: normalUp ? base : shade(base, 0.62),
    });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

export const OgCard: React.FC = () => {
  const data = syntheticYear("monolith-og", 2025);
  const mesh = buildMonolith(data, { variant: "skyline", sizeMm: 180, label: false });
  const drawn = faces(mesh);

  const xs = drawn.flatMap((f) => f.points.split(" ").map((pt) => Number(pt.split(",")[0])));
  const ys = drawn.flatMap((f) => f.points.split(" ").map((pt) => Number(pt.split(",")[1])));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;

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
      <svg
        width={720}
        height={430}
        viewBox={`${minX} ${minY} ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", right: 24, top: 108 }}
      >
        {drawn.map((f, i) => (
          <polygon key={i} points={f.points} fill={f.fill} />
        ))}
      </svg>

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
          FREE · OPEN SOURCE
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
        <div>No account · no upload · MIT licensed</div>
        <div>{PROJECT.site.replace("https://", "")}</div>
      </div>
    </AbsoluteFill>
  );
};
