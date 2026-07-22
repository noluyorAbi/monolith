import { fetchContributionYear } from "@/lib/github";
import { LOGIN_RE, BadLoginError } from "@/lib/contributions";
import { parseModelRequest } from "@/lib/request";
import { buildMonolith } from "@/lib/build";
import { modelErrorResponse } from "@/lib/responses";
import { paletteById, defaultPalette } from "@/lib/palettes";
import { writeGlb } from "@/lib/glb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const req = parseModelRequest(new URL(request.url));
  if (!LOGIN_RE.test(req.login)) {
    return modelErrorResponse(new BadLoginError(req.login));
  }
  try {
    const data = await fetchContributionYear(req.login, req.year);
    const palette = paletteById(req.paletteId) ?? defaultPalette();
    const mesh = buildMonolith(data, {
      variant: req.variant,
      sizeMm: req.sizeMm,
      label: true,
    });
    const glb = writeGlb(mesh, palette);
    const file = `${req.login}-${req.year}-${req.variant}-${req.sizeMm}mm.glb`;
    return new Response(new Uint8Array(glb), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    return modelErrorResponse(err);
  }
}
