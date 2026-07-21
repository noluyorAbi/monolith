import { NextResponse, type NextRequest } from "next/server";
import {
  STUDIO_COOKIE,
  STUDIO_TTL_MS,
  mintStudioSession,
  studioEnv,
  verifyStudioKey,
  verifyStudioSession,
} from "@/lib/admin";

export const config = { matcher: "/studio/:path*" };

export async function middleware(request: NextRequest) {
  const env = studioEnv();
  const now = Date.now();

  if (await verifyStudioSession(request.cookies.get(STUDIO_COOKIE)?.value, env, now)) {
    return NextResponse.next();
  }

  // A key in the query string is the way in, but it is exchanged for a signed
  // session and redirected away immediately, so the secret neither lingers in
  // history and referrers nor ends up sitting in a cookie jar.
  const presented = request.nextUrl.searchParams.get("key") ?? undefined;
  const session = verifyStudioKey(presented, env) ? await mintStudioSession(env, now) : null;
  if (session) {
    const clean = new URL(request.nextUrl);
    clean.searchParams.delete("key");
    const response = NextResponse.redirect(clean);
    response.cookies.set(STUDIO_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.production,
      path: "/studio",
      maxAge: STUDIO_TTL_MS / 1000,
    });
    return response;
  }

  return new NextResponse("Not found", { status: 404 });
}
