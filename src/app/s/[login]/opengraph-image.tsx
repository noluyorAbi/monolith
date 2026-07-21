import { ImageResponse } from "next/og";
import { LOGIN_RE, fetchContributionYear, availableYears } from "@/lib/github";
import { notFound } from "next/navigation";
import { PALETTES } from "@/lib/products";
import { computeStats } from "@/lib/build";
import { PROJECT } from "@/lib/project";

export const runtime = "nodejs";
export const alt = "A GitHub year as a printable object";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The palette the viewer uses, rather than a third hand-copied ramp. */
const RAMP = PALETTES[0].ramp;

/**
 * A share card built from the person's own year rather than a generic logo.
 * The calendar is drawn as the object's own footprint: the same grid, the same
 * colour ramp, so the link previews as the thing it links to.
 */
export default async function Image({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  // The page 404s an invalid handle; without the same guard this route would
  // still render 1200x630 of attacker-chosen text under the wordmark, and run
  // a full satori pass per request while doing it.
  if (!LOGIN_RE.test(login)) notFound();
  const year = availableYears(1)[0];
  const data = await fetchContributionYear(login, year).catch(() => null);
  const stats = data ? computeStats(data) : null;
  const weeks = data?.weeks ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#060708",
          padding: 64,
          fontFamily: "monospace",
          color: "#ecece9",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, letterSpacing: 8, color: "#8b9096" }}>MONOLITH</div>
            <div style={{ fontSize: 78, marginTop: 12, letterSpacing: -2 }}>{data?.login ?? login}</div>
            <div style={{ display: "flex", fontSize: 24, color: "#8b9096", marginTop: 4 }}>
              {data?.demo
                ? `${year} · sample data, GitHub unreachable`
                : `${year} · ${stats ? stats.total.toLocaleString("en-GB") : "—"} contributions`}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: "#060708",
              background: "#d7ff45",
              padding: "10px 18px",
              borderRadius: 6,
              letterSpacing: 2,
            }}
          >
            3MF · STL · FREE
          </div>
        </div>

        <div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
          {weeks.slice(0, 53).map((week, w) => (
            <div key={w} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {week.map((day, d) => (
                <div
                  key={d}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 2,
                    background: day ? RAMP[day.level] : "#0c0e10",
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, color: "#8b9096" }}>
          <div style={{ display: "flex" }}>{PROJECT.tagline}</div>
          <div style={{ display: "flex" }}>{PROJECT.site.replace("https://", "")}</div>
        </div>
      </div>
    ),
    size,
  );
}
