import { test } from "vitest";
import assert from "node:assert";

import { fetchContributionYears } from "@/lib/github";
import { pack, syntheticYear, computeStats } from "@/lib/contributions";
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
