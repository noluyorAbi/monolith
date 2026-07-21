import { NextResponse } from "next/server";
import { BadLoginError, NotFoundError, fetchContributionYear } from "@/lib/github";
import { computeStats } from "@/lib/build";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();

  try {
    const data = await fetchContributionYear(login, year);
    return NextResponse.json(
      { data, stats: computeStats(data) },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    if (err instanceof BadLoginError) {
      return NextResponse.json({ error: "invalid_login", message: "That is not a GitHub handle." }, { status: 400 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found", message: `No GitHub account called ${login}.` }, { status: 404 });
    }
    return NextResponse.json({ error: "upstream", message: "GitHub would not answer." }, { status: 502 });
  }
}
