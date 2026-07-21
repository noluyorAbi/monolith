import type { BuiltMesh } from "./types";

export interface Part {
  /** -1 for the plinth and engraving, 1..4 for contribution intensity. */
  level: number;
  name: string;
  /** Welded, Z-up, millimetres. */
  vertices: Float32Array;
  indices: Uint32Array;
  triangles: number;
  volumeMm3: number;
  /** True when the part's outward area vectors cancel, i.e. it is a closed solid. */
  closed: boolean;
}

export const LEVEL_NAMES: Record<number, string> = {
  [-1]: "Plinth",
  1: "Quiet days",
  2: "Steady days",
  3: "Busy days",
  4: "Peak days",
};

/**
 * Scene space is Y-up; 3MF, STL and every slicer are Z-up. One conversion,
 * stated once, rather than a sign flip smeared across the exporters.
 */
function toPrintSpace(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y];
}

/** Signed volume via the divergence theorem. Exact for a closed surface. */
export function signedVolume(vertices: Float32Array, indices: Uint32Array): number {
  let total = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2];
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2];
    total +=
      ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return total / 6;
}

/** Sum of outward area vectors, which is zero for any closed surface. */
function areaResidual(vertices: Float32Array, indices: Uint32Array): number {
  let sx = 0, sy = 0, sz = 0, area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = vertices[b] - vertices[a];
    const uy = vertices[b + 1] - vertices[a + 1];
    const uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a];
    const vy = vertices[c + 1] - vertices[a + 1];
    const vz = vertices[c + 2] - vertices[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    sx += nx; sy += ny; sz += nz;
    area += Math.hypot(nx, ny, nz);
  }
  return area > 0 ? Math.hypot(sx, sy, sz) / area : 0;
}

/**
 * Weld a triangle soup into an indexed mesh. Coordinates are snapped to a
 * micron before hashing, which is well below anything an FDM printer can
 * resolve and far above float32's noise at these magnitudes.
 */
function weld(triangles: number[][]): { vertices: Float32Array; indices: Uint32Array } {
  const lookup = new Map<string, number>();
  const verts: number[] = [];
  const indices: number[] = [];
  for (const [x, y, z] of triangles) {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let index = lookup.get(key);
    if (index === undefined) {
      index = verts.length / 3;
      lookup.set(key, index);
      verts.push(x, y, z);
    }
    indices.push(index);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices) };
}

/**
 * Break the object into one solid per contribution level, in print space.
 *
 * This is what makes multi-colour work: each level becomes its own 3MF object
 * that a slicer can hand to its own filament slot. It also keeps every piece
 * individually closed, since a bar and the plate it stands on merely touch
 * rather than intersect.
 */
export function splitByLevel(mesh: BuiltMesh): Part[] {
  const buckets = new Map<number, number[][]>();
  for (let t = 0; t < mesh.triangles; t++) {
    const level = Math.round(mesh.levels[t * 3]);
    let bucket = buckets.get(level);
    if (!bucket) buckets.set(level, (bucket = []));
    for (let v = 0; v < 3; v++) {
      const i = (t * 3 + v) * 3;
      bucket.push(toPrintSpace(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]));
    }
  }

  const parts: Part[] = [];
  for (const level of [...buckets.keys()].sort((a, b) => a - b)) {
    const { vertices, indices } = weld(buckets.get(level)!);
    if (indices.length === 0) continue;
    parts.push({
      level,
      name: LEVEL_NAMES[level] ?? `Level ${level}`,
      vertices,
      indices,
      triangles: indices.length / 3,
      volumeMm3: Math.abs(signedVolume(vertices, indices)),
      closed: areaResidual(vertices, indices) < 1e-4,
    });
  }
  return parts;
}

/** The whole object as one welded solid, for slicers driven by a single filament. */
export function wholeObject(mesh: BuiltMesh): Part {
  const soup: number[][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    soup.push(toPrintSpace(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]));
  }
  const { vertices, indices } = weld(soup);
  return {
    level: -1,
    name: "Monolith",
    vertices,
    indices,
    triangles: indices.length / 3,
    volumeMm3: Math.abs(signedVolume(vertices, indices)),
    closed: areaResidual(vertices, indices) < 1e-4,
  };
}

/**
 * The parts a slicer should receive.
 *
 * One solid per contribution level is what lets someone assign a filament per
 * intensity. If any group came out open, a single welded solid is the safe
 * answer: a slicer will not thank us for a shell it cannot fill.
 */
export function printableParts(mesh: BuiltMesh): Part[] {
  const split = splitByLevel(mesh);
  return split.every((p) => p.closed) ? split : [wholeObject(mesh)];
}
