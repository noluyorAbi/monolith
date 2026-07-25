import "server-only";

import {
  BadLoginError,
  LOGIN_RE,
  NotFoundError,
  normaliseLogin,
  pack,
  syntheticYear,
  yearRange,
  availableYears,
  assembleMultiYear,
  splitRangeByYear,
} from "./contributions";
import type { CommitHoursData, ContributionYear, Day, LangShare, Level, MultiYearData } from "./types";

/**
 * Reaching GitHub. Server only: it reads GITHUB_TOKEN and scrapes a page, and
 * neither belongs anywhere near a browser bundle.
 */

const LEVELS: Record<string, Level> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

// One query, one point, one round trip. Everything below is a scalar or a
// connectionless field, so adding it costs nothing in GraphQL points: the cost
// is driven by connections, not by fields (see feature-prio.md F4 / marktanalyse
// section 5.5). contributionYears makes the year picker correct, the total*
// family and milestone fields are spent by F6, and isHalloween is spent by the
// Halloween finish.
const GQL = `query($login:String!,$from:DateTime!,$to:DateTime!){\n  user(login:$login){\n    login name\n    contributionYears\n    contributionsCollection(from:$from,to:$to){\n      contributionCalendar{\n        colors\n        isHalloween\n        weeks{ contributionDays{ date contributionCount contributionLevel weekday } }\n      }\n      totalCommitContributions\n      totalIssueContributions\n      totalPullRequestContributions\n      totalPullRequestReviewContributions\n      totalRepositoriesWithContributedCommits\n      joinedGitHubContribution\n      firstPullRequestContribution\n      firstIssueContribution\n      firstRepositoryContribution\n    }\n  }\n}`;

