import * as THREE from "three";
import type { BuiltMesh } from "@/lib/types";

/**
 * A long flat object seen broadside wastes a portrait screen. Swinging the
 * azimuth down its length lets it recede diagonally instead, which fills a
 * tall frame with the same geometry.
 */
export function viewDirection(aspect: number): THREE.Vector3 {
  const portrait = THREE.MathUtils.clamp((1.15 - aspect) / 0.65, 0, 1);
  return new THREE.Vector3(
    THREE.MathUtils.lerp(0.2, 0.92, portrait),
    THREE.MathUtils.lerp(0.62, 0.72, portrait),
    THREE.MathUtils.lerp(1, 0.62, portrait),
  ).normalize();
}

/**
 * Distance that just contains the bounding box for this exact aspect ratio.
 * Fitting the projected corners rather than a bounding sphere matters here:
 * the skyline is long and flat, and a sphere fit would push it half a screen
 * away.
 */
export function fitDistance(
  mesh: BuiltMesh,
  offsetY: number,
  fovDeg: number,
  aspect: number,
  /** Overrides the angle without touching the containment maths. */
  dir: THREE.Vector3 = viewDirection(aspect),
): number {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();

  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  const tanX = tanY * aspect;

  const { min, max } = mesh.bounds;
  let needed = 0;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(
      i & 1 ? max[0] : min[0],
      (i & 2 ? max[1] : min[1]) + offsetY,
      i & 4 ? max[2] : min[2],
    );
    const along = p.dot(dir);
    const dx = Math.abs(p.dot(right));
    const dy = Math.abs(p.dot(camUp));
    needed = Math.max(needed, along + dx / tanX, along + dy / tanY);
  }
  return needed * 1.02;
}
