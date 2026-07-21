import type { Part } from "./parts";

/**
 * Everything in this file is taken from Bambu Studio's own bundled presets
 * (Contents/Resources/profiles/BBL), not from memory. Preset ids, filament
 * densities, prices and the setting key names are theirs; only the handful of
 * overrides below are ours, and each one is here for a reason that has to do
 * with this specific object.
 */

export interface Printer {
  id: string;
  name: string;
  /** Bambu machine preset id. */
  preset: string;
  /** Suffix Bambu uses on the matching process and filament presets. */
  presetSuffix: string;
  bedMm: [number, number];
  nozzleMm: number;
}

export const PRINTERS: Printer[] = [
  {
    id: "x1c",
    name: "Bambu Lab X1 Carbon",
    preset: "Bambu Lab X1 Carbon 0.4 nozzle",
    presetSuffix: "X1C",
    bedMm: [256, 256],
    nozzleMm: 0.4,
  },
  {
    id: "p1s",
    name: "Bambu Lab P1S / P1P",
    preset: "Bambu Lab P1S 0.4 nozzle",
    presetSuffix: "X1C",
    bedMm: [256, 256],
    nozzleMm: 0.4,
  },
  {
    id: "a1",
    name: "Bambu Lab A1",
    preset: "Bambu Lab A1 0.4 nozzle",
    presetSuffix: "A1",
    bedMm: [256, 256],
    nozzleMm: 0.4,
  },
  {
    id: "a1m",
    name: "Bambu Lab A1 mini",
    preset: "Bambu Lab A1 mini 0.4 nozzle",
    presetSuffix: "A1M",
    bedMm: [180, 180],
    nozzleMm: 0.4,
  },
];

export const DEFAULT_PRINTER_ID = "p1s";

export function printerById(id: string): Printer {
  return PRINTERS.find((p) => p.id === id) ?? PRINTERS.find((p) => p.id === DEFAULT_PRINTER_ID)!;
}

export interface Material {
  id: string;
  name: string;
  /** Bambu filament preset id, minus the printer suffix. */
  presetBase: string;
  type: "PLA" | "PETG";
  /** g/cm3, from the vendor preset. */
  density: number;
  /** EUR per kg, from the vendor preset. */
  pricePerKg: number;
  /** A long, narrow footprint lifts at the ends in anything that shrinks. */
  brim: "no_brim" | "outer_only";
  brimWidthMm: number;
  note: string;
}

export const MATERIALS: Material[] = [
  {
    id: "pla",
    name: "PLA Basic",
    presetBase: "Bambu PLA Basic",
    type: "PLA",
    density: 1.26,
    pricePerKg: 24.99,
    brim: "no_brim",
    brimWidthMm: 0,
    note: "The default. Crisp edges, no warping at this footprint.",
  },
  {
    id: "pla-matte",
    name: "PLA Matte",
    presetBase: "Bambu PLA Matte",
    type: "PLA",
    density: 1.32,
    pricePerKg: 24.99,
    brim: "no_brim",
    brimWidthMm: 0,
    note: "Hides layer lines. Best photographs, slightly softer detail.",
  },
  {
    id: "pla-silk",
    name: "PLA Silk",
    presetBase: "Bambu PLA Silk",
    type: "PLA",
    density: 1.32,
    pricePerKg: 29.99,
    brim: "no_brim",
    brimWidthMm: 0,
    note: "Metallic sheen. Shows every seam, so the seam is parked at the back.",
  },
  {
    id: "petg",
    name: "PETG Basic",
    presetBase: "Bambu PETG Basic",
    type: "PETG",
    density: 1.25,
    pricePerKg: 24.99,
    brim: "outer_only",
    brimWidthMm: 3,
    note: "Tougher and heat safe. Needs a brim on a plinth this long.",
  },
];

export const DEFAULT_MATERIAL_ID = "pla";

export function materialById(id: string): Material {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS.find((m) => m.id === DEFAULT_MATERIAL_ID)!;
}

export interface Quality {
  id: string;
  name: string;
  layerHeightMm: number;
  /** Bambu process preset id, minus the printer suffix. */
  presetBase: string;
  note: string;
}

export const QUALITIES: Quality[] = [
  { id: "fine", name: "Fine", layerHeightMm: 0.12, presetBase: "0.12mm Fine", note: "Sharpest tower tops, longest print" },
  { id: "standard", name: "Standard", layerHeightMm: 0.16, presetBase: "0.16mm Optimal", note: "What we print ourselves" },
  { id: "fast", name: "Fast", layerHeightMm: 0.2, presetBase: "0.20mm Standard", note: "Layer lines visible on the towers" },
];

