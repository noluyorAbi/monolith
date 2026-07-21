import assert from "node:assert/strict";
import { test } from "vitest";
import { MeshBuilder, scaleToSize } from "@/lib/mesh";
import { buildMonolith, computeStats } from "@/lib/build";
import { toBinarySTL } from "@/lib/stl";
import { syntheticYear } from "@/lib/github";
import { measureText, rasterise } from "@/lib/font5x7";
import { constantTimeEqual, studioAccess } from "@/lib/admin";
import type { Variant } from "@/lib/types";

const VARIANTS: Variant[] = ["skyline", "ring", "wave", "spine"];

function triangleNormals(positions: Float32Array) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const ux = positions[i + 3] - positions[i];
    const uy = positions[i + 4] - positions[i + 1];
    const uz = positions[i + 5] - positions[i + 2];
    const vx = positions[i + 6] - positions[i];
    const vy = positions[i + 7] - positions[i + 1];
    const vz = positions[i + 8] - positions[i + 2];
    out.push([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
  }
  return out;
}

test("box faces point outward", () => {
  const mb = new MeshBuilder();
  mb.box(-1, -1, -1, 1, 1, 1);
  const mesh = mb.finish();
  assert.equal(mesh.triangles, 12);
  // Every face of a box centred on the origin has its normal pointing away
  // from the centre, so normal · centroid must be positive.
  for (let t = 0; t < mesh.triangles; t++) {
    const i = t * 9;
    const cx = (mesh.positions[i] + mesh.positions[i + 3] + mesh.positions[i + 6]) / 3;
    const cy = (mesh.positions[i + 1] + mesh.positions[i + 4] + mesh.positions[i + 7]) / 3;
    const cz = (mesh.positions[i + 2] + mesh.positions[i + 5] + mesh.positions[i + 8]) / 3;
    const n = triangleNormals(mesh.positions)[t];
    assert.ok(n[0] * cx + n[1] * cy + n[2] * cz > 0, `triangle ${t} winds inward`);
  }
});

test("a closed box has zero net area vector", () => {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 3, 5, 7);
  const mesh = mb.finish();
  const sum = triangleNormals(mesh.positions).reduce(
    (a, n) => [a[0] + n[0], a[1] + n[1], a[2] + n[2]],
    [0, 0, 0],
  );
  for (const v of sum) assert.ok(Math.abs(v) < 1e-6, `net area vector leaked: ${sum}`);
});

test("wedge and cylinder are watertight in the same sense", () => {
  const mb = new MeshBuilder();
  mb.wedge(4, 9, 0.2, 1.1, 0, 3, 4);
  mb.cylinder(6, 0, 2, 24);
  const mesh = mb.finish();
  const sum = triangleNormals(mesh.positions).reduce(
    (a, n) => [a[0] + n[0], a[1] + n[1], a[2] + n[2]],
    [0, 0, 0],
  );
  for (const v of sum) assert.ok(Math.abs(v) < 1e-4, `net area vector leaked: ${sum}`);
});

test("scaleToSize hits the requested footprint", () => {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 40, 10, 20);
  const scaled = scaleToSize(mb.finish(), 180);
  assert.ok(Math.abs(scaled.size.x - 180) < 1e-3);
  assert.ok(Math.abs(scaled.size.z - 90) < 1e-3);
  assert.ok(Math.abs(scaled.size.y - 45) < 1e-3);
});

test("every variant builds real geometry at the requested size", () => {
  const data = syntheticYear("octocat", 2025);
  for (const variant of VARIANTS) {
    const mesh = buildMonolith(data, { variant, sizeMm: 180, label: true });
    assert.ok(mesh.triangles > 500, `${variant} produced only ${mesh.triangles} triangles`);
    assert.ok(Math.abs(Math.max(mesh.size.x, mesh.size.z) - 180) < 1e-3, `${variant} wrong size`);
    assert.ok(mesh.size.y > 1, `${variant} is flat`);
    assert.ok(mesh.positions.every(Number.isFinite), `${variant} emitted NaN`);
    assert.equal(mesh.levels.length * 3, mesh.positions.length);
    assert.equal(mesh.order.length * 3, mesh.positions.length);
    assert.equal(mesh.baseY.length * 3, mesh.positions.length);
  }
});

