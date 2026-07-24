import type { CommitHoursData, ContributionYear, Stats } from "./types";

/**
 * The developer starsign. Every account works in a recognisable shape: when
 * the commits land, how evenly, how hard the peaks tower over the routine.
 * This reads those shapes off the calendar (and, when the search API answered,
 * the hour histogram) and names them, the way a star chart names a scatter of
 * points. Deterministic: the same year always casts the same sign, and the
 * sigil is seeded by the login so two Nightsmiths still wear different stars.
 */

export type PersonaTier = "legendary" | "rare" | "uncommon" | "common";

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
  /**
   * A genuine second commit hour, at least six hours from the peak and
   * carrying most of its weight, or null. Two work-lives in one calendar.
   */
  secondHour: number | null;
}

export interface Persona {
  id: string;
  /** The sign, e.g. "The Nightsmith". */
  name: string;
  /** One sentence that reads like a horoscope written by a build log. */
  line: string;
  /** How uncommon the shape is; worn as a small coloured tag. */
  tier: PersonaTier;
  /** Two or three short evidence chips, so the sign is a measurement, not flattery. */
  traits: string[];
  /** The next sign down the ladder that also matches: the undertone. */
  ascendant: { id: string; name: string } | null;
  metrics: PersonaMetrics;
  /**
   * A small constellation, seeded by the login: points in 0..1, edges by
   * index, plus which stars twinkle after the draw-in.
   */
  sigil: {
    points: [number, number][];
    edges: [number, number][];
    brightest: number;
    twinkle: number[];
  };
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
  let peakHour: number | null = null;
  let secondHour: number | null = null;
  if (hours && hours.sampled > 0) {
    const peak = Math.max(...hours.hours);
    peakHour = hours.hours.indexOf(peak);
    // A second life: another hour at least six hours away (circularly) that
    // still carries most of the peak's weight. Needs a real sample behind it.
    if (hours.sampled >= 30) {
      let best = 0;
      for (let h = 0; h < 24; h++) {
        const dist = Math.min(Math.abs(h - peakHour), 24 - Math.abs(h - peakHour));
        if (dist < 6) continue;
        if (hours.hours[h] > best) {
          best = hours.hours[h];
          if (best >= peak * 0.55) secondHour = h;
        }
      }
    }
  }
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
    secondHour,
  };
}

interface SignDef {
  id: string;
  name: string;
  line: string;
  tier: PersonaTier;
  /** First predicate that matches wins; ordered most-specific first. */
  when: (m: PersonaMetrics) => boolean;
}

const night = (h: number | null) => h !== null && (h >= 22 || h < 5);
const dawn = (h: number | null) => h !== null && h >= 5 && h < 10;
const dusk = (h: number | null) => h !== null && h >= 17 && h < 22;

/**
 * Ordered most-specific to most-general; the last entry always matches, so
 * every account gets a sign. Names stay in the forge register the rest of the
 * product speaks. The tier is the honest frequency of the shape, worn as a
 * small tag: legendary shapes are genuinely hard to produce by accident.
 */
