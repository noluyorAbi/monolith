import { afterEach, test, vi } from "vitest";
import assert from "node:assert";

import { fetchContributionYears, fetchContributionRange, fetchLifetime, fetchRepoActivity, repoActivityToYear, fetchCommitHours, fetchTopLanguages, fetchRepoLanguages, StatsPendingError, type RepoActivity } from "@/lib/github";
import { splitByLevel, printableParts, wholeObject } from "@/lib/parts";
import { slotForLevel } from "@/lib/slots";
import { pack, splitRangeByYear, syntheticYear, computeStats, BadLoginError } from "@/lib/contributions";
import { buildDuel, buildMultiYear, buildMonolith, fitsBed, langAbbr, langLegend } from "@/lib/build";
import { printerById } from "@/lib/print";
import type { ContributionYear } from "@/lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Build N synthetic years for a login without touching the network. */
function fakeMulti(login: string, years: number[]): ContributionYear[] {
  return years.map((y) => {
    const base = syntheticYear(login, y);
    return pack(login, login, y, base.days, "synthetic", {
      totalIssues: 10 + y,
      totalPullRequests: 5 + y,
      totalReviews: 2 + y,
      totalRepos: 1 + y,
      joinedAt: "2018-01-01",
      firstPrAt: `${y}-03-01`,
    });
  });
}

function multiOf(parts: ContributionYear[]) {
  return {
    login: "octocat",
    name: "octocat",
    years: parts,
    fromYear: parts[0].year,
    toYear: parts[parts.length - 1].year,
    demo: true,
    source: "synthetic" as const,
    totalCommits: 0,
    totalIssues: 0,
    totalPullRequests: 0,
    totalReviews: 0,
    totalRepos: 0,
  };
}

test("fetchContributionYears returns the requested years with the correct span", async () => {
  // GitHub unreachable: the multi-year fetch must still deliver every
  // requested year, labelled synthetic, without touching the real network.
  vi.stubGlobal("fetch", async () => {
    throw new Error("offline");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const data = await fetchContributionYears("octocat", [2023, 2024, 2025]);
  assert.equal(data.years.length, 3);
  assert.equal(data.fromYear, 2023);
  assert.equal(data.toYear, 2025);
  assert.equal(data.demo, true, "an unreachable GitHub must be flagged as demo data");
  assert.ok(data.totalCommits >= 0);
  assert.ok(data.totalIssues >= 0);
  assert.ok(data.totalPullRequests >= 0);
  assert.ok(data.totalReviews >= 0);
  assert.ok(data.joinedAt === undefined || typeof data.joinedAt === "string");
});

test("the aliased GraphQL multi-year call parses every year from one response", async () => {
  // The stated value of M1 is ONE aliased GraphQL round trip for N years; this
  // is the first test that actually executes that path rather than the
  // synthetic fallback.
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  const calls: string[] = [];
  const week = (date: string, count: number) => ({
    contributionDays: [{ date, contributionCount: count, contributionLevel: "THIRD_QUARTILE", weekday: 0 }],
  });
  const yearBlock = (date: string, count: number) => ({
    contributionCalendar: { colors: [], isHalloween: false, weeks: [week(date, count)] },
    totalCommitContributions: count,
    totalIssueContributions: 1,
    totalPullRequestContributions: 1,
    totalPullRequestReviewContributions: 0,
    totalRepositoriesWithContributedCommits: 1,
    joinedGitHubContribution: { occurredAt: "2016-04-01T00:00:00Z" },
    firstPullRequestContribution: null,
    firstIssueContribution: null,
    firstRepositoryContribution: null,
  });
  vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input.url);
    calls.push(url);
    assert.ok(url.includes("api.github.com/graphql"), `expected one GraphQL call, got ${url}`);
    const body = String(init?.body ?? (input instanceof Request ? await input.text() : ""));
    assert.match(body, /y2024: contributionsCollection/, "years must be aliased into one query");
    assert.match(body, /y2025: contributionsCollection/, "years must be aliased into one query");
    return new Response(
      JSON.stringify({
        data: {
          user: {
            login: "octocat",
            name: "The Octocat",
            contributionYears: [2025, 2024],
            y2024: yearBlock("2024-06-01", 7),
            y2025: yearBlock("2025-06-01", 9),
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const data = await fetchContributionYears("octocat", [2024, 2025]);
  assert.equal(calls.length, 1, "N years must cost one round trip");
  assert.equal(data.years.length, 2);
  assert.equal(data.years[0].year, 2024);
  assert.equal(data.years[0].total, 7);
  assert.equal(data.years[1].total, 9);
  assert.equal(data.totalCommits, 16);
  assert.equal(data.demo, false);
  assert.equal(data.joinedAt, "2016-04-01");
});

test("buildMultiYear stacks years in depth, keeping one year's width", () => {
  const parts = fakeMulti("octocat", [2021, 2022, 2023, 2024]);
  const one = buildMonolith(parts[0], { variant: "skyline", sizeMm: 120, label: false });
  const stacked = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 120, label: false });
  // Years are terraces along Z: depth grows, width stays a single year's.
  assert.ok(stacked.size.z > one.size.z * 2.5, `stacked depth ${stacked.size.z} vs single ${one.size.z}`);
  assert.ok(stacked.size.x < one.size.x * 1.05, `width must stay one year's (${stacked.size.x} vs ${one.size.x})`);
  assert.ok(stacked.triangles > one.triangles, "stacked has more triangles than one year");
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < stacked.positions.length; i += 3) {
    minX = Math.min(minX, stacked.positions[i]);
    maxX = Math.max(maxX, stacked.positions[i]);
    minZ = Math.min(minZ, stacked.positions[i + 2]);
    maxZ = Math.max(maxZ, stacked.positions[i + 2]);
  }
  assert.ok(minX < 0 && maxX > 0, "object is centred on X");
  assert.ok(minZ < 0 && maxZ > 0, "object is centred on Z");
});

test("terraced years stand on ONE continuous base plate, not N loose plates", () => {
  const parts = fakeMulti("octocat", [2022, 2023, 2024]);
  const stacked = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: true });
  const one = buildMonolith(parts[0], { variant: "skyline", sizeMm: 180, label: false });
  // A single bottom face must span the WHOLE footprint. With per-row plates
  // the largest bottom triangle only ever covers one row's depth.
  let bottomSpan = 0;
  const p = stacked.positions;
  for (let t = 0; t < p.length; t += 9) {
    if (p[t + 1] !== 0 || p[t + 4] !== 0 || p[t + 7] !== 0) continue;
    const zs = [p[t + 2], p[t + 5], p[t + 8]];
    bottomSpan = Math.max(bottomSpan, Math.max(...zs) - Math.min(...zs));
  }
  assert.ok(
    bottomSpan > one.size.z * 2,
    `the base plate must be one piece spanning all rows (bottom span ${bottomSpan} vs one row ${one.size.z})`,
  );
  // And the engraving scale on the shared plate matches a single year's.
  const single = buildMonolith(parts[2], { variant: "skyline", sizeMm: 180, label: true });
  assert.ok(Math.abs(stacked.print.engravePixelMm - single.print.engravePixelMm) < 1e-6);
});

test("each terrace's year is engraved on the plate's right side wall", () => {
  const parts = fakeMulti("octocat", [2022, 2023, 2024]);
  const labelled = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: true });
  const bare = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: false });
  // The row-year text extrudes OUT of the +X wall, so the labelled build is
  // wider than the plate by the engrave depth; the bare build is exactly 180.
  assert.ok(Math.abs(bare.size.x - 180) < 1e-3, `bare width ${bare.size.x}`);
  assert.ok(
    labelled.size.x > 180.2 && labelled.size.x < 181,
    `year labels should stand off the right wall (width ${labelled.size.x})`,
  );
  // One block of pixels per row: every row's Z band contains side-wall
  // geometry past the plate wall. Only the year text reaches beyond
  // bounds.max.x minus the engrave depth.
  const zs: number[] = [];
  const p = labelled.positions;
  const textX = labelled.size.x / 2 - 0.3;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] > textX) zs.push(p[i + 2]);
  }
  zs.sort((a, b) => a - b);
  let clusters = zs.length ? 1 : 0;
  for (let i = 1; i < zs.length; i++) if (zs[i] - zs[i - 1] > 15) clusters++;
  assert.equal(clusters, 3, `side-wall text should appear beside all 3 rows, got ${clusters} clusters`);
});