async function viaGraphQL(
  login: string,
  year: number,
  token: string,
  range?: [string, string],
): Promise<ContributionYear | null> {
  const win = range ?? yearRange(year);
  const from = Array.isArray(win) ? win[0] : win.from;
  const to = Array.isArray(win) ? win[1] : win.to;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "monolith",
    },
    body: JSON.stringify({
      query: GQL,
      variables: { login, from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
    }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: {
      user?: {
        login: string;
        name: string | null;
        /** The exact years the account has contributions in, newest first. */
        contributionYears: number[];
        contributionsCollection: {
          contributionCalendar: {
            colors: string[];
            isHalloween: boolean;
            weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string; weekday: number }[] }[];
          };
          totalCommitContributions: number;
          totalIssueContributions: number;
          totalPullRequestContributions: number;
          totalPullRequestReviewContributions: number;
          totalRepositoriesWithContributedCommits: number;
          joinedGitHubContribution: { occurredAt: string } | null;
          firstPullRequestContribution: { occurredAt: string } | null;
          firstIssueContribution: { occurredAt: string } | null;
          firstRepositoryContribution: { occurredAt: string } | null;
        };
      } | null;
    };
    errors?: { type?: string; message: string }[];
  };
  if (json.errors?.some((e) => e.type === "NOT_FOUND")) throw new NotFoundError(login);
  const user = json.data?.user;
  if (!user) return null;

  const cal = user.contributionsCollection.contributionCalendar;
  const days: Day[] = [];
  for (const week of cal.weeks) {
    for (const d of week.contributionDays) {
      days.push({
        date: d.date,
        count: d.contributionCount,
        level: LEVELS[d.contributionLevel] ?? 0,
      });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const cc = user.contributionsCollection;
  const extras: Partial<ContributionYear> = {
    contributionYears: user.contributionYears ?? undefined,
    colors: cal.colors && cal.colors.length ? cal.colors : undefined,
    isHalloween: cal.isHalloween ?? false,
    totalIssues: cc.totalIssueContributions,
    totalPullRequests: cc.totalPullRequestContributions,
    totalReviews: cc.totalPullRequestReviewContributions,
    totalRepos: cc.totalRepositoriesWithContributedCommits,
    joinedAt: dateOf(cc.joinedGitHubContribution),
    firstPrAt: dateOf(cc.firstPullRequestContribution),
    firstIssueAt: dateOf(cc.firstIssueContribution),
    firstRepoAt: dateOf(cc.firstRepositoryContribution),
  };
  return pack(user.login, user.name || user.login, year, days, "graphql", extras);
}

/** GitHub returns milestone contributions as `{ occurredAt }`; take the date. */
function dateOf(node: { occurredAt: string } | null | undefined): string | undefined {
  return node?.occurredAt ? node.occurredAt.slice(0, 10) : undefined;
}

/**
 * The public calendar fragment. No token, no rate-limit headaches, and it is
 * exactly what the profile page renders, so it always matches what people see.
 */
async function viaHTML(login: string, year: number, range?: [string, string]): Promise<ContributionYear | null> {
  const win = range ?? yearRange(year);
  const from = Array.isArray(win) ? win[0] : win.from;
  const to = Array.isArray(win) ? win[1] : win.to;
  const url = `https://github.com/users/${encodeURIComponent(login)}/contributions?from=${from}&to=${to}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; monolith/1.0)",
      "X-Requested-With": "XMLHttpRequest",
    },
    next: { revalidate: 3600 },
  });
  if (res.status === 404) throw new NotFoundError(login);
  if (!res.ok) return null;
  const html = await res.text();

  const counts = new Map<string, number>();
  const tip = /<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g;
  for (let m = tip.exec(html); m; m = tip.exec(html)) {
    const text = m[2].trim();
    const n = /^([\d,]+)\s+contribution/.exec(text);
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }

  const days: Day[] = [];
  const cell = /<td\b[^>]*>/g;
  for (let m = cell.exec(html); m; m = cell.exec(html)) {
    const tag = m[0];
    const date = /data-date="([^"]+)"/.exec(tag)?.[1];
    if (!date) continue;
    const level = Number(/data-level="(\d)"/.exec(tag)?.[1] ?? 0) as Level;
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const count = (id ? counts.get(id) : undefined) ?? 0;
    days.push({ date, count, level });
  }
  if (days.length === 0) return null;
  days.sort((a, b) => a.date.localeCompare(b.date));
  return pack(login, login, year, days, "html");
}

export async function fetchContributionYear(
  rawLogin: string,
  year: number,
): Promise<ContributionYear> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    if (token) {
      const viaApi = await viaGraphQL(login, year, token);
      if (viaApi) return viaApi;
    }
    const viaScrape = await viaHTML(login, year);
    if (viaScrape) return viaScrape;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    // Falling back silently would make a rate limit, an expired token and a
    // markup change all look like a quiet success. Say which one happened.
    console.error(`[monolith] contributions lookup failed for ${login} ${year}:`, err);
  }
  console.warn(`[monolith] serving synthetic data for ${login} ${year}`);
  return syntheticYear(login, year);
}

/**
 * An arbitrary window, not a calendar year. marktanalyse 6.1 / 5.4: "my last
 * twelve months" or "2014 to 2024". GitHub's contributionsCollection refuses
 * any window longer than one year, so the range is split at calendar-year
 * boundaries, each slice fetched like a single year, and the days stitched
 * back together. The packed `year` is the start year so the week grid lines
 * up; the build path is identical to a single year.
 */
export async function fetchContributionRange(
  rawLogin: string,
  from: string,
  to: string,
): Promise<ContributionYear> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new BadLoginError(`range ${from}..${to}`);
  }
  if (from > to) [from, to] = [to, from];
  const startYear = Number(from.slice(0, 4));

  // Calendar-year slices. ISO dates compare correctly as strings.
  const windows: [string, string][] = [];
  for (let cursor = from; cursor <= to; ) {
    const y = Number(cursor.slice(0, 4));
    const yearEnd = `${y}-12-31`;
    windows.push([cursor, yearEnd < to ? yearEnd : to]);
    cursor = `${y + 1}-01-01`;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const chunks = await Promise.all(
    windows.map(async ([f, t]): Promise<ContributionYear | null> => {
      const y = Number(f.slice(0, 4));
      try {
        if (token) {
          const viaApi = await viaGraphQL(login, y, token, [f, t]);
          if (viaApi) return viaApi;
        }
        return await viaHTML(login, y, [f, t]);
      } catch (err) {
        if (err instanceof NotFoundError) throw err;
        console.error(`[monolith] range slice failed for ${login} ${f}..${t}:`, err);
        return null;
      }
    }),
  );

  const parts = chunks.filter((c): c is ContributionYear => c !== null);
  if (parts.length === 0) {
    console.warn(`[monolith] serving synthetic data for ${login} ${from}..${to}`);
    return syntheticYear(login, startYear);
  }
  if (parts.length === 1) return { ...parts[0], year: startYear };

  // Adjacent slices pad to full calendar weeks, so their edges overlap by up
  // to six days; dedupe by date, keeping the larger count.
  const byDate = new Map<string, Day>();
  for (const part of parts) {
    for (const d of part.days) {
      const seen = byDate.get(d.date);
      if (!seen || d.count > seen.count) byDate.set(d.date, d);
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const sum = (f: (p: ContributionYear) => number | undefined) =>
    parts.reduce((a, p) => a + (f(p) ?? 0), 0);
  const firstDefined = <T,>(f: (p: ContributionYear) => T | undefined): T | undefined => {
    for (const p of parts) {
      const v = f(p);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  return pack(login, parts[0].name, startYear, days, parts[0].source, {
    contributionYears: firstDefined((p) => p.contributionYears),
    isHalloween: parts.some((p) => p.isHalloween),
    totalIssues: sum((p) => p.totalIssues),
    totalPullRequests: sum((p) => p.totalPullRequests),
    totalReviews: sum((p) => p.totalReviews),
    joinedAt: firstDefined((p) => p.joinedAt),
    firstPrAt: firstDefined((p) => p.firstPrAt),
    firstIssueAt: firstDefined((p) => p.firstIssueAt),
    firstRepoAt: firstDefined((p) => p.firstRepoAt),
  });
}

/**
 * Several years in one request. marktanalyse section 5.4: aliasing N one-year
 * `contributionsCollection` windows into a single GraphQL call costs ~1 point
 * and one round trip, so the lifetime view is free at the API level. Without a
 * token we fall back to N independent lookups (HTML scrape each), which is
 * slower but needs no secret. Years are returned oldest-first for stacking.
 */
export async function fetchContributionYears(
  rawLogin: string,
  years: number[],
): Promise<MultiYearData> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);
  const ordered = [...new Set(years)].sort((a, b) => a - b);
  if (ordered.length === 0) ordered.push(new Date().getUTCFullYear());

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    try {
      const data = await viaGraphQLMulti(login, ordered, token);
      if (data) return data;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      console.error(`[monolith] multi-year lookup failed for ${login}:`, err);
    }
  }
  // No token, or the aliased call failed: fetch each year independently.
  const parts = await Promise.all(ordered.map((y) => fetchContributionYear(login, y)));
  return assembleMultiYear(login, parts);
}

/** Build one aliased query covering every requested year. */
async function viaGraphQLMulti(
  login: string,
  years: number[],
  token: string,
): Promise<MultiYearData | null> {
  const aliases = years
    .map((y) => {
      const { from, to } = yearRange(y);
      return `y${y}: contributionsCollection(from:"${from}T00:00:00Z",to:"${to}T23:59:59Z"){
        contributionCalendar{ colors isHalloween weeks{ contributionDays{ date contributionCount contributionLevel weekday } } }
        totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions totalRepositoriesWithContributedCommits
        joinedGitHubContribution firstPullRequestContribution firstIssueContribution firstRepositoryContribution }`;
    })
    .join("\n");
  const query = `query($login:String!){ user(login:$login){ login name contributionYears ${aliases} } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "monolith",
    },
    body: JSON.stringify({ query, variables: { login } }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { user?: Record<string, unknown> | null };
    errors?: { type?: string; message: string }[];
  };
  if (json.errors?.some((e) => e.type === "NOT_FOUND")) throw new NotFoundError(login);
  const user = json.data?.user as
    | (Record<string, unknown> & { login: string; name: string | null; contributionYears?: number[] })
    | null
    | undefined;
  if (!user) return null;

  const parts: ContributionYear[] = [];
  for (const y of years) {
    const cc = user[`y${y}`] as
      | {
          contributionCalendar: {
            colors: string[];
            isHalloween: boolean;
            weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string; weekday: number }[] }[];
          };
          totalCommitContributions: number;
          totalIssueContributions: number;
          totalPullRequestContributions: number;
          totalPullRequestReviewContributions: number;
          totalRepositoriesWithContributedCommits: number;
          joinedGitHubContribution: { occurredAt: string } | null;
          firstPullRequestContribution: { occurredAt: string } | null;
          firstIssueContribution: { occurredAt: string } | null;
          firstRepositoryContribution: { occurredAt: string } | null;
        }
      | undefined;
    if (!cc) continue;
    const cal = cc.contributionCalendar;
    const days: Day[] = [];
    for (const week of cal.weeks) {
      for (const d of week.contributionDays) {
        days.push({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 });
      }
    }
    days.sort((a, b) => a.date.localeCompare(b.date));
    const extras: Partial<ContributionYear> = {
      contributionYears: user.contributionYears ?? undefined,
      colors: cal.colors && cal.colors.length ? cal.colors : undefined,
      isHalloween: cal.isHalloween ?? false,
      totalIssues: cc.totalIssueContributions,
      totalPullRequests: cc.totalPullRequestContributions,
      totalReviews: cc.totalPullRequestReviewContributions,
      totalRepos: cc.totalRepositoriesWithContributedCommits,
      joinedAt: dateOf(cc.joinedGitHubContribution),
      firstPrAt: dateOf(cc.firstPullRequestContribution),
      firstIssueAt: dateOf(cc.firstIssueContribution),
      firstRepoAt: dateOf(cc.firstRepositoryContribution),
    };
    parts.push(pack(user.login, user.name || user.login, y, days, "graphql", extras));
  }
  if (parts.length === 0) return null;
  return assembleMultiYear(login, parts);
}

