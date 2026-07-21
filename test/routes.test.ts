import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { unzip } from "./helpers/zip";
import { GET as getKit } from "@/app/api/kit/route";
import { GET as getStl } from "@/app/api/stl/route";
import { GET as get3mf } from "@/app/api/3mf/route";
import { GET as getContributions } from "@/app/api/contributions/route";
import { MAX_SIZE_MM, MIN_SIZE_MM, modelQuery, parseModelRequest } from "@/lib/request";
import { DEFAULT_MATERIAL_ID, DEFAULT_PRINTER_ID, DEFAULT_QUALITY_ID } from "@/lib/print";
import { yearFromDays } from "@/lib/contributions";
import type { Day } from "@/lib/types";
import fixture from "./fixtures/contributions-2025.json";

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
  // mean one year on the preview and another on the download.
  const current = new Date().getUTCFullYear();
  for (const junk of ["99999", "1900", "1e21", "-5", "notayear"]) {
    assert.equal(parseModelRequest(new URL(`${BASE}/kit?year=${junk}`)).year, current, junk);
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
