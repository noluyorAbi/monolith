import assert from "node:assert/strict";
import { test } from "vitest";
import { inflateRawSync } from "node:zlib";
import { crc32, zip } from "@/lib/zip";
import { buildMonolith } from "@/lib/build";
import { splitByLevel, wholeObject, signedVolume } from "@/lib/parts";
import { buildThreeMf } from "@/lib/threemf";
import { bambuPreset, printCard } from "@/lib/kit";
import { bambuOverrides, materialById, printerById, qualityById } from "@/lib/print";
import { quote } from "@/lib/products";
import { slotForLevel } from "@/lib/slots";
import { syntheticYear } from "@/lib/github";

/** Independent reader, so the writer is checked against something other than itself. */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, "no end of central directory");
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(p), 0x02014b50, "bad central directory signature");
    const method = buffer.readUInt16LE(p + 10);
    const storedCrc = buffer.readUInt32LE(p + 16);
    const compSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const offset = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    assert.equal(buffer.readUInt32LE(offset), 0x04034b50, "bad local header signature");
    const localNameLen = buffer.readUInt16LE(offset + 26);
    const localExtraLen = buffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + localNameLen + localExtraLen;
    const raw = buffer.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(crc32(data), storedCrc, `${name}: crc mismatch`);
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const DATA = syntheticYear("octocat", 2025);
const MESH = buildMonolith(DATA, { variant: "skyline", sizeMm: 180, label: true });

test("the zip writer round trips through an independent reader", () => {
  const entries = [
    { path: "a.txt", data: new TextEncoder().encode("hello") },
    { path: "nested/b.bin", data: new Uint8Array(5000).fill(7) },
    { path: "empty.txt", data: new Uint8Array(0) },
  ];
  const files = unzip(zip(entries));
  assert.equal(files.size, 3);
  assert.equal(files.get("a.txt")!.toString(), "hello");
  assert.equal(files.get("nested/b.bin")!.length, 5000);
  assert.equal(files.get("empty.txt")!.length, 0);
});

test("the same object always produces the same bytes", () => {
  const entry = [{ path: "x", data: new TextEncoder().encode("deterministic") }];
  assert.deepEqual(zip(entry), zip(entry));
});

test("splitting by level yields closed solids that add up to the whole", () => {
  const parts = splitByLevel(MESH);
  assert.ok(parts.length >= 2, "expected a plinth plus at least one level");
  for (const part of parts) {
    assert.ok(part.closed, `${part.name} is not a closed solid`);
    assert.ok(part.volumeMm3 > 0, `${part.name} has no volume`);
    assert.ok(part.indices.every((i) => i < part.vertices.length / 3), `${part.name} index out of range`);
  }
  const summed = parts.reduce((a, p) => a + p.volumeMm3, 0);
  const whole = wholeObject(MESH);
  assert.ok(whole.closed, "the merged object is not closed");
  // The parts only touch, so their volumes add up rather than overlapping.
  assert.ok(Math.abs(summed - whole.volumeMm3) / whole.volumeMm3 < 0.001);
});

test("welding does not move the geometry", () => {
  const whole = wholeObject(MESH);
  // Y-up scene to Z-up print space: the object's height becomes its Z extent.
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < whole.vertices.length; i += 3) {
    minZ = Math.min(minZ, whole.vertices[i]);
    maxZ = Math.max(maxZ, whole.vertices[i]);
  }
  assert.ok(Math.abs(minZ) < 1e-3, `object does not sit on the plate, min z ${minZ}`);
  assert.ok(Math.abs(maxZ - MESH.size.y) < 1e-3, "height changed during conversion");
  assert.ok(signedVolume(whole.vertices, whole.indices) > 0, "surface is inside out");
});