test("binary STL header, count, and byte length line up", () => {
  const data = syntheticYear("octocat", 2025);
  const mesh = buildMonolith(data, { variant: "skyline", sizeMm: 120, label: true });
  const buffer = toBinarySTL(mesh, "MONOLITH octocat 2025");
  const view = new DataView(buffer);
  assert.equal(buffer.byteLength, 84 + mesh.triangles * 50);
  assert.equal(view.getUint32(80, true), mesh.triangles);
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 21));
  assert.equal(header, "MONOLITH octocat 2025");
});

test("STL exports Z-up unit normals", () => {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 10, 4, 6);
  const buffer = toBinarySTL(mb.finish(), "test");
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  let sawUp = false;
  for (let t = 0; t < count; t++) {
    const o = 84 + t * 50;
    const n = [view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true)];
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, "normal is not unit length");
    if (n[2] > 0.99) sawUp = true;
  }
  // The scene's +Y top face has to land on STL's +Z.
  assert.ok(sawUp, "no upward facing triangle after the Y-up to Z-up swap");
});

test("stats read the calendar the way a human would", () => {
  const data = syntheticYear("octocat", 2024);
  const stats = computeStats(data);
  assert.equal(stats.total, data.days.reduce((a, d) => a + d.count, 0));
  assert.ok(stats.activeDays > 0 && stats.activeDays <= data.days.length);
  assert.ok(stats.longestStreak >= stats.currentStreak);
  assert.ok(stats.bestDay && stats.bestDay.count > 0);
});

test("synthetic years are deterministic and calendar shaped", () => {
  const a = syntheticYear("octocat", 2023);
  const b = syntheticYear("octocat", 2023);
  assert.deepEqual(a.days, b.days);
  assert.equal(a.days.length, 365);
  assert.ok(a.weeks.length >= 52 && a.weeks.length <= 54);
  assert.notEqual(a.total, syntheticYear("torvalds", 2023).total);
  assert.equal(a.demo, true);
});

test("font measures what it rasterises", () => {
  assert.equal(measureText("AB"), 11);
  assert.equal(measureText(""), 0);
  const pixels = rasterise("I");
  assert.ok(pixels.length > 0);
  assert.ok(pixels.every((p) => p.col >= 0 && p.col < 5 && p.row >= 0 && p.row < 7));
  // Unknown characters degrade to a dash rather than vanishing.
  assert.equal(measureText("é"), measureText("-"));
});

test("the obvious handle gets the obvious object", () => {
  const mesh = buildMonolith(syntheticYear("monolith", 2025), {
    variant: "skyline",
    sizeMm: 180,
    label: true,
  });
  assert.equal(mesh.triangles, 12);
  const ratio = mesh.size.y / mesh.size.x;
  assert.ok(Math.abs(ratio - 9 / 4) < 1e-3, `expected 1:4:9, got ${ratio}`);
});

test("every variant closes its surface", () => {
  const data = syntheticYear("octocat", 2025);
  for (const variant of VARIANTS) {
    const mesh = buildMonolith(data, { variant, sizeMm: 180, label: true });
    const normals = triangleNormals(mesh.positions);
    // For any closed surface the outward area vectors cancel exactly. Flipped
    // winding anywhere leaves a residual, so this catches inside-out faces that
    // slicers would otherwise reject.
    const area = normals.reduce((a, n) => a + Math.hypot(...n), 0);
    const sum = normals.reduce((a, n) => [a[0] + n[0], a[1] + n[1], a[2] + n[2]], [0, 0, 0]);
    const residual = Math.hypot(...sum) / area;
    assert.ok(residual < 1e-4, `${variant} leaks area: residual ${residual}`);
  }
});

test("the studio guard fails closed", () => {
  const key = "s3cret-key";
  // Configured: only the exact key gets in, from either the cookie or the query.
  assert.equal(studioAccess(key, { key, production: true }), true);
  assert.equal(studioAccess("s3cret-ke", { key, production: true }), false);
  assert.equal(studioAccess("s3cret-keZ", { key, production: true }), false);
  assert.equal(studioAccess("", { key, production: true }), false);
  assert.equal(studioAccess(undefined, { key, production: true }), false);

  // Unset in production must lock the queue rather than publish it.
  assert.equal(studioAccess(undefined, { production: true }), false);
  assert.equal(studioAccess("anything", { production: true }), false);

  // Unset locally stays open so the bench needs no ceremony.
  assert.equal(studioAccess(undefined, { production: false }), true);
});

test("constant time compare still answers correctly", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
  assert.equal(constantTimeEqual("", ""), true);
});
