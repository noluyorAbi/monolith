import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { fetchContributionYear } from "@/lib/github";
import {
  BadLoginError,
  LOGIN_RE,
  NotFoundError,
  availableYears,
  availableYearsFor,
  normaliseLogin,
  pack,
  syntheticYear,
} from "@/lib/contributions";
import { biggestSizeFor, buildMonolith, fitsBed, sizeById, sizesForPrinter } from "@/lib/build";
import { printerById } from "@/lib/print";
import type { ContributionYear } from "@/lib/types";

/**
 * The handle is the only user input the whole app takes, and it reaches an
 * outbound URL and a Content-Disposition filename. These tests pin the gate.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("normalisation accepts what people actually paste", () => {
  for (const [input, expected] of [
    ["octocat", "octocat"],
    ["  octocat  ", "octocat"],
    ["@octocat", "octocat"],
    ["https://github.com/octocat", "octocat"],
    ["http://github.com/octocat/", "octocat"],
    ["HTTPS://GitHub.com/octocat", "octocat"],
    ["https://github.com/octocat///", "octocat"],
  ] as const) {
    assert.equal(normaliseLogin(input), expected, `normalising ${input}`);
  }
});

test("the login gate matches GitHub's own rules", () => {
  for (const good of ["a", "a-b", "octocat", "a".repeat(39), "0", "a-1-b"]) {
    assert.ok(LOGIN_RE.test(good), `${good} should be accepted`);
  }
  for (const bad of ["", "-a", "a-", "a--b", "a".repeat(40), "a_b", "a.b", "a/b", "../etc", "a b"]) {
    assert.ok(!LOGIN_RE.test(bad), `${bad} should be rejected`);
  }
});

test("an unusable handle is rejected before anything is fetched", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await assert.rejects(() => fetchContributionYear("not a handle", 2025), BadLoginError);
  await assert.rejects(() => fetchContributionYear("../../etc/passwd", 2025), BadLoginError);
  assert.equal(fetchSpy.mock.calls.length, 0, "a rejected handle still hit the network");
});

test("a missing account is reported, not replaced with invented data", async () => {
  vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
  await assert.rejects(() => fetchContributionYear("octocat", 2025), NotFoundError);
});

/** A trimmed copy of the fragment GitHub serves, keeping the shape that matters. */
const CALENDAR_HTML = `
<table class="ContributionCalendar-grid">
 <tbody>
  <tr>
   <td tabindex="0" data-date="2025-01-05" id="day-0-1" data-level="1" class="ContributionCalendar-day"></td>
   <td tabindex="0" data-date="2025-01-12" id="day-0-2" data-level="4" class="ContributionCalendar-day"></td>
   <td tabindex="0" data-date="2025-01-19" id="day-0-3" data-level="0" class="ContributionCalendar-day"></td>
  </tr>
 </tbody>
</table>
<tool-tip for="day-0-1" class="sr-only">4 contributions on January 5th.</tool-tip>
<tool-tip for="day-0-2" class="sr-only">1,204 contributions on January 12th.</tool-tip>
<tool-tip for="day-0-3" class="sr-only">No contributions on January 19th.</tool-tip>
`;

test("the calendar parser reads counts, levels and dates off the real markup", async () => {
  vi.stubGlobal("fetch", async () => new Response(CALENDAR_HTML, { status: 200 }));
  const year = await fetchContributionYear("octocat", 2025);

  assert.equal(year.source, "html", "should not have fallen back to synthetic data");
  assert.equal(year.demo, false);
  assert.equal(year.days.length, 3);
  assert.deepEqual(year.days[0], { date: "2025-01-05", count: 4, level: 1 });
  // Thousands separators are real in this markup and must not truncate.
  assert.deepEqual(year.days[1], { date: "2025-01-12", count: 1204, level: 4 });
  assert.deepEqual(year.days[2], { date: "2025-01-19", count: 0, level: 0 });
  assert.equal(year.total, 1208);
});

test("markup we cannot parse degrades to labelled sample data, never to zeroes", async () => {
  vi.stubGlobal("fetch", async () => new Response("<div>they redesigned it again</div>", { status: 200 }));
  const year = await fetchContributionYear("octocat", 2025);

  assert.equal(year.demo, true, "unparseable markup must be flagged, not served as a real year");
  assert.equal(year.source, "synthetic");
  assert.ok(year.total > 0, "a year of zeroes would look like a real, empty year");
});

test("an upstream failure is flagged rather than silently faked", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("rate limited");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const year = await fetchContributionYear("octocat", 2025);
  assert.equal(year.demo, true);
  assert.ok((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0, "the failure was swallowed without a trace");
});

test("synthetic years are deterministic and shaped like a calendar", () => {
  const a = syntheticYear("octocat", 2023);
  assert.deepEqual(a.days, syntheticYear("octocat", 2023).days);
  assert.notEqual(a.total, syntheticYear("torvalds", 2023).total);
  assert.equal(a.demo, true);
});

test("available years follow the account when GitHub says so", () => {
  const now = new Date().getUTCFullYear();
  // No data yet: the recent fixed window.
  assert.deepEqual(availableYearsFor(null, 7), availableYears(7));
  // A 2011 account: its real years appear, no guessing at the empty recent ones.
  const oldYear = {
    login: "veteran",
    name: "veteran",
    year: 2011,
    total: 0,
    days: [],
    weeks: [],
    demo: false,
    source: "graphql" as const,
    contributionYears: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011],
  };
  const offered = availableYearsFor(oldYear as unknown as ContributionYear, 7);
  assert.ok(offered.includes(2024) && offered.includes(2011));
  // Newest first, and nothing from the future.
  assert.equal(offered[0], 2024);
  assert.ok(offered.every((y) => y <= now));
});