test("a sparse or empty year still owns a full terrace of plate", () => {
  // The user's own 5-yr range: early years nearly empty. The plate used to be
  // sized from tower positions, so empty rows had NO plate under them and
  // their year labels floated in air beyond the plate's edge.
  const full = fakeMulti("octocat", [2024])[0];
  const sparse = pack("octocat", "octocat", 2022, [{ date: "2022-07-01", count: 1, level: 1 }], "html");
  const empty = pack("octocat", "octocat", 2023, [{ date: "2023-07-01", count: 0, level: 0 }], "html");
  const stacked = buildMultiYear(multiOf([sparse, empty, full]), { variant: "skyline", sizeMm: 180, label: true });
  const one = buildMonolith(full, { variant: "skyline", sizeMm: 180, label: false });
  // Three full rows of plate depth, not one row plus stray towers.
  assert.ok(
    stacked.size.z > one.size.z * 2.5,
    `plate must span all 3 rows (depth ${stacked.size.z} vs single ${one.size.z})`,
  );
  // And the bottom face spans it all in one piece.
  let bottomSpan = 0;
  const p = stacked.positions;
  for (let t = 0; t < p.length; t += 9) {
    if (p[t + 1] !== 0 || p[t + 4] !== 0 || p[t + 7] !== 0) continue;
    const zs = [p[t + 2], p[t + 5], p[t + 8]];
    bottomSpan = Math.max(bottomSpan, Math.max(...zs) - Math.min(...zs));
  }
  assert.ok(bottomSpan > one.size.z * 2.5, `one continuous plate expected, bottom span ${bottomSpan}`);
});

