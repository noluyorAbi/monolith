import { MeshBuilder, scaleToSize, type Attribs } from "./mesh";
import { GLYPH_H, measureText, rasterise } from "./font5x7";
import type { BuildOptions, BuiltMesh, ContributionYear, Day, MultiYearData, Variant } from "./types";
import type { Printer } from "./print";

/** Millimetres. Chosen so a default skyline lands close to a 210mm desk piece. */
const CELL = 4;
const GAP = 0.6;
const MAX_H = 26;
const MIN_BAR = 0.9;
const BASE_H = 5;
const PLATE_PAD = 3.5;
const ENGRAVE_DEPTH = 0.7;
/**
 * Text height on the plate. Raised from 3.2 so that at the default 180 mm the
 * font pixel lands at 0.47 mm, clear of the 0.42 mm line a 0.4 mm nozzle lays
 * down. That threshold is not theoretical: slicing with and without the
 * engraving showed it contributes 22.5 mm of filament at 0.47 mm pixels and
 * 1.3 mm at 0.31 mm, which is the difference between a signature and a rumour.
 */
const ENGRAVE_TEXT_MM = 4.0;

export const VARIANTS: { id: Variant; name: string; blurb: string }[] = [
  { id: "skyline", name: "Skyline", blurb: "The full year, day by day" },
  { id: "ring", name: "Ring", blurb: "52 weeks bent into a circle" },
  { id: "wave", name: "Wave", blurb: "One continuous surface" },
  { id: "spine", name: "Spine", blurb: "Twelve months, twelve towers" },
];

export type SizeId = "desk" | "shelf" | "statement";

export interface SizeDef {
  id: SizeId;
  name: string;
  mm: number;
  blurb: string;
}

export const SIZES: SizeDef[] = [
  { id: "desk", name: "Desk", mm: 120, blurb: "Fits beside a keyboard" },
  { id: "shelf", name: "Shelf", mm: 180, blurb: "The default trophy" },
  { id: "statement", name: "Statement", mm: 260, blurb: "You want it seen" },
];

export const DEFAULT_SIZE_ID: SizeId = "shelf";

export function sizeById(id: string): (typeof SIZES)[number] {
  return SIZES.find((s) => s.id === id) ?? SIZES.find((s) => s.id === DEFAULT_SIZE_ID)!;
}

