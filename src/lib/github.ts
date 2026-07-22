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
} from "./contributions";
import type { ContributionYear, Day, Level, MultiYearData } from "./types";

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
 * twelve months" or "2014 to 2024". GraphQL and the HTML fallback both accept
 * `from`/`to`, so this is one fetcher swap away from `fetchContributionYear`.
 * The packed `year` is the start year so the week grid lines up; the build
 * path is identical to a single year (the builders grid from the first day).
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
  const startYear = Number(from.slice(0, 4));
  const range: [string, string] = [from, to];

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    if (token) {
      const viaApi = await viaGraphQL(login, startYear, token, range);
      if (viaApi) return viaApi;
    }
    const viaScrape = await viaHTML(login, startYear, range);
    if (viaScrape) return viaScrape;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    console.error(`[monolith] range lookup failed for ${login} ${from}..${to}:`, err);
  }
  console.warn(`[monolith] serving synthetic data for ${login} ${from}..${to}`);
  return syntheticYear(login, startYear);
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
  return assembleMulti(login, parts);
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
  return assembleMulti(login, parts);
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

export async function fetchRepoActivity(owner: string, repo: string): Promise<RepoActivity> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stats/commit_activity`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "monolith" }, next: { revalidate: 3600 } },
  );
  if (res.status === 404) throw new NotFoundError(`${owner}/${repo}`);
  if (!res.ok) throw new Error(`repo stats ${res.status}`);
  const rows = (await res.json()) as { week: number; total: number; days: number[] }[];
  const weeks = rows.map((r) => ({
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
  for (const w of activity.weeks) {
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

/** Roll a list of years into one MultiYearData, summing the composition. */
function assembleMulti(login: string, parts: ContributionYear[]): MultiYearData {
  const demo = parts.some((p) => p.demo);
  const source = parts[0]?.source ?? "synthetic";
  const sum = (f: (p: ContributionYear) => number | undefined) =>
    parts.reduce((a, p) => a + (f(p) ?? 0), 0);
  const firstDefined = <T,>(f: (p: ContributionYear) => T | undefined): T | undefined => {
    for (const p of parts) {
      const v = f(p);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  return {
    login,
    name: parts[0]?.name ?? login,
    years: parts,
    fromYear: parts[0].year,
    toYear: parts[parts.length - 1].year,
    demo,
    source,
    contributionYears: firstDefined((p) => p.contributionYears),
    colors: firstDefined((p) => p.colors),
    isHalloween: parts.some((p) => p.isHalloween),
    totalCommits: sum((p) => p.total),
    totalIssues: sum((p) => p.totalIssues),
    totalPullRequests: sum((p) => p.totalPullRequests),
    totalReviews: sum((p) => p.totalReviews),
    totalRepos: sum((p) => p.totalRepos),
    joinedAt: firstDefined((p) => p.joinedAt),
    firstPrAt: firstDefined((p) => p.firstPrAt),
    firstIssueAt: firstDefined((p) => p.firstIssueAt),
    firstRepoAt: firstDefined((p) => p.firstRepoAt),
  };
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
export interface CommitHours {
  login: string;
  year: number;
  /** 24 buckets, index = local hour 0..23. */
  hours: number[];
  total: number;
  capped: boolean;
}

export async function fetchCommitHours(
  rawLogin: string,
  year: number,
): Promise<CommitHours> {
  const login = normaliseLogin(rawLogin);
  if (!LOGIN_RE.test(login)) throw new BadLoginError(rawLogin);
  const from = `${year}-01-01`;
  const to = year === new Date().getUTCFullYear() ? new Date().toISOString().slice(0, 10) : `${year}-12-31`;
  const q = `author:${login} author-date:${from}..${to}`;
  const res = await fetch(
    `https://api.github.com/search/commits?per_page=100&q=${encodeURIComponent(q)}`,
    { headers: { Accept: "application/vnd.github.cloak-preview+json", "User-Agent": "monolith" } },
  );
  if (!res.ok) {
    // Search is rate-limited; return an empty histogram rather than throwing,
    // so the caller can degrade gracefully.
    return { login, year, hours: new Array(24).fill(0), total: 0, capped: false };
  }
  const json = (await res.json()) as { total_count: number; items: { commit: { author: { date: string } } }[] };
  const hours = new Array(24).fill(0);
  for (const item of json.items) {
    // The timestamp is `YYYY-MM-DDTHH:MM:SS+OFFSET`; the HH is the author's
    // own local hour (marktanalyse 5.1: "true to the developer's actual day",
    // carrying their real UTC offset). Take it straight off the wall clock
    // rather than re-deriving it through the server timezone.
    const wall = /T(\d{2}):\d{2}:\d{2}[+-]/.exec(item.commit.author.date);
    if (wall) hours[Number(wall[1])]++;
  }
  return {
    login,
    year,
    hours,
    total: json.total_count,
    // 100 results is one page; the real total may be larger.
    capped: json.total_count > 100,
  };
}