test("a multi-year stack deeper than the bed is caught by fitsBed", () => {
  const parts = fakeMulti("octocat", [2020, 2021, 2022, 2023, 2024, 2025]);
  const stacked = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: false });
  const mini = printerById("a1m"); // 180mm bed
  assert.equal(fitsBed(mini, stacked.size.z), false);
});

test("streak stats are derived client-side from the calendar", () => {
  const year = syntheticYear("octocat", 2025);
  const stats = computeStats(year);
  assert.ok(stats.longestStreak >= 1, "longest streak is at least one day");
  assert.ok(typeof stats.currentStreak === "number");
});

test("milestone dates are engraved onto the base plate when present", () => {
  const plain = pack("octocat", "octocat", 2025, syntheticYear("octocat", 2025).days, "synthetic");
  const withMilestones = pack("octocat", "octocat", 2025, syntheticYear("octocat", 2025).days, "synthetic", {
    joinedAt: "2016-04-01",
    firstPrAt: "2017-09-12",
  });
  const a = buildMonolith(plain, { variant: "skyline", sizeMm: 180, label: true });
  const b = buildMonolith(withMilestones, { variant: "skyline", sizeMm: 180, label: true });
  // Engraving JOINED <yr> and 1ST PR <yr> adds geometry to the base plate.
  assert.ok(b.positions.length > a.positions.length, "milestone engraving should add base-plate geometry");
  // The letters must extrude OUT of the min-Z wall (past the plate), not be
  // buried inside the solid where they would render as nothing.
  assert.ok(
    b.bounds.min[2] < a.bounds.min[2] - 0.1,
    `milestone text should reach past the plate wall (${b.bounds.min[2]} vs ${a.bounds.min[2]})`,
  );
});

test("a cross-year range re-slices into per-year rows; a single-year range stays one plate", () => {
  const spread: ReturnType<typeof syntheticYear>["days"] = [];
  for (const [date, count] of [
    ["2023-08-01", 5],
    ["2023-12-30", 2],
    ["2024-03-01", 7],
    ["2025-01-05", 1],
  ] as const) {
    spread.push({ date, count, level: 1 });
  }
  const range = pack("octocat", "octocat", 2023, spread, "html");
  const multi = splitRangeByYear(range);
  assert.ok(multi, "a 2023..2025 range must re-slice");
  assert.equal(multi!.years.length, 3);
  assert.equal(multi!.fromYear, 2023);
  assert.equal(multi!.toYear, 2025);
  assert.equal(multi!.totalCommits, 15);

  const single = pack("octocat", "octocat", 2024, [{ date: "2024-05-01", count: 3, level: 1 }], "html");
  assert.equal(splitRangeByYear(single), null, "one calendar year stays one plate");
});

test("terraced rows share one physical scale even when a year is partial", () => {
  // A full year beside a half year: the half row must come out narrower, not
  // blown up to full width with double-sized cells.
  const full = syntheticYear("octocat", 2024);
  const half = pack(
    "octocat",
    "octocat",
    2025,
    syntheticYear("octocat", 2025).days.slice(0, 182),
    "synthetic",
  );
  const stacked = buildMultiYear(multiOf([full, half]), { variant: "skyline", sizeMm: 180, label: false });
  // The stack's width is the FULL year's width; the half year occupies about
  // half of it, so the overall footprint is still 180 across.
  assert.ok(Math.abs(stacked.size.x - 180) < 1, `stack width ${stacked.size.x} should be the full year's 180`);
  // Two rows deep.
  const one = buildMonolith(full, { variant: "skyline", sizeMm: 180, label: false });
  assert.ok(stacked.size.z > one.size.z * 1.8, `two rows expected, depth ${stacked.size.z}`);
});

test("multi-year print metrics report per-year millimetres, not a stack-wide rescale", () => {
  const parts = fakeMulti("octocat", [2021, 2022, 2023]);
  const one = buildMonolith(parts[2], { variant: "skyline", sizeMm: 180, label: true });
  const stacked = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: true });
  // The engraving lives inside the last per-year mesh at that year's own
  // scale; the roll-up must not divide it by the three-years-wide footprint.
  assert.ok(
    Math.abs(stacked.print.engravePixelMm - one.print.engravePixelMm) < 1e-6,
    `engraved pixel ${stacked.print.engravePixelMm} should match the per-year ${one.print.engravePixelMm}`,
  );
  assert.ok(
    stacked.print.gapMm !== null && stacked.print.gapMm > one.print.gapMm! * 0.9,
    "the tower gap must stay in per-year millimetres",
  );
});