function barHeight(count: number, max: number, dampening = 0): number {
  if (count <= 0) return 0;
  if (max <= 0) return MIN_BAR;
  const d = clamp01(dampening);
  // dampening in [0,1] raises the power curve from 0.7 toward ~2.1 (pulling
  // mid days down) AND lowers the ceiling the busiest day may reach, from the
  // full MAX_H down to 40% of it. Without the ceiling drop the single spike
  // would still tower at 100% no matter the curve. F7.
  const power = 0.7 + d * 1.4;
  const cap = MAX_H * (1 - d * 0.6);
  return MIN_BAR + Math.pow(count / max, power) * (cap - MIN_BAR);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function maxCount(days: Day[]): number {
  let max = 0;
  for (const d of days) if (d.count > max) max = d.count;
  return max;
}

/**
 * Raise text out of a vertical wall. `face` says which way the wall points, so
 * the letters grow away from the solid instead of burying themselves in it.
 */
function engraveWall(
  mb: MeshBuilder,
  text: string,
  opts: {
    x: number;
    y: number;
    px: number;
    z: number;
    align: "left" | "right";
    face?: "front" | "back";
  },
): void {
  const width = measureText(text) * opts.px;
  const startX = opts.align === "left" ? opts.x : opts.x - width;
  const back = opts.face === "back";
  for (const p of rasterise(text)) {
    // Mirrored on a back-facing wall, so it reads correctly from that side.
    const col = back ? measureText(text) - p.col - 1 : p.col;
    const x0 = startX + col * opts.px;
    const y0 = opts.y + p.row * opts.px;
    const z0 = back ? opts.z - ENGRAVE_DEPTH : opts.z;
    mb.box(x0, y0, z0, x0 + opts.px, y0 + opts.px, z0 + ENGRAVE_DEPTH);
  }
}

/** Raise text out of a horizontal (+Y) surface, centred on (cx, cz). */
function engraveTop(
  mb: MeshBuilder,
  text: string,
  opts: { cx: number; cz: number; px: number; y: number },
): void {
  const width = measureText(text) * opts.px;
  const startX = opts.cx - width / 2;
  const startZ = opts.cz + (GLYPH_H * opts.px) / 2;
  for (const p of rasterise(text)) {
    const x0 = startX + p.col * opts.px;
    const z0 = startZ - (p.row + 1) * opts.px;
    mb.box(x0, opts.y, z0, x0 + opts.px, opts.y + ENGRAVE_DEPTH, z0 + opts.px);
  }
}

function signature(data: ContributionYear): string {
  return data.login.toUpperCase();
}

function buildSkyline(data: ContributionYear, label: boolean, dampening = 0): MeshBuilder {
  const mb = new MeshBuilder();
  const weeks = data.weeks;
  const cols = weeks.length;
  const gridW = cols * CELL;
  const gridD = 7 * CELL;
  const plateW = gridW + PLATE_PAD * 2;
  const plateD = gridD + PLATE_PAD * 2;
  const x0 = -plateW / 2;
  const z0 = -plateD / 2;

  mb.box(x0, 0, z0, x0 + plateW, BASE_H, z0 + plateD);

  const max = maxCount(data.days);
  const total = Math.max(1, data.days.length);
  let seen = 0;
  for (let w = 0; w < cols; w++) {
    for (let d = 0; d < 7; d++) {
      const day = weeks[w][d];
      if (!day) continue;
      const order = 0.05 + 0.95 * (seen / total);
      seen++;
      const h = barHeight(day.count, max, dampening);
      if (h <= 0) continue;
      const cx = x0 + PLATE_PAD + w * CELL;
      const cz = z0 + PLATE_PAD + d * CELL;
      const at: Attribs = { level: day.level, order, baseY: BASE_H };
      mb.box(cx + GAP / 2, BASE_H, cz + GAP / 2, cx + CELL - GAP / 2, BASE_H + h, cz + CELL - GAP / 2, at);
    }
  }

  if (!label) return mb;
  const px = ENGRAVE_TEXT_MM / GLYPH_H;
  const textY = (BASE_H - ENGRAVE_TEXT_MM) / 2;
  engraveWall(mb, signature(data), {
    x: x0 + PLATE_PAD,
    y: textY,
    px,
    z: z0 + plateD,
    align: "left",
  });
  engraveWall(mb, String(data.year), {
    x: x0 + plateW - PLATE_PAD,
    y: textY,
    px,
    z: z0 + plateD,
    align: "right",
  });
  // M4 / marktanalyse 5.4: engrave the account's real milestones on the base
  // plate so the object carries its own origin story. Only when the data has
  // them (the GraphQL path; the HTML fallback does not), and only on the
  // front face so the signature and the year keep the back.
  const yearOf = (iso?: string) => (iso ? iso.slice(0, 4) : undefined);
  const joined = yearOf(data.joinedAt);
  if (joined) {
    engraveWall(mb, `JOINED ${joined}`, {
      x: x0 + plateW / 2 - (measureText(`JOINED ${joined}`) * px) / 2,
      y: textY,
      px: px * 0.8,
      z: z0,
      align: "left",
      face: "front",
    });
  }
  const firstPr = yearOf(data.firstPrAt);
  if (firstPr) {
    engraveWall(mb, `1ST PR ${firstPr}`, {
      x: x0 + plateW / 2 - (measureText(`1ST PR ${firstPr}`) * px) / 2,
      y: textY,
      px: px * 0.8,
      z: z0,
      align: "left",
      face: "front",
    });
  }
  return mb;
}

function buildRing(data: ContributionYear, label: boolean, dampening = 0): MeshBuilder {
  const mb = new MeshBuilder();
  const weeks = data.weeks;
  const cols = weeks.length;
  const innerR = 30;
  const bandT = 5;
  const outerR = innerR + 7 * bandT;
  const plateR = outerR + PLATE_PAD;

  mb.cylinder(plateR, 0, BASE_H, 128);

  const max = maxCount(data.days);
  const total = Math.max(1, data.days.length);
  const sector = (Math.PI * 2) / cols;
  const angleGap = sector * 0.08;
  let seen = 0;
  for (let w = 0; w < cols; w++) {
    for (let d = 0; d < 7; d++) {
      const day = weeks[w][d];
      if (!day) continue;
      const order = 0.05 + 0.95 * (seen / total);
      seen++;
      const h = barHeight(day.count, max, dampening);
      if (h <= 0) continue;
      const a0 = w * sector + angleGap / 2;
      const a1 = (w + 1) * sector - angleGap / 2;
      const r0 = innerR + d * bandT + GAP / 2;
      const r1 = innerR + (d + 1) * bandT - GAP / 2;
      mb.wedge(r0, r1, a0, a1, BASE_H, BASE_H + h, 3, {
        level: day.level,
        order,
        baseY: BASE_H,
      });
    }
  }

  if (!label) return mb;
  const text = `${signature(data)} ${data.year}`;
  const px = Math.min(1.0, (innerR * 1.5) / Math.max(1, measureText(text)));
  engraveTop(mb, text, { cx: 0, cz: 0, px, y: BASE_H });
  return mb;
}

function buildWave(data: ContributionYear, label: boolean, dampening = 0): MeshBuilder {
  const mb = new MeshBuilder();
  const weeks = data.weeks;
  const cols = weeks.length;
  const gridW = cols * CELL;
  const gridD = 7 * CELL;
  const x0 = -gridW / 2;
  const z0 = -gridD / 2;
  const max = maxCount(data.days);

  const cellH = (w: number, d: number): number => {
    if (w < 0 || w >= cols || d < 0 || d > 6) return 0;
    const day = weeks[w][d];
    return day ? barHeight(day.count, max, dampening) : 0;
  };
  const cellLevel = (w: number, d: number): number => {
    if (w < 0 || w >= cols || d < 0 || d > 6) return 0;
    return weeks[w][d]?.level ?? 0;
  };

  // Corner heights are the mean of the up-to-four cells that touch them, which
  // turns the stepped calendar into a continuous landscape.
  const cornerH = (w: number, d: number): number => {
    const vals = [cellH(w - 1, d - 1), cellH(w, d - 1), cellH(w - 1, d), cellH(w, d)];
    return BASE_H + vals.reduce((a, b) => a + b, 0) / 4;
  };
  const cornerLevel = (w: number, d: number): number =>
    Math.max(cellLevel(w - 1, d - 1), cellLevel(w, d - 1), cellLevel(w - 1, d), cellLevel(w, d));

  const px = (w: number) => x0 + w * CELL;
  const pz = (d: number) => z0 + d * CELL;
  const at = (w: number, d: number): Attribs => ({
    level: cornerLevel(w, d),
    order: 0.05 + 0.95 * Math.min(1, w / cols),
    baseY: BASE_H,
  });

  for (let w = 0; w < cols; w++) {
    for (let d = 0; d < 7; d++) {
      const a: [number, number, number] = [px(w), cornerH(w, d), pz(d)];
      const b: [number, number, number] = [px(w + 1), cornerH(w + 1, d), pz(d)];
      const c: [number, number, number] = [px(w + 1), cornerH(w + 1, d + 1), pz(d + 1)];
      const e: [number, number, number] = [px(w), cornerH(w, d + 1), pz(d + 1)];
      mb.quad(e, c, b, a, at(w, d));
    }
  }

  // Skirt down to the floor plus a flat bottom, so the surface prints solid.
  for (let w = 0; w < cols; w++) {
    mb.quad(
      [px(w + 1), 0, pz(0)],
      [px(w), 0, pz(0)],
      [px(w), cornerH(w, 0), pz(0)],
      [px(w + 1), cornerH(w + 1, 0), pz(0)],
    );
    mb.quad(
      [px(w), 0, pz(7)],
      [px(w + 1), 0, pz(7)],
      [px(w + 1), cornerH(w + 1, 7), pz(7)],
      [px(w), cornerH(w, 7), pz(7)],
    );
  }
  for (let d = 0; d < 7; d++) {
    mb.quad(
      [px(0), 0, pz(d)],
      [px(0), 0, pz(d + 1)],
      [px(0), cornerH(0, d + 1), pz(d + 1)],
      [px(0), cornerH(0, d), pz(d)],
    );
    mb.quad(
      [px(cols), 0, pz(d + 1)],
      [px(cols), 0, pz(d)],
      [px(cols), cornerH(cols, d), pz(d)],
      [px(cols), cornerH(cols, d + 1), pz(d + 1)],
    );
  }
  mb.quad([px(0), 0, pz(0)], [px(cols), 0, pz(0)], [px(cols), 0, pz(7)], [px(0), 0, pz(7)]);

  if (!label) return mb;
  const tpx = ENGRAVE_TEXT_MM / GLYPH_H;
  engraveWall(mb, `${signature(data)} ${data.year}`, {
    x: px(0) + 2,
    y: (BASE_H - ENGRAVE_TEXT_MM) / 2,
    px: tpx,
    z: pz(7),
    align: "left",
  });
  return mb;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function buildSpine(data: ContributionYear, label: boolean, dampening = 0): MeshBuilder {
  const mb = new MeshBuilder();
  const totals = new Array(12).fill(0);
  for (const day of data.days) {
    const m = Number(day.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) totals[m] += day.count;
  }
  const max = Math.max(1, ...totals);

  const pitch = 14;
  const barW = 11;
  const depth = 26;
  const plateW = 12 * pitch + PLATE_PAD * 2;
  const plateD = depth + PLATE_PAD * 2;
  const x0 = -plateW / 2;
  const z0 = -plateD / 2;

  mb.box(x0, 0, z0, x0 + plateW, BASE_H, z0 + plateD);

  for (let m = 0; m < 12; m++) {
    const d = clamp01(dampening);
    const power = 0.75 + d * 1.4;
    const cap = MAX_H * 1.6 * (1 - d * 0.6);
    const h = MIN_BAR + Math.pow(totals[m] / max, power) * (cap - MIN_BAR);
    const cx = x0 + PLATE_PAD + m * pitch + (pitch - barW) / 2;
    const level = totals[m] === 0 ? 0 : Math.min(4, Math.ceil((totals[m] / max) * 4));
    mb.box(cx, BASE_H, z0 + PLATE_PAD, cx + barW, BASE_H + h, z0 + PLATE_PAD + depth, {
      level,
      order: 0.05 + 0.95 * (m / 11),
      baseY: BASE_H,
    });
    if (!label) continue;
    const lpx = 2.0 / GLYPH_H;
    engraveWall(mb, MONTHS[m], {
      x: cx + barW / 2 - (measureText(MONTHS[m]) * lpx) / 2,
      y: (BASE_H - 2.0) / 2,
      px: lpx,
      z: z0 + plateD,
      align: "left",
    });
  }

  if (!label) return mb;
  const px = ENGRAVE_TEXT_MM / GLYPH_H;
  const text = `${signature(data)} ${data.year}`;
  engraveWall(mb, text, {
    x: x0 + plateW / 2 - (measureText(text) * px) / 2,
    y: (BASE_H - ENGRAVE_TEXT_MM) / 2,
    px,
    z: z0,
    align: "left",
    face: "back",
  });
  return mb;
}

const BUILDERS: Record<Variant, (data: ContributionYear, label: boolean, dampening?: number) => MeshBuilder> = {
  skyline: buildSkyline,
  ring: buildRing,
  wave: buildWave,
  spine: buildSpine,
};

/** 1 : 4 : 9. For anyone who types the obvious handle. */
function buildSlab(): MeshBuilder {
  const mb = new MeshBuilder();
  const unit = 5;
  mb.box(-2 * unit, 0, -unit / 2, 2 * unit, 9 * unit, unit / 2, { level: 0, order: 0.4, baseY: 0 });
  return mb;
}

/** Forms whose towers are separated by a real air gap the nozzle has to clear. */
const GAPPED: Variant[] = ["skyline", "ring"];

export function buildMonolith(data: ContributionYear, options: BuildOptions): BuiltMesh {
  if (data.login.toLowerCase() === "monolith") {
    return scaleToSize(buildSlab().finish(), options.sizeMm * 0.28);
  }
  const builder = BUILDERS[options.variant] ?? buildSkyline;
  const raw = builder(data, options.label, options.dampening ?? 0).finish();
  const scaled = scaleToSize(raw, options.sizeMm);

  // Everything is modelled at a nominal size and then scaled, so the features
  // that matter on the machine only get their real dimensions here.
  const k = options.sizeMm / Math.max(raw.size.x, raw.size.z);
  scaled.print = {
    engravePixelMm: options.label ? (ENGRAVE_TEXT_MM / GLYPH_H) * k : 0,
    gapMm: GAPPED.includes(options.variant) ? GAP * k : null,
  };
  return scaled;
}

/**
 * Whether a finished object at `sizeMm` fits a printer's bed. The object is
 * square on the bed, so the limiting edge is the smaller bed dimension. F16:
 * the picker marks sizes a chosen printer cannot print rather than letting
 * the user queue a print that will fail on the first layer.
 */
export function fitsBed(printer: Printer, sizeMm: number): boolean {
  const bed = Math.min(printer.bedMm[0], printer.bedMm[1]);
  return sizeMm <= bed;
}

/** The largest offered size that actually fits the given printer. */
export function biggestSizeFor(printer: Printer): SizeDef {
  const fit = [...SIZES].reverse().find((s) => fitsBed(printer, s.mm));
  return fit ?? SIZES[0];
}

/** The offered sizes with a flag for whether the printer can print them. */
export function sizesForPrinter(printer: Printer): Array<SizeDef & { fits: boolean }> {
  return SIZES.map((s) => ({ ...s, fits: fitsBed(printer, s.mm) }));
}

/**
 * Stack several years into one object, oldest on the left. Each year is built
 * at the same `sizeMm` and placed beside the previous one with a fixed gutter,
 * so the multi-year model reads as a skyline of skylines (marktanalyse 5.4 / 6.1).
 * The total footprint grows with the year count; the caller is responsible for
 * checking `fitsBed` against the chosen printer for the resulting width.
 */
export function buildMultiYear(
  multi: MultiYearData,
  options: BuildOptions,
): BuiltMesh {
  const per = buildMonolith(multi.years[0], { ...options, label: false });
  const gutter = per.size.x * 0.12;
  const stride = per.size.x + gutter;
  const positions: number[] = [];
  const levels: number[] = [];
  const order: number[] = [];
  const baseY: number[] = [];

  multi.years.forEach((year, i) => {
    const mesh = buildMonolith(year, { ...options, label: i === multi.years.length - 1 });
    const dx = i * stride;
    for (let v = 0; v < mesh.positions.length; v += 3) {
      positions.push(mesh.positions[v] + dx, mesh.positions[v + 1], mesh.positions[v + 2]);
      levels.push(mesh.levels[v / 3]);
      order.push(mesh.order[v / 3]);
      baseY.push(mesh.baseY[v / 3]);
    }
  });

  const pos = new Float32Array(positions);
  const bounds = { min: [Infinity, Infinity, Infinity] as [number, number, number], max: [-Infinity, -Infinity, -Infinity] as [number, number, number] };
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      bounds.min[a] = Math.min(bounds.min[a], pos[i + a]);
      bounds.max[a] = Math.max(bounds.max[a], pos[i + a]);
    }
  }
  const size = {
    x: bounds.max[0] - bounds.min[0],
    y: bounds.max[1] - bounds.min[1],
    z: bounds.max[2] - bounds.min[2],
  };
  // Re-centre on X so the object sits in the middle of the build plate, and
  // lift so the base sits at y=0.
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= cx;
    pos[i + 1] -= bounds.min[1];
  }
  const print = {
    engravePixelMm: options.label ? (ENGRAVE_TEXT_MM / GLYPH_H) * (options.sizeMm / Math.max(size.x, size.z)) : 0,
    gapMm: GAPPED.includes(options.variant) ? GAP * (options.sizeMm / Math.max(size.x, size.z)) : null,
  };
  return {
    positions: pos,
    levels: new Float32Array(levels),
    order: new Float32Array(order),
    baseY: new Float32Array(baseY),
    triangles: pos.length / 9,
    bounds: {
      min: [-size.x / 2, 0, bounds.min[2]],
      max: [size.x / 2, size.y, bounds.max[2]],
    },
    size,
    print,
  };
}
