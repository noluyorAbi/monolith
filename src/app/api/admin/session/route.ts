import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  SESSION_MAX_AGE_S,
  adminEnabled,
  clearFailures,
  clientKey,
  issueSession,
  passwordMatches,
  recordFailure,
  throttled,
} from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * Log in and log out.
 *
 * A wrong password and a missing panel answer differently on purpose: 401
 * means "there is a door here", 404 means "there is not". The 404 is what a
 * fork of this repository without `ADMIN_PASSWORD` returns, so a deployment
 * that never opted in does not advertise an unlocked entrance.
 */
export async function POST(request: Request) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });

  const key = clientKey(request);
  if (throttled(key)) {
    return NextResponse.json({ error: "too many attempts, wait ten minutes" }, { status: 429 });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "expected json" }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    recordFailure(key);
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }

  const token = issueSession();
  if (token === null) return new NextResponse(null, { status: 404 });

  clearFailures(key);
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure would make the cookie unusable over plain http on localhost, so it
    // follows the deployment rather than being hard-coded on.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return response;
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
