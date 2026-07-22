import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { unzip } from "./helpers/zip";
import { GET as getKit } from "@/app/api/kit/route";
import { GET as getStl } from "@/app/api/stl/route";
import { GET as get3mf } from "@/app/api/3mf/route";
import { GET as getContributions } from "@/app/api/contributions/route";
import { GET as getCompare } from "@/app/api/compare/route";
import { GET as getCard } from "@/app/api/card/[login]/route";
import { GET as getGlb } from "@/app/api/glb/route";
import { MAX_SIZE_MM, MIN_SIZE_MM, modelQuery, buildBambuLink, parseModelRequest } from "@/lib/request";
import { DEFAULT_MATERIAL_ID, DEFAULT_PRINTER_ID, DEFAULT_QUALITY_ID } from "@/lib/print";
import { DEFAULT_PALETTE_ID } from "@/lib/palettes";
import { yearFromDays } from "@/lib/contributions";
import type { Day } from "@/lib/types";
import fixture from "../data/contributions-2025.json";

/**
 * The download contract is the public surface of this project. These tests
 * cover the parsing, the clamps, the whitelists and the error mapping, none of
 * which the geometry tests touch.
 */

/** Serve the frozen year instead of GitHub, so the routes are deterministic. */
function stubGitHub() {
  vi.stubGlobal("fetch", async () => {
    const days = fixture.days as Day[];
    const rows = days
      .map(
        (d, i) =>
          `<td data-date="${d.date}" id="d${i}" data-level="${d.level}" class="ContributionCalendar-day"></td>` +
          `<tool-tip for="d${i}">${d.count} contributions on x.</tool-tip>`,
      )
      .join("");
    return new Response(rows, { status: 200 });
  });
}

const BASE = "http://localhost/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the query the browser builds is the query the routes parse", () => {
  const query = modelQuery({
    login: "octocat",
    year: 2025,
    variant: "ring",
    sizeMm: 260,
    printerId: "a1m",
    materialId: "petg",
    qualityId: "fine",
    slots: 4,
    paletteId: "aurum",
  });
  const parsed = parseModelRequest(new URL(`${BASE}/kit?${query}`));

  assert.equal(parsed.login, "octocat");
  assert.equal(parsed.year, 2025);
  assert.equal(parsed.variant, "ring");
  assert.equal(parsed.sizeMm, 260);
  assert.equal(parsed.printer.id, "a1m");
  assert.equal(parsed.material.id, "petg");
  assert.equal(parsed.quality.id, "fine");
  assert.equal(parsed.slots, 4);
  assert.equal(parsed.paletteId, "aurum");
});

test("an unknown palette in the share link degrades to the default, never errors", () => {
  const parsed = parseModelRequest(
    new URL(`${BASE}/kit?login=octocat&variant=wave&mm=180&palette=does-not-exist`),
  );
  assert.equal(parsed.variant, "wave");
  assert.equal(parsed.paletteId, DEFAULT_PALETTE_ID);
});

test("the full-state link round trips the viewer configuration", () => {
  const query = modelQuery({
    login: "torvalds",
    year: 2024,
    variant: "spine",
    sizeMm: 120,
    paletteId: "obsidian",
  });
  const parsed = parseModelRequest(new URL(`${BASE}/s?${query}`));
  assert.equal(parsed.login, "torvalds");
  assert.equal(parsed.year, 2024);
  assert.equal(parsed.variant, "spine");
  assert.equal(parsed.sizeMm, 120);
  assert.equal(parsed.paletteId, "obsidian");
  // The query string is exactly what the app, the download, and the card all
  // read, so a shared link reproduces the object on every surface.
  assert.ok(query.includes("palette=obsidian"));
  assert.ok(query.includes("variant=spine"));
});

