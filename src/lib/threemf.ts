import { zip, type ZipEntry } from "./zip";
import type { Part } from "./parts";
import type { Printer } from "./print";

/**
 * 3MF writer, core specification only.
 *
 * There is deliberately no Bambu Studio project layer in here. That was tried
 * and measured: a hand-written project_settings.config makes Bambu Studio
 * 02.00.03.54 segfault on load, and even a complete 420 key config exported by
 * Bambu itself fails unless the model also carries the production extension
 * with its UUID scheme. Faking that would be guesswork that breaks on the next
 * release. Plain core 3MF, by contrast, loads and slices cleanly, and the print
 * settings ship next to it as a native preset the slicer is designed to import.
 * See scripts/verify-print-kit.sh, which proves both halves against a real
 * Bambu Studio install.
 *
 * Every part path, namespace and rule below was read out of a project exported
 * by Bambu Studio itself, not recalled.
 */

const CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const MODEL_REL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";

export interface ThreeMfOptions {
  login: string;
  year: number;
  variant: string;
  printer: Printer;
  sourceUrl: string;
  modelLicence: string;
  /** True when the year behind this shape was invented rather than read. */
  sampleData?: boolean;
  /** Plain text card describing the profile, carried inside the container. */
  card?: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Micron precision is well past what any FDM machine resolves. */
function num(value: number): string {
  return String(Number(value.toFixed(4)));
}

function contentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="txt" ContentType="text/plain"/>
</Types>
`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="${MODEL_REL}"/>
</Relationships>
`;
}

export function modelXml(
  parts: Part[],
  options: ThreeMfOptions,
  translate: [number, number],
): string {
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}">`);
  out.push(` <metadata name="Application">MONOLITH</metadata>`);
  out.push(
    ` <metadata name="Title">${esc(`${options.login} ${options.year} ${options.variant}`)}</metadata>`,
  );
  out.push(` <metadata name="Designer">${esc(options.login)}</metadata>`);
  const description = options.sampleData
    ? `SAMPLE DATA: GitHub was unreachable, so this shape is invented and is NOT ${options.login}'s real ${options.year}.`
    : `${options.login}'s ${options.year} of GitHub contributions, as an object. One part per intensity level.`;
  out.push(` <metadata name="Description">${esc(description)}</metadata>`);
  out.push(` <metadata name="LicenseTerms">${esc(options.modelLicence)}</metadata>`);
  out.push(` <metadata name="Origin">${esc(options.sourceUrl)}</metadata>`);
  out.push(` <resources>`);

  // No <basematerials>. It is the spec's colour carrier, but grepping the
  // importers of PrusaSlicer, OrcaSlicer, BambuStudio and libSavitar for it
  // returns nothing in all four: it is inert everywhere it would matter, and
  // the triangle pid path it opens in Cura's parser is untested. The parts
  // carry names instead, and the print card says which filament goes where.
  parts.forEach((part, index) => {
    out.push(`  <object id="${index + 1}" type="model" name="${esc(part.name)}">`);
    out.push(`   <mesh>`);
    out.push(`    <vertices>`);
    for (let v = 0; v < part.vertices.length; v += 3) {
      out.push(
        `     <vertex x="${num(part.vertices[v])}" y="${num(part.vertices[v + 1])}" z="${num(part.vertices[v + 2])}"/>`,
      );
    }
    out.push(`    </vertices>`);
    out.push(`    <triangles>`);
    for (let t = 0; t < part.indices.length; t += 3) {
      out.push(
        `     <triangle v1="${part.indices[t]}" v2="${part.indices[t + 1]}" v3="${part.indices[t + 2]}"/>`,
      );
    }
    out.push(`    </triangles>`);
    out.push(`   </mesh>`);
    out.push(`  </object>`);
  });

  out.push(` </resources>`);
  out.push(` <build>`);
  const [tx, ty] = translate;
  parts.forEach((_, index) => {
    out.push(
      `  <item objectid="${index + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(tx)} ${num(ty)} 0" printable="1"/>`,
    );
  });
  out.push(` </build>`);
  out.push(`</model>`);
  return out.join("\n");
}

export function buildThreeMf(parts: Part[], options: ThreeMfOptions): Buffer {
  // Parked on the middle of the plate so it opens ready to slice rather than
  // hanging off the corner waiting to be arranged.
  const centre: [number, number] = [options.printer.bedMm[0] / 2, options.printer.bedMm[1] / 2];
  const encoder = new TextEncoder();

  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: encoder.encode(contentTypes()) },
    { path: "_rels/.rels", data: encoder.encode(rootRels()) },
    { path: "3D/3dmodel.model", data: encoder.encode(modelXml(parts, options, centre)) },
  ];
  if (options.card) {
    entries.push({ path: "Metadata/MONOLITH.txt", data: encoder.encode(options.card) });
  }
  return zip(entries);
}
