import type { ContributionYear, Day, Level, Stats } from "./types";

/**
 * Calendar helpers with no network and no environment access, so the browser
 * and the server can share them. The fetchers live in github.ts, which is
 * marked server-only; keeping the two apart means the next secret added there
 * cannot ride along into a client bundle.
 */

export const LOGIN_RE = /^[a-zA-Z0-9](?:-?[a-zA-Z0-9]){0,38}$/;

export class BadLoginError extends Error {}
export class NotFoundError extends Error {}

/**
 * Accepts what people actually paste: a bare handle, an @handle, or the whole
 * profile URL. Exported because the browser validates the same string before
 * sending it, and two copies of this had already drifted apart.
 */
export function normaliseLogin(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\/+$/, "");
}
export function yearRange(year: number): { from: string; to: string } {
  const today = new Date();
  const isCurrent = year === today.getUTCFullYear();
  const end = isCurrent ? today.toISOString().slice(0, 10) : `${year}-12-31`;
  return { from: `${year}-01-01`, to: end };
}

/**
 * GitHub launched in 2008, and a year we cannot render is not worth caching.
 * A numeric year outside that range clamps to the nearest end rather than
 * silently swapping to the current year: someone asking for 2005 is closer to
 * meaning 2008 than to meaning now. Only a non-year falls back to the present.
 */
export function parseYear(raw: string | null): number {
  const current = availableYears(1)[0];
  const value = Number(raw);
  if (!Number.isInteger(value)) return current;
  return Math.min(Math.max(value, 2008), current);
}

/** How far back the interface lets someone go. */
export const SELECTABLE_YEARS = 7;

/**
 * Resolve a requested year against the window the UI actually offers, to the
 * nearest end of it. A share link asking for a year further back than the
 * window lands on the oldest selectable year, not on today.
 */
export function clampSelectableYear(raw: string | number | undefined | null): number {
  const years = availableYears(SELECTABLE_YEARS);
  const value = Number(raw);
  if (!Number.isInteger(value)) return years[0];
  return Math.min(Math.max(value, years[years.length - 1]), years[0]);
}

export function availableYears(count = 6): number[] {
  const now = new Date().getUTCFullYear();
  return Array.from({ length: count }, (_, i) => now - i);
}

/**
 * The years worth offering for a given account. Defaults to the fixed recent
 * window, but when the live data carries GitHub's own `contributionYears` we
 * offer exactly the years that exist rather than guessing. A 2024 account no
 * longer gets empty years, and a 2011 account no longer has its real years
 * hidden. F4: the cheapest single field, spent on the picker.
 */
export function availableYearsFor(data: ContributionYear | null, count = SELECTABLE_YEARS): number[] {
  const recent = availableYears(count);
  const real = (data?.contributionYears ?? []).filter((y) => Number.isInteger(y));
  if (real.length === 0) return recent;
  // Real years win outright: offer every one, newest first, but keep the list
  // from overflowing the picker with a hard ceiling. The recent window is only
  // a fallback for when we have no contributionYears at all.
  const MAX_OFFERED = 15;
  return Array.from(new Set(real))
    .filter((y) => y >= 2008 && y <= new Date().getUTCFullYear())
    .sort((a, b) => b - a)
    .slice(0, MAX_OFFERED);
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

export function pack(
  login: string,
  name: string,
  year: number,
  days: Day[],
  source: ContributionYear["source"],
  extras?: Partial<ContributionYear>,
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
    ...extras,
  };
}

/**
 * Rebuild a full year from a bare day list. The week grid is derived, not
 * stored, so a fixture only has to carry the days and still exercises the same
 * calendar layout the live paths use.
 */
export function yearFromDays(
  login: string,
  year: number,
  days: Day[],
  source: ContributionYear["source"] = "html",
): ContributionYear {
  return pack(login, login, year, days, source);
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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function computeStats(data: ContributionYear): Stats {
  let activeDays = 0;
  let longest = 0;
  let run = 0;
  let best: Day | null = null;
  const perWeekday = new Array(7).fill(0);

  for (const day of data.days) {
    if (day.count > 0) {
      activeDays++;
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
    if (!best || day.count > best.count) best = day;
    perWeekday[new Date(`${day.date}T00:00:00Z`).getUTCDay()] += day.count;
  }

  let current = 0;
  for (let i = data.days.length - 1; i >= 0; i--) {
    if (data.days[i].count > 0) current++;
    else break;
  }

  let busiest = 0;
  for (let i = 1; i < 7; i++) if (perWeekday[i] > perWeekday[busiest]) busiest = i;

  return {
    total: data.total,
    activeDays,
    longestStreak: longest,
    currentStreak: current,
    bestDay: best && best.count > 0 ? best : null,
    averagePerActiveDay: activeDays ? data.total / activeDays : 0,
    busiestWeekday: WEEKDAYS[busiest],
  };
}
