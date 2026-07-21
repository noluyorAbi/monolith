import type { ContributionYear, Day, Level } from "./types";

export const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export class BadLoginError extends Error {}
export class NotFoundError extends Error {}

const LEVELS: Record<string, Level> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

export function yearRange(year: number): { from: string; to: string } {
  const today = new Date();
  const isCurrent = year === today.getUTCFullYear();
  const end = isCurrent ? today.toISOString().slice(0, 10) : `${year}-12-31`;
  return { from: `${year}-01-01`, to: end };
}

export function availableYears(count = 6): number[] {
  const now = new Date().getUTCFullYear();
  return Array.from({ length: count }, (_, i) => now - i);
}

/** Lay a chronological day list out as GitHub does: columns of weeks, Sunday first. */
function toWeeks(days: Day[]): (Day | null)[][] {
  if (days.length === 0) return [];
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const gridStart = new Date(first);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const weeks: (Day | null)[][] = [];
  for (const day of days) {
    const d = new Date(`${day.date}T00:00:00Z`);
    const offset = Math.floor((d.getTime() - gridStart.getTime()) / 86_400_000);
    const w = Math.floor(offset / 7);
    while (weeks.length <= w) weeks.push(new Array(7).fill(null));
    weeks[w][d.getUTCDay()] = day;
  }
  return weeks;
}

function pack(
  login: string,
  name: string,
  year: number,
  days: Day[],
  source: ContributionYear["source"],
): ContributionYear {
  return {
    login,
    name,
    year,
    total: days.reduce((a, d) => a + d.count, 0),
    days,
    weeks: toWeeks(days),
    demo: source === "synthetic",
    source,
  };
}

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

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic stand-in when GitHub cannot be reached. Always flagged in the
 * payload so the UI can say so out loud rather than quietly faking a year.
 */
export function syntheticYear(login: string, year: number): ContributionYear {
  const rnd = mulberry32(hash(`${login}:${year}`));
  const { from, to } = yearRange(year);
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days: Day[] = [];
  let momentum = rnd();
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    momentum = momentum * 0.86 + rnd() * 0.14;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 0.35 : 1;
    const raw = Math.max(0, momentum * 2 - 0.55) * weekend * 26 * (0.4 + rnd());
    const count = rnd() < 0.13 ? 0 : Math.round(raw);
    const level = (count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 14 ? 3 : 4) as Level;
    days.push({ date: d.toISOString().slice(0, 10), count, level });
  }
  return pack(login, login, year, days, "synthetic");
}

export async function fetchContributionYear(
  rawLogin: string,
  year: number,
): Promise<ContributionYear> {
  const login = rawLogin.trim().replace(/^@/, "").replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
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
  }
  return syntheticYear(login, year);
}
