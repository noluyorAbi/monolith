import { test, vi } from "vitest";
import assert from "node:assert";

import { fetchContributionYears, fetchContributionRange, fetchLifetime, repoActivityToYear, type RepoActivity } from "@/lib/github";
import { pack, syntheticYear, computeStats, BadLoginError } from "@/lib/contributions";
import { buildMultiYear, buildMonolith, fitsBed } from "@/lib/build";
import { printerById } from "@/lib/print";
import type { ContributionYear } from "@/lib/types";

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
  const data = await fetchContributionYears("octocat", [2023, 2024, 2025]);
  assert.equal(data.years.length, 3);
  assert.equal(data.fromYear, 2023);
  assert.equal(data.toYear, 2025);
  assert.ok(data.totalCommits >= 0);
  assert.ok(data.totalIssues >= 0);
  assert.ok(data.totalPullRequests >= 0);
  assert.ok(data.totalReviews >= 0);
  assert.ok(data.joinedAt === undefined || typeof data.joinedAt === "string");
});

test("buildMultiYear stacks years into a wider footprint than one year", () => {
  const parts = fakeMulti("octocat", [2021, 2022, 2023, 2024]);
  const one = buildMonolith(parts[0], { variant: "skyline", sizeMm: 120, label: false });
  const stacked = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 120, label: false });
  assert.ok(stacked.size.x > one.size.x * 2.5, `stacked width ${stacked.size.x} vs single ${one.size.x}`);
  assert.ok(stacked.triangles > one.triangles, "stacked has more triangles than one year");
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < stacked.positions.length; i += 3) {
    minX = Math.min(minX, stacked.positions[i]);
    maxX = Math.max(maxX, stacked.positions[i]);
  }
  assert.ok(minX < 0 && maxX > 0, "object is centred on the origin");
});

test("a multi-year stack wider than the bed is caught by fitsBed", () => {
  const parts = fakeMulti("octocat", [2020, 2021, 2022, 2023, 2024, 2025]);
  const stacked = buildMultiYear(multiOf(parts), { variant: "skyline", sizeMm: 180, label: false });
  const mini = printerById("a1m"); // 180mm bed
  assert.equal(fitsBed(mini, stacked.size.x), false);
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
  const data = await fetchLifetime("octocat");
  assert.ok(data.years.length >= 1, "lifetime should cover at least the current year");
  assert.ok(data.fromYear <= data.toYear, "fromYear must be <= toYear");
  assert.ok(data.totalCommits >= 0);
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

