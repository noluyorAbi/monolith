import { NextResponse } from "next/server";
import { fetchContributionYear, fetchContributionYears, fetchCommitHours, fetchLifetime, fetchContributionRange } from "@/lib/github";
import { computeStats, parseYear } from "@/lib/contributions";
import { modelErrorResponse } from "@/lib/responses";
import type { MultiYearData } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  const year = parseYear(url.searchParams.get("year"));

  try {
    // M16 / marktanalyse 5.1: commit time-of-day, the most valuable finding in
    // the document. One bounded unauthenticated search returns the histogram.
    const hoursLogin = url.searchParams.get("hours");
    if (hoursLogin) {
      const hours = await fetchCommitHours(hoursLogin, year);
      return NextResponse.json(
        { hours },
        { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
      );
    }
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
    // M12 / marktanalyse 5.4 lifetime view: stack every year the account has.
    if (url.searchParams.has("lifetime")) {
      const multi = await fetchLifetime(login);
      return NextResponse.json(
        { multi, stats: statsForMulti(multi) },
        { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
      );
    }
    // M11 / marktanalyse 6.1 arbitrary window ("last 12 months", "2014-2024").
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && to) {
      const data = await fetchContributionRange(login, from, to);
      return NextResponse.json(
        { data, stats: computeStats(data) },
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

/**
 * The full stat block for a multi-year roll-up, computed over the years'
 * concatenated day list. This returns the SAME shape as a single year's
 * stats (the HUD renders busiest weekday and peak day unconditionally), plus
 * the roll-up's composition totals. Concatenating the days also makes the
 * streaks honest across year boundaries: a run over New Year's Eve counts as
 * one streak instead of two.
 */
function statsForMulti(multi: MultiYearData) {
  const days = multi.years
    .flatMap((y) => y.days)
    .sort((a, b) => a.date.localeCompare(b.date));
  const base = computeStats({ ...multi.years[0], days, total: multi.totalCommits });
  return {
    ...base,
    totalIssues: multi.totalIssues,
    totalPullRequests: multi.totalPullRequests,
    totalReviews: multi.totalReviews,
    totalRepos: multi.totalRepos,
    years: multi.years.length,
  };
}

