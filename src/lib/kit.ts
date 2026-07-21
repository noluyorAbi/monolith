import { zip, type ZipEntry } from "./zip";
import { buildThreeMf } from "./threemf";
import { toBinarySTL } from "./stl";
import { slotForLevel, type ColourSlots } from "./slots";
import {
  MIN_TOWER_GAP_MM,
  NOZZLE_LINE_MM,
  bambuOverrides,
  estimate,
  fitsBed,
  overrides,
  type Material,
  type Printer,
  type Quality,
} from "./print";
import type { Part } from "./parts";
import type { BuiltMesh } from "./types";

/**
 * The print kit: one download with the model, the profile, and the reasoning.
 *
 * The split matters. The 3MF carries geometry only, because that is the part
 * every slicer agrees on. The profile ships as a preset file, because that is
 * the mechanism slicers actually support for sharing settings, and it was
 * verified to apply cleanly rather than assumed to.
 */

export interface KitOptions {
  login: string;
  year: number;
  variant: string;
  sizeMm: number;
  printer: Printer;
  material: Material;
  quality: Quality;
  slots: ColourSlots;
  sourceUrl: string;
  modelLicence: string;
  /**
   * True when GitHub could not be reached and the year was invented. It has to
   * travel with the artifact: someone is about to spend hours and filament on
   * this, and the file is labelled with their real handle.
   */
  sampleData?: boolean;
}

/**
 * A Bambu Studio / OrcaSlicer process preset. It inherits from the stock
 * preset rather than restating it, so it stays a dozen lines and keeps working
 * when the vendor updates their profiles underneath it.
 */
export function bambuPreset(options: KitOptions): string {
  const { printer, material, quality } = options;
  return `${JSON.stringify(
    {
      type: "process",
      name: presetName(printer, quality),
      from: "User",
      instantiation: "true",
      inherits: `${quality.presetBase} @BBL ${printer.presetSuffix}`,
      ...bambuOverrides(material, quality),
      compatible_printers: [printer.preset],
    },
    null,
    4,
  )}\n`;
}

/**
 * The preset's name appears in the file, in the instructions telling you to
 * select it, and in the zip entry path. They have to agree or the kit tells
 * you to pick something that is not there.
 */
export function presetName(printer: Printer, quality: Quality): string {
  return `MONOLITH ${quality.layerHeightMm.toFixed(2)}mm @BBL ${printer.presetSuffix}`;
}

/**
 * The stem every file in the kit shares. The download routes name their
 * responses with it too, so the card can never list a file the browser did not
 * receive under a different name.
 */
export function kitStem(o: {
  login: string;
  year: number;
  variant: string;
  sizeMm: number;
}): string {
  return `monolith-${o.login}-${o.year}-${o.variant}-${o.sizeMm}mm`;
}

