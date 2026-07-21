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
import type { ContributionYear, Day, Level } from "./types";

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

const GQL = `query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){
    login name
    contributionsCollection(from:$from,to:$to){
      contributionCalendar{
        weeks{ contributionDays{ date contributionCount contributionLevel } }
      }
    }
  }
}`;

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
        contributionsCollection: {
          contributionCalendar: {
            weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
          };
        };
      } | null;
    };
    errors?: { type?: string; message: string }[];
  };
  if (json.errors?.some((e) => e.type === "NOT_FOUND")) throw new NotFoundError(login);
  const user = json.data?.user;
  if (!user) return null;

  const days: Day[] = [];
  for (const week of user.contributionsCollection.contributionCalendar.weeks) {
    for (const d of week.contributionDays) {
      days.push({
        date: d.date,
        count: d.contributionCount,
        level: LEVELS[d.contributionLevel] ?? 0,
      });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return pack(user.login, user.name || user.login, year, days, "graphql");
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