/**
 * The whole account, from join to now. marktanalyse 5.4 "since-account-creation
 * lifetime view": one probe year reveals `contributionYears`, then the full set
 * is fetched in a single aliased call. When GitHub is unreachable we fall back
 * to a recent window so the object still renders.
 */
export async function fetchLifetime(rawLogin: string): Promise<MultiYearData> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);
  // Probe the current year to learn the real year list, then fetch all of them.
  const probe = await fetchContributionYear(login, new Date().getUTCFullYear());
  const years = (probe.contributionYears ?? []).filter((y) => Number.isInteger(y));
  if (years.length === 0) {
    // No contributionYears in the payload (HTML fallback): use a recent window.
    return fetchContributionYears(login, availableYears());
  }
  return fetchContributionYears(login, years);
}

/**
 * A single repository's last-52-week commit skyline. marktanalyse 5.4: REST
 * `/stats/commit_activity` is unauthenticated, one request, and returns exactly
 * the 52 weeks x 7 days shape a skyline builder wants. It carries totals per
 * week, not per day, so the day grid is synthesised from the weekly total.
 */
export interface RepoActivity {
  owner: string;
  repo: string;
  /** One entry per of the last 52 weeks, oldest first. */
  weeks: { week: string; total: number; days: number[] }[];
  total: number;
}

