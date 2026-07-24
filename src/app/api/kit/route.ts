import { NextResponse } from "next/server";
import { resolveModelSource } from "@/lib/github";
import { modelErrorResponse } from "@/lib/responses";
import { buildMonolith, buildMultiYear } from "@/lib/build";
import { printableParts } from "@/lib/parts";
import { buildKit, kitStem } from "@/lib/kit";
import { parseModelRequest } from "@/lib/request";
import { PROJECT } from "@/lib/project";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseModelRequest(new URL(request.url));

  try {
    // The query names a subject and a span; the kit must contain the object
    // the viewer showed (lifetime stack, range, repo skyline), not a
    // single-year collapse of it.
    const src = await resolveModelSource(options);
    const build = {
      variant: options.variant,
      sizeMm: options.sizeMm,
      label: true,
      dampening: options.dampening,
    };
    const mesh = src.multi ? buildMultiYear(src.multi, build) : buildMonolith(src.data, build);
    const parts = printableParts(mesh);

    const file = buildKit(parts, mesh, {
      ...options,
      login: src.who,
      year: src.data.year,
      spanLabel: src.spanLabel,
      sourceUrl: PROJECT.url,
      modelLicence: PROJECT.modelLicence,
      sampleData: src.demo,
    });

    const name = `${kitStem({ ...options, login: src.who, year: src.data.year, spanLabel: src.spanLabel })}-print-kit.zip`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Parts": String(parts.length),
        "X-Monolith-Sample-Data": String(src.demo),
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