test("fetchContributionRange returns an arbitrary window, not a calendar year", async () => {
  vi.stubGlobal("fetch", async (input: Request) => {
    const url = String(input?.url ?? input);
    if (url.includes("/users/octocat/contributions")) {
      // A tiny window 2019-06-01..2021-05-31 with two cells.
      const html = [
        `<td data-date="2019-06-01" id="d0" data-level="3" class="ContributionCalendar-day"></td>`,
        `<td data-date="2021-05-31" id="d1" data-level="1" class="ContributionCalendar-day"></td>`,
        `<tool-tip for="d0">5 contributions on June 1st, 2019.</tool-tip>`,
        `<tool-tip for="d1">1 contribution on May 31st, 2021.</tool-tip>`,
      ].join("");
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error("unexpected fetch");
  });
  const data = await fetchContributionRange("octocat", "2019-06-01", "2021-05-31");
  assert.equal(data.year, 2019);
  assert.ok(data.days.length >= 2, "the window should carry its days");
  assert.ok(data.days[0].date >= "2019-06-01");
  assert.ok(data.days[data.days.length - 1].date <= "2021-05-31");
  const mesh = buildMonolith(data, { variant: "skyline", sizeMm: 180, label: true });
  assert.ok(mesh.triangles > 0, "the arbitrary-range object builds");
});

test("fetchContributionRange rejects a malformed window", async () => {
  await assert.rejects(() => fetchContributionRange("octocat", "not-a-date", "2021-05-31"), BadLoginError);
});

test("fetchLifetime stacks every contributed year the account has", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("offline");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const data = await fetchLifetime("octocat");
  assert.ok(data.years.length >= 1, "lifetime should cover at least the current year");
  assert.ok(data.fromYear <= data.toYear, "fromYear must be <= toYear");
  assert.ok(data.totalCommits >= 0);
});

test("a range spanning several years is split at calendar boundaries and stitched", async () => {
  const windows: string[] = [];
  vi.stubGlobal("fetch", async (input: Request | string) => {
    const url = typeof input === "string" ? input : String(input.url);
    if (url.includes("/users/octocat/contributions")) {
      const from = new URL(url).searchParams.get("from")!;
      windows.push(from);
      // Each calendar-year slice answers with one day inside its own window.
      const y = from.slice(0, 4);
      const html =
        `<td data-date="${y}-07-01" id="d0" data-level="2" class="ContributionCalendar-day"></td>` +
        `<tool-tip for="d0">3 contributions on July 1st.</tool-tip>`;
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const data = await fetchContributionRange("octocat", "2019-06-01", "2021-05-31");
  // GitHub refuses windows over one year, so the fetcher must have asked for
  // three calendar-year slices rather than one three-year window.
  assert.deepEqual(windows.sort(), ["2019-06-01", "2020-01-01", "2021-01-01"]);
  assert.equal(data.year, 2019);
  assert.equal(data.days.length, 3, "one day per stitched slice");
  assert.equal(data.total, 9, "counts sum across the stitched slices");
});

test("a repo's commit histogram builds a faithful skyline", () => {
  const activity: RepoActivity = {
    owner: "vercel",
    repo: "next.js",
    total: 52,
    weeks: Array.from({ length: 52 }, (_, w) => ({
      week: new Date(Date.UTC(2025, 0, 5 + w * 7)).toISOString().slice(0, 10),
      total: w % 7,
      days: [0, 1, 2, 3, 4, 1, 0],
    })),
  };
  const year = repoActivityToYear(activity);
  const mesh = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  assert.equal(year.days.length, 52 * 7, "every day of 52 weeks should be present");
  assert.ok(mesh.triangles > 0, "the repo skyline builds");
});

test("a repo whose stats GitHub is still computing raises StatsPendingError, not a crash", async () => {
  // GitHub answers the first stats request for a cold repo with 202 and an
  // EMPTY body. res.json() on that used to throw and become a 500.
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async () => new Response(null, { status: 202 }));
  const pending = fetchRepoActivity("vercel", "next.js");
  const settled = assert.rejects(pending, StatsPendingError);
  await vi.advanceTimersByTimeAsync(10_000);
  await settled;
});

test("a 202 that resolves on retry returns the data without surfacing the pending state", async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    if (calls === 1) return new Response(null, { status: 202 });
    const rows = [{ week: Math.floor(Date.UTC(2025, 0, 5) / 1000), total: 3, days: [0, 1, 0, 2, 0, 0, 0] }];
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  });
  const pending = fetchRepoActivity("vercel", "next.js");
  await vi.advanceTimersByTimeAsync(10_000);
  const activity = await pending;
  assert.equal(calls, 2, "the fetcher should retry once after the 202");
  assert.equal(activity.total, 3);
});

test("an empty repository (204 / empty stats) still yields a buildable flat plate", async () => {
  vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
  const activity = await fetchRepoActivity("octocat", "brand-new-repo");
  assert.equal(activity.total, 0);
  assert.equal(activity.weeks.length, 0);
  const year = repoActivityToYear(activity);
  assert.equal(year.days.length, 52 * 7, "an empty repo still gets a full 52-week grid");
  assert.equal(year.total, 0);
  const mesh = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  assert.ok(mesh.triangles > 0, "the flat plate builds instead of crashing");
});

