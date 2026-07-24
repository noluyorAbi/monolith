import { NextResponse } from "next/server";
import { resolveModelSource } from "@/lib/github";
import { modelErrorResponse } from "@/lib/responses";
import { buildMonolith, buildMultiYear } from "@/lib/build";
import { printableParts } from "@/lib/parts";
import { buildKitThreeMf, kitStem } from "@/lib/kit";
import { parseModelRequest } from "@/lib/request";
import { PROJECT } from "@/lib/project";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseModelRequest(new URL(request.url));

  try {
    // Same resolver as every download: the 3MF matches the viewer in every
    // mode (single year, lifetime stack, range, repo skyline).
    const src = await resolveModelSource(options);
    const build = {
      variant: options.variant,
      sizeMm: options.sizeMm,
      label: true,
      dampening: options.dampening,
    };
    const mesh = src.multi ? buildMultiYear(src.multi, build) : buildMonolith(src.data, build);
    const parts = printableParts(mesh);

    const file = buildKitThreeMf(parts, mesh, {
      ...options,
      login: src.who,
      year: src.data.year,
      spanLabel: src.spanLabel,
      sourceUrl: PROJECT.url,
      modelLicence: PROJECT.modelLicence,
      sampleData: src.demo,
    });

    const name = `${kitStem({ ...options, login: src.who, year: src.data.year, spanLabel: src.spanLabel })}.3mf`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "model/3mf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Parts": String(parts.length),
        // Callers that automate downloads deserve to know the year is invented.
        "X-Monolith-Sample-Data": String(src.demo),
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
