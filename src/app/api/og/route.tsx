import { ImageResponse } from "next/og";
import { resolveModelSource } from "@/lib/github";
import { parseModelRequest } from "@/lib/request";
import { computeStats } from "@/lib/contributions";
import { derivePersona, signName } from "@/lib/persona";
import type { ContributionYear } from "@/lib/types";

export const runtime = "nodejs";

/**
 * The share preview. A link dropped into X, Discord or Slack used to unfurl
 * as bare text; this renders the skyline's silhouette, the handle, the stats
 * line and the starsign as a 1200x630 PNG. It speaks the same share contract
 * as everything else, so a lifetime or range link previews the window it
 * actually shows. The `noog` flag opts a share page out entirely.
 */

const VOID = "#060708";
const FOG = "#ecece9";
const MUTE = "#a3a7ad";
const DIM = "#8b9096";
const ACCENT = "#d7ff45";
const GREENS = ["#123222", "#1c5334", "#2a7d4d", "#43ad6b", "#7ce8a2"];

/** Weekly totals, capped to what 1200px can show as readable bars. */
function weeklyBars(data: ContributionYear, multi: { years: ContributionYear[] } | null): number[] {
  const weeks = multi ? multi.years.flatMap((y) => y.weeks) : data.weeks;
  const totals = weeks.map((w) => w.reduce((a, d) => a + (d?.count ?? 0), 0));
  const MAX_BARS = 106;
  if (totals.length <= MAX_BARS) return totals;
  // Merge neighbouring weeks so a lifetime still fits the frame.
  const merged: number[] = [];
  const per = Math.ceil(totals.length / MAX_BARS);
  for (let i = 0; i < totals.length; i += per) {
    merged.push(totals.slice(i, i + per).reduce((a, b) => a + b, 0));
  }
  return merged;
}

export async function GET(request: Request) {
  const req = parseModelRequest(new URL(request.url));
  try {
    const src = await resolveModelSource(req);
    const days = src.multi ? src.multi.years.flatMap((y) => y.days) : src.data.days;
    const base = src.multi
      ? { ...src.data, days, total: src.multi.totalCommits }
      : src.data;
    const stats = computeStats(base);
    const sign =
      (req.sign && signName(req.sign)) ||
      (req.subject === "user"
        ? derivePersona(base, stats, null, src.spanLabel).name
        : null);

    const bars = weeklyBars(src.data, src.multi ?? null);
    const max = Math.max(1, ...bars);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: VOID,
            padding: "56px 64px",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", color: DIM, fontSize: 26, letterSpacing: 8 }}>
              MONOLITH
            </div>
            <div style={{ display: "flex", color: DIM, fontSize: 24, letterSpacing: 4 }}>
              {src.spanLabel.toUpperCase()}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", color: FOG, fontSize: 84, fontWeight: 700 }}>
              {src.who}
            </div>
            <div style={{ display: "flex", gap: 28, color: MUTE, fontSize: 28 }}>
              <span>{`${base.total.toLocaleString("en-GB")} commits`}</span>
              <span>{`${stats.longestStreak} day streak`}</span>
              {sign && <span style={{ color: ACCENT }}>{sign}</span>}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 3,
              height: 220,
              borderBottom: `2px solid ${DIM}`,
              paddingBottom: 0,
            }}
          >
            {bars.map((t, i) => {
              const h = t === 0 ? 3 : 8 + Math.round((t / max) * 200);
              const level = t === 0 ? 0 : Math.min(4, 1 + Math.floor((t / max) * 3.99));
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: Math.max(4, Math.floor(1000 / bars.length)),
                    height: h,
                    backgroundColor: GREENS[level],
                  }}
                />
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", color: DIM, fontSize: 22 }}>
            <span>A year of commits, as a printable object</span>
            <span>{`monolith · free 3MF + STL${src.demo ? " · sample data" : ""}`}</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    // A broken login still unfurls as a branded card rather than a 500.
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: VOID,
            color: FOG,
            fontSize: 72,
            letterSpacing: 16,
            fontFamily: "sans-serif",
          }}
        >
          MONOLITH
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }
}