test("the sigil and peak-day engravings are opt-in and add real geometry", () => {
  const year = fakeMulti("octocat", [2025])[0];
  const sigil = {
    points: [[0.1, 0.2], [0.5, 0.8], [0.9, 0.3]] as [number, number][],
    edges: [[0, 1], [1, 2]] as [number, number][],
    name: "The Comet",
  };
  const plain = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  const withSigil = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true, sigil });
  const withPeak = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true, peak: true });
  assert.ok(withSigil.triangles > plain.triangles, "the sigil must add back-wall geometry");
  assert.ok(withPeak.triangles > plain.triangles, "the peak date must add front-wall geometry");

  // The ring has no flat wall; its extras land on the clear plate centre and
  // must stay inside the band's inner circle (raw innerR 30 at plate top).
  const ringPlain = buildMonolith(year, { variant: "ring", sizeMm: 180, label: true });
  const ringExtra = buildMonolith(year, { variant: "ring", sizeMm: 180, label: true, sigil, peak: true });
  assert.ok(ringExtra.triangles > ringPlain.triangles, "ring extras must add centre geometry");
  const kRing = 180 / 137; // sizeMm over the ring's raw footprint (2 * plateR)
  const innerMm = 30 * kRing;
  const topMm = 5 * kRing; // plate top; extras are raised ~0.9mm out of it
  const p = ringExtra.positions;
  let engraved = 0;
  for (let i = 0; i < p.length; i += 3) {
    const y = p[i + 1];
    // Strictly above the plate top and below the shortest bar: only the
    // raised engravings live in this band.
    if (y <= topMm + 1e-3 || y > topMm + 1.0) continue;
    engraved++;
    const r = Math.hypot(p[i], p[i + 2]);
    assert.ok(r < innerMm, `engraving at r=${r.toFixed(1)} runs under the band (inner ${innerMm.toFixed(1)})`);
  }
  assert.ok(engraved > 0, "the centre engravings must exist in the band above the plate");
  // Off means off: no flag, byte-identical geometry.
  const again = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  assert.equal(again.triangles, plain.triangles);

  // The same extras land on a multi-year stack's shared plate.
  const parts = fakeMulti("octocat", [2024, 2025]);
  const stackPlain = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: true });
  const stackExtra = buildMultiYear(multiOf(parts), {
    variant: "skyline",
    sizeMm: 180,
    label: true,
    sigil,
    peak: true,
  });
  assert.ok(stackExtra.triangles > stackPlain.triangles);
});

test("the duel puts two years back to back on one shared plate", () => {
  const [a, b] = fakeMulti("octocat", [2025, 2025]);
  const bNamed = { ...b, login: "torvalds", name: "torvalds" };
  const single = buildMonolith(a, { variant: "skyline", sizeMm: 180, label: true });
  const duel = buildDuel(a, bNamed, { variant: "skyline", sizeMm: 180, label: true });
  // One year's width, roughly two years' depth, centred.
  assert.ok(Math.abs(duel.size.x - 180) < 1, `duel width ${duel.size.x}`);
  assert.ok(duel.size.z > single.size.z * 1.6, `two grids expected, depth ${duel.size.z}`);
  // Both calendars present: the label-less duel carries roughly twice the
  // label-less single object's towers.
  const singleBare = buildMonolith(a, { variant: "skyline", sizeMm: 180, label: false });
  const duelBare = buildDuel(a, bNamed, { variant: "skyline", sizeMm: 180, label: false });
  assert.ok(
    duelBare.triangles > singleBare.triangles * 1.7,
    `both calendars must be present (${duelBare.triangles} vs ${singleBare.triangles})`,
  );
  // One continuous bottom face spanning the whole footprint: one object.
  let bottomSpan = 0;
  const p = duel.positions;
  for (let t = 0; t < p.length; t += 9) {
    if (p[t + 1] !== 0 || p[t + 4] !== 0 || p[t + 7] !== 0) continue;
    const zs = [p[t + 2], p[t + 5], p[t + 8]];
    bottomSpan = Math.max(bottomSpan, Math.max(...zs) - Math.min(...zs));
  }
  assert.ok(bottomSpan > single.size.z * 1.6, `one shared plate expected, span ${bottomSpan}`);
  // Names on both walls: geometry protrudes past the plate on BOTH z sides.
  const bare = buildDuel(a, bNamed, { variant: "skyline", sizeMm: 180, label: false });
  assert.ok(duel.triangles > bare.triangles, "the two names add wall geometry");
  // Deterministic.
  assert.equal(buildDuel(a, bNamed, { variant: "skyline", sizeMm: 180, label: true }).triangles, duel.triangles);
});

test("the keyring loop fuses to the plate and keeps its physical size", () => {
  const year = fakeMulti("octocat", [2025])[0];
  const plain = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  const looped = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true, loop: true });
  assert.ok(looped.triangles > plain.triangles, "the loop adds geometry");
  // scaleToSize pins the longest edge to sizeMm, so the loop shows up as an
  // ASYMMETRY: it protrudes past the plate on the -x/-z corner.
  assert.ok(
    looped.bounds.min[0] < plain.bounds.min[0] - 1,
    `the loop should protrude past the corner (${looped.bounds.min[0]} vs ${plain.bounds.min[0]})`,
  );
  // Physical millimetres at any size: the protrusion (asymmetry between the
  // -x reach and the +x reach) is hand-sized at 180mm AND at the 60mm
  // keyring size, instead of scaling down with the object.
  const protrusion = (m: { bounds: { min: number[]; max: number[] } }) =>
    Math.abs(m.bounds.min[0]) - Math.abs(m.bounds.max[0]);
  const small = buildMonolith(year, { variant: "skyline", sizeMm: 60, label: true, loop: true });
  const p180 = protrusion(looped);
  const p60 = protrusion(small);
  assert.ok(p180 > 3 && p180 < 10, `loop protrusion at 180mm: ${p180.toFixed(1)}mm`);
  assert.ok(p60 > 3 && p60 < 10, `loop protrusion at 60mm: ${p60.toFixed(1)}mm`);
  assert.ok(Math.abs(p60 - p180) < 3, `physical size holds (${p60.toFixed(1)} vs ${p180.toFixed(1)})`);
});