test("nonsense parameters fall back rather than reaching the generator", () => {
  const parsed = parseModelRequest(
    new URL(`${BASE}/kit?login=octocat&variant=teapot&mm=99999&printer=laser&material=steel&quality=perfect&slots=7`),
  );
  assert.equal(parsed.variant, "skyline");
  assert.equal(parsed.sizeMm, MAX_SIZE_MM);
  assert.equal(parsed.printer.id, DEFAULT_PRINTER_ID);
  assert.equal(parsed.material.id, DEFAULT_MATERIAL_ID);
  assert.equal(parsed.quality.id, DEFAULT_QUALITY_ID);
  assert.equal(parsed.slots, 1);

  assert.equal(parseModelRequest(new URL(`${BASE}/kit?mm=1`)).sizeMm, MIN_SIZE_MM);
  assert.equal(parseModelRequest(new URL(`${BASE}/kit?mm=-500`)).sizeMm, MIN_SIZE_MM);
});

test("the kit endpoint returns a zip carrying all four files", async () => {
  stubGitHub();
  const res = await getKit(new Request(`${BASE}/kit?login=noluyorAbi&year=2025&variant=skyline&mm=180`));

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/zip");
  assert.match(res.headers.get("Content-Disposition") ?? "", /filename="monolith-noluyorAbi-2025-skyline-180mm-print-kit\.zip"/);
  assert.equal(res.headers.get("X-Monolith-Sample-Data"), "false");

  const buffer = Buffer.from(await res.arrayBuffer());
  const names = [...unzip(buffer).keys()];
  assert.ok(names.some((n) => n.endsWith(".3mf")), `no 3mf in ${names}`);
  assert.ok(names.some((n) => n.endsWith(".stl")), `no stl in ${names}`);
  assert.ok(names.some((n) => n.startsWith("presets/") && n.endsWith(".json")), `no preset in ${names}`);
  assert.ok(names.includes("PRINT-ME.txt"), `no print card in ${names}`);
});

test("the stl and 3mf endpoints answer with the right type and filename", async () => {
  stubGitHub();
  const stl = await getStl(new Request(`${BASE}/stl?login=noluyorAbi&year=2025&mm=120`));
  assert.equal(stl.status, 200);
  assert.equal(stl.headers.get("Content-Type"), "model/stl");
  assert.match(stl.headers.get("Content-Disposition") ?? "", /120mm\.stl/);

  stubGitHub();
  const threeMf = await get3mf(new Request(`${BASE}/3mf?login=noluyorAbi&year=2025&mm=180`));
  assert.equal(threeMf.status, 200);
  assert.equal(threeMf.headers.get("Content-Type"), "model/3mf");
  // One part per contribution level, which is what makes multi colour possible.
  assert.ok(Number(threeMf.headers.get("X-Monolith-Parts")) > 1);
});

test("an unusable handle is a 400, not a generated object", async () => {
  for (const [name, handler] of [
    ["kit", getKit],
    ["stl", getStl],
    ["3mf", get3mf],
  ] as const) {
    const res = await handler(new Request(`${BASE}/${name}?login=not%20a%20handle`));
    assert.equal(res.status, 400, `${name} accepted an invalid handle`);
    const body = (await res.json()) as { error: string; message?: string };
    assert.equal(body.error, "invalid_login");
    // The browser renders this string verbatim, so it has to be there.
    assert.ok(body.message && body.message.length > 0, `${name} returned no message`);
  }
});

test("the contributions endpoint answers with data, stats and a usable error", async () => {
  stubGitHub();
  const ok = await getContributions(new Request(`${BASE}/contributions?login=noluyorAbi&year=2025`));
  assert.equal(ok.status, 200);
  const payload = (await ok.json()) as { data: { total: number; demo: boolean }; stats: { total: number } };
  assert.equal(payload.data.demo, false);
  assert.equal(payload.stats.total, payload.data.total);

  const bad = await getContributions(new Request(`${BASE}/contributions?login=not%20a%20handle`));
  assert.equal(bad.status, 400);
  assert.ok(((await bad.json()) as { message?: string }).message);
});

