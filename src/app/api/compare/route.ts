import { NextResponse } from "next/server";
import { fetchContributionYear } from "@/lib/github";
import { computeStats, parseYear } from "@/lib/contributions";
import { modelErrorResponse } from "@/lib/responses";

export const runtime = "nodejs";

/**
 * M7 / marktanalyse 6: compare two accounts on the same year. Returns both
 * years' stats and the deltas, so a "who contributed more" widget can be built
 * on top without either client fetching GitHub twice. The two lookups run in
 * parallel; a 404 on either side is a 404 for the comparison.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const a = url.searchParams.get("a") ?? "";
  const b = url.searchParams.get("b") ?? "";
  const year = parseYear(url.searchParams.get("year"));

  if (!a || !b) {
    return NextResponse.json({ error: "both `a` and `b` logins are required" }, { status: 400 });
  }

  try {
    const [ya, yb] = await Promise.all([fetchContributionYear(a, year), fetchContributionYear(b, year)]);
    const sa = computeStats(ya);
    const sb = computeStats(yb);
    return NextResponse.json(
      {
        a: { login: ya.login, year: ya.year, stats: sa },
        b: { login: yb.login, year: yb.year, stats: sb },
        delta: {
          total: sa.total - sb.total,
          activeDays: sa.activeDays - sb.activeDays,
          longestStreak: sa.longestStreak - sb.longestStreak,
          winner: sa.total === sb.total ? "tie" : sa.total > sb.total ? ya.login : yb.login,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return modelErrorResponse(err);
  }
}
