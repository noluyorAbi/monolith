import type { BuiltMesh } from "./types";
import type { Palette } from "./palettes";

/**
 * A minimal glTF 2.0 writer that packs the monolith into one GLB binary.
 * Blender, Fusion, Unity, Unreal, Godot and the web all open GLB with vertex
 * colours, so the same object that prints also drops into any 3D workflow
 * without a converter. F8.
 *
 * Layout: a 12-byte header, then two chunks:
 *   1. JSON (the scene graph, geometry accessors, material with VERTEX_COLOR)
 *   2. BIN (non-indexed positions + colours as raw little-endian floats)
 *
 * The mesh is non-indexed: positions and levels are parallel per-vertex
 * arrays, and `triangles` is the triangle count (three vertices each).
 */

interface Packed {
  positions: Float32Array; // xyz per vertex
  colors: Float32Array; // rgba per vertex, 0..1
  indices: Uint32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

/** Flatten the non-indexed mesh into single interleaved buffers. */
export function packMesh(mesh: BuiltMesh, palette: Palette): Packed {
  const verts = mesh.positions.length / 3;
  const positions = mesh.positions; // already xyz floats
  const colors = new Float32Array(verts * 4);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < verts; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    // The viewer tints the mesh by palette per level; the GLB carries colours
    // inline, so apply the same mapping here. Level -1 / 0 is structural
    // (the base plate / supports) and takes the palette base.
    const level = mesh.levels[i];
    const rampIndex = level < 1 ? 0 : level > palette.ramp.length - 1 ? palette.ramp.length - 1 : level;
    const hex = rampIndex === 0 && level < 1 ? palette.base : palette.ramp[rampIndex] ?? palette.ramp[0];
    const c = hexToRgb(hex);
    colors[i * 4] = c.r;
    colors[i * 4 + 1] = c.g;
    colors[i * 4 + 2] = c.b;
    colors[i * 4 + 3] = 1;
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }

  const indices = new Uint32Array(verts);
  for (let i = 0; i < verts; i++) indices[i] = i;

  return { positions, colors, indices, bounds: { min, max } };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function align4(n: number): number {
  return (n + 3) & ~3;
}

export function writeGlb(mesh: BuiltMesh, palette: Palette): Buffer {
  const packed = packMesh(mesh, palette);
  const posBytes = packed.positions.byteLength;
  const colBytes = packed.colors.byteLength;
  const idxBytes = packed.indices.byteLength;

  // BIN chunk: positions, then colours, then indices (uint32, not 3-aligned).
  const binLength = align4(posBytes) + align4(colBytes) + idxBytes;
  const bin = Buffer.alloc(binLength);
  packed.positions.forEach((val, i) => bin.writeFloatLE(val, i * 4));
  const colOffset = align4(posBytes);
  packed.colors.forEach((val, i) => bin.writeFloatLE(val, colOffset + i * 4));
  const idxOffset = colOffset + align4(colBytes);
  packed.indices.forEach((val, i) => bin.writeUInt32LE(val, idxOffset + i * 4));

  const gltf = {
    asset: { version: "2.0", generator: "MONOLITH" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "monolith" }],
    meshes: [
      {
        name: "monolith",
        primitives: [
          {
            attributes: { POSITION: 0, COLOR_0: 1 },
            indices: 2,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    materials: [
      {
        name: "vertex-coloured",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0.0,
          roughnessFactor: 0.7,
        },
        doubleSided: true,
      },
    ],
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: colOffset, byteLength: colBytes, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: packed.positions.length / 3,
        type: "VEC3",
        min: packed.bounds.min,
        max: packed.bounds.max,
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: packed.colors.length / 4,
        type: "VEC4",
      },
      {
        bufferView: 2,
        componentType: 5125,
        count: packed.indices.length,
        type: "SCALAR",
      },
    ],
  };

  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonChunkLen = align4(json.length);
  const jsonPadded = Buffer.alloc(jsonChunkLen);
  json.copy(jsonPadded);

  const totalLength = 12 + 8 + jsonChunkLen + 8 + binLength;
  const out = Buffer.alloc(totalLength);
  // Header
  out.writeUInt32LE(0x46546c67, 0); // "glTF"
  out.writeUInt32LE(2, 4); // version
  out.writeUInt32LE(totalLength, 8);
  // JSON chunk
  out.writeUInt32LE(jsonChunkLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonPadded.copy(out, 20);
  // BIN chunk
  const binStart = 20 + jsonChunkLen;
  out.writeUInt32LE(binLength, binStart);
  out.writeUInt32LE(0x004e4942, binStart + 4); // "BIN\0"
  bin.copy(out, binStart + 8);

  return out;
}
