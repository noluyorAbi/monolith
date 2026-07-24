import { NextResponse } from "next/server";
import { resolveModelSource } from "@/lib/github";
import { modelErrorResponse } from "@/lib/responses";
import { buildMonolith, buildMultiYear } from "@/lib/build";
import { toBinarySTL } from "@/lib/stl";
import { kitStem } from "@/lib/kit";
import { parseModelRequest } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseModelRequest(new URL(request.url));

  try {
    // Same resolver as every download: the STL matches the viewer in every
    // mode (single year, lifetime stack, range, repo skyline).
    const src = await resolveModelSource(options);
    const build = {
      variant: options.variant,
      sizeMm: options.sizeMm,
      label: true,
      dampening: options.dampening,
    };
    const mesh = src.multi ? buildMultiYear(src.multi, build) : buildMonolith(src.data, build);
    // The header is the only place an STL can carry provenance, so say when
    // the year behind it was invented rather than read.
    const header =
      `MONOLITH ${src.who} ${src.spanLabel} ${options.variant} ${options.sizeMm}mm` +
      (src.demo ? " SAMPLE-DATA" : "");
    const stl = toBinarySTL(mesh, header);
    const name = `${kitStem({ ...options, login: src.who, year: src.data.year, spanLabel: src.spanLabel })}.stl`;

    return new NextResponse(stl, {
      headers: {
        "Content-Type": "model/stl",
        "Content-Length": String(stl.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Triangles": String(mesh.triangles),
        "X-Monolith-Sample-Data": String(src.demo),
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
