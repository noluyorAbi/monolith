import { MeshBuilder, scaleToSize, type Attribs } from "./mesh";
import { GLYPH_H, measureText, rasterise } from "./font5x7";
import type { BuildOptions, BuiltMesh, ContributionYear, Day, LangShare, MultiYearData, Variant } from "./types";
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

export type SizeId = "keyring" | "desk" | "shelf" | "statement";

export interface SizeDef {
  id: SizeId;
  name: string;
  mm: number;
  blurb: string;
}

export const SIZES: SizeDef[] = [
  { id: "keyring", name: "Keyring", mm: 60, blurb: "A year on your keys" },
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

/**
 * Raise text out of a +X-facing side wall. Seen from +X the reading direction
 * runs along -Z, so the first letter sits at the highest Z (nearest the
 * viewer's left) and the text is centred on `zCenter`.
 */
function engraveWallRight(
  mb: MeshBuilder,
  text: string,
  opts: { x: number; y: number; px: number; zCenter: number },
): void {
  const width = measureText(text) * opts.px;
  const zStart = opts.zCenter + width / 2;
  for (const p of rasterise(text)) {
    const z1 = zStart - p.col * opts.px;
    const y0 = opts.y + p.row * opts.px;
    mb.box(opts.x, y0, z1 - opts.px, opts.x + ENGRAVE_DEPTH, y0 + opts.px, z1);
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

const SIGIL_H = 3.4;

/**
 * Raise the starsign out of a back wall: the sign's name plus its
 * constellation, stars as dots and the connecting lines as strings of beads.
 * Beads print at any angle where a thin angled prism would not, and a dotted
 * line is how a star chart draws a figure anyway. Mirrored like all back-wall
 * text so it reads correctly from that side.
 */
function engraveSigilBack(
  mb: MeshBuilder,
  sigil: NonNullable<BuildOptions["sigil"]>,
  opts: { cx: number; z: number },
): void {
  const boxW = SIGIL_H * 1.5;
  const namePx = (ENGRAVE_TEXT_MM / GLYPH_H) * 0.8;
  const name = sigil.name.toUpperCase().replace(/^THE /, "");
  const nameW = measureText(name) * namePx;
  const gapW = 2.5;
  const left = opts.cx - (boxW + gapW + nameW) / 2;
  const zo = opts.z - ENGRAVE_DEPTH;
  // Viewed from -Z the x axis mirrors; flip the figure so the printed chart
  // matches the one on screen. SVG y runs down, wall y runs up: flip that too.
  const at = ([nx, ny]: [number, number]): [number, number] => [
    left + nameW + gapW + (1 - nx) * boxW,
    (BASE_H - SIGIL_H) / 2 + (1 - ny) * SIGIL_H,
  ];
  for (const p of sigil.points) {
    const [x, y] = at(p);
    mb.box(x - 0.5, y - 0.5, zo, x + 0.5, y + 0.5, opts.z);
  }
  for (const [a, b] of sigil.edges) {
    const [x1, y1] = at(sigil.points[a]);
    const [x2, y2] = at(sigil.points[b]);
    const beads = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 0.9));
    for (let i = 1; i < beads; i++) {
      const t = i / beads;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      mb.box(x - 0.3, y - 0.3, zo, x + 0.3, y + 0.3, opts.z);
    }
  }
  engraveWall(mb, name, {
    x: left,
    y: (BASE_H - GLYPH_H * namePx) / 2,
    px: namePx,
    z: opts.z,
    align: "left",
    face: "back",
  });
}

/**
 * The same starsign, laid flat on a horizontal (+Y) surface: the ring has no
 * flat wall, but its band encloses a clear centre. Viewed from above the
 * figure reads exactly like the on-screen card (x right, screen-down toward
 * the viewer), so no mirroring.
 */
function engraveSigilTop(
  mb: MeshBuilder,
  sigil: NonNullable<BuildOptions["sigil"]>,
  opts: { cx: number; cz: number; y: number; w: number; h: number },
): void {
  const at = ([nx, ny]: [number, number]): [number, number] => [
    opts.cx + (nx - 0.5) * opts.w,
    opts.cz + (ny - 0.5) * opts.h,
  ];
  const y1 = opts.y + ENGRAVE_DEPTH;
  for (const p of sigil.points) {
    const [x, z] = at(p);
    mb.box(x - 0.5, opts.y, z - 0.5, x + 0.5, y1, z + 0.5);
  }
  for (const [a, b] of sigil.edges) {
    const [x1, z1] = at(sigil.points[a]);
    const [x2, z2] = at(sigil.points[b]);
    const beads = Math.max(2, Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.9));
    for (let i = 1; i < beads; i++) {
      const t = i / beads;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      mb.box(x - 0.3, opts.y, z - 0.3, x + 0.3, y1, z + 0.3);
    }
  }
}

