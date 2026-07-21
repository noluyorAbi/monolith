import React, { useMemo } from "react";
import { buildMonolith } from "../src/lib/build";
import { yearFromDays } from "../src/lib/contributions";
import type { Day } from "../src/lib/types";
import frozen from "../data/contributions-2025.json";
import type { BuiltMesh, Variant } from "../src/lib/types";

/**
 * The object, drawn by projecting the real mesh rather than by illustrating it.
 * Every asset in this repository therefore comes from the same buildMonolith
 * the site and the exporters use, so a change to the geometry updates the
 * marketing images on the next render instead of leaving them stale.
 */

import { defaultPalette, type Palette } from "../src/lib/palettes";

/** Isometric. No perspective, which keeps a very wide object readable. */
function project(x: number, y: number, z: number): [number, number] {
  const a = Math.PI / 6;
  return [(x - z) * Math.cos(a), (x + z) * Math.sin(a) - y];
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * factor)},${Math.round(((n >> 8) & 255) * factor)},${Math.round((n & 255) * factor)})`;
}

/**
 * Flat light for one triangle, from the wall it belongs to.
 *
 * One factor for every wall made the two visible sides of a bar the same
 * value, and on a light finish that value landed on the plate's own colour:
 * a short bar sank into the plate and only its lit top read as a stray
 * triangle. Separating the two walls gives every bar a corner to be seen by.
 */
function lightOn(p: Float32Array, i: number): number {
  const ux = p[i + 3] - p[i];
  const uy = p[i + 4] - p[i + 1];
  const uz = p[i + 5] - p[i + 2];
  const vx = p[i + 6] - p[i];
  const vy = p[i + 7] - p[i + 1];
  const vz = p[i + 8] - p[i + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const max = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
  if (max === Math.abs(ny)) return 1;
  return max === Math.abs(nx) ? 0.74 : 0.52;
}

interface Face {
  points: string;
  depth: number;
  fill: string;
  /** Plate and engraving. Everything a bar stands on, so it is painted first. */
  structural: boolean;
}

function faces(mesh: BuiltMesh, reveal: number, palette: Palette): Face[] {
  const out: Face[] = [];
  const p = mesh.positions;
  for (let t = 0; t < mesh.triangles; t++) {
    const i = t * 9;
    const level = Math.round(mesh.levels[t * 3]);
    const order = mesh.order[t * 3];
    const baseY = mesh.baseY[t * 3];

    // Same growth curve the viewer's shader runs, so a still from this matches
    // what the page does at the same moment.
    const local = Math.max(0, Math.min(1, (reveal - order * 0.72) / 0.28));
    const grown = 1 - Math.pow(1 - local, 3);
    const lift = (y: number) => baseY + (y - baseY) * grown;

    const [ax, ay] = project(p[i], lift(p[i + 1]), p[i + 2]);
    const [bx, by] = project(p[i + 3], lift(p[i + 4]), p[i + 5]);
    const [cx, cy] = project(p[i + 6], lift(p[i + 7]), p[i + 8]);
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 0) continue;

    const base = level < 0 ? palette.base : palette.ramp[Math.max(0, Math.min(4, level))];
    out.push({
      points: `${ax},${ay} ${bx},${by} ${cx},${cy}`,
      depth: p[i + 2] + p[i + 5] + p[i + 8] + p[i] + p[i + 3] + p[i + 6],
      fill: shade(base, lightOn(p, i)),
      structural: level < 0,
    });
  }
  // A painter's sort on x+z alone is exact between bars, because each bar is a
  // column on the grid and a larger x+z column stands wholly in front of a
  // smaller one. It is not exact for the plate: its top is two triangles the
  // size of the whole object, so their centre depth put half the grid behind
  // the plate and the grey top painted over the bars at the back. The plate
  // and its engraving carry nothing above them, so they can be laid down
  // first unconditionally and the bars sorted on top of them.
  return out.sort((a, b) =>
    a.structural === b.structural ? a.depth - b.depth : a.structural ? -1 : 1,
  );
}

/**
 * The year every asset draws: noluyorAbi's real 2025, frozen in data/ and
 * shared with the calibration test. Rendering an invented year here would put
 * a denser object and a longer print time in front of people than the one the
 * slicer was measured against.
 */
export function assetYear() {
  return yearFromDays(frozen.login, frozen.year, frozen.days as Day[]);
}

export const Monolith: React.FC<{
  width: number;
  height: number;
  variant?: Variant;
  /** 0 to 1. Below 1 the towers are still rising. */
  reveal?: number;
  /** Defaults to the finish the viewer opens with. */
  palette?: Palette;
  style?: React.CSSProperties;
}> = ({ width, height, variant = "skyline", reveal = 1, palette, style }) => {
  const finish = palette ?? defaultPalette();
  const mesh = useMemo(
    () => buildMonolith(assetYear(), { variant, sizeMm: 180, label: false }),
    [variant],
  );

  // The viewBox is fixed to the fully grown object so a rising animation does
  // not appear to zoom while it plays.
  const box = useMemo(() => {
    const full = faces(mesh, 1, finish);
    const xs = full.flatMap((f) => f.points.split(" ").map((q) => Number(q.split(",")[0])));
    const ys = full.flatMap((f) => f.points.split(" ").map((q) => Number(q.split(",")[1])));
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { minX, minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }, [mesh, finish]);

  const drawn = faces(mesh, reveal, finish);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={style}
    >
      {drawn.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} />
      ))}
    </svg>
  );
};