/**
 * GitHub answers the FIRST stats request for a cold repo with 202 and an empty
 * body while it computes. That is not an error and not data; it is "ask again
 * in a moment", and the route maps it to a 503 with Retry-After.
 */
export class StatsPendingError extends Error {
  constructor(slug: string) {
    super(`GitHub is still computing statistics for ${slug}; retry shortly.`);
    this.name = "StatsPendingError";
  }
}

export async function fetchRepoActivity(owner: string, repo: string): Promise<RepoActivity> {
  const slug = `${owner}/${repo}`;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stats/commit_activity`;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "monolith" };

  // 202 = "computing, ask again". Usually ready within a second or two, so a
  // couple of short in-request retries turn the common cold-repo case into a
  // success instead of surfacing the pending state to every first caller.
  let res = await fetch(url, { headers, next: { revalidate: 3600 } });
  for (let attempt = 0; res.status === 202 && attempt < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await fetch(url, { headers, cache: "no-store" });
  }
  if (res.status === 404) throw new NotFoundError(slug);
  if (res.status === 202) throw new StatsPendingError(slug);
  // 204 is GitHub's answer for an empty repository: no commits, no body.
  if (res.status === 204) return { owner, repo, weeks: [], total: 0 };
  if (!res.ok) throw new Error(`repo stats ${res.status}`);

  const text = await res.text();
  const rows = text.trim() ? (JSON.parse(text) as unknown) : [];
  if (!Array.isArray(rows)) return { owner, repo, weeks: [], total: 0 };
  const weeks = (rows as { week: number; total: number; days: number[] }[]).map((r) => ({
    week: new Date(r.week * 1000).toISOString().slice(0, 10),
    total: r.total,
    days: r.days,
  }));
  return {
    owner,
    repo,
    weeks,
    total: weeks.reduce((a, w) => a + w.total, 0),
  };
}

/**
 * Turn a repo's weekly commit histogram into the `ContributionYear` shape the
 * geometry builders already consume. The day grid is exact (GitHub returns the
 * seven per-day counts per week), so the skyline is faithful, not synthesised.
 */
export function repoActivityToYear(activity: RepoActivity): ContributionYear {
  const days: Day[] = [];
  // An empty repository still deserves an object: a flat 52-week plate says
  // "no commits" honestly, where an empty day list would crash the builders.
  const weeks = activity.weeks.length
    ? activity.weeks
    : Array.from({ length: 52 }, (_, i) => {
        const sunday = new Date();
        sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay() - (51 - i) * 7);
        return { week: sunday.toISOString().slice(0, 10), total: 0, days: new Array(7).fill(0) };
      });
  for (const w of weeks) {
    const sunday = new Date(`${w.week}T00:00:00Z`);
    for (let d = 0; d < 7; d++) {
      const date = new Date(sunday);
      date.setUTCDate(sunday.getUTCDate() + d);
      const count = w.days[d] ?? 0;
      const level = (count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 14 ? 3 : 4) as Level;
      days.push({ date: date.toISOString().slice(0, 10), count, level });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return pack(activity.owner, activity.repo, new Date(`${days[0]?.date ?? "2008-01-01"}`).getUTCFullYear(), days, "graphql", {
    totalIssues: 0,
  });
}

/**
 * One resolver for every download route. The query string names a subject
 * (user or repo) and a span (year, lifetime, range); this turns that into the
 * data the mesh builders consume, so the 3MF, STL, GLB and kit endpoints all
 * produce the object the viewer showed rather than silently collapsing every
 * mode back to a single user year.
 */
export interface ResolvedModel {
  /** Single-year-shaped data; for a multi-year span, the most recent year. */
  data: ContributionYear;
  /** Set when the object is a multi-year stack; build with buildMultiYear. */
  multi: MultiYearData | null;
  /** The duel opponent's year, when the request carried `vs`; build with buildDuel. */
  vsData: ContributionYear | null;
  /** Whose object this is, for filenames and engraving: login or owner/repo. */
  who: string;
  /** The span, human-readable: "2025", "2016-2025", "2023-06-01..2024-06-01". */
  spanLabel: string;
  demo: boolean;
}

export async function resolveModelSource(req: {
  login: string;
  year: number;
  span: "year" | "lifetime" | "range";
  from: string;
  to: string;
  subject: "user" | "repo";
  repoOwner: string;
  repoName: string;
  vs?: string;
}): Promise<ResolvedModel> {
  if (req.subject === "repo") {
    const activity = await fetchRepoActivity(req.repoOwner, req.repoName);
    const data = repoActivityToYear(activity);
    return {
      data,
      multi: null,
      vsData: null,
      who: `${req.repoOwner}/${req.repoName}`,
      spanLabel: "52-weeks",
      demo: data.demo,
    };
  }
  if (req.span === "lifetime") {
    const multi = await fetchLifetime(req.login);
    return {
      data: multi.years[multi.years.length - 1],
      multi: multi.years.length > 1 ? multi : null,
      vsData: null,
      who: multi.login,
      spanLabel: `${multi.fromYear}-${multi.toYear}`,
      demo: multi.demo,
    };
  }
  if (req.span === "range") {
    const data = await fetchContributionRange(req.login, req.from, req.to);
    // A range across calendar years renders (and downloads) as the same
    // depth-wise terrace stack a lifetime object uses.
    const multi = splitRangeByYear(data);
    return {
      data,
      multi,
      vsData: null,
      who: data.login,
      spanLabel: `${req.from}..${req.to}`,
      demo: data.demo,
    };
  }
  // The duel: two single years fetched side by side, rendered back to back.
  if (req.vs) {
    const [data, vsData] = await Promise.all([
      fetchContributionYear(req.login, req.year),
      fetchContributionYear(req.vs, req.year),
    ]);
    return {
      data,
      multi: null,
      vsData,
      who: `${data.login}-vs-${vsData.login}`,
      spanLabel: String(data.year),
      demo: data.demo || vsData.demo,
    };
  }
  const data = await fetchContributionYear(req.login, req.year);
  return { data, multi: null, vsData: null, who: data.login, spanLabel: String(data.year), demo: data.demo };
}

/**
 * The languages ring's data. With a token, one GraphQL call sums the byte
 * sizes GitHub itself reports per repository (the same numbers behind the
 * profile's language bar), colours included. Without one, the public repo
 * list still names each repository's primary language and its size, which is
 * a coarser census but an honest one. Either way the result is the top six
 * languages at 4%+ of the total, shares renormalised to sum to 1. Failure
 * returns [] so the flag degrades to a plain object instead of an error.
 */
const LANG_KEEP = 6;
const LANG_MIN_SHARE = 0.04;

/** GitHub's own colours for the languages the token-less path can meet. */
const LANG_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
  Scala: "#c22d40",
  Haskell: "#5e5086",
  Elixir: "#6e4a7e",
  Lua: "#000080",
  R: "#198CE7",
  "Jupyter Notebook": "#DA5B0B",
  "Objective-C": "#438eff",
  Zig: "#ec915c",
};

function topShares(sizes: Map<string, { bytes: number; color: string }>): LangShare[] {
  const total = [...sizes.values()].reduce((a, v) => a + v.bytes, 0);
  if (total <= 0) return [];
  const kept = [...sizes.entries()]
    .map(([name, v]) => ({ name, color: v.color, share: v.bytes / total }))
    .filter((l) => l.share >= LANG_MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, LANG_KEEP);
  const sum = kept.reduce((a, l) => a + l.share, 0);
  return sum > 0 ? kept.map((l) => ({ ...l, share: l.share / sum })) : [];
}

export async function fetchTopLanguages(rawLogin: string): Promise<LangShare[]> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);
  const sizes = new Map<string, { bytes: number; color: string }>();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    if (token) {
      const query = `query($login:String!){ user(login:$login){
        repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:PUSHED_AT,direction:DESC}){
          nodes{ languages(first:10, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } }
        } } }`;
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "monolith",
        },
        body: JSON.stringify({ query, variables: { login } }),
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: {
            user?: {
              repositories: {
                nodes: ({ languages: { edges: ({ size: number; node: { name: string; color: string | null } } | null)[] } | null } | null)[];
              };
            } | null;
          };
        };
        for (const repo of json.data?.user?.repositories.nodes ?? []) {
          for (const edge of repo?.languages?.edges ?? []) {
            if (!edge) continue;
            const seen = sizes.get(edge.node.name);
            sizes.set(edge.node.name, {
              bytes: (seen?.bytes ?? 0) + edge.size,
              color: edge.node.color ?? LANG_COLORS[edge.node.name] ?? "#8b949e",
            });
          }
        }
        if (sizes.size > 0) return topShares(sizes);
      }
    }
    // Token-less: the public repo list carries each repository's primary
    // language and its size in KB; weight by that so a large project counts
    // for more than a gist-sized one.
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed`,
      { headers: { Accept: "application/vnd.github+json", "User-Agent": "monolith" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const repos = (await res.json()) as { language: string | null; size: number; fork: boolean }[];
    if (!Array.isArray(repos)) return [];
    for (const repo of repos) {
      if (!repo.language || repo.fork) continue;
      const seen = sizes.get(repo.language);
      sizes.set(repo.language, {
        bytes: (seen?.bytes ?? 0) + Math.max(1, repo.size),
        color: LANG_COLORS[repo.language] ?? "#8b949e",
      });
    }
    return topShares(sizes);
  } catch (err) {
    console.error(`[monolith] languages lookup failed for ${login}:`, err);
    return [];
  }
}

