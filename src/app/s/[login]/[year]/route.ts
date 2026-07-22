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
  _request: Request,
  { params }: { params: Promise<{ login: string; year: string }> },
) {
  const { login, year } = await params;
  const chosen = clampSelectableYear(year);
  redirect(`/s/${encodeURIComponent(login)}?year=${chosen}`);
}
