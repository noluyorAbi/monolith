import "server-only";

import {
  BadLoginError,
  LOGIN_RE,
  NotFoundError,
  normaliseLogin,
  pack,
  syntheticYear,
  yearRange,
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
): Promise<ContributionYear | null> {
  const { from, to } = yearRange(year);
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
async function viaHTML(login: string, year: number): Promise<ContributionYear | null> {
  const { from, to } = yearRange(year);
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