export const DEFAULT_QUALITY_ID = "standard";

export function qualityById(id: string): Quality {
  return QUALITIES.find((q) => q.id === id) ?? QUALITIES.find((q) => q.id === DEFAULT_QUALITY_ID)!;
}

export const WALL_LOOPS = 3;
export const TOP_SHELL_LAYERS = 5;
export const BOTTOM_SHELL_LAYERS = 3;
export const INFILL_DENSITY = 0.15;
export const INFILL_PATTERN = "gyroid";
/**
 * Measured, because the received wisdom here is wrong. Slicing the same object
 * with and without the engraving, under both generators:
 *
 *   size    font pixel   classic     arachne
 *   180mm   0.47 mm      +22.53 mm   +19.50 mm   of filament for the handle
 *   120mm   0.31 mm      + 1.30 mm   + 3.86 mm
 *
 * So classic does NOT erase the handle at the default size: what saved it was
 * raising the text until the font pixel cleared the 0.42 mm line a 0.4 mm
 * nozzle lays down (see ENGRAVE_TEXT_MM in build.ts). Arachne is still worth
 * setting because below that threshold it recovers roughly three times as much
 * of the lettering, but it is an improvement, not a rescue.
 */
export const WALL_GENERATOR = "arachne";

/** The line a 0.4 mm nozzle lays down. Detail under this is at the slicer's mercy. */
export const NOZZLE_LINE_MM = 0.42;
/** Below one nozzle width, neighbouring towers fuse at the base. */
export const MIN_TOWER_GAP_MM = 0.4;
/** Clearance kept between the object and the edge of the plate. */
export const BED_MARGIN_MM = 8;

export function fitsBed(size: { x: number; z: number }, printer: Printer): boolean {
  return (
    size.x + BED_MARGIN_MM <= printer.bedMm[0] && size.z + BED_MARGIN_MM <= printer.bedMm[1]
  );
}

export interface PrintSpec {
  /** The slicer key, as Bambu and Orca spell it. */
  key: string;
  label: string;
  /** What the value means to a person. */
  value: string;
  /** What to type into a slicer that is not Bambu or Orca. */
  raw: string;
  why: string;
}

/**
 * One list, two audiences.
 *
 * The card and the settings panel read the labels; the preset file reads the
 * keys. Writing them separately let them drift: detect_thin_wall reached the
 * preset but never the list headed "set these by hand. That is the whole
 * list", so anyone on another slicer silently lost it, and it is the setting
 * that keeps the engraved handle.
 */
export function overrides(material: Material, quality: Quality): PrintSpec[] {
  return [
    {
      key: "layer_height",
      label: "Layer height",
      value: `${quality.layerHeightMm.toFixed(2)} mm`,
      raw: quality.layerHeightMm.toFixed(2),
      why: "The top face of every tower is what people look at.",
    },
    {
      key: "wall_loops",
      label: "Walls",
      value: String(WALL_LOOPS),
      raw: String(WALL_LOOPS),
      why: "A tower is 3.4 mm wide, so three walls make it effectively solid.",
    },
    {
      key: "top_shell_layers",
      label: "Top layers",
      value: String(TOP_SHELL_LAYERS),
      raw: String(TOP_SHELL_LAYERS),
      why: "371 small top surfaces. Anything thinner pillows.",
    },
    {
      key: "bottom_shell_layers",
      label: "Bottom layers",
      value: String(BOTTOM_SHELL_LAYERS),
      raw: String(BOTTOM_SHELL_LAYERS),
      why: "Flat plinth straight on the plate.",
    },
    {
      key: "sparse_infill_density",
      label: "Infill",
      value: `${Math.round(INFILL_DENSITY * 100)}%`,
      raw: `${Math.round(INFILL_DENSITY * 100)}%`,
      why: "Only the plinth has any volume to fill.",
    },
    {
      key: "sparse_infill_pattern",
      label: "Infill pattern",
      value: INFILL_PATTERN,
      raw: INFILL_PATTERN,
      why: "Quiet under the towers and quick to print.",
    },
    {
      key: "wall_generator",
      label: "Wall generator",
      value: WALL_GENERATOR,
      raw: WALL_GENERATOR,
      why: "Recovers about three times more of the engraved handle at small sizes.",
    },
    {
      key: "detect_thin_wall",
      label: "Thin walls",
      value: "on",
      raw: "1",
      why: "Keeps features under one line width instead of dropping them.",
    },
    {
      key: "enable_support",
      label: "Supports",
      value: "off",
      raw: "0",
      why: "Every face grows straight up. There is not one overhang.",
    },
    {
      key: "seam_position",
      label: "Seam",
      value: "back",
      raw: "back",
      why: "Your handle is engraved on the front face. The seam is kept off it.",
    },
    {
      key: "brim_type",
      label: "Brim",
      value: material.brim === "no_brim" ? "none" : `${material.brimWidthMm} mm outer`,
      raw: material.brim,
      why:
        material.brim === "no_brim"
          ? "PLA holds a 180 mm footprint without one."
          : "PETG shrinks, and this plinth is long and narrow.",
    },
    {
      key: "brim_width",
      label: "Brim width",
      value: `${material.brimWidthMm} mm`,
      raw: String(material.brimWidthMm),
      why: "Follows the brim setting above.",
    },
  ];
}

