import { NextResponse } from "next/server";
import { BadLoginError, NotFoundError, fetchContributionYear } from "@/lib/github";
import { SIZES, VARIANTS, buildMonolith } from "@/lib/build";
import { splitByLevel, wholeObject } from "@/lib/parts";
import { buildThreeMf } from "@/lib/threemf";
import { printCard } from "@/lib/kit";
import type { ColourSlots } from "@/lib/slots";
import { materialById, printerById, qualityById } from "@/lib/print";
import { paletteById } from "@/lib/products";
import { PROJECT } from "@/lib/project";
import type { Variant } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
  const variantParam = url.searchParams.get("variant") ?? "skyline";
  const variant = (VARIANTS.some((v) => v.id === variantParam) ? variantParam : "skyline") as Variant;
  const sizeMm = Math.min(400, Math.max(60, Number(url.searchParams.get("mm")) || SIZES[1].mm));
  const printer = printerById(url.searchParams.get("printer") ?? "p1s");
  const material = materialById(url.searchParams.get("material") ?? "pla");
  const quality = qualityById(url.searchParams.get("quality") ?? "standard");
  const finish = paletteById(url.searchParams.get("finish") ?? "signal");
  const slotsParam = Number(url.searchParams.get("slots"));
  const slots = ([1, 2, 4].includes(slotsParam) ? slotsParam : 1) as ColourSlots;

  try {
    const data = await fetchContributionYear(login, year);
    const mesh = buildMonolith(data, { variant, sizeMm, label: true });

    // Splitting per level is what lets a slicer put each intensity on its own
    // filament. If any group came out open, one welded solid is the safe
    // answer: a slicer will not thank us for a shell it cannot fill.
    const split = splitByLevel(mesh);
    const parts = split.every((p) => p.closed) ? split : [wholeObject(mesh)];

    const colours = [
      { level: -1, hex: finish.base },
      ...finish.ramp.map((hex, i) => ({ level: i, hex })),
    ];

    const kit = {
      login: data.login,
      year: data.year,
      variant,
      sizeMm,
      printer,
      material,
      quality,
      slots,
      sourceUrl: PROJECT.url,
      modelLicence: PROJECT.modelLicence,
    };
    const file = buildThreeMf(parts, {
      ...kit,
      card: printCard(parts, mesh, kit),
    });

    const name = `monolith-${data.login}-${data.year}-${variant}-${sizeMm}mm${slots > 1 ? `-${slots}colour` : ""}.3mf`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "model/3mf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Parts": String(parts.length),
        "X-Monolith-Triangles": String(parts.reduce((a, p) => a + p.triangles, 0)),
      },
    });
  } catch (err) {
    if (err instanceof BadLoginError) return NextResponse.json({ error: "invalid_login" }, { status: 400 });
    if (err instanceof NotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
