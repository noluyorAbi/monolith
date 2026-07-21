import { NextResponse, type NextRequest } from "next/server";
import { STUDIO_COOKIE, studioAccess, studioEnv } from "@/lib/admin";

export const config = { matcher: "/studio/:path*" };

const TWELVE_HOURS = 60 * 60 * 12;

export function middleware(request: NextRequest) {
  const env = studioEnv();
  const cookie = request.cookies.get(STUDIO_COOKIE)?.value;

  if (studioAccess(cookie, env)) return NextResponse.next();

  // A key in the query string is the way in, but it is swapped for a cookie
  // and redirected away immediately so it never lingers in history, referrers,
  // or a screenshot of the address bar.
  const presented = request.nextUrl.searchParams.get("key") ?? undefined;
  if (presented && studioAccess(presented, env)) {
    const clean = new URL(request.nextUrl);
    clean.searchParams.delete("key");
    const response = NextResponse.redirect(clean);
    response.cookies.set(STUDIO_COOKIE, presented, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.production,
      path: "/studio",
      maxAge: TWELVE_HOURS,
    });
    return response;
  }

  return new NextResponse("Not found", { status: 404 });
}
