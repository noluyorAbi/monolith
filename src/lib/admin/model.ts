/**
 * The launch board's data shape.
 *
 * This file deliberately contains no content, only structure. The channel list
 * and the post copy are private working material and live in the store, never
 * in the repository, because the repository is public and a marketing plan
 * read by the people it targets stops being a plan.
 */

/** Where a channel sits between "not written yet" and "this is the live post". */
export const CHANNEL_STATUSES = ["todo", "ready", "scheduled", "posted", "skipped"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

/**
 * Which push a channel belongs to. Waves exist because posting the same thing
 * everywhere on one evening is a removal reason on Reddit and a ban reason on
 * Discord, so the plan has to carry its own spacing.
 */
export const WAVES = [1, 2, 3, 4] as const;
export type Wave = (typeof WAVES)[number];

export interface Channel {
  id: string;
  /** What it is called where you post it, e.g. "Show HN" or "r/SideProject". */
  name: string;
  /** Coarse bucket used only for grouping the board, e.g. "Reddit". */
  group: string;
  /** The exact page you post on. Empty when it is an email or a DM. */
  url: string;
  wave: Wave;
  status: ChannelStatus;
  /** ISO date, or empty. Local date only; the hour lives in `notes`. */
  scheduledAt: string;
  /** The link to the post once it exists. This is what makes the board a log. */
  postedUrl: string;
  /**
   * The rules that get a post removed. Kept next to the copy rather than in a
   * separate document, because the rule is only useful at the moment of
   * writing the post, and a rule in another file is a rule you did not read.
   */
  rules: string;
  /** Title, subject line, or first line. Copy-paste ready. */
  title: string;
  /** The post body. Copy-paste ready, already in that channel's register. */
  body: string;
  notes: string;
  /** What it did: points, upvotes, clicks. Filled in afterwards. */
  result: string;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  /** ISO date or empty. */
  due: string;
}

/** One manual reading of the numbers, so the board can show a trend. */
export interface Metric {
  id: string;
  /** ISO date. */
  at: string;
  stars: number;
  visitors: number;
  kits: number;
  note: string;
}

export interface LaunchState {
  version: 1;
  /** ISO timestamp of the last successful write. Set by the server, not the client. */
  updatedAt: string;
  /**
   * Free text: where the project stands, which decisions are settled and why,
   * what is deployed, and which questions are still the owner's to answer.
   *
   * A board of channels, tasks and numbers answers "what is left" but not "why
   * is it like this", so anything not yet done ended up explained somewhere
   * else. This is the one surface that makes the panel the place you open
   * first rather than the fourth thing you check.
   */
  brief: string;
  channels: Channel[];
  tasks: Task[];
  metrics: Metric[];
}

export const EMPTY_STATE: LaunchState = {
  version: 1,
  updatedAt: "",
  brief: "",
  channels: [],
  tasks: [],
  metrics: [],
};

const str = (v: unknown, max = 20000): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Everything arriving from the browser is rebuilt field by field rather than
 * trusted and stored. The panel is behind a password, so this is not a defence
 * against an attacker; it is a defence against a bad deploy writing a shape
 * the reader cannot parse, which would lose the board's contents.
 */
export function parseState(raw: unknown): LaunchState {
  const o = (raw ?? {}) as Record<string, unknown>;
  const channels = Array.isArray(o.channels) ? o.channels : [];
  const tasks = Array.isArray(o.tasks) ? o.tasks : [];
  const metrics = Array.isArray(o.metrics) ? o.metrics : [];
  return {
    version: 1,
    updatedAt: str(o.updatedAt, 40),
    // Generous, because this is where the reasoning lives, but still bounded so
    // a paste accident cannot make the document unwritable.
    brief: str(o.brief, 200000),
    channels: channels.slice(0, 500).map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      const wave = num(r.wave);
      const status = str(r.status, 20) as ChannelStatus;
      return {
        id: str(r.id, 64) || crypto.randomUUID(),
        name: str(r.name, 200),
        group: str(r.group, 200),
        url: str(r.url, 2000),
        wave: (WAVES as readonly number[]).includes(wave) ? (wave as Wave) : 1,
        status: CHANNEL_STATUSES.includes(status) ? status : "todo",
        scheduledAt: str(r.scheduledAt, 40),
        postedUrl: str(r.postedUrl, 2000),
        rules: str(r.rules),
        title: str(r.title, 2000),
        body: str(r.body),
        notes: str(r.notes),
        result: str(r.result, 500),
      };
    }),
    tasks: tasks.slice(0, 500).map((t) => {
      const r = (t ?? {}) as Record<string, unknown>;
      return {
        id: str(r.id, 64) || crypto.randomUUID(),
        text: str(r.text, 1000),
        done: r.done === true,
        due: str(r.due, 40),
      };
    }),
    metrics: metrics.slice(0, 2000).map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        id: str(r.id, 64) || crypto.randomUUID(),
        at: str(r.at, 40),
        stars: num(r.stars),
        visitors: num(r.visitors),
        kits: num(r.kits),
        note: str(r.note, 1000),
      };
    }),
  };
}