/** One repository's language split. The REST endpoint is public and exact. */
export async function fetchRepoLanguages(owner: string, repo: string): Promise<LangShare[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`,
      { headers: { Accept: "application/vnd.github+json", "User-Agent": "monolith" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const bytes = (await res.json()) as Record<string, number>;
    const sizes = new Map<string, { bytes: number; color: string }>();
    for (const [name, b] of Object.entries(bytes)) {
      sizes.set(name, { bytes: b, color: LANG_COLORS[name] ?? "#8b949e" });
    }
    return topShares(sizes);
  } catch (err) {
    console.error(`[monolith] languages lookup failed for ${owner}/${repo}:`, err);
    return [];
  }
}

/** The right language split for a parsed model request, subject-aware. */
export async function fetchModelLanguages(req: {
  subject: "user" | "repo";
  login: string;
  repoOwner: string;
  repoName: string;
}): Promise<LangShare[]> {
  return req.subject === "repo"
    ? fetchRepoLanguages(req.repoOwner, req.repoName)
    : fetchTopLanguages(req.login);
}

/**
 * The hour-of-day a user commits, in their own local timezone. marktanalyse
 * 5.1: `/search/commits` is unauthenticated, returns the author's true local
 * UTC offset, and is "the most valuable finding in this document". The search
 * API is capped at 10 req/min and 1,000 results, so this makes ONE bounded
 * query across the requested year and buckets every returned commit by its
 * local hour. A prolific user's year may exceed 1,000 commits; the histogram is
 * then a representative sample, which the caller is told via `capped`.
 */
export type CommitHours = CommitHoursData;

/** How many search pages to spend per histogram. Three pages = 300 commits,
 * a solid sample, while staying well inside the search API's 10 req/min. */
const HOUR_PAGES = 3;

export async function fetchCommitHours(
  rawLogin: string,
  year: number,
): Promise<CommitHours> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);
  const from = `${year}-01-01`;
  const to = year === new Date().getUTCFullYear() ? new Date().toISOString().slice(0, 10) : `${year}-12-31`;
  const q = `author:${login} author-date:${from}..${to}`;

  const hours = new Array(24).fill(0);
  let total = 0;
  let sampled = 0;
  for (let page = 1; page <= HOUR_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/search/commits?per_page=100&page=${page}&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/vnd.github.cloak-preview+json", "User-Agent": "monolith" } },
    );
    if (!res.ok) {
      // Search is rate-limited; keep whatever pages already landed rather
      // than throwing, so the caller can degrade gracefully.
      break;
    }
    const json = (await res.json()) as { total_count: number; items: { commit: { author: { date: string } } }[] };
    total = json.total_count;
    for (const item of json.items) {
      // The timestamp is `YYYY-MM-DDTHH:MM:SS+OFFSET` or `...Z`; the HH is the
      // author's own local hour (marktanalyse 5.1: "true to the developer's
      // actual day", carrying their real UTC offset — for a UTC author the
      // offset is rendered as Z and the wall clock is still theirs). Take it
      // straight off the string rather than re-deriving it through the server
      // timezone.
      const wall = /T(\d{2}):\d{2}:\d{2}(?:[+-Zz])/.exec(item.commit.author.date);
      if (wall) {
        hours[Number(wall[1])]++;
        sampled++;
      }
    }
    if (json.items.length < 100) break;
  }

  return { login, year, hours, total, sampled, capped: total > sampled };
}
