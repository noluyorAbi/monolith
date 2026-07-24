import { afterEach, test, vi } from "vitest";
import assert from "node:assert";

import { fetchContributionYears, fetchContributionRange, fetchLifetime, fetchRepoActivity, repoActivityToYear, fetchCommitHours, StatsPendingError, type RepoActivity } from "@/lib/github";
import { pack, syntheticYear, computeStats, BadLoginError } from "@/lib/contributions";
import { buildMultiYear, buildMonolith, fitsBed } from "@/lib/build";
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
  // The letters must extrude OUT of the min-Z wall (past the plate), not be
  // buried inside the solid where they would render as nothing.
  assert.ok(
    b.bounds.min[2] < a.bounds.min[2] - 0.1,
    `milestone text should reach past the plate wall (${b.bounds.min[2]} vs ${a.bounds.min[2]})`,
  );
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