const SIGNS: SignDef[] = [
  {
    id: "eclipse",
    name: "The Eclipse",
    tier: "legendary",
    line: "Months of dark, then the whole sky at once. Absence is part of the orbit, not the end of it.",
    when: (m) => m.longestGap >= 100 && m.spike >= 6,
  },
  {
    id: "twinflame",
    name: "The Twin Flame",
    tier: "rare",
    line: "Two fires, hours apart: one before the world wakes, one after it sleeps. Both are real.",
    when: (m) => m.peakHour !== null && m.secondHour !== null,
  },
  {
    id: "nightsmith",
    name: "The Nightsmith",
    tier: "rare",
    line: "Forges after midnight, steady as a furnace. The quiet hours are the workshop.",
    when: (m) => night(m.peakHour) && m.cadence >= 0.45,
  },
  {
    id: "dawnwright",
    name: "The Dawnwright",
    tier: "rare",
    line: "First light, first commit. The day is built before anyone else has opened a terminal.",
    when: (m) => dawn(m.peakHour),
  },
  {
    id: "moth",
    name: "The Moth",
    tier: "uncommon",
    line: "Circles back to the lamp every evening. The day ends where the focus begins.",
    when: (m) => dusk(m.peakHour) && m.cadence >= 0.35,
  },
  {
    id: "alchemist",
    name: "The Weekend Alchemist",
    tier: "uncommon",
    line: "Weekdays belong to someone else; Saturday turns base hours into gold.",
    when: (m) => m.weekendShare >= 0.34,
  },
  {
    id: "clockwork",
    name: "The Clockwork",
    tier: "uncommon",
    line: "Runs on office time to the minute; the weekend is a scheduled outage.",
    when: (m) => m.weekendShare <= 0.05 && m.cadence >= 0.35,
  },
  {
    id: "comet",
    name: "The Comet",
    tier: "rare",
    line: "Long dark orbits, then a tail of fire across the calendar. Arrival is an event.",
    when: (m) => m.spike >= 5 && m.cadence < 0.4,
  },
  {
    id: "supernova",
    name: "The Supernova",
    tier: "legendary",
    line: "A busy sky, and still one day outshines the rest of the year combined. It was visible from space.",
    when: (m) => m.spike >= 12,
  },
  {
    id: "perennial",
    name: "The Perennial",
    tier: "legendary",
    line: "Blooms every single day, all seasons, no theatrics. The rarest shape: relentless and even.",
    when: (m) => m.cadence >= 0.85 && m.spike < 3,
  },
  {
    id: "metronome",
    name: "The Metronome",
    tier: "uncommon",
    line: "Rarely loud, never silent. The streak is the achievement; the calendar keeps the beat.",
    when: (m) => m.cadence >= 0.62 && m.spike < 4,
  },
  {
    id: "stormcaller",
    name: "The Stormcaller",
    tier: "uncommon",
    line: "Calm skies, then a day that towers over the month. The pressure builds, and lands at once.",
    when: (m) => m.spike >= 6,
  },
  {
    id: "keeper",
    name: "The Streakkeeper",
    tier: "uncommon",
    line: "Guards an unbroken line the way a lighthouse guards a coast: daily, deliberately.",
    when: (m) => m.longestStreak >= 30,
  },
  {
    id: "tidewalker",
    name: "The Tidewalker",
    tier: "common",
    line: "Comes and goes with the moon: weeks of flow, weeks of ebb, and the work rises with each return.",
    when: (m) => m.longestGap >= 21 && m.cadence >= 0.25,
  },
  {
    id: "lantern",
    name: "The Lantern",
    tier: "common",
    line: "A small light most days. Not the brightest in the sky, but the one you navigate by.",
    when: (m) => m.cadence >= 0.4,
  },
  {
    id: "cartographer",
    name: "The Cartographer",
    tier: "common",
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
  const brightest = Math.floor(rnd() * count);
  // Two lesser stars twinkle after the draw-in; never the anchor star, whose
  // steadiness is the point.
  const twinkle: number[] = [];
  while (twinkle.length < 2) {
    const i = Math.floor(rnd() * count);
    if (i !== brightest && !twinkle.includes(i)) twinkle.push(i);
  }
  return { points, edges, brightest, twinkle };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Every sign id the share contract may carry. */
export const SIGN_IDS = SIGNS.map((s) => s.id);

/** Public face of a sign, for surfaces that receive only its id. */
export function signInfo(
  id: string,
): { id: string; name: string; tier: PersonaTier; line: string } | null {
  const s = SIGNS.find((x) => x.id === id);
  return s ? { id: s.id, name: s.name, tier: s.tier, line: s.line } : null;
}

export function signName(id: string): string | null {
  return signInfo(id)?.name ?? null;
}

/**
 * The engraving payload for a known sign: the same deterministic
 * constellation the card shows, cast from login + sign + window. The sign id
 * travels in the share URL so an hour-refined reading (which the download
 * routes cannot re-derive without the rate-limited search API) still engraves
 * exactly what the page showed.
 */
export function sigilFor(
  login: string,
  signId: string,
  spanKey: string,
): (Persona["sigil"] & { name: string }) | null {
  const name = signName(signId);
  if (!name) return null;
  const sigil = castSigil(`${login.toLowerCase()}:${signId}${spanKey ? `:${spanKey}` : ""}`);
  return { ...sigil, name };
}

/** The one measurement that made this sign fire; leads the evidence chips. */
function signatureTrait(id: string, m: PersonaMetrics): string | null {
  switch (id) {
    case "eclipse":
      return `silent ${m.longestGap} days straight`;
    case "twinflame":
      return m.secondHour !== null && m.peakHour !== null
        ? `burns at ${hh(m.peakHour)} + ${hh(m.secondHour)}`
        : null;
    case "supernova":
    case "stormcaller":
    case "comet":
      return `peak day ×${m.spike.toFixed(0)} the average`;
    case "perennial":
    case "keeper":
      return `${m.longestStreak}-day streak`;
    case "alchemist":
      return `${pct(m.weekendShare)} on weekends`;
    case "clockwork":
      return `${pct(1 - m.weekendShare)} on weekdays`;
    case "tidewalker":
      return `${m.longestGap}-day ebb`;
    default:
      return null;
  }
}

export function derivePersona(
  data: ContributionYear,
  stats: Stats,
  hours?: CommitHoursData | null,
  /**
   * Identifies the window being read ("2026", "2023-2026", "2019-2026" for a
   * lifetime). It seeds the sigil alongside login and sign, so the same
   * account under the same sign still wears a different constellation for a
   * different period: the reading belongs to the window, not the login.
   */
  spanKey?: string,
): Persona {
  const metrics = computePersonaMetrics(data, stats, hours);
  const idx = SIGNS.findIndex((s) => s.when(metrics));
  const sign = SIGNS[idx];
  // The undertone: the next sign down the ladder that also matches. The
  // fallback never counts; an ascendant must be earned, not defaulted.
  const asc = SIGNS.slice(idx + 1, -1).find((s) => s.when(metrics)) ?? null;

  const traits: string[] = [];
  const lead = signatureTrait(sign.id, metrics);
  if (lead) traits.push(lead);
  traits.push(`active ${pct(metrics.cadence)} of days`);
  if (metrics.peakHour !== null && sign.id !== "twinflame") traits.push(`peak ${hh(metrics.peakHour)}`);
  if (traits.length < 3) {
    if (metrics.weekendShare >= 0.25 && sign.id !== "alchemist")
      traits.push(`${pct(metrics.weekendShare)} on weekends`);
    else if (metrics.longestStreak >= 10 && lead !== `${metrics.longestStreak}-day streak`)
      traits.push(`${metrics.longestStreak}-day streak`);
    else if (metrics.spike >= 4 && !lead?.startsWith("peak day"))
      traits.push(`peak day ×${metrics.spike.toFixed(0)} the average`);
  }

  return {
    id: sign.id,
    name: sign.name,
    line: sign.line,
    tier: sign.tier,
    traits: traits.slice(0, 3),
    ascendant: asc ? { id: asc.id, name: asc.name } : null,
    metrics,
    sigil: castSigil(
      `${data.login.toLowerCase()}:${sign.id}${spanKey ? `:${spanKey}` : ""}`,
    ),
  };
}
