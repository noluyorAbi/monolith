import { NextResponse } from "next/server";
import { fetchContributionYear } from "@/lib/github";
import { modelErrorResponse } from "@/lib/responses";
import { buildMonolith } from "@/lib/build";
import { toBinarySTL } from "@/lib/stl";
import { kitStem } from "@/lib/kit";
import { parseModelRequest } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseModelRequest(new URL(request.url));

  try {
    const data = await fetchContributionYear(options.login, options.year);
    const mesh = buildMonolith(data, {
      variant: options.variant,
      sizeMm: options.sizeMm,
      label: true,
    });
    // The header is the only place an STL can carry provenance, so say when
    // the year behind it was invented rather than read.
    const header =
      `MONOLITH ${data.login} ${data.year} ${options.variant} ${options.sizeMm}mm` +
      (data.demo ? " SAMPLE-DATA" : "");
    const stl = toBinarySTL(mesh, header);
    const name = `${kitStem({ ...options, login: data.login, year: data.year })}.stl`;

    return new NextResponse(stl, {
      headers: {
        "Content-Type": "model/stl",
        "Content-Length": String(stl.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Triangles": String(mesh.triangles),
        "X-Monolith-Sample-Data": String(data.demo),
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
