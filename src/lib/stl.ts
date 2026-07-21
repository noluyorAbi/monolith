import type { BuiltMesh } from "./types";

/**
 * Binary STL. Header is 80 bytes, then a uint32 triangle count, then 50 bytes
 * per triangle: normal + three vertices as float32, plus a uint16 attribute
 * word that every slicer ignores.
 */
export function toBinarySTL(mesh: BuiltMesh, header: string): ArrayBuffer {
  const tris = mesh.triangles;
  const buffer = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const label = header.slice(0, 79);
  for (let i = 0; i < label.length; i++) bytes[i] = label.charCodeAt(i) & 0x7f;

  view.setUint32(80, tris, true);

  const p = mesh.positions;
  let offset = 84;
  for (let t = 0; t < tris; t++) {
    const i = t * 9;
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    // STL is Z-up; the scene is Y-up, so swap on the way out.
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, -nz, true);
    view.setFloat32(offset + 8, ny, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, -az, true);
    view.setFloat32(offset + 20, ay, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, -bz, true);
    view.setFloat32(offset + 32, by, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, -cz, true);
    view.setFloat32(offset + 44, cy, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return buffer;
}