test("the GraphQL path maps levels, sorts days and reports a missing account", async () => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  const payload = {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        contributionsCollection: {
          contributionCalendar: {
            weeks: [
              {
                contributionDays: [
                  { date: "2025-03-02", contributionCount: 9, contributionLevel: "FOURTH_QUARTILE" },
                  { date: "2025-01-01", contributionCount: 0, contributionLevel: "NONE" },
                  { date: "2025-02-01", contributionCount: 2, contributionLevel: "SECOND_QUARTILE" },
                ],
              },
            ],
          },
        },
      },
    },
  };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(payload), { status: 200 }));

  const year = await fetchContributionYear("octocat", 2025);
  assert.equal(year.source, "graphql");
  assert.equal(year.demo, false);
  assert.equal(year.name, "The Octocat");
  assert.deepEqual(
    year.days.map((d) => d.date),
    ["2025-01-01", "2025-02-01", "2025-03-02"],
    "days must come back in calendar order",
  );
  assert.deepEqual(
    year.days.map((d) => d.level),
    [0, 2, 4],
    "quartile names must map onto the 0..4 ramp the geometry reads",
  );
  assert.equal(year.total, 11);
});

test("GraphQL reporting a missing account is not answered with invented data", async () => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ errors: [{ type: "NOT_FOUND", message: "no" }] }), { status: 200 }),
  );
  await assert.rejects(() => fetchContributionYear("ghost", 2025), NotFoundError);
});

test("the free scalar fields arrive in one query, at no extra cost", async () => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  const payload = {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        contributionYears: [2025, 2024, 2023],
        contributionsCollection: {
          contributionCalendar: {
            colors: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
            isHalloween: true,
            weeks: [
              {
                contributionDays: [
                  { date: "2025-03-02", contributionCount: 9, contributionLevel: "FOURTH_QUARTILE", weekday: 7 },
                  { date: "2025-01-01", contributionCount: 0, contributionLevel: "NONE", weekday: 3 },
                  { date: "2025-02-01", contributionCount: 2, contributionLevel: "SECOND_QUARTILE", weekday: 6 },
                ],
              },
            ],
          },
          totalCommitContributions: 11,
          totalIssueContributions: 2,
          totalPullRequestContributions: 3,
          totalPullRequestReviewContributions: 1,
          totalRepositoriesWithContributedCommits: 4,
          joinedGitHubContribution: { occurredAt: "2011-05-20T00:00:00Z" },
          firstPullRequestContribution: { occurredAt: "2012-08-01T00:00:00Z" },
          firstIssueContribution: null,
          firstRepositoryContribution: null,
        },
      },
    },
  };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(payload), { status: 200 }));

  const year = await fetchContributionYear("octocat", 2025);
  assert.equal(year.source, "graphql");
  assert.deepEqual(year.contributionYears, [2025, 2024, 2023]);
  assert.equal(year.isHalloween, true);
  assert.deepEqual(year.colors, ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"]);
  assert.equal(year.totalIssues, 2);
  assert.equal(year.totalPullRequests, 3);
  assert.equal(year.totalReviews, 1);
  assert.equal(year.totalRepos, 4);
  assert.equal(year.joinedAt, "2011-05-20");
  assert.equal(year.firstPrAt, "2012-08-01");
  assert.equal(year.firstIssueAt, undefined);
});

test("the size picker marks what the chosen printer cannot print", () => {
  const p1s = printerById("p1s");
  const mini = printerById("a1m");
  const statement = sizeById("statement");

  // The A1 mini bed is 180 mm; the statement size is 260 mm and must be
  // flagged, while desk and shelf still fit.
  assert.equal(fitsBed(mini, statement.mm), false);
  assert.equal(fitsBed(mini, sizeById("shelf").mm), true);
  assert.equal(fitsBed(p1s, sizeById("shelf").mm), true);

  const forMini = sizesForPrinter(mini);
  const statementEntry = forMini.find((s) => s.id === "statement");
  assert.equal(statementEntry?.fits, false);
  // biggestSizeFor never returns a size the bed cannot hold.
  assert.equal(biggestSizeFor(mini).mm <= mini.bedMm[0], true);
  assert.equal(biggestSizeFor(mini).id, "shelf");
});

test("outlier compression flattens the busiest days", () => {
  // Build a year with one extreme day dwarfing the rest, so the tallest bar
  // must drop as dampening rises. F7: one slider should visibly compress it.
  const days: { date: string; count: number; level: number }[] = [];
  for (let i = 0; i < 365; i++) {
    const count = i === 100 ? 200 : 4 + (i % 3);
    const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    days.push({ date, count, level: count === 0 ? 0 : Math.min(4, Math.ceil(count / 40)) });
  }
  const year = pack("octocat", "octocat", 2025, days as unknown as never[], "graphql");
  const flat = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true, dampening: 0 });
  const damped = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true, dampening: 1 });
  assert.ok(flat.bounds.max[1] > damped.bounds.max[1], "dampening should lower the tallest point");
  const def = buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true });
  assert.equal(def.bounds.max[1], flat.bounds.max[1]);
});