/**
 * Keyring loop, physical millimetres (applied via the builder's own scale).
 *
 * The hole is the one dimension that cannot scale: 4.4mm across takes any
 * split ring, and a proportional hole would stop accepting one below the
 * default size. Everything else is derived from it, so the loop is as small as
 * a usable hole allows rather than as large as it used to be.
 *
 * The previous 5.0mm outer radius made a 10.0mm loop, and at the 60mm size,
 * the one actually called Keyring, the plate is 9.6mm deep. The loop was wider
 * than the object was deep, which is why it read as a washer glued to a card.
 */
const LOOP_HOLE_R_MM = 2.2;
/** Material around the hole. 1.6mm at the plate's own thickness carries keys. */
const LOOP_WALL_MM = 1.6;
const LOOP_OUT_MM = LOOP_HOLE_R_MM + LOOP_WALL_MM;
const LOOP_IN_MM = LOOP_HOLE_R_MM;
/** How wide the tab is where it leaves the plate wall. Must exceed the loop. */
const LOOP_NECK_MM = 8.0;

/**
 * A flat annulus fused to the plate so the object hangs off a keyring.
 * Positions are raw units; the caller passes radii and thickness already
 * divided by its own eventual scale factor, so the printed loop is always
 * ~7.6mm across with a ~4.4mm hole, flush with the plate it grows out of.
 */
function loopAt(
  mb: MeshBuilder,
  cx: number,
  cz: number,
  R: number,
  r: number,
  h: number,
): void {
  const seg = 40;
  const p = (rad: number, a: number, y: number): [number, number, number] => [
    cx + Math.cos(a) * rad,
    y,
    cz - Math.sin(a) * rad,
  ];
  for (let i = 0; i < seg; i++) {
    const s = (i / seg) * Math.PI * 2;
    const e = ((i + 1) / seg) * Math.PI * 2;
    mb.quad(p(r, s, h), p(R, s, h), p(R, e, h), p(r, e, h));
    mb.quad(p(r, e, 0), p(R, e, 0), p(R, s, 0), p(r, s, 0));
    mb.quad(p(R, s, 0), p(R, e, 0), p(R, e, h), p(R, s, h));
    mb.quad(p(r, e, 0), p(r, s, 0), p(r, s, h), p(r, e, h));
  }
}

/**
 * Extrude a plan polygon from y0 to y1 as a closed prism. Points are (x, z).
 *
 * Winding is normalised here rather than demanded of the caller: a top cap
 * wound counter-clockwise seen from above has a negative shoelace in (x, z),
 * which is the same sense `mesh.ts` documents for its own wedges. The caps are
 * fanned from the first point, so the polygon has to be star-shaped from it.
 */
function prism(mb: MeshBuilder, pts: [number, number][], y0: number, y1: number): void {
  if (pts.length < 3 || y1 <= y0) return;
  let shoelace = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    shoelace += ax * bz - bx * az;
  }
  const p = shoelace > 0 ? [...pts].reverse() : pts;
  const top = (i: number): [number, number, number] => [p[i][0], y1, p[i][1]];
  const bot = (i: number): [number, number, number] => [p[i][0], y0, p[i][1]];
  for (let i = 1; i + 1 < p.length; i++) {
    mb.tri(top(0), top(i), top(i + 1));
    mb.tri(bot(0), bot(i + 1), bot(i));
  }
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    mb.quad(bot(i), bot(j), top(j), top(i));
  }
}

/**
 * The loop for a rectangular plate: a tab growing out of the LEFT wall,
 * centred on it, flush with the plate top and bottom.
 *
 * Two things were wrong with the annulus this replaces. It was 3.2mm thick
 * whatever the plate was, so at the 60mm size, the one actually called
 * Keyring, it stood 1.83mm proud of a 1.37mm plate and read as a washer glued
 * to a card. And that extra thickness was protecting the wrong link: at that
 * size the plate itself is 1.37mm, so a loop 2.3 times stronger than the
 * object hanging off it only moves the break one step along. Flush is both
 * better looking and the honest answer.
 *
 * The outline is the convex hull of the hole's boss and the neck where it
 * leaves the wall, so the two sides run in on straight tangents instead of
 * meeting the wall in a pair of re-entrant notches. Those notches were the
 * ugly part, and a notch at a joint is also where a tab tears.
 */
