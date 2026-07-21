import { MeshBuilder, scaleToSize, type Attribs } from "./mesh";
import { GLYPH_H, measureText, rasterise } from "./font5x7";
import type { BuildOptions, BuiltMesh, ContributionYear, Day, Variant } from "./types";

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

export const SIZES = [
  { id: "desk", name: "Desk", mm: 120, blurb: "Fits beside a keyboard" },
  { id: "shelf", name: "Shelf", mm: 180, blurb: "The default trophy" },
  { id: "statement", name: "Statement", mm: 260, blurb: "You want it seen" },
] as const;

export type SizeId = (typeof SIZES)[number]["id"];

export const DEFAULT_SIZE_ID: SizeId = "shelf";

export function sizeById(id: string): (typeof SIZES)[number] {
  return SIZES.find((s) => s.id === id) ?? SIZES.find((s) => s.id === DEFAULT_SIZE_ID)!;
}

function barHeight(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return MIN_BAR;
  return MIN_BAR + Math.pow(count / max, 0.7) * (MAX_H - MIN_BAR);
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

function buildSkyline(data: ContributionYear, label: boolean): MeshBuilder {
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
      const h = barHeight(day.count, max);
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
  return mb;
}

function buildRing(data: ContributionYear, label: boolean): MeshBuilder {
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
      const h = barHeight(day.count, max);
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

function buildWave(data: ContributionYear, label: boolean): MeshBuilder {
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
    return day ? barHeight(day.count, max) : 0;
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

function buildSpine(data: ContributionYear, label: boolean): MeshBuilder {
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
    const h = MIN_BAR + Math.pow(totals[m] / max, 0.75) * (MAX_H * 1.6 - MIN_BAR);
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

const BUILDERS: Record<Variant, (data: ContributionYear, label: boolean) => MeshBuilder> = {
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
  const raw = builder(data, options.label).finish();
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
