import { redirect } from "next/navigation";
import { clampSelectableYear } from "@/lib/contributions";

/**
 * M9 / marktanalyse 12: a persistent per-year permalink. `/s/<login>/<year>`
 * always resolves to the single-year viewer with that year preselected, so a
 * link to someone's 2019 never drifts to "whatever the picker shows today".
 * The viewer already lives at /s/[login]?year=Y; this just gives the year its
 * own stable, shareable path.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ login: string; year: string }> },
) {
  const { login, year } = await params;
  const chosen = clampSelectableYear(year);
  // Carry the rest of the query along: a permalink to someone's 2019 ring at
  // 260 mm should not shed the ring and the 260 mm on the way through.
  const search = new URL(request.url).searchParams;
  search.set("year", String(chosen));
  redirect(`/s/${encodeURIComponent(login)}?${search.toString()}`);
}
