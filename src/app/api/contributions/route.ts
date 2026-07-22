import { NextResponse } from "next/server";
import { fetchContributionYear, fetchContributionYears } from "@/lib/github";
import { computeStats, parseYear } from "@/lib/contributions";
import { modelErrorResponse } from "@/lib/responses";
import type { MultiYearData } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  const year = parseYear(url.searchParams.get("year"));

  try {
    // M8 / marktanalyse 16 (JSON alongside visual) + M1: when `years` is given
    // the same endpoint returns the multi-year roll-up as JSON, so a machine
    // can read the lifetime composition without parsing the 3MF.
    const yearsParam = url.searchParams.get("years");
    if (yearsParam) {
      const years = yearsParam
        .split(",")
        .map((s) => parseYear(s))
        .filter((y, i, a) => a.indexOf(y) === i);
      const multi = await fetchContributionYears(login, years);
      return NextResponse.json(
        { multi, stats: statsForMulti(multi) },
        { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
      );
    }
    const data = await fetchContributionYear(login, year);
    return NextResponse.json(
      { data, stats: computeStats(data) },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return modelErrorResponse(err);
  }
}

/** A compact stat block for a multi-year roll-up. */
function statsForMulti(multi: MultiYearData) {
  let longestStreak = 0;
  let currentStreak = 0;
  let activeDays = 0;
  for (const y of multi.years) {
    const s = computeStats(y);
    longestStreak = Math.max(longestStreak, s.longestStreak);
    currentStreak += s.currentStreak;
    activeDays += s.activeDays;
  }
  return {
    total: multi.totalCommits,
    activeDays,
    longestStreak,
    currentStreak,
    totalIssues: multi.totalIssues,
    totalPullRequests: multi.totalPullRequests,
    totalReviews: multi.totalReviews,
    totalRepos: multi.totalRepos,
    years: multi.years.length,
  };
}