/**
 * The tab has to stay inside the object's own silhouette. It used to be 3.2mm
 * thick whatever the plate was, which at the 60mm size stood 1.83mm proud of a
 * 1.37mm plate, and 10.0mm across on a plate only 9.6mm deep. Both are pinned
 * here because both are invisible to a triangle count.
 */
test("the keyring loop is flush with the plate and never wider than it", () => {
  const year = fakeMulti("octocat", [2025])[0];
  for (const sizeMm of [60, 120, 180, 260, 400]) {
    const m = buildMonolith(year, { variant: "skyline", sizeMm, label: true, loop: true });
    const plain = buildMonolith(year, { variant: "skyline", sizeMm, label: true });
    // The plate is seven cells plus two pads deep and BASE_H tall, so its
    // thickness is exactly a seventh of its depth at every scale.
    const plateTop = m.size.z / 7;
    const plateLeft = plain.bounds.min[0];

    let highest = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 0; i < m.positions.length; i += 3) {
      // Only geometry the plate does not already cover, which is the tab.
      if (m.positions[i] >= plateLeft) continue;
      highest = Math.max(highest, m.positions[i + 1]);
      zMin = Math.min(zMin, m.positions[i + 2]);
      zMax = Math.max(zMax, m.positions[i + 2]);
    }

    assert.ok(highest > 0, `${sizeMm}mm: expected tab geometry left of the plate`);
    assert.ok(
      highest <= plateTop + 1e-6,
      `${sizeMm}mm: tab rises ${(highest - plateTop).toFixed(2)}mm above the plate top`,
    );
    assert.ok(
      zMax - zMin <= m.size.z + 1e-6,
      `${sizeMm}mm: tab is ${(zMax - zMin).toFixed(1)}mm across a plate ${m.size.z.toFixed(1)}mm deep`,
    );
  }
});

test("the keyring loop still splits into closed solids", () => {
  const year = fakeMulti("octocat", [2025])[0];
  for (const sizeMm of [60, 180]) {
    const m = buildMonolith(year, { variant: "skyline", sizeMm, label: true, loop: true });
    const plain = buildMonolith(year, { variant: "skyline", sizeMm, label: true });
    // printableParts falls back to one whole object as soon as any group is
    // open, so asserting on its output alone would pass through the fallback.
    // Assert the surface itself closes, and that the split did not degrade.
    assert.ok(wholeObject(m).closed, `${sizeMm}mm: the loop leaves an open surface`);
    assert.equal(
      printableParts(m).length,
      printableParts(plain).length,
      `${sizeMm}mm: the loop dropped the model back to a single part`,
    );
  }
});

/**
 * The language band is colour only, which says nothing once the object is
 * printed in a single filament. The legend is the key, and it has to survive
 * a long handle and the peak-day text without running into either.
 */
test("the language legend abbreviates, and shortens rather than overflowing", () => {
  assert.equal(langAbbr("TypeScript"), "TS");
  assert.equal(langAbbr("Jupyter Notebook"), "IPYNB");
  // C, C++ and C# must not collapse onto each other, which stripping
  // punctuation would do.
  assert.equal(langAbbr("C"), "C");
  assert.equal(langAbbr("C++"), "CPP");
  assert.equal(langAbbr("C#"), "CS");
  // An unknown language still gets something readable.
  assert.equal(langAbbr("Brainfuck"), "BRAI");
  assert.equal(langAbbr("!!!"), "ETC");

  const langs = [
    { name: "TypeScript", color: "#3178c6", share: 0.62 },
    { name: "JavaScript", color: "#f1e05a", share: 0.19 },
    { name: "CSS", color: "#563d7c", share: 0.09 },
    { name: "Python", color: "#3572A5", share: 0.1 },
  ];
  // Source order, deliberately not re-sorted by share: the band is drawn in
  // the same order, and a legend that sorted differently would name the wrong
  // segment. Python is the bigger share here and still comes fourth.
  assert.equal(langLegend(langs), "TS 62  JS 19  CSS 9");
  assert.equal(langLegend(langs, 1), "TS 62");
  assert.equal(langLegend([]), "");
});

