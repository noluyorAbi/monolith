import { NextResponse } from "next/server";
import { fetchRepoActivity, repoActivityToYear } from "@/lib/github";
import { buildMonolith } from "@/lib/build";
import { printableParts } from "@/lib/parts";
import { buildKitThreeMf, kitStem } from "@/lib/kit";
import { parseModelRequest } from "@/lib/request";
import { PROJECT } from "@/lib/project";
import { modelErrorResponse } from "@/lib/responses";

export const runtime = "nodejs";

/**
 * M14 / marktanalyse 5.4: a single repository's last-52-week commit skyline.
 * Unauthenticated REST, one request; the day grid is exact, so the object is
 * faithful. Reuses the same 3MF kit path as a user year.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const options = parseModelRequest(new URL(request.url));

  try {
    const activity = await fetchRepoActivity(owner, repo);
    const data = repoActivityToYear(activity);
    const mesh = buildMonolith(data, { variant: options.variant, sizeMm: options.sizeMm, label: true, dampening: options.dampening });
    const parts = printableParts(mesh);

    const file = buildKitThreeMf(parts, mesh, {
      ...options,
      login: `${owner}/${repo}`,
      year: data.year,
      sourceUrl: PROJECT.url,
      modelLicence: PROJECT.modelLicence,
      sampleData: false,
    });

    const name = `${kitStem({ ...options, login: `${owner}-${repo}`, year: data.year })}.3mf`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "model/3mf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Repo": `${owner}/${repo}`,
        "X-Monolith-Commits": String(activity.total),
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
