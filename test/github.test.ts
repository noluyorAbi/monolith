import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { fetchContributionYear } from "@/lib/github";
import {
  BadLoginError,
  LOGIN_RE,
  NotFoundError,
  availableYears,
  normaliseLogin,
  syntheticYear,
} from "@/lib/contributions";

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

test("available years run backwards from the current one", () => {
  const years = availableYears(4);
  assert.equal(years.length, 4);
  assert.equal(years[0], new Date().getUTCFullYear());
  for (let i = 1; i < years.length; i++) assert.equal(years[i], years[i - 1] - 1);
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
