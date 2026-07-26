import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, adminEnabled, sessionValid } from "@/lib/admin/auth";
import { parseState } from "@/lib/admin/model";
import { backendName, readState, writeState } from "@/lib/admin/store";

export const dynamic = "force-dynamic";

/** One guard for both verbs, so a new verb cannot be added without one. */
async function denied(): Promise<NextResponse | null> {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!sessionValid(token)) return NextResponse.json({ error: "no session" }, { status: 401 });
  return null;
}

export async function GET() {
  const refused = await denied();
  if (refused) return refused;
  return NextResponse.json({ state: await readState(), backend: backendName() });
}

export async function PUT(request: Request) {
  const refused = await denied();
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected json" }, { status: 400 });
  }

  // The client's `updatedAt` is discarded by `writeState`, which stamps its
  // own. A board saved from two tabs is last-write-wins; the alternative is a
  // merge protocol nobody needs for a single-operator board.
  const saved = await writeState(parseState(body));
  return NextResponse.json({ state: saved, backend: backendName() });
}