test("the 3mf is a valid container with in-range geometry", () => {
  const parts = splitByLevel(MESH);
  const file = buildThreeMf(parts, {
    login: "octocat",
    year: 2025,
    variant: "skyline",
    printer: printerById("p1s"),
    sourceUrl: "https://example.test",
    modelLicence: "CC BY 4.0",
    card: "card",
  });
  const files = unzip(file);
  for (const required of ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"]) {
    assert.ok(files.has(required), `missing ${required}`);
  }
  const model = files.get("3D/3dmodel.model")!.toString();
  assert.match(model, /unit="millimeter"/);
  assert.match(model, /xmlns="http:\/\/schemas\.microsoft\.com\/3dmanufacturing\/core\/2015\/02"/);
  assert.equal((model.match(/<object /g) ?? []).length, parts.length);
  assert.equal((model.match(/<item /g) ?? []).length, parts.length);
  // basematerials is inert in every slicer that matters, so it is not emitted.
  assert.ok(!model.includes("<basematerials"));
  assert.ok(!model.includes(" pid="));

  const vertexCount = (model.match(/<vertex /g) ?? []).length;
  const triangleCount = (model.match(/<triangle /g) ?? []).length;
  assert.equal(vertexCount, parts.reduce((a, p) => a + p.vertices.length / 3, 0));
  assert.equal(triangleCount, parts.reduce((a, p) => a + p.triangles, 0));
  // Welding has to actually save something, or the split was pointless.
  assert.ok(vertexCount < triangleCount * 3);
});

test("the shipped preset inherits rather than restating the vendor profile", () => {
  const options = {
    login: "octocat",
    year: 2025,
    variant: "skyline",
    sizeMm: 180,
    printer: printerById("p1s"),
    material: materialById("pla"),
    quality: qualityById("standard"),
    slots: 4 as const,
    sourceUrl: "https://example.test",
    modelLicence: "CC BY 4.0",
  };
  const preset = JSON.parse(bambuPreset(options)) as Record<string, unknown>;
  assert.equal(preset.type, "process");
  assert.equal(preset.inherits, "0.16mm Optimal @BBL X1C");
  assert.deepEqual(preset.compatible_printers, ["Bambu Lab P1S 0.4 nozzle"]);
  // Small on purpose: overrides only, so a vendor profile update still applies.
  const expected = bambuOverrides(options.material, options.quality);
  for (const [key, value] of Object.entries(expected)) assert.equal(preset[key], value);
  assert.ok(Object.keys(preset).length < 20, "preset is restating the stock profile");

  const card = printCard(splitByLevel(MESH), MESH, options);
  assert.match(card, /No supports/);
  assert.match(card, /0\.16 mm/);
  for (const part of splitByLevel(MESH)) assert.ok(card.includes(part.name));
});

test("four slots map to a base plus a three step ramp", () => {
  assert.equal(slotForLevel(-1, 4), 1);
  assert.equal(slotForLevel(1, 4), 2);
  assert.equal(slotForLevel(2, 4), 2);
  assert.equal(slotForLevel(3, 4), 3);
  assert.equal(slotForLevel(4, 4), 4);
  for (const level of [-1, 1, 2, 3, 4]) {
    assert.equal(slotForLevel(level, 1), 1);
    assert.ok(slotForLevel(level, 2) <= 2);
    assert.ok(slotForLevel(level, 4) <= 4);
  }
});

test("the quote is the sum of its stated parts and nothing else", () => {
  const bill = quote({ grams: 22.4, hours: 3.9, slots: 1 }, "de");
  const lineSum = bill.lines.reduce((a, l) => a + l.amount, 0);
  assert.ok(Math.abs(lineSum - bill.subtotal) < 1e-9, "subtotal does not match the lines");
  // Rounded to the nearest 50 cents, so allow exactly that and no more.
  assert.ok(Math.abs(bill.total - (bill.subtotal + bill.shipping)) <= 0.25);

  // Four colours cost more in two distinct ways, and both must show up.
  const four = quote({ grams: 22.4, hours: 3.9, slots: 4 }, "de");
  assert.ok(four.grams > bill.grams, "purge waste is not counted");
  assert.ok(four.hours > bill.hours, "tool change time is not counted");
  assert.ok(four.subtotal > bill.subtotal);

  // Postage is the only thing that varies by destination.
  const world = quote({ grams: 22.4, hours: 3.9, slots: 1 }, "world");
  assert.equal(world.subtotal, bill.subtotal);
  assert.ok(world.shipping > bill.shipping);
  assert.ok(world.shippingDetail.length > 0);
});
