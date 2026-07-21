import { NextResponse } from "next/server";
import { fetchContributionYear } from "@/lib/github";
import { computeStats, parseYear } from "@/lib/contributions";
import { modelErrorResponse } from "@/lib/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  // Same clamp the download routes apply. Without it a junk year still issued
  // a real outbound request to GitHub and minted its own cache entry.
  const year = parseYear(url.searchParams.get("year"));

  try {
    const data = await fetchContributionYear(login, year);
    return NextResponse.json(
      { data, stats: computeStats(data) },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return modelErrorResponse(err);
  }
}