/** The same list, keyed the way a Bambu or Orca preset wants it. */
export function bambuOverrides(material: Material, quality: Quality): Record<string, string> {
  return Object.fromEntries(overrides(material, quality).map((s) => [s.key, s.raw]));
}

export interface Estimate {
  solidCm3: number;
  materialCm3: number;
  grams: number;
  filamentCost: number;
  /** Hours, as a range because print time depends on the machine. */
  hoursLow: number;
  hoursHigh: number;
}

/** Surface area, used by the shell term of the material estimate. */
function surfaceArea(part: Part): number {
  let area = 0;
  const { vertices: v, indices: i } = part;
  for (let t = 0; t < i.length; t += 3) {
    const a = i[t] * 3, b = i[t + 1] * 3, c = i[t + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const vx = v[c] - v[a], vy = v[c + 1] - v[a + 1], vz = v[c + 2] - v[a + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return area;
}

/**
 * Calibration, measured rather than guessed.
 *
 * Bambu Studio 02.00.03.54 sliced the same 180 mm skyline three times with the
 * profile below. Filament length converts at 1.75 mm stock:
 *
 *   layer   filament        time        implied flow
 *   0.12    16.81 cm3    4h35m20s      1.018 mm3/s
 *   0.16    17.74 cm3    3h53m10s      1.268 mm3/s
 *   0.20    18.77 cm3    3h37m02s      1.441 mm3/s
 *
 * The raw shell model below predicted 23.69 cm3, because it counts the plate's
 * top face and every tower's underside as surface when the union has them
 * buried. SHELL_CALIBRATION is that systematic overcount. It and LAYER_BULK
 * were solved numerically against the three runs above; the fit reproduces all
 * three to within 0.3%. The flow line is a least squares fit through the same
 * points. test/calib.test.ts asserts it still holds.
 */
const SHELL_CALIBRATION = 0.55;
const LAYER_BULK = 1.38;
const FLOW_INTERCEPT = 0.3945;
const FLOW_SLOPE = 5.2887;


/**
 * The shell is the surface wrapped to wall thickness; whatever is left over is
 * filled at the infill rate. Thin towers hit the cap and come out solid, which
 * is what actually happens on the machine.
 *
 * Fitted on the skyline. Other forms have a different surface to volume ratio,
 * so treat the numbers as a band, which is how they are presented.
 */
export function estimate(parts: Part[], material: Material, quality: Quality): Estimate {
  const lineWidth = NOZZLE_LINE_MM;
  const wallThickness = WALL_LOOPS * lineWidth;
  let solid = 0;
  let used = 0;

  for (const part of parts) {
    const volume = part.volumeMm3;
    solid += volume;
    const shell = Math.min(volume, surfaceArea(part) * wallThickness * SHELL_CALIBRATION);
    used += shell + Math.max(0, volume - shell) * INFILL_DENSITY;
  }

  used *= 1 + LAYER_BULK * (quality.layerHeightMm - 0.16);
  const grams = (used / 1000) * material.density;
  const seconds = used / (FLOW_INTERCEPT + FLOW_SLOPE * quality.layerHeightMm);

  return {
    solidCm3: solid / 1000,
    materialCm3: used / 1000,
    grams,
    filamentCost: (grams / 1000) * material.pricePerKg,
    hoursLow: (seconds / 3600) * 0.85,
    hoursHigh: (seconds / 3600) * 1.25,
  };
}

export function formatPrice(euros: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}