function loopAtLeftWall(
  mb: MeshBuilder,
  x0: number,
  zCenter: number,
  k: number,
  plateD: number,
): void {
  const R = LOOP_OUT_MM / k;
  const r = LOOP_IN_MM / k;
  // Hole kept clear of the wall, and the tab buried into the plate so the
  // joint is fused material rather than two faces sharing a plane.
  const c = r + 0.3 / k;
  const bury = 0.4 / k;
  const cx = x0 - c;
  const cw = c + bury;
  const xEdge = cx + cw;
  // The neck is capped against the plate it leaves, so the tab never swallows
  // the whole end of a small object. At 60mm the plate is 8.9mm deep and a
  // flat 8mm neck left 0.4mm of shoulder on each side, which reads as the
  // plate having been cut off rather than the tab having grown out of it.
  const half = Math.min(LOOP_NECK_MM / k, plateD * 0.72) / 2;

  loopAt(mb, cx, zCenter, R, r, BASE_H);

  // Where the boss crosses the buried edge, and whether a tangent exists at
  // all. Both are guaranteed by the constants above; the guard is here so a
  // future change to them fails visibly instead of emitting a folded face.
  if (R <= cw || half <= Math.sqrt(R * R - cw * cw)) return;
  const q = Math.sqrt(R * R - cw * cw);

  for (const s of [1, -1]) {
    const pz = zCenter + s * half;
    const dlen = Math.hypot(cw, s * half);
    if (dlen <= R) continue;
    const ux = cw / dlen;
    const uz = (s * half) / dlen;
    const a = (R * R) / dlen;
    const h = (R * Math.sqrt(dlen * dlen - R * R)) / dlen;
    const bx = cx + ux * a;
    const bz = zCenter + uz * a;
    // Two tangent points; the one further from the wall is the outer one. The
    // other lies back under the plate and would fold the tab through itself.
    const t1: [number, number] = [bx - uz * h, bz + ux * h];
    const t2: [number, number] = [bx + uz * h, bz - ux * h];
    const t = t1[0] < t2[0] ? t1 : t2;

    const angQ = Math.atan2(s * q, cw);
    const angT = Math.atan2(t[1] - zCenter, t[0] - cx);
    let sweep = angT - angQ;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;

    const arc: [number, number][] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const ang = angQ + (sweep * i) / steps;
      arc.push([cx + Math.cos(ang) * R, zCenter + Math.sin(ang) * R]);
    }
    prism(mb, [[xEdge, pz], ...arc], 0, BASE_H);
  }
}

/**
 * The languages ring. Each kept language becomes its own solid at level
 * LANG_LEVEL + index, which is what makes it its own 3MF object (parts.ts
 * splits by level) and its own colour in the viewer and the GLB (both read
 * BuiltMesh.langs by the same index).
 */
const LANG_LEVEL = 10;
/** Raised enough to survive four 0.2mm layers at the default 180mm. */
const LANG_H = 0.8;
/** Strip depth + inset fit inside PLATE_PAD with 0.7 clear of the towers. */
const LANG_DEPTH = 2.2;
const LANG_INSET = 0.6;
const LANG_GAP = 0.8;

/** Defensive re-normalisation; the data layer already keeps top six at 4%+. */
function keptLangs(langs: LangShare[] | null | undefined): LangShare[] {
  const kept = (langs ?? []).filter((l) => l.share > 0).slice(0, 6);
  const sum = kept.reduce((a, l) => a + l.share, 0);
  return sum > 0 ? kept.map((l) => ({ ...l, share: l.share / sum })) : [];
}

/**
 * The ring as a bar: proportional segments on the plate top just inside the
 * front edge, reading left to right like GitHub's own language bar. The strip
 * lives in the plate's PLATE_PAD border, so it never touches a tower.
 */
function langBarTop(
  mb: MeshBuilder,
  langs: LangShare[],
  x0: number,
  x1: number,
  zFront: number,
): void {
  const kept = keptLangs(langs);
  if (kept.length === 0) return;
  const z1 = zFront - LANG_INSET;
  const usable = x1 - x0 - LANG_GAP * (kept.length - 1);
  if (usable <= 0) return;
  let x = x0;
  kept.forEach((l, i) => {
    const w = usable * l.share;
    mb.box(x, BASE_H, z1 - LANG_DEPTH, x + w, BASE_H + LANG_H, z1, {
      level: LANG_LEVEL + i,
      order: 0.97,
      baseY: BASE_H,
    });
    x += w + LANG_GAP;
  });
}

