import { resolveModelSource } from "@/lib/github";
import { LOGIN_RE, BadLoginError } from "@/lib/contributions";
import { parseModelRequest } from "@/lib/request";
import { buildMonolith, buildMultiYear } from "@/lib/build";
import { modelErrorResponse } from "@/lib/responses";
import { paletteById, defaultPalette } from "@/lib/palettes";
import { writeGlb } from "@/lib/glb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const req = parseModelRequest(new URL(request.url));
  if (req.subject !== "repo" && !LOGIN_RE.test(req.login)) {
    return modelErrorResponse(new BadLoginError(req.login));
  }
  try {
    // Same resolver as every download: the GLB matches the viewer in every
    // mode (single year, lifetime stack, range, repo skyline).
    const src = await resolveModelSource(req);
    const palette = paletteById(req.paletteId) ?? defaultPalette();
    const build = {
      variant: req.variant,
      sizeMm: req.sizeMm,
      label: true,
      dampening: req.dampening,
    };
    const mesh = src.multi ? buildMultiYear(src.multi, build) : buildMonolith(src.data, build);
    const glb = writeGlb(mesh, palette);
    const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-");
    const file = `${safe(src.who)}-${safe(src.spanLabel)}-${req.variant}-${req.sizeMm}mm.glb`;
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