test("the legend reaches the plate wall and yields to a long handle", () => {
  const langs = [
    { name: "TypeScript", color: "#3178c6", share: 0.62 },
    { name: "JavaScript", color: "#f1e05a", share: 0.19 },
    { name: "CSS", color: "#563d7c", share: 0.19 },
  ];
  const short = fakeMulti("octocat", [2025])[0];
  const plain = buildMonolith(short, { variant: "skyline", sizeMm: 180, label: true });
  const keyed = buildMonolith(short, { variant: "skyline", sizeMm: 180, label: true, langs });
  assert.ok(keyed.triangles > plain.triangles, "the legend adds wall geometry");

  // A 39 character login is the GitHub maximum. The wall it leaves is too
  // narrow for three entries, so the legend must shrink instead of colliding
  // with the year, which sits at the right edge.
  const longName = "a".repeat(39);
  const base = syntheticYear(longName, 2025);
  const long = pack(longName, longName, 2025, base.days, "synthetic", {});
  const longPlain = buildMonolith(long, { variant: "skyline", sizeMm: 180, label: true });
  const longKeyed = buildMonolith(long, { variant: "skyline", sizeMm: 180, label: true, langs });
  const added = longKeyed.triangles - longPlain.triangles;
  const addedShort = keyed.triangles - plain.triangles;
  assert.ok(added < addedShort, `a long handle must shorten the legend (${added} vs ${addedShort})`);
});

