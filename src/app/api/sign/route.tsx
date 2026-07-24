import { ImageResponse } from "next/og";
import { resolveModelSource } from "@/lib/github";
import { parseModelRequest } from "@/lib/request";
import { computeStats } from "@/lib/contributions";
import { derivePersona, signInfo, sigilFor, type Persona } from "@/lib/persona";

export const runtime = "nodejs";

/**
 * The starsign as its own square share card: the constellation large, the
 * sign's name, tier, line and evidence chips. People share what says
 * something about THEM; the skyline says what they did, this says what they
 * are. Speaks the share contract, so the reading covers the shared window
 * and a carried sign id reproduces the page's hour-refined sign.
 */

const VOID = "#060708";
const FOG = "#ecece9";
const MUTE = "#a3a7ad";
const DIM = "#8b9096";
const EDGE = "#5f656c";
const ACCENT = "#d7ff45";

const TIER_COLOR: Record<Persona["tier"], string> = {
  legendary: ACCENT,
  rare: FOG,
  uncommon: MUTE,
  common: DIM,
};

export async function GET(request: Request) {
  const req = parseModelRequest(new URL(request.url));
  try {
    const src = await resolveModelSource(req);
    const days = src.multi ? src.multi.years.flatMap((y) => y.days) : src.data.days;
    const base = src.multi ? { ...src.data, days, total: src.multi.totalCommits } : src.data;
    const stats = computeStats(base);
    const derived = derivePersona(base, stats, null, src.spanLabel);
    // The page's hour-refined sign wins; the derived one covers a bare link.
    const info = (req.sign && signInfo(req.sign)) || signInfo(derived.id)!;
    const sigil =
      info.id === derived.id
        ? derived.sigil
        : sigilFor(src.who, info.id, src.spanLabel)!;
    const traits = derived.traits;

    const px = (v: number) => 120 + v * 560;
    const py = (v: number) => 150 + v * 560;

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
            padding: 64,
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: DIM, fontSize: 26, letterSpacing: 8 }}>
            <span>STARSIGN</span>
            <span>{src.spanLabel.toUpperCase()}</span>
          </div>

          <svg width="800" height="620" viewBox="0 0 800 620" style={{ margin: "0 auto" }}>
            <circle cx={400} cy={330} r={300} fill="none" stroke={EDGE} strokeWidth={1.5} strokeDasharray="4 14" opacity={0.5} />
            {sigil.edges.map(([a, b], i) => (
              <line
                key={`e${i}`}
                x1={px(sigil.points[a][0])}
                y1={py(sigil.points[a][1])}
                x2={px(sigil.points[b][0])}
                y2={py(sigil.points[b][1])}
                stroke={EDGE}
                strokeWidth={3}
              />
            ))}
            {sigil.points.map(([x, y], i) => {
              const bright = i === sigil.brightest;
              return (
                <circle
                  key={`p${i}`}
                  cx={px(x)}
                  cy={py(y)}
                  r={bright ? 14 : 8}
                  fill={bright ? ACCENT : MUTE}
                />
              );
            })}
          </svg>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ color: FOG, fontSize: 68, fontWeight: 700 }}>{info.name}</span>
              <span style={{ color: TIER_COLOR[info.tier], fontSize: 26, letterSpacing: 6 }}>
                {info.tier.toUpperCase()}
              </span>
            </div>
            <span style={{ color: MUTE, fontSize: 28, lineHeight: 1.4 }}>{info.line}</span>
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              {traits.map((t) => (
                <span
                  key={t}
                  style={{
                    display: "flex",
                    border: `1px solid ${EDGE}`,
                    borderRadius: 999,
                    padding: "8px 18px",
                    color: DIM,
                    fontSize: 20,
                    letterSpacing: 2,
                  }}
                >
                  {t.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", color: DIM, fontSize: 24 }}>
            <span style={{ color: MUTE }}>{src.who}</span>
            <span>{`monolith${src.demo ? " · sample data" : ""}`}</span>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
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
            fontSize: 64,
            letterSpacing: 14,
            fontFamily: "sans-serif",
          }}
        >
          MONOLITH
        </div>
      ),
      { width: 1080, height: 1080 },
    );
  }
}
