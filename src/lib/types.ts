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
}
