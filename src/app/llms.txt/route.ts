import { PROJECT } from "@/lib/project";
import { VARIANTS, SIZES } from "@/lib/build";
import { MATERIALS, PRINTERS, QUALITIES, overrides, materialById, qualityById } from "@/lib/print";

export const runtime = "nodejs";

/**
 * llms.txt, per llmstxt.org: a plain markdown brief for language models, so an
 * assistant asked "how do I turn my GitHub year into something printable" can
 * answer accurately instead of guessing at the interface.
 *
 * It is generated rather than written, so it cannot drift from the code. The
 * settings table below is the same source the print kit ships.
 */
export function GET() {
  const specs = overrides(materialById("pla"), qualityById("standard"));
  const body = `# ${PROJECT.name}

> ${PROJECT.tagline} ${PROJECT.name} turns a public GitHub contribution year into a 3D-printable object and hands over the files for free. Type a handle, watch the object build in the browser, download a print kit, or have one printed at cost.

${PROJECT.name} is open source (${PROJECT.licence}) at ${PROJECT.url}. Generated models are licensed ${PROJECT.modelLicence}. No account, no sign-up, no upload: it reads the public contribution calendar GitHub already publishes.

## What it produces

A print kit ZIP containing:

- A 3MF of the object, split into one part per contribution intensity, written to the 3MF core specification so it opens in Bambu Studio, OrcaSlicer, PrusaSlicer and Cura.
- The same object as a binary STL, for tools that do not read 3MF.
- A Bambu Studio and OrcaSlicer process preset that inherits from the stock vendor profile and overrides only what this object needs.
- A plain text card listing every setting and the reason for it.

## Forms

${VARIANTS.map((v) => `- \`${v.id}\` — ${v.name}: ${v.blurb.toLowerCase()}.`).join("\n")}

## Sizes

${SIZES.map((s) => `- ${s.name}: ${s.mm} mm along the longest edge. ${s.blurb}.`).join("\n")}

Any size from 60 to 400 mm can be requested directly from the API. Below roughly 150 mm the engraved handle falls under one nozzle width and prints faint.

## Print profile

Chosen for this specific object; everything not listed stays on your own defaults.

${specs.map((s) => `- ${s.label}: ${s.value}. ${s.why}`).join("\n")}

## Materials and machines

- Filaments: ${MATERIALS.map((m) => m.name).join(", ")}.
- Qualities: ${QUALITIES.map((q) => `${q.name} (${q.layerHeightMm.toFixed(2)} mm)`).join(", ")}.
- Presets ship for: ${PRINTERS.map((p) => p.name).join(", ")}.

## Endpoints

- \`GET /api/kit?login=&year=&variant=&mm=&printer=&material=&quality=&slots=\` — the print kit as a ZIP.
- \`GET /api/3mf?login=&year=&variant=&mm=\` — the 3MF on its own.
- \`GET /api/stl?login=&year=&variant=&mm=\` — binary STL, 60 to 400 mm.
- \`GET /api/contributions?login=&year=\` — the parsed contribution year plus derived statistics, as JSON.

## Pages

- ${PROJECT.site}/ — the builder.
- ${PROJECT.site}/s/{login}?year={year} — a shareable page for one account and year.

## Printing it yourself

Nothing overhangs; the whole object grows straight up off a flat plinth, so supports are never needed. On a 0.4 mm nozzle, 180 mm or larger keeps the engraved handle readable and the towers separated. A 180 mm skyline uses roughly 22 g of filament and about four hours on a Bambu P1S.

## Having one printed

Offered at cost, shipped from Germany, with the filament, machine time, labour, packaging and postage itemised at checkout. There is no margin added. Anyone with a printer should use the free files instead.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