test("a year we cannot render never reaches GitHub", async () => {
  const fetchSpy = vi.fn(async (_url: unknown) => new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // Every route clamps to the same window, so the same query string cannot
  // mean one year on the preview and another on the download. Numeric years
  // land on the nearest end of the renderable range; only a non-year falls
  // back to the present.
  const current = new Date().getUTCFullYear();
  for (const [junk, expected] of [
    ["99999", current],
    ["1900", 2008],
    ["1e21", current],
    ["-5", 2008],
    ["notayear", current],
  ] as const) {
    assert.equal(parseModelRequest(new URL(`${BASE}/kit?year=${junk}`)).year, expected, junk);
  }
  await getContributions(new Request(`${BASE}/contributions?login=octocat&year=1e21`));
  const requested = String(fetchSpy.mock.calls.at(0)?.at(0) ?? "");
  assert.ok(requested.includes(`${current}-01-01`), `asked GitHub for ${requested}`);
});

test("an invented year is labelled in the stl header and the 3mf description", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("rate limited");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const stl = await getStl(new Request(`${BASE}/stl?login=octocat&year=2025`));
  assert.equal(stl.headers.get("X-Monolith-Sample-Data"), "true");
  const header = Buffer.from(await stl.arrayBuffer()).subarray(0, 80).toString("ascii");
  assert.match(header, /SAMPLE-DATA/, "the stl header does not mark the year as invented");

  vi.stubGlobal("fetch", async () => {
    throw new Error("rate limited");
  });
  const threeMf = await get3mf(new Request(`${BASE}/3mf?login=octocat&year=2025`));
  const files = unzip(Buffer.from(await threeMf.arrayBuffer()));
  assert.match(files.get("3D/3dmodel.model")!.toString(), /SAMPLE DATA/);
  assert.match(files.get("Metadata/MONOLITH.txt")!.toString(), /SAMPLE DATA/);
});

test("the 3MF arrives split into one object per contribution level", async () => {
  stubGitHub();
  const res = await get3mf(new Request(`${BASE}/3mf?login=noluyorAbi&year=2025&variant=skyline&mm=180`));
  const files = unzip(Buffer.from(await res.arrayBuffer()));
  const model = files.get("3D/3dmodel.model")!.toString();

  // F1 (core): Bambu Studio must open the plate already broken into the parts
  // MONOLITH chose, one 3MF object per intensity level, so each can take its
  // own filament slot. There are five levels (plinth + four intensities).
  const objects = (model.match(/<object /g) ?? []).length;
  assert.ok(objects >= 2, `expected the model split into parts, found ${objects} object(s)`);
  // The parts are named, so the slicer's object list is self-explanatory.
  assert.match(model, /Peak days|Busy days|Quiet days|Plinth/);
});

test("multi-colour 3MF binds each part to a filament slot via model_settings.config", async () => {
  stubGitHub();
  // slots=4 asks for four filaments; the config must tag every object.
  const res = await get3mf(
    new Request(`${BASE}/3mf?login=noluyorAbi&year=2025&variant=skyline&mm=180&slots=4`),
  );
  const files = unzip(Buffer.from(await res.arrayBuffer()));
  const cfg = files.get("Metadata/model_settings.config");
  assert.ok(cfg, "multi-colour 3MF is missing Metadata/model_settings.config");
  const xml = cfg!.toString();
  // M6 / marktanalyse 4.13: Bambu + Orca read this blob on import, so the
  // intensities land pre-assigned. Every object gets an extruder metadata row.
  assert.match(xml, /<metadata key="extruder" value="\d+"\/>/);
  const extruders = [...xml.matchAll(/<metadata key="extruder" value="(\d+)"\/>/g)].map((m) => Number(m[1]));
  const objects = (files.get("3D/3dmodel.model")!.toString().match(/<object /g) ?? []).length;
  assert.equal(extruders.length, objects, "every 3MF object must carry one extruder binding");
  // With slots=4 the busiest part must reach a higher slot than the plinth.
  assert.ok(Math.max(...extruders) > 1, "highest-intensity part should map above the base slot");
});

