import { NextResponse } from "next/server";
import { BadLoginError, NotFoundError, fetchContributionYear } from "@/lib/github";
import { SIZES, VARIANTS, buildMonolith } from "@/lib/build";
import { toBinarySTL } from "@/lib/stl";
import type { Variant } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get("login") ?? "";
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
  const variantParam = url.searchParams.get("variant") ?? "skyline";
  const variant = (VARIANTS.some((v) => v.id === variantParam) ? variantParam : "skyline") as Variant;
  const sizeMm = Number(url.searchParams.get("mm")) || SIZES[1].mm;
  const clamped = Math.min(400, Math.max(60, sizeMm));

  try {
    const data = await fetchContributionYear(login, year);
    const mesh = buildMonolith(data, { variant, sizeMm: clamped, label: true });
    const header = `MONOLITH ${data.login} ${data.year} ${variant} ${clamped}mm`;
    const stl = toBinarySTL(mesh, header);
    const name = `monolith-${data.login}-${data.year}-${variant}-${clamped}mm.stl`;
    return new NextResponse(stl, {
      headers: {
        "Content-Type": "model/stl",
        "Content-Length": String(stl.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Monolith-Triangles": String(mesh.triangles),
      },
    });
  } catch (err) {
    if (err instanceof BadLoginError) {
      return NextResponse.json({ error: "invalid_login" }, { status: 400 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