export function printCard(parts: Part[], mesh: BuiltMesh, options: KitOptions): string {
  const { material, quality, printer, slots } = options;
  const est = estimate(parts, material, quality);
  const preset = presetName(printer, quality);
  const stem = kitStem(options);
  const pad = (s: string, n: number) => s.padEnd(n);

  const lines: string[] = [
    `MONOLITH`,
    `${options.login} · ${options.year} · ${options.variant} · ${options.sizeMm} mm`,
    ``,
  ];

  if (options.sampleData) {
    lines.push(
      `*******************************************************************`,
      `  SAMPLE DATA. GitHub could not be reached, so this is NOT`,
      `  ${options.login}'s real ${options.year}. The shape is invented.`,
      `  Print it if you like the object, but do not read anything`,
      `  into it. Try again when GitHub is reachable for the real year.`,
      `*******************************************************************`,
      ``,
    );
  }

  lines.push(
    `${options.sourceUrl}`,
    `Model licensed ${options.modelLicence}. It is your year: print it, remix it, put it on a shelf.`,
    ``,
    `-------------------------------------------------------------------`,
    `WHAT IS IN THIS KIT`,
    `-------------------------------------------------------------------`,
    `  ${stem}.3mf`,
    `      The object. One part per contribution level.`,
    `  ${stem}.stl`,
    `      The same object as a single solid, for anything that does not`,
    `      read 3MF.`,
    `  presets/${preset}.json`,
    `      Bambu Studio and OrcaSlicer process preset.`,
    `  PRINT-ME.txt`,
    `      This file.`,
    ``,
    `-------------------------------------------------------------------`,
    `BAMBU STUDIO / ORCASLICER`,
    `-------------------------------------------------------------------`,
    `  1. File > Import > Import Configs...  and pick the json in presets/.`,
    `  2. Open ${stem}.3mf.`,
    `  3. Select the "${preset}" process preset.`,
    `  4. Slice. There is nothing else to set.`,
    ``,
  );

  if (slots > 1) {
    lines.push(
      `  Multi colour: the object arrives as ${parts.length} separate parts, one per`,
      `  intensity. In the object list, set the filament on each part:`,
      ``,
    );
    for (const part of parts) {
      lines.push(`    ${pad(part.name, 14)} filament ${slotForLevel(part.level, slots)}`);
    }
    lines.push(
      ``,
      `  Slicers do not read colour assignments out of a plain 3MF, so this is`,
      `  two clicks per part rather than automatic. It is the honest version:`,
      `  the parts are already separated for you, the assignment is yours.`,
      ``,
    );
  } else {
    lines.push(
      `  Single colour: every part is the same filament. Slice as is.`,
      ``,
    );
  }

  lines.push(
    `-------------------------------------------------------------------`,
    `ANY OTHER SLICER`,
    `-------------------------------------------------------------------`,
    `  Load the 3MF or the STL and set these by hand. That is the whole list;`,
    `  everything else can stay on your usual defaults.`,
    ``,
  );
  for (const spec of overrides(material, quality)) {
    lines.push(`    ${pad(spec.label, 14)} ${pad(spec.value, 16)} ${spec.why}`);
  }

  lines.push(
    ``,
    `-------------------------------------------------------------------`,
    `WHAT TO EXPECT`,
    `-------------------------------------------------------------------`,
    `  Footprint        ${mesh.size.x.toFixed(0)} x ${mesh.size.z.toFixed(0)} mm, ${mesh.size.y.toFixed(0)} mm tall`,
    `  Solid volume     ${est.solidCm3.toFixed(1)} cm3`,
    `  Filament         about ${est.grams.toFixed(0)} g of ${material.name}`,
    `  Print time       roughly ${est.hoursLow.toFixed(1)} to ${est.hoursHigh.toFixed(1)} hours`,
    ``,
    `  Those two are estimates from the geometry, calibrated against a real`,
    `  Bambu Studio slice of a 180 mm skyline. A sparse year prints faster`,
    `  than a busy one, so treat them as a range, not a promise.`,
    ``,
  );

  if (mesh.print.engravePixelMm > 0 && mesh.print.engravePixelMm < NOZZLE_LINE_MM) {
    lines.push(
      `  !! At ${options.sizeMm} mm your handle is engraved in ${mesh.print.engravePixelMm.toFixed(2)} mm pixels,`,
      `     under the ${NOZZLE_LINE_MM} mm line a 0.4 mm nozzle lays down. Measured on this`,
      `     model, the lettering loses most of its material below that: the`,
      `     profile uses arachne, which keeps about three times more of it than`,
      `     the stock generator, but it will still be faint. 180 mm or larger, or`,
      `     a 0.2 mm nozzle, gives you a signature you can actually read.`,
      ``,
    );
  }
  if (mesh.print.gapMm !== null && mesh.print.gapMm < MIN_TOWER_GAP_MM) {
    lines.push(
      `  !! The gap between neighbouring towers is ${mesh.print.gapMm.toFixed(2)} mm, under one nozzle`,
      `     width. They will fuse at the base. Go bigger or drop to a 0.2 mm nozzle.`,
      ``,
    );
  }

  if (!fitsBed(mesh.size, printer)) {
    lines.push(
      `  !! ${options.sizeMm} mm does not fit a ${printer.name} (${printer.bedMm[0]} x ${printer.bedMm[1]} mm bed).`,
      `     Pick a smaller size, or slice it on a bigger machine.`,
      ``,
    );
  }

  lines.push(
    `-------------------------------------------------------------------`,
    `  No supports. Nothing overhangs: every face grows straight up off the`,
    `  plate. If your slicer wants to add them, it is guessing, turn it off.`,
    `-------------------------------------------------------------------`,
    ``,
  );
  return lines.join("\n");
}

/**
 * The 3MF as it ships, card included. Both the standalone download and the
 * copy inside the kit go through here, so the two cannot drift.
 */
export function buildKitThreeMf(parts: Part[], mesh: BuiltMesh, options: KitOptions): Buffer {
  return buildThreeMf(parts, {
    login: options.login,
    year: options.year,
    variant: options.variant,
    printer: options.printer,
    sourceUrl: options.sourceUrl,
    modelLicence: options.modelLicence,
    sampleData: options.sampleData,
    card: printCard(parts, mesh, options),
  });
}

export function buildKit(parts: Part[], mesh: BuiltMesh, options: KitOptions): Buffer {
  const encoder = new TextEncoder();
  const card = printCard(parts, mesh, options);
  const stem = kitStem(options);

  const threeMf = buildKitThreeMf(parts, mesh, options);

  const stl = toBinarySTL(mesh, `MONOLITH ${options.login} ${options.year} ${options.variant}`);
  const preset = presetName(options.printer, options.quality);

  const entries: ZipEntry[] = [
    { path: `${stem}.3mf`, data: new Uint8Array(threeMf) },
    { path: `${stem}.stl`, data: new Uint8Array(stl) },
    { path: `presets/${preset}.json`, data: encoder.encode(bambuPreset(options)) },
    { path: "PRINT-ME.txt", data: encoder.encode(card) },
  ];
  return zip(entries);
}
