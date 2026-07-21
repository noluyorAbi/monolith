import { NextResponse } from "next/server";
import { BadLoginError, NotFoundError } from "./contributions";

/**
 * One mapping from a thrown error to a response, so the download endpoints
 * cannot drift apart on what a 400, a 404 and a 502 mean.
 */
export function modelErrorResponse(err: unknown): NextResponse {
  if (err instanceof BadLoginError) {
    return NextResponse.json(
      { error: "invalid_login", message: "That is not a GitHub handle." },
      { status: 400 },
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json(
      { error: "not_found", message: "No GitHub account by that name." },
      { status: 404 },
    );
  }
  // fetchContributionYear already handles and logs upstream trouble itself, so
  // anything reaching here is ours: a geometry or writer defect wearing an
  // upstream label. Say so in the log rather than blaming GitHub silently.
  console.error("[monolith] request failed while building the model:", err);
  return NextResponse.json(
    { error: "internal", message: "Something broke on our side." },
    { status: 500 },
  );
}
