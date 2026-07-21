import { NextResponse } from "next/server";
import { fetchContributionYear } from "@/lib/github";
import { modelErrorResponse } from "@/lib/responses";
import { buildMonolith } from "@/lib/build";
import { printableParts } from "@/lib/parts";
import { buildKitThreeMf, kitStem } from "@/lib/kit";
import { parseModelRequest } from "@/lib/request";
import { PROJECT } from "@/lib/project";

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
    const parts = printableParts(mesh);

    const file = buildKitThreeMf(parts, mesh, {
      ...options,
      login: data.login,
      year: data.year,
      sourceUrl: PROJECT.url,
      modelLicence: PROJECT.modelLicence,
      sampleData: data.demo,
    });

    const name = `${kitStem({ ...options, login: data.login, year: data.year })}.3mf`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "model/3mf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Parts": String(parts.length),
        // Callers that automate downloads deserve to know the year is invented.
        "X-Monolith-Sample-Data": String(data.demo),
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