/**
 * The ring variant's version is a literal ring: proportional arcs around the
 * plinth's outer border, the PLATE_PAD annulus between the data band and the
 * plate edge, so it wraps the whole object.
 */
function langRingTop(mb: MeshBuilder, langs: LangShare[], plateR: number): void {
  const kept = keptLangs(langs);
  if (kept.length === 0) return;
  const r1 = plateR - LANG_INSET;
  const r0 = r1 - LANG_DEPTH;
  const gapA = LANG_GAP / ((r0 + r1) / 2);
  const usable = Math.PI * 2 - gapA * kept.length;
  if (usable <= 0) return;
  // Start at the back and sweep the full circle, biggest share first.
  let a = Math.PI / 2;
  for (let i = 0; i < kept.length; i++) {
    const sweep = usable * kept[i].share;
    mb.wedge(r0, r1, a, a + sweep, BASE_H, BASE_H + LANG_H, Math.max(2, Math.ceil(sweep / 0.1)), {
      level: LANG_LEVEL + i,
      order: 0.97,
      baseY: BASE_H,
    });
    a += sweep + gapA;
  }
}

/** "PEAK 47 - 9 FEB" for the busiest day, or null for an empty window. */
function peakText(days: Day[]): string | null {
  let best: Day | null = null;
  for (const d of days) if (d.count > 0 && (!best || d.count > best.count)) best = d;
  if (!best) return null;
  const m = Number(best.date.slice(5, 7)) - 1;
  if (m < 0 || m > 11) return null;
  return `PEAK ${best.count} - ${Number(best.date.slice(8, 10))} ${MONTHS[m]}`;
}