test("single-colour 3MF does not emit a model_settings.config", async () => {
  stubGitHub();
  const res = await get3mf(
    new Request(`${BASE}/3mf?login=noluyorAbi&year=2025&variant=skyline&mm=180&slots=1`),
  );
  const files = unzip(Buffer.from(await res.arrayBuffer()));
  assert.equal(files.get("Metadata/model_settings.config"), undefined, "single colour needs no extruder config");
});

test("a missing account is a 404 rather than an invented year", async () => {
  vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
  const res = await getKit(new Request(`${BASE}/kit?login=definitelynotarealaccount&year=2025`));
  assert.equal(res.status, 404);
});

test("sample data is announced in the response, not shipped quietly", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("rate limited");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const res = await getKit(new Request(`${BASE}/kit?login=octocat&year=2025`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Monolith-Sample-Data"), "true");

  const buffer = Buffer.from(await res.arrayBuffer());
  const card = unzip(buffer).get("PRINT-ME.txt")?.toString() ?? "";
  assert.match(card, /SAMPLE DATA/, "the print card does not warn that the year is invented");
});

test("the fixture year survives a round trip through the parser", () => {
  const year = yearFromDays(fixture.login, fixture.year, fixture.days as Day[]);
  assert.equal(year.total, fixture.total);
  assert.ok(year.weeks.length >= 52 && year.weeks.length <= 54);
});

test("the embeddable card renders the object as an image anyone can host", async () => {
  stubGitHub();
  const res = await getCard(
    new Request(`${BASE}/card/noluyorAbi?login=noluyorAbi&year=2025&variant=skyline&mm=180`),
    { params: Promise.resolve({ login: "noluyorAbi" }) },
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/svg+xml");
  const svg = await res.text();
  assert.match(svg, /<svg/);
  // It carries the footprint, not a generic logo, and the one print fact no
  // competitor can show.
  assert.match(svg, /noluyorAbi/);
  assert.match(svg, /2025/);
  assert.match(svg, /g filament/);
  assert.match(svg, /<rect/, "the calendar grid should be drawn");

  // Unknown handles 404 rather than rendering attacker-chosen text.
  const bad = await getCard(new Request(`${BASE}/card/not%20a%20handle`), {
    params: Promise.resolve({ login: "not a handle" }),
  });
  assert.equal(bad.status, 404);
});

test("the glb endpoint returns a valid binary glTF carrying vertex colours", async () => {
  stubGitHub();
  const res = await getGlb(
    new Request(`${BASE}/glb?login=noluyorAbi&year=2025&variant=skyline&mm=180&palette=signal`),
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "model/gltf-binary");
  const buf = Buffer.from(await res.arrayBuffer());
  // GLB magic "glTF" and version 2.
  assert.equal(buf.readUInt32LE(0), 0x46546c67);
  assert.equal(buf.readUInt32LE(4), 2);
  // The JSON chunk declares a vertex-coloured material and POSITION + COLOR_0.
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  assert.equal(json.materials[0].pbrMetallicRoughness.baseColorFactor.join(), "1,1,1,1");
  assert.deepEqual(Object.keys(json.meshes[0].primitives[0].attributes).sort(), ["COLOR_0", "POSITION"]);
  assert.ok(json.accessors[0].count > 0, "the geometry should have vertices");
  // A bad handle is a 400, not a generated object.
  const bad = await getGlb(new Request(`${BASE}/glb?login=not%20a%20handle&year=2025`));
  assert.equal(bad.status, 400);
});

test("the Bambu Studio hand-off only ever carries a clean http(s) origin", () => {
  // The one external-app launch in the product. It must refuse to hand a
  // local path or a non-http scheme to Bambu Studio, no matter what origin the
  // browser reports. F0.
  const ok = buildBambuLink("https://monolith.adatepe.dev", "login=octocat&year=2025", "octocat", 2025);
  assert.match(ok, /^bambustudioopen:\/\/open\?file=https%3A%2F%2Fmonolith/);
  assert.match(ok, /monolith-octocat-2025\.3mf/);

  for (const origin of ["file:///Users/x", "javascript:alert(1)", "ftp://evil", "not a url"]) {
    assert.throws(
      () => buildBambuLink(origin, "login=octocat", "octocat", 2025),
      /refusing/,
      `origin ${origin} should be refused`,
    );
  }
});

test("the contributions endpoint returns a multi-year roll-up as JSON", async () => {
  stubGitHub();
  const res = await getContributions(
    new Request(`${BASE}/contributions?login=noluyorAbi&years=2023,2024,2025`),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.multi, "multi-year JSON must carry a `multi` block");
  assert.equal(body.multi.years.length, 3);
  assert.equal(body.multi.fromYear, 2023);
  assert.equal(body.multi.toYear, 2025);
  assert.ok(body.stats.total >= 0);
  assert.ok(body.stats.years === 3);
});

test("the compare endpoint returns both accounts and the delta", async () => {
  stubGitHub();
  const res = await getCompare(
    new Request(`${BASE}/compare?a=noluyorAbi&b=octocat&year=2025`),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.a.login, "noluyorAbi");
  assert.equal(body.b.login, "octocat");
  assert.ok(typeof body.delta.total === "number");
  assert.ok(["tie", "noluyorAbi", "octocat"].includes(body.delta.winner));
});

test("the compare endpoint rejects a missing login", async () => {
  stubGitHub();
  const res = await getCompare(new Request(`${BASE}/compare?a=noluyorAbi&year=2025`));
  assert.equal(res.status, 400);
});

test("a per-year permalink resolves to the single-year viewer", async () => {
  const { GET } = await import("@/app/s/[login]/[year]/route");
  // Next's redirect() throws a NEXT_REDIRECT control-flow error; catching it
  // proves the permalink resolves and issues the redirect to the viewer.
  await assert.rejects(async () =>
    GET(new Request("https://x/s/octocat/2019"), {
      params: Promise.resolve({ login: "octocat", year: "2019" }),
    }),
  );
});

test("the share state round-trips dampening (M13)", () => {
  const url = new URL(`https://x/?login=octocat&year=2025&variant=skyline&mm=180&dampening=0.7`);
  const req = parseModelRequest(url);
  assert.equal(req.dampening, 0.7, "dampening should be read from the query");
  const q = modelQuery({ login: req.login, year: req.year, variant: req.variant, sizeMm: req.sizeMm, dampening: req.dampening });
  assert.match(q, /dampening=0\.7/, "dampening should be written back into the share query");
  // Clamped: a wild value cannot produce a broken object.
  const wild = parseModelRequest(new URL("https://x/?login=octocat&dampening=5"));
  assert.equal(wild.dampening, 1, "dampening above 1 clamps to 1");
});

test("the repo route emits a 3MF from a repository's commit history", async () => {
  vi.stubGlobal("fetch", async (input: Request) => {
    const url = String(input?.url ?? input);
    if (url.includes("/stats/commit_activity")) {
      const rows = Array.from({ length: 52 }, (_, w) => ({
        week: Math.floor(Date.UTC(2025, 0, 5 + w * 7) / 1000),
        total: w % 7,
        days: [0, 1, 2, 3, 4, 1, 0],
      }));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected fetch");
  });
  const { GET } = await import("@/app/api/repo/[owner]/[repo]/route");
  const res = await GET(new Request("https://x/api/repo/vercel/next.js?variant=skyline&mm=180"), {
    params: Promise.resolve({ owner: "vercel", repo: "next.js" }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "model/3mf");
  assert.ok(Number(res.headers.get("X-Monolith-Commits")) > 0, "the commit total should be reported");
});

