export type Level = 0 | 1 | 2 | 3 | 4;

export interface Day {
  /** ISO date, YYYY-MM-DD */
  date: string;
  count: number;
  level: Level;
}

export interface ContributionYear {
  login: string;
  /** Display name as GitHub spells it, when we can resolve it. */
  name: string;
  year: number;
  total: number;
  /** Chronological, one entry per rendered day. */
  days: Day[];
  /** Column-major calendar: weeks[w][weekday]. Weekday 0 = Sunday. */
  weeks: (Day | null)[][];
  /** True when GitHub was unreachable and the shape is synthesised. */
  demo: boolean;
  source: "graphql" | "html" | "synthetic";
  /**
   * Everything below is read from the GraphQL response. It is optional because
   * the token-less HTML fallback returns none of it, and the production
   * geometry path must keep type-checking against that fallback. F4/F6 spend
   * these; until then they are inert data.
   */
  /** The exact years this account has contributed in, newest first. */
  contributionYears?: number[];
  /** GitHub's own hex ramp for the rendered calendar. */
  colors?: string[];
  /** A real seasonal palette flag nobody else turns into a finish. */
  isHalloween?: boolean;
  /** Composition totals, all from the same single query. */
  totalIssues?: number;
  totalPullRequests?: number;
  totalReviews?: number;
  totalRepos?: number;
  /** Milestone dates, for engraving on the base plate. */
  joinedAt?: string;
  firstPrAt?: string;
  firstIssueAt?: string;
  firstRepoAt?: string;
}

export interface Stats {
  total: number;
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  bestDay: Day | null;
  averagePerActiveDay: number;
  busiestWeekday: string;
}

export type Variant = "skyline" | "ring" | "wave" | "spine";

export interface BuildOptions {
  variant: Variant;
  /** Target size of the longest footprint edge, in millimetres. */
  sizeMm: number;
  label: boolean;
  /**
   * Outlier compression, 0..1. 0 keeps busy days at their true relative
   * height; 1 strongly flattens the busiest days toward the rest so a single
   * spike does not tower over the year. F7.
   */
  dampening?: number;
}

export interface BuiltMesh {
  /** Non-indexed triangle soup, xyz per vertex. */
  positions: Float32Array;
  /** Contribution level per vertex, -1 for structural geometry. */
  levels: Float32Array;
  /** Chronological reveal order per vertex, 0..1. */
  order: Float32Array;
  /** Y coordinate the vertex grows from during the reveal. */
  baseY: Float32Array;
  triangles: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /** Millimetres, after scaling. */
  size: { x: number; y: number; z: number };
  /**
   * Real-world sizes of the two features that decide whether this prints well.
   * A 0.4 mm nozzle lays a 0.42 mm line, so anything below that is at the mercy
   * of the slicer's thin-feature handling.
   */
  print: {
    /** Width of one engraved font pixel. */
    engravePixelMm: number;
    /** Narrowest air gap between neighbouring towers, if the form has any. */
    gapMm: number | null;
  };
}

/**
 * Which of the studio's lights are switched on. The viewer exposes these as
 * controls, so the object can be studied under the key alone, by its own
 * emissive glow, or however else the hand on the switches likes it.
 */
export interface StudioLights {
  /** The main light, and the only one that casts the shadow. */
  key: boolean;
  /** The cool fill from the left. */
  fill: boolean;
  /** The kicker from behind that separates the far edge. */
  rim: boolean;
  /** A flat lamp from the camera side. Off by default: it flattens the form. */
  front: boolean;
  /** The emissive light the busy days carry on their own. */
  glow: boolean;
}