test("commit time-of-day is bucketed into 24 local hours (M16)", async () => {
  vi.stubGlobal("fetch", async (input: Request) => {
    const url = typeof input === "string" ? input : String(input.url);
    if (url.includes("/search/commits")) {
      // Two commits: one at 09:00Z, one at 22:00Z.
      const items = [
        { commit: { author: { date: "2025-03-01T09:00:00+00:00" } } },
        { commit: { author: { date: "2025-06-01T22:00:00+05:30" } } },
      ];
      return new Response(JSON.stringify({ total_count: 2, items }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected fetch");
  });
  const hours = await fetchCommitHours("octocat", 2025);
  assert.equal(hours.hours.length, 24);
  assert.equal(hours.hours[9], 1, "the 09:00Z commit lands in bucket 9");
  assert.equal(hours.hours[22], 1, "the +05:30 commit (22:00 local) lands in bucket 22");
  assert.equal(hours.total, 2);
  assert.equal(hours.sampled, 2, "every returned commit must land in a bucket");
});

test("UTC commits with a Z suffix are counted, not silently dropped", async () => {
  // A UK-winter or CI author's timestamps end in Z, not +00:00. The old regex
  // required a numeric offset sign and returned an all-zero histogram for them.
  vi.stubGlobal("fetch", async () => {
    const items = [
      { commit: { author: { date: "2025-01-10T07:00:00Z" } } },
      { commit: { author: { date: "2025-01-11T07:30:00Z" } } },
      { commit: { author: { date: "2025-01-12T23:00:00-08:00" } } },
    ];
    return new Response(JSON.stringify({ total_count: 3, items }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const hours = await fetchCommitHours("octocat", 2025);
  assert.equal(hours.hours[7], 2, "both Z-suffixed 07:xx commits must be bucketed");
  assert.equal(hours.hours[23], 1);
  assert.equal(hours.sampled, 3);
  assert.equal(hours.capped, false, "total equals sampled, so nothing was cut off");
});

test("a histogram cut off by the search cap says how much of the year it sampled", async () => {
  // 100-item pages with a large total: the fetcher pages up to its budget and
  // must report sampled honestly so the UI can say "sample of N of M".
  let page = 0;
  vi.stubGlobal("fetch", async () => {
    page++;
    const items = Array.from({ length: 100 }, (_, i) => ({
      commit: { author: { date: `2025-02-0${(i % 9) + 1}T1${i % 10}:00:00+01:00` } },
    }));
    return new Response(JSON.stringify({ total_count: 500, items }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const hours = await fetchCommitHours("octocat", 2025);
  assert.equal(page, 3, "the fetcher spends its page budget on a large year");
  assert.equal(hours.sampled, 300);
  assert.equal(hours.total, 500);
  assert.equal(hours.capped, true);
  assert.equal(hours.hours.reduce((a, b) => a + b, 0), hours.sampled, "buckets sum to the sample size");
});


test("the languages ring is opt-in: proportional segments, own levels, own parts", () => {
  const year = fakeMulti("octocat", [2025])[0];
  const langs = [
    { name: "TypeScript", color: "#3178c6", share: 0.5 },
    { name: "Python", color: "#3572A5", share: 0.3 },
    { name: "Rust", color: "#dea584", share: 0.2 },
  ];
  const plain = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  const withLangs = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true, langs });
  assert.ok(withLangs.triangles > plain.triangles, "the bar adds geometry");
  assert.deepEqual(withLangs.langs?.map((l) => l.name), ["TypeScript", "Python", "Rust"]);

  // Segments carry levels 10..12 and sit raised on the plate top.
  const k = 180 / (year.weeks.length * 4 + 7); // sizeMm over the raw plate width
  const topMm = 5 * k;
  const spans = new Map<number, { min: number; max: number }>();
  const p = withLangs.positions;
  for (let i = 0; i < withLangs.levels.length; i++) {
    const level = withLangs.levels[i];
    if (level < 10) continue;
    const y = p[i * 3 + 1];
    assert.ok(y >= topMm - 1e-3 && y <= topMm + 0.8 * k + 1e-3, `segment vertex at y=${y.toFixed(2)}`);
    const s = spans.get(level) ?? { min: Infinity, max: -Infinity };
    s.min = Math.min(s.min, p[i * 3]);
    s.max = Math.max(s.max, p[i * 3]);
    spans.set(level, s);
  }
  assert.deepEqual([...spans.keys()].sort((a, b) => a - b), [10, 11, 12]);
  const widthOf = (lvl: number) => spans.get(lvl)!.max - spans.get(lvl)!.min;
  const total = widthOf(10) + widthOf(11) + widthOf(12);
  assert.ok(widthOf(10) > widthOf(11) && widthOf(11) > widthOf(12), "bigger share, longer segment");
  assert.ok(Math.abs(widthOf(10) / total - 0.5) < 0.05, `top share holds half the bar (${(widthOf(10) / total).toFixed(2)})`);

  // One closed 3MF object per language, named after it.
  const parts = splitByLevel(withLangs);
  for (const name of ["TypeScript", "Python", "Rust"]) {
    const part = parts.find((pt) => pt.name === name);
    assert.ok(part, `part "${name}" must exist`);
    assert.ok(part!.closed, `part "${name}" must be a closed solid`);
  }

  // Slot binding: base plate keeps slot 1, languages cycle the accent slots.
  assert.equal(slotForLevel(10, 1), 1);
  assert.equal(slotForLevel(11, 2), 2);
  assert.deepEqual([10, 11, 12, 13].map((l) => slotForLevel(l, 4)), [2, 3, 4, 2]);

  // Ring variant: arcs around the plinth border, clear OUTSIDE the data band.
  const ringPlain = buildMonolith(year, { variant: "ring", sizeMm: 180, label: true });
  const ringLangs = buildMonolith(year, { variant: "ring", sizeMm: 180, label: true, langs });
  assert.ok(ringLangs.triangles > ringPlain.triangles, "the ring gains its arcs");
  const kR = 180 / 137;
  const bandOuterMm = 65 * kR;
  let arcVerts = 0;
  for (let i = 0; i < ringLangs.levels.length; i++) {
    if (ringLangs.levels[i] < 10) continue;
    arcVerts++;
    const r = Math.hypot(ringLangs.positions[i * 3], ringLangs.positions[i * 3 + 2]);
    assert.ok(r > bandOuterMm, `arc vertex at r=${r.toFixed(1)} runs under the band (outer ${bandOuterMm.toFixed(1)})`);
  }
  assert.ok(arcVerts > 0, "the arcs must exist");

  // Wave has no plate border: the flag is inert there, honestly.
  const wavePlain = buildMonolith(year, { variant: "wave", sizeMm: 180, label: true });
  const waveLangs = buildMonolith(year, { variant: "wave", sizeMm: 180, label: true, langs });
  assert.equal(waveLangs.triangles, wavePlain.triangles);
  assert.equal(waveLangs.langs, undefined, "no geometry, no part names");

  // The multi-year shared plate carries the bar in its own front border.
  const years = fakeMulti("octocat", [2024, 2025]);
  const stackPlain = buildMultiYear(multiOf(years), { variant: "skyline", sizeMm: 180, label: true });
  const stackLangs = buildMultiYear(multiOf(years), { variant: "skyline", sizeMm: 180, label: true, langs });
  assert.ok(stackLangs.triangles > stackPlain.triangles);
  assert.equal(stackLangs.langs?.length, 3);

  // Off means off: no flag, byte-identical geometry.
  assert.equal(buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true }).triangles, plain.triangles);
});

test("fetchTopLanguages keeps the top six at 4%+ and renormalises the shares", async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | Request) => {
    const url = typeof input === "string" ? input : String((input as Request).url);
    if (url.includes("graphql")) {
      // Token path (when the env has one): answer empty so the REST census runs.
      return new Response(JSON.stringify({ data: { user: null } }), { status: 200 });
    }
    const repos = [
      { language: "TypeScript", size: 500, fork: false },
      { language: "Python", size: 300, fork: false },
      { language: "Rust", size: 190, fork: false },
      { language: "Lua", size: 10, fork: false }, // 1%: below the 4% floor
      { language: "C", size: 9000, fork: true }, // forks do not count
      { language: null, size: 400, fork: false },
    ];
    return new Response(JSON.stringify(repos), { status: 200, headers: { "content-type": "application/json" } });
  });
  const langs = await fetchTopLanguages("octocat");
  assert.deepEqual(langs.map((l) => l.name), ["TypeScript", "Python", "Rust"]);
  const sum = langs.reduce((a, l) => a + l.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares must renormalise to 1, got ${sum}`);
  assert.equal(langs[0].color, "#3178c6", "known languages wear GitHub's colour");

  // A repository's split comes off the public languages endpoint, bytes exact.
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ Go: 750, HCL: 250 }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  const repo = await fetchRepoLanguages("hashicorp", "terraform");
  assert.deepEqual(repo.map((l) => [l.name, l.share]), [["Go", 0.75], ["HCL", 0.25]]);

  // GitHub silent: an empty list, never a throw, so the flag degrades cleanly.
  vi.stubGlobal("fetch", async () => new Response(null, { status: 403 }));
  assert.deepEqual(await fetchTopLanguages("octocat"), []);
});
