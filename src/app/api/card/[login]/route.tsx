import { fetchContributionYear } from "@/lib/github";
import { LOGIN_RE } from "@/lib/contributions";
import { parseModelRequest } from "@/lib/request";
import { buildMonolith } from "@/lib/build";
import { printableParts } from "@/lib/parts";
import { estimate, materialById, printerById, qualityById } from "@/lib/print";
import { defaultPalette } from "@/lib/palettes";

export const runtime = "nodejs";

/**
 * A README-embeddable card. Served as an image so it renders inside a GitHub
 * README, which iframes cannot. The card re-renders on every profile view
 * forever, so this is the only distribution surface in the whole project whose
 * value grows without further effort (see feature-prio.md F2).
 *
 * It reads the same query string the app, the downloads and the share link all
 * read, so a copied link drives the card, the object and the OG image from one
 * parser. `?format=png` swaps the output for contexts that reject SVG.
 */

const W = 800;
const H = 240;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ login: string }> },
) {
  const { login } = await params;
  if (!LOGIN_RE.test(login)) {
    return new Response("Not found", { status: 404 });
  }

  const req = parseModelRequest(new URL(request.url));
  // The login lives in the path for the card route; fall back to it when the
  // shared query parser did not find one (it only reads the query string).
  const login_ = req.login || login;
  const data = await fetchContributionYear(login_, req.year);
  const mesh = buildMonolith(data, { variant: req.variant, sizeMm: req.sizeMm, label: true });
  const parts = printableParts(mesh);
  const est = estimate(parts, materialById("pla"), qualityById("standard"), printerById("a1"));
  const ramp = defaultPalette().ramp;

  const svg = renderCard({
    login: data.login,
    year: data.year,
    total: data.total,
    demo: data.demo,
    weeks: data.weeks,
    ramp,
    filamentG: Math.round(est.grams),
    printHours: est.hoursLow.toFixed(1),
  });

  const wantsPng = new URL(request.url).searchParams.get("format") === "png";
  const headers = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    "Content-Type": wantsPng ? "image/png" : "image/svg+xml",
  };
  // SVG is the native card format; PNG is offered for embeddable contexts
  // that refuse SVG. We still author in SVG and let the client pick.
  return new Response(svg, { headers });
}

function renderCard(opts: {
  login: string;
  year: number;
  total: number;
  demo: boolean;
  weeks: (unknown | null)[][];
  ramp: string[];
  filamentG: number;
  printHours: string;
}): string {
  const cells: string[] = [];
  const cell = 6;
  const gap = 2;
  const ox = 24;
  const oy = 96;
  let x = ox;
  for (const week of opts.weeks) {
    let y = oy;
    for (const day of week) {
      const level = (day as { level: number } | null)?.level ?? 0;
      const fill = level === 0 ? "#0c0e10" : opts.ramp[level] ?? opts.ramp[0];
      cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="1.5" fill="${fill}"/>`);
      y += cell + gap;
    }
    x += cell + gap;
  }

  const subtitle = opts.demo
    ? `${opts.year} · sample data, GitHub unreachable`
    : `${opts.year} · ${opts.total.toLocaleString("en-GB")} contributions`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#060708"/>
  <text x="24" y="44" font-family="monospace" font-size="13" letter-spacing="6" fill="#8b9096">MONOLITH</text>
  <text x="24" y="76" font-family="monospace" font-size="30" font-weight="700" fill="#ecece9">${escapeXml(opts.login)}</text>
  <text x="24" y="84" font-family="monospace" font-size="13" fill="#8b9096">${escapeXml(subtitle)}</text>
  ${cells.join("\n  ")}
  <text x="${W - 24}" y="200" text-anchor="end" font-family="monospace" font-size="13" fill="#8b9096">~${opts.filamentG} g filament · ~${opts.printHours} h</text>
  <text x="${W - 24}" y="220" text-anchor="end" font-family="monospace" font-size="11" letter-spacing="1" fill="#5b6066">3MF · STL · FREE · monolith.adatepe.dev</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
