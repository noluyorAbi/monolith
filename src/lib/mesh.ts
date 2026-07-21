import type { BuiltMesh } from "./types";

type Vec3 = readonly [number, number, number];

export interface Attribs {
  /** Contribution level, -1 for structural geometry (plate, engraving). */
  level: number;
  /** Chronological reveal order, 0..1. */
  order: number;
  /** Y the element grows out of during the reveal. */
  baseY: number;
}

const STRUCTURAL: Attribs = { level: -1, order: 0, baseY: 0 };

/**
 * Accumulates a non-indexed triangle soup plus the per-vertex attributes the
 * reveal shader and the finish palette need. Winding is counter-clockwise seen
 * from outside, which is what both three.js and the STL spec expect.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private lvl: number[] = [];
  private ord: number[] = [];
  private base: number[] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  tri(a: Vec3, b: Vec3, c: Vec3, at: Attribs = STRUCTURAL): void {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) {
      this.lvl.push(at.level);
      this.ord.push(at.order);
      this.base.push(at.baseY);
    }
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, at: Attribs = STRUCTURAL): void {
    this.tri(a, b, c, at);
    this.tri(a, c, d, at);
  }

  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    at: Attribs = STRUCTURAL,
  ): void {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    const v000: Vec3 = [x0, y0, z0];
    const v100: Vec3 = [x1, y0, z0];
    const v110: Vec3 = [x1, y1, z0];
    const v010: Vec3 = [x0, y1, z0];
    const v001: Vec3 = [x0, y0, z1];
    const v101: Vec3 = [x1, y0, z1];
    const v111: Vec3 = [x1, y1, z1];
    const v011: Vec3 = [x0, y1, z1];

    this.quad(v001, v101, v111, v011, at); // +Z
    this.quad(v100, v000, v010, v110, at); // -Z
    this.quad(v000, v001, v011, v010, at); // -X
    this.quad(v101, v100, v110, v111, at); // +X
    this.quad(v011, v111, v110, v010, at); // +Y
    this.quad(v000, v100, v101, v001, at); // -Y
  }

  /**
   * Annular sector prism: a slice of a ring, extruded from y0 to y1.
   * Angles in radians, measured counter-clockwise from +X in the XZ plane.
   */
  wedge(
    r0: number,
    r1: number,
    a0: number,
    a1: number,
    y0: number,
    y1: number,
    segments: number,
    at: Attribs = STRUCTURAL,
  ): void {
    if (r1 <= r0 || y1 <= y0 || a1 <= a0) return;
    const seg = Math.max(1, segments);
    // Z is negated so that a rising angle sweeps counter-clockwise as seen from
    // above, which is the sense every winding below assumes.
    const p = (r: number, a: number, y: number): Vec3 => [
      Math.cos(a) * r,
      y,
      -Math.sin(a) * r,
    ];
    for (let i = 0; i < seg; i++) {
      const s = a0 + ((a1 - a0) * i) / seg;
      const e = a0 + ((a1 - a0) * (i + 1)) / seg;
      // top and bottom caps
      this.quad(p(r0, s, y1), p(r1, s, y1), p(r1, e, y1), p(r0, e, y1), at);
      this.quad(p(r0, e, y0), p(r1, e, y0), p(r1, s, y0), p(r0, s, y0), at);
      // outer and inner walls
      this.quad(p(r1, s, y0), p(r1, e, y0), p(r1, e, y1), p(r1, s, y1), at);
      this.quad(p(r0, e, y0), p(r0, s, y0), p(r0, s, y1), p(r0, e, y1), at);
    }
    // end caps closing the sector
    this.quad(p(r1, a0, y0), p(r1, a0, y1), p(r0, a0, y1), p(r0, a0, y0), at);
    this.quad(p(r0, a1, y0), p(r0, a1, y1), p(r1, a1, y1), p(r1, a1, y0), at);
  }

  /** Solid cylinder, used for the ring variant's plinth. */
  cylinder(r: number, y0: number, y1: number, segments: number, at: Attribs = STRUCTURAL): void {
    const p = (a: number, y: number): Vec3 => [Math.cos(a) * r, y, -Math.sin(a) * r];
    const top: Vec3 = [0, y1, 0];
    const bottom: Vec3 = [0, y0, 0];
    for (let i = 0; i < segments; i++) {
      const s = (i / segments) * Math.PI * 2;
      const e = ((i + 1) / segments) * Math.PI * 2;
      this.tri(top, p(s, y1), p(e, y1), at);
      this.tri(bottom, p(e, y0), p(s, y0), at);
      this.quad(p(s, y0), p(e, y0), p(e, y1), p(s, y1), at);
    }
  }

  finish(): BuiltMesh {
    const positions = new Float32Array(this.pos);
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = positions[i + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
    if (!Number.isFinite(min[0])) {
      min[0] = min[1] = min[2] = 0;
      max[0] = max[1] = max[2] = 0;
    }
    return {
      positions,
      levels: new Float32Array(this.lvl),
      order: new Float32Array(this.ord),
      baseY: new Float32Array(this.base),
      triangles: this.triangles,
      bounds: { min, max },
      size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] },
      print: { engravePixelMm: 0, gapMm: null },
    };
  }
}

/** Uniformly scale a finished mesh so its longest footprint edge hits `sizeMm`. */
export function scaleToSize(mesh: BuiltMesh, sizeMm: number): BuiltMesh {
  const longest = Math.max(mesh.size.x, mesh.size.z);
  if (longest <= 0) return mesh;
  const k = sizeMm / longest;
  if (Math.abs(k - 1) < 1e-6) return mesh;
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = mesh.positions[i] * k;
  const baseY = new Float32Array(mesh.baseY.length);
  for (let i = 0; i < baseY.length; i++) baseY[i] = mesh.baseY[i] * k;
  const scale3 = (v: [number, number, number]): [number, number, number] => [
    v[0] * k,
    v[1] * k,
    v[2] * k,
  ];
  return {
    ...mesh,
    positions,
    baseY,
    bounds: { min: scale3(mesh.bounds.min), max: scale3(mesh.bounds.max) },
    size: { x: mesh.size.x * k, y: mesh.size.y * k, z: mesh.size.z * k },
  };
}
