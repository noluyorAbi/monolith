import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { COOKIE_NAME, adminEnabled, sessionValid } from "@/lib/admin/auth";
import { backendName, readState } from "@/lib/admin/store";
import Board from "./Board";
import Login from "./Login";

// The board is rebuilt per request. Caching it would serve one operator's
// unsaved-looking board to the next request, and there is nothing here worth
// caching anyway.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Launch",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The private launch board.
 *
 * Not linked from anywhere in the product, excluded in `robots.ts`, and absent
 * entirely unless `ADMIN_PASSWORD` is set. The 404 is deliberate: this
 * repository is public, and a fork someone else deploys must not answer this
 * route at all.
 */
export default async function AdminPage() {
  if (!adminEnabled()) notFound();

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!sessionValid(token)) return <Login />;

  return <Board initial={await readState()} backend={backendName()} />;
}