function buildSkyline(data: ContributionYear, o: BuildOptions, plate = true): MeshBuilder {
  const label = o.label;
  const dampening = o.dampening ?? 0;
  const mb = new MeshBuilder();
  const weeks = data.weeks;
  const cols = weeks.length;
  const gridW = cols * CELL;
  const gridD = 7 * CELL;
  const plateW = gridW + PLATE_PAD * 2;
  const plateD = gridD + PLATE_PAD * 2;
  const x0 = -plateW / 2;
  const z0 = -plateD / 2;

  // plate=false when the multi-year assembly provides one shared base plate
  // for all rows; the towers then sit directly on that shared plate.
  if (plate) mb.box(x0, 0, z0, x0 + plateW, BASE_H, z0 + plateD);

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

  // Opt-in extras live on the plate walls, so they need the plate. All are
  // independent of the signature label.
  if (plate && o.loop) loopAtLeftWall(mb, x0, 0, o.sizeMm / plateW, plateD);
  if (plate && o.sigil) engraveSigilBack(mb, o.sigil, { cx: 0, z: z0 });
  if (plate && o.langs?.length) {
    langBarTop(mb, o.langs, x0 + PLATE_PAD, x0 + plateW - PLATE_PAD, z0 + plateD);
  }
  if (plate && o.peak) {
    const t = peakText(data.days);
    if (t) {
      const peakPx = (ENGRAVE_TEXT_MM / GLYPH_H) * 0.8;
      engraveWall(mb, t, {
        x: -(measureText(t) * peakPx) / 2,
        y: (BASE_H - GLYPH_H * peakPx) / 2,
        px: peakPx,
        z: z0 + plateD,
        align: "left",
      });
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
  // them (the GraphQL path; the HTML fallback does not). They live on the
  // min-Z wall, which faces -Z, so the letters must extrude with face:"back"
  // (the spine builder raises text on this same wall the same way); "front"
  // would bury them inside the plate. One in each corner so both can be
  // present without colliding.
  const yearOf = (iso?: string) => (iso ? iso.slice(0, 4) : undefined);
  const milestonePx = px * 0.8;
  const milestoneY = (BASE_H - GLYPH_H * milestonePx) / 2;
  const joined = yearOf(data.joinedAt);
  if (joined) {
    engraveWall(mb, `JOINED ${joined}`, {
      x: x0 + PLATE_PAD,
      y: milestoneY,
      px: milestonePx,
      z: z0,
      align: "left",
      face: "back",
    });
  }
  const firstPr = yearOf(data.firstPrAt);
  if (firstPr) {
    engraveWall(mb, `1ST PR ${firstPr}`, {
      x: x0 + plateW - PLATE_PAD,
      y: milestoneY,
      px: milestonePx,
      z: z0,
      align: "right",
      face: "back",
    });
  }
  return mb;
}

function buildRing(data: ContributionYear, o: BuildOptions, plate = true): MeshBuilder {
  const label = o.label;
  const dampening = o.dampening ?? 0;
  const mb = new MeshBuilder();
  const weeks = data.weeks;
  const cols = weeks.length;
  const innerR = 30;
  const bandT = 5;
  const outerR = innerR + 7 * bandT;
  const plateR = outerR + PLATE_PAD;

  if (plate) mb.cylinder(plateR, 0, BASE_H, 128);

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

  // The ring has no flat wall, so its extras live on the clear centre of the
  // plate top, in rows: constellation deep, signature centre, sign name and
  // peak day toward the viewer. Every row is narrower than the chord of the
  // inner circle at its z, so nothing runs under the band. The keyring loop
  // hangs off the plinth's back-left edge, its hole clear of the circle.
  if (plate && o.loop) {
    const k = o.sizeMm / (2 * plateR);
    const dist = plateR + LOOP_IN_MM / k + 0.2 / k;
    // Flush with the plinth, like the rectangular tab. The plinth's edge is
    // curved, so the joint is a circle-circle lens rather than a chord against
    // a flat wall: ~5.9mm of fused material at the shipping constants.
    loopAt(mb, -dist * Math.SQRT1_2, -dist * Math.SQRT1_2, LOOP_OUT_MM / k, LOOP_IN_MM / k, BASE_H);
  }
  if (plate && o.sigil) {
    engraveSigilTop(mb, o.sigil, { cx: 0, cz: -15, y: BASE_H, w: 13.5, h: 9 });
    const name = o.sigil.name.toUpperCase().replace(/^THE /, "");
    const namePx = Math.min(0.5, (innerR * 1.4) / Math.max(1, measureText(name)));
    engraveTop(mb, name, { cx: 0, cz: 8.5, px: namePx, y: BASE_H });
  }
  if (plate && o.peak) {
    const t = peakText(data.days);
    if (t) {
      const peakPx = Math.min(0.5, (innerR * 1.5) / Math.max(1, measureText(t)));
      engraveTop(mb, t, { cx: 0, cz: 15, px: peakPx, y: BASE_H });
    }
  }
  if (plate && o.langs?.length) langRingTop(mb, o.langs, plateR);

  if (!label) return mb;
  const text = `${signature(data)} ${data.year}`;
  const px = Math.min(1.0, (innerR * 1.5) / Math.max(1, measureText(text)));
  engraveTop(mb, text, { cx: 0, cz: 0, px, y: BASE_H });
  return mb;
}

function buildWave(data: ContributionYear, o: BuildOptions): MeshBuilder {
  const label = o.label;
  const dampening = o.dampening ?? 0;
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

  if (o.loop) loopAtLeftWall(mb, px(0), 0, o.sizeMm / gridW, gridD);
  if (o.sigil) engraveSigilBack(mb, o.sigil, { cx: 0, z: pz(0) });
  if (o.peak) {
    const t = peakText(data.days);
    if (t) {
      const peakPx = (ENGRAVE_TEXT_MM / GLYPH_H) * 0.8;
      engraveWall(mb, t, {
        x: px(cols) - 2,
        y: (BASE_H - GLYPH_H * peakPx) / 2,
        px: peakPx,
        z: pz(7),
        align: "right",
      });
    }
  }

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

// The spine's back wall carries the centred signature and its front wall the
// month labels, so the sigil and peak extras are inert here too.
function buildSpine(data: ContributionYear, o: BuildOptions, plate = true): MeshBuilder {
  const label = o.label;
  const dampening = o.dampening ?? 0;
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

  if (plate) mb.box(x0, 0, z0, x0 + plateW, BASE_H, z0 + plateD);
  if (plate && o.loop) loopAtLeftWall(mb, x0, 0, o.sizeMm / plateW, plateD);
  if (plate && o.langs?.length) {
    langBarTop(mb, o.langs, x0 + PLATE_PAD, x0 + plateW - PLATE_PAD, z0 + plateD);
  }

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

const BUILDERS: Record<
  Variant,
  (data: ContributionYear, o: BuildOptions, plate?: boolean) => MeshBuilder
> = {
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
  const raw = builder(data, options).finish();
  const scaled = scaleToSize(raw, options.sizeMm);

  // Everything is modelled at a nominal size and then scaled, so the features
  // that matter on the machine only get their real dimensions here.
  const k = options.sizeMm / Math.max(raw.size.x, raw.size.z);
  scaled.print = {
    engravePixelMm: options.label ? (ENGRAVE_TEXT_MM / GLYPH_H) * k : 0,
    gapMm: GAPPED.includes(options.variant) ? GAP * k : null,
  };
  // The list that names and colours the language levels, in the exact order
  // the geometry used. Wave built none (no plate border), so it carries none.
  const langs = options.variant === "wave" ? [] : keptLangs(options.langs);
  if (langs.length) scaled.langs = langs;
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
 * Stack several years into one object, oldest at the back, newest at the
 * front. Years are terraces along Z (the width stays one year's width, only
 * the depth grows), and every row stands on ONE continuous base plate, so the
 * result is a single connected solid rather than N loose plates with air
 * between them. Rows are built plate-less in raw units and share one scale
 * factor, so a partial year comes out proportionally narrower with the same
 * cell size as its neighbours. The signature, the year span and the account
 * milestones are engraved on the shared plate's walls. The caller still
 * checks `fitsBed` against the resulting depth.
 */
export function buildMultiYear(
  multi: MultiYearData,
  options: BuildOptions,
): BuiltMesh {
  const builder = BUILDERS[options.variant] ?? buildSkyline;
  const rowOptions: BuildOptions = { ...options, label: false, sigil: null, peak: false, loop: false };
  const rows = multi.years.map((y) => builder(y, rowOptions, false).finish());

  // Nominal per-row footprint from the CALENDAR, not from whichever towers
  // happen to exist: a sparse or empty year still owns a full-size terrace,
  // so the plate always spans every row and the side-wall year labels always
  // land on plate instead of floating in air beyond it.
  const RING_R = 30 + 7 * 5; // innerR + 7 bands, keep in sync with buildRing
  const foot = (y: ContributionYear): { w: number; d: number } =>
    options.variant === "ring"
      ? { w: RING_R * 2, d: RING_R * 2 }
      : options.variant === "spine"
        ? { w: 12 * 14, d: 26 } // 12 months x pitch, bar depth; see buildSpine
        : { w: y.weeks.length * CELL, d: 7 * CELL };

  // Row pitch: the deepest row plus a readable gap of plate between years.
  const rowDepth = Math.max(...multi.years.map((y) => foot(y).d));
  const rowGap = CELL * 2.5;
  const stride = rowDepth + rowGap;

  const positions: number[] = [];
  const levels: number[] = [];
  const order: number[] = [];
  const baseY: number[] = [];
  const append = (mesh: BuiltMesh, dz: number): void => {
    for (let v = 0; v < mesh.positions.length; v += 3) {
      positions.push(mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2] + dz);
      levels.push(mesh.levels[v / 3]);
      order.push(mesh.order[v / 3]);
      baseY.push(mesh.baseY[v / 3]);
    }
  };
  // Oldest year deepest, newest in front, so the signature wall stays the
  // outermost face.
  rows.forEach((mesh, i) => append(mesh, i * stride));

  // One complete plate under every row, sized from the nominal footprints so
  // its edge lands exactly PLATE_PAD outside the widest grid, same as a
  // single year's plate.
  const halfW = Math.max(...multi.years.map((y) => foot(y).w)) / 2;
  const px0 = -halfW - PLATE_PAD;
  const px1 = halfW + PLATE_PAD;
  const pz0 = -rowDepth / 2 - PLATE_PAD;
  const pz1 = (rows.length - 1) * stride + rowDepth / 2 + PLATE_PAD;
  const mb = new MeshBuilder();
  mb.box(px0, 0, pz0, px1, BASE_H, pz1);

  if (options.label) {
    const last = multi.years[multi.years.length - 1];
    const px = ENGRAVE_TEXT_MM / GLYPH_H;
    const textY = (BASE_H - ENGRAVE_TEXT_MM) / 2;
    const span =
      multi.fromYear === multi.toYear
        ? String(multi.toYear)
        : `${multi.fromYear}-${multi.toYear}`;
    engraveWall(mb, signature(last), { x: px0 + PLATE_PAD, y: textY, px, z: pz1, align: "left" });
    engraveWall(mb, span, { x: px1 - PLATE_PAD, y: textY, px, z: pz1, align: "right" });
    // Milestones live on the min-Z wall (the outermost back face), one per
    // corner, exactly like the single-year plate.
    const yearOf = (iso?: string) => (iso ? iso.slice(0, 4) : undefined);
    const milestonePx = px * 0.8;
    const milestoneY = (BASE_H - GLYPH_H * milestonePx) / 2;
    const joined = yearOf(last.joinedAt);
    if (joined) {
      engraveWall(mb, `JOINED ${joined}`, {
        x: px0 + PLATE_PAD,
        y: milestoneY,
        px: milestonePx,
        z: pz0,
        align: "left",
        face: "back",
      });
    }
    const firstPr = yearOf(last.firstPrAt);
    if (firstPr) {
      engraveWall(mb, `1ST PR ${firstPr}`, {
        x: px1 - PLATE_PAD,
        y: milestoneY,
        px: milestonePx,
        z: pz0,
        align: "right",
        face: "back",
      });
    }
    // Each terrace carries its own year on the plate's right side wall,
    // centred on its row, so a stacked print still says which row is which.
    const rowPx = px * 0.8;
    const rowY = (BASE_H - GLYPH_H * rowPx) / 2;
    multi.years.forEach((year, i) => {
      engraveWallRight(mb, String(year.year), { x: px1, y: rowY, px: rowPx, zCenter: i * stride });
    });
  }
  // Opt-in extras on the shared plate, independent of the signature label:
  // the sigil in the centre of the back wall (milestones keep the corners),
  // the peak day in the centre of the front wall (login and span keep those
  // corners). The peak reads across every rendered year.
  if (options.loop) loopAtLeftWall(mb, px0, (pz0 + pz1) / 2, options.sizeMm / (px1 - px0), pz1 - pz0);
  if (options.sigil) {
    engraveSigilBack(mb, options.sigil, { cx: (px0 + px1) / 2, z: pz0 });
  }
  if (options.peak) {
    const t = peakText(multi.years.flatMap((y) => y.days));
    if (t) {
      const peakPx = (ENGRAVE_TEXT_MM / GLYPH_H) * 0.8;
      engraveWall(mb, t, {
        x: (px0 + px1) / 2 - (measureText(t) * peakPx) / 2,
        y: (BASE_H - GLYPH_H * peakPx) / 2,
        px: peakPx,
        z: pz1,
        align: "left",
      });
    }
  }
  // The languages bar sits in the shared plate's own front border, clear of
  // the front row's terrace whatever the variant of the rows.
  if (options.langs?.length) {
    langBarTop(mb, options.langs, px0 + PLATE_PAD, px1 - PLATE_PAD, pz1);
  }
  append(mb.finish(), 0);

  // Width carries the single-year meaning of sizeMm; the depth grows with the
  // year count and is reported honestly for the bed check. Scaled by the plate
  // width so k matches a single year's scale factor exactly.
  const k = options.sizeMm / Math.max(1e-6, px1 - px0);

  const pos = new Float32Array(positions);
  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMinZ = Infinity, bMaxZ = -Infinity, bMaxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < bMinX) bMinX = pos[i];
    if (pos[i] > bMaxX) bMaxX = pos[i];
    if (pos[i + 1] < bMinY) bMinY = pos[i + 1];
    if (pos[i + 1] > bMaxY) bMaxY = pos[i + 1];
    if (pos[i + 2] < bMinZ) bMinZ = pos[i + 2];
    if (pos[i + 2] > bMaxZ) bMaxZ = pos[i + 2];
  }
  // Re-centre on X and Z, drop the base to y=0, and scale to millimetres.
  const cx = (bMinX + bMaxX) / 2;
  const cz = (bMinZ + bMaxZ) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * k;
    pos[i + 1] = (pos[i + 1] - bMinY) * k;
    pos[i + 2] = (pos[i + 2] - cz) * k;
  }
  const scaledBaseY = new Float32Array(baseY.length);
  for (let i = 0; i < baseY.length; i++) scaledBaseY[i] = baseY[i] * k;

  const size = {
    x: (bMaxX - bMinX) * k,
    y: (bMaxY - bMinY) * k,
    z: (bMaxZ - bMinZ) * k,
  };
  const print = {
    engravePixelMm: options.label ? (ENGRAVE_TEXT_MM / GLYPH_H) * k : 0,
    gapMm: GAPPED.includes(options.variant) ? GAP * k : null,
  };
  const langs = keptLangs(options.langs);
  return {
    positions: pos,
    levels: new Float32Array(levels),
    order: new Float32Array(order),
    baseY: scaledBaseY,
    triangles: pos.length / 9,
    bounds: {
      min: [-size.x / 2, 0, -size.z / 2],
      max: [size.x / 2, size.y, size.z / 2],
    },
    size,
    print,
    ...(langs.length ? { langs } : {}),
  };
}

/**
 * Two people, one plate: A's skyline reads from the front, B's is turned
 * 180 degrees so it reads from the back, back to back like a duel. Always
 * skyline rows regardless of variant: facing calendars are the point, and
 * both walls are needed for the two names, so the sigil/peak extras stay
 * off this object. The keyring loop still works.
 */
export function buildDuel(
  a: ContributionYear,
  b: ContributionYear,
  options: BuildOptions,
): BuiltMesh {
  const rowOptions: BuildOptions = { ...options, label: false, sigil: null, peak: false, loop: false };
  const rowA = buildSkyline(a, rowOptions, false).finish();
  const rowB = buildSkyline(b, rowOptions, false).finish();

  const rowDepth = 7 * CELL;
  const spine = CELL * 2; // shared plate between the two grids
  const offset = (rowDepth + spine) / 2;

  const positions: number[] = [];
  const levels: number[] = [];
  const order: number[] = [];
  const baseY: number[] = [];
  const append = (mesh: BuiltMesh, rotate: boolean, dz: number): void => {
    for (let v = 0; v < mesh.positions.length; v += 3) {
      const x = mesh.positions[v];
      const z = mesh.positions[v + 2];
      // A 180-degree turn about Y (a rotation, so the winding survives).
      positions.push(rotate ? -x : x, mesh.positions[v + 1], (rotate ? -z : z) + dz);
      levels.push(mesh.levels[v / 3]);
      order.push(mesh.order[v / 3]);
      baseY.push(mesh.baseY[v / 3]);
    }
  };
  append(rowA, false, offset);
  append(rowB, true, -offset);

  const halfW = (Math.max(a.weeks.length, b.weeks.length) * CELL) / 2;
  const px0 = -halfW - PLATE_PAD;
  const px1 = halfW + PLATE_PAD;
  const pz1 = offset + rowDepth / 2 + PLATE_PAD;
  const pz0 = -pz1;
  const mb = new MeshBuilder();
  mb.box(px0, 0, pz0, px1, BASE_H, pz1);

  const k = options.sizeMm / (px1 - px0);
  if (options.loop) loopAtLeftWall(mb, px0, 0, k, pz1 - pz0);
  // The two grids leave a clear spine of shared plate between them; the
  // languages bar runs along it, readable from A's side.
  if (options.langs?.length) {
    langBarTop(mb, options.langs, px0 + PLATE_PAD, px1 - PLATE_PAD, LANG_DEPTH / 2 + LANG_INSET);
  }
  if (options.label) {
    const px = ENGRAVE_TEXT_MM / GLYPH_H;
    const textY = (BASE_H - ENGRAVE_TEXT_MM) / 2;
    // Each duellist's wall carries their own name; the year sits opposite.
    engraveWall(mb, signature(a), { x: px0 + PLATE_PAD, y: textY, px, z: pz1, align: "left" });
    engraveWall(mb, String(a.year), { x: px1 - PLATE_PAD, y: textY, px, z: pz1, align: "right" });
    engraveWall(mb, signature(b), { x: px0 + PLATE_PAD, y: textY, px, z: pz0, align: "left", face: "back" });
    engraveWall(mb, String(b.year), { x: px1 - PLATE_PAD, y: textY, px, z: pz0, align: "right", face: "back" });
  }
  const plate = mb.finish();
  for (let v = 0; v < plate.positions.length; v += 3) {
    positions.push(plate.positions[v], plate.positions[v + 1], plate.positions[v + 2]);
    levels.push(plate.levels[v / 3]);
    order.push(plate.order[v / 3]);
    baseY.push(plate.baseY[v / 3]);
  }

  const pos = new Float32Array(positions);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1];
    if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * k;
    pos[i + 1] = (pos[i + 1] - minY) * k;
    pos[i + 2] = (pos[i + 2] - cz) * k;
  }
  const scaledBaseY = new Float32Array(baseY.length);
  for (let i = 0; i < baseY.length; i++) scaledBaseY[i] = baseY[i] * k;

  const size = { x: (maxX - minX) * k, y: (maxY - minY) * k, z: (maxZ - minZ) * k };
  const langs = keptLangs(options.langs);
  return {
    positions: pos,
    levels: new Float32Array(levels),
    order: new Float32Array(order),
    baseY: scaledBaseY,
    triangles: pos.length / 9,
    bounds: {
      min: [-size.x / 2, 0, -size.z / 2],
      max: [size.x / 2, size.y, size.z / 2],
    },
    size,
    print: {
      engravePixelMm: options.label ? (ENGRAVE_TEXT_MM / GLYPH_H) * k : 0,
      gapMm: GAP * k,
    },
    ...(langs.length ? { langs } : {}),
  };
}
