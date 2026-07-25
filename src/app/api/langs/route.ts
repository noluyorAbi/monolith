import { NextResponse } from "next/server";
import { fetchRepoLanguages, fetchTopLanguages } from "@/lib/github";
import { LOGIN_RE } from "@/lib/contributions";
import { REPO_RE } from "@/lib/request";
import { modelErrorResponse } from "@/lib/responses";

export const runtime = "nodejs";

/**
 * The languages ring's data endpoint: the viewer fetches it when the flag is
 * toggled on, so the browser never talks to GitHub directly. `login` asks for
 * an account's split, `owner`+`repo` for one repository's. An account GitHub
 * cannot answer for returns an empty list, not an error: the flag then
 * degrades to a plain object.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  const owner = url.searchParams.get("owner") ?? "";
  const repo = url.searchParams.get("repo") ?? "";

  try {
    const langs =
      owner && repo && LOGIN_RE.test(owner) && REPO_RE.test(repo)
        ? await fetchRepoLanguages(owner, repo)
        : LOGIN_RE.test(login)
          ? await fetchTopLanguages(login)
          : null;
    if (langs === null) {
      return NextResponse.json({ message: "Pass a login, or an owner and repo." }, { status: 400 });
    }
    return NextResponse.json(
      { langs },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return modelErrorResponse(err);
  }
}
