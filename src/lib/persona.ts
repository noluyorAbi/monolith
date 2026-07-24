import type { CommitHoursData, ContributionYear, Stats } from "./types";

/**
 * The developer starsign. Every account works in a recognisable shape: when
 * the commits land, how evenly, how hard the peaks tower over the routine.
 * This reads those shapes off the calendar (and, when the search API answered,
 * the hour histogram) and names them, the way a star chart names a scatter of
 * points. Deterministic: the same year always casts the same sign, and the
 * sigil is seeded by the login so two Nightsmiths still wear different stars.
 */

export interface PersonaMetrics {
  /** Share of days in the window with at least one contribution, 0..1. */
  cadence: number;
  /** Share of all contributions made on Saturday or Sunday, 0..1. */
  weekendShare: number;
  /** Peak day divided by the average active day; how hard the spikes tower. */
  spike: number;
  /** Longest run of consecutive active days. */
  longestStreak: number;
  /** Longest run of consecutive silent days. */
  longestGap: number;
  /** Peak local commit hour 0..23, or null when the histogram never arrived. */
  peakHour: number | null;
}

export interface Persona {
  id: string;
  /** The sign, e.g. "The Nightsmith". */
  name: string;
  /** One sentence that reads like a horoscope written by a build log. */
  line: string;
  /** Two or three short evidence chips, so the sign is a measurement, not flattery. */
  traits: string[];
  metrics: PersonaMetrics;
  /** A small constellation, seeded by the login: points in 0..1, edges by index. */
  sigil: { points: [number, number][]; edges: [number, number][]; brightest: number };
}

export function computePersonaMetrics(
  data: ContributionYear,
  stats: Stats,
  hours?: CommitHoursData | null,
): PersonaMetrics {
  let weekend = 0;
  let gap = 0;
  let longestGap = 0;
  for (const day of data.days) {
    const wd = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) weekend += day.count;
    if (day.count === 0) {
      gap++;
      if (gap > longestGap) longestGap = gap;
    } else {
      gap = 0;
    }
  }
  const peakHour =
    hours && hours.sampled > 0 ? hours.hours.indexOf(Math.max(...hours.hours)) : null;
  return {
    cadence: data.days.length ? stats.activeDays / data.days.length : 0,
    weekendShare: data.total ? weekend / data.total : 0,
    spike:
      stats.bestDay && stats.averagePerActiveDay > 0
        ? stats.bestDay.count / stats.averagePerActiveDay
        : 1,
    longestStreak: stats.longestStreak,
    longestGap,
    peakHour,
  };
}

interface SignDef {
  id: string;
  name: string;
  line: string;
  /** First predicate that matches wins; ordered most-specific first. */
  when: (m: PersonaMetrics) => boolean;
}

const night = (h: number | null) => h !== null && (h >= 22 || h < 5);
const dawn = (h: number | null) => h !== null && h >= 5 && h < 10;

/**
 * Ordered most-specific to most-general; the last entry always matches, so
 * every account gets a sign. Names stay in the forge register the rest of the
 * product speaks.
 */
const SIGNS: SignDef[] = [
  {
    id: "nightsmith",
    name: "The Nightsmith",
    line: "Forges after midnight, steady as a furnace. The quiet hours are the workshop.",
    when: (m) => night(m.peakHour) && m.cadence >= 0.45,
  },
  {
    id: "comet",
    name: "The Comet",
    line: "Long dark orbits, then a tail of fire across the calendar. Arrival is an event.",
    when: (m) => m.spike >= 5 && m.cadence < 0.4,
  },
  {
    id: "dawnwright",
    name: "The Dawnwright",
    line: "First light, first commit. The day is built before anyone else has opened a terminal.",
    when: (m) => dawn(m.peakHour),
  },
  {
    id: "alchemist",
    name: "The Weekend Alchemist",
    line: "Weekdays belong to someone else; Saturday turns base hours into gold.",
    when: (m) => m.weekendShare >= 0.34,
  },
  {
    id: "metronome",
    name: "The Metronome",
    line: "Rarely loud, never silent. The streak is the achievement; the calendar keeps the beat.",
    when: (m) => m.cadence >= 0.62 && m.spike < 4,
  },
  {
    id: "stormcaller",
    name: "The Stormcaller",
    line: "Calm skies, then a day that towers over the month. The pressure builds, and lands at once.",
    when: (m) => m.spike >= 6,
  },
  {
    id: "keeper",
    name: "The Streakkeeper",
    line: "Guards an unbroken line the way a lighthouse guards a coast: daily, deliberately.",
    when: (m) => m.longestStreak >= 30,
  },
  {
    id: "tidewalker",
    name: "The Tidewalker",
    line: "Comes and goes with the moon: weeks of flow, weeks of ebb, and the work rises with each return.",
    when: (m) => m.longestGap >= 21 && m.cadence >= 0.25,
  },
  {
    id: "lantern",
    name: "The Lantern",
    line: "A small light most days. Not the brightest in the sky, but the one you navigate by.",
    when: (m) => m.cadence >= 0.4,
  },
  {
    id: "cartographer",
    name: "The Cartographer",
    line: "Charts the year in careful expeditions: out, map something real, return, rest.",
    when: () => true,
  },
];

function hashString(s: string): number {
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
 * A constellation for the sign: six to eight stars strung on a walk across
 * the box, plus one chord so it reads as a figure rather than a squiggle.
 * Seeded by login + sign, so it is personal but stable across visits.
 */
function castSigil(seed: string): Persona["sigil"] {
  const rnd = mulberry32(hashString(seed));
  const count = 6 + Math.floor(rnd() * 3);
  const points: [number, number][] = [];
  // A guided walk: x advances in uneven steps so the figure spans the box,
  // y wanders, both padded so strokes and dots stay inside the viewBox.
  for (let i = 0; i < count; i++) {
    const x = 0.08 + (0.84 * i) / (count - 1) + (rnd() - 0.5) * 0.1;
    const y = 0.14 + rnd() * 0.72;
    points.push([Math.min(0.92, Math.max(0.08, x)), y]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < count - 1; i++) edges.push([i, i + 1]);
  // One chord back across the figure, never duplicating a walk edge.
  const from = Math.floor(rnd() * (count - 3));
  edges.push([from, from + 2 + Math.floor(rnd() * (count - from - 3))]);
  return { points, edges, brightest: Math.floor(rnd() * count) };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function derivePersona(
  data: ContributionYear,
  stats: Stats,
  hours?: CommitHoursData | null,
): Persona {
  const metrics = computePersonaMetrics(data, stats, hours);
  const sign = SIGNS.find((s) => s.when(metrics))!;

  const traits: string[] = [`active ${pct(metrics.cadence)} of days`];
  if (metrics.peakHour !== null) traits.push(`peak ${hh(metrics.peakHour)}`);
  if (metrics.weekendShare >= 0.25) traits.push(`${pct(metrics.weekendShare)} on weekends`);
  else if (metrics.longestStreak >= 10) traits.push(`${metrics.longestStreak}-day streak`);
  else if (metrics.spike >= 4) traits.push(`peak day ×${metrics.spike.toFixed(0)} the average`);

  return {
    id: sign.id,
    name: sign.name,
    line: sign.line,
    traits: traits.slice(0, 3),
    metrics,
    sigil: castSigil(`${data.login.toLowerCase()}:${sign.id}`),
  };
}
