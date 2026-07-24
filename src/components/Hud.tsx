"use client";

import { motion } from "motion/react";
import { Ticker } from "./Ticker";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { BuiltMesh, CommitHoursData, ContributionYear, Stats, Variant } from "@/lib/types";
import type { Persona } from "@/lib/persona";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Module scope, so its identity does not change the Ticker effect every render. */
const oneDecimal = (n: number) => n.toFixed(1);

function Row({
  value,
  label,
  delay,
  format,
}: {
  value: number;
  label: string;
  delay: number;
  format?: (n: number) => string;
}) {
  return (
    <motion.div
      className="flex items-baseline gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      <Ticker
        value={value}
        format={format}
        className="w-[6.5ch] shrink-0 text-right font-[family-name:var(--font-display)] text-[1.05rem] tabular-nums text-fog"
      />
      <span className="text-[0.62rem] tracking-[0.18em] uppercase text-dim">{label}</span>
    </motion.div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** What kind of day the peak commit hour describes. M16's one-word verdict. */
function chronotype(peakHour: number): string {
  if (peakHour >= 22 || peakHour < 5) return "night owl";
  if (peakHour < 11) return "early bird";
  if (peakHour < 18) return "daylight coder";
  return "evening coder";
}

/**
 * The commit day, hour by hour. One series of one magnitude, so it wears one
 * ink: every bar the recessive edge tone, the single peak the accent, labels
 * in text tokens. Small enough to live under the stat column without a legend
 * or an axis; the caption carries the units and the honesty about sampling.
 */
function HourHistogram({ hours }: { hours: CommitHoursData }) {
  const max = Math.max(1, ...hours.hours);
  const peak = hours.hours.indexOf(Math.max(...hours.hours));
  return (
    <motion.div
      className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.46 }}
    >
      <div className="flex items-end gap-[2px]" aria-hidden>
        {hours.hours.map((v, h) => (
          <div
            key={h}
            title={`${String(h).padStart(2, "0")}:00 · ${v.toLocaleString("en-GB")} commits`}
            className={`w-[5px] rounded-t-[1px] ${h === peak ? "bg-accent" : "bg-edge"}`}
            style={{ height: `${v === 0 ? 1 : Math.max(2, (v / max) * 26)}px` }}
          />
        ))}
      </div>
      <span className="text-[0.6rem] tracking-[0.14em] uppercase text-dim">
        commits by local hour · peak {String(peak).padStart(2, "0")}:00 ·{" "}
        <span className="text-mute">{chronotype(peak)}</span>
      </span>
      {hours.capped && (
        <span className="text-[0.55rem] tracking-[0.12em] uppercase text-dim">
          sample of {hours.sampled.toLocaleString("en-GB")} of{" "}
          {hours.total.toLocaleString("en-GB")} commits
        </span>
      )}
    </motion.div>
  );
}

/**
 * The developer starsign, worn as a small constellation. The stars are the
 * sign's sigil (seeded by the login, so it is personal and stable); the lines
 * draw themselves in once, oldest ritual in the book for saying "this was
 * cast, not templated". One accent star burns brighter: the sign's anchor.
 */
function PersonaCard({ persona }: { persona: Persona }) {
  const px = (v: number) => v * 100;
  return (
    <motion.div
      className="mt-3 flex flex-col gap-2 border-t border-line pt-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
    >
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 100 100"
          className="h-12 w-12 shrink-0"
          role="img"
          aria-label={`${persona.name} sigil`}
        >
          {persona.sigil.edges.map(([a, b], i) => (
            <motion.line
              key={`e${i}`}
              x1={px(persona.sigil.points[a][0])}
              y1={px(persona.sigil.points[a][1])}
              x2={px(persona.sigil.points[b][0])}
              y2={px(persona.sigil.points[b][1])}
              stroke="var(--color-edge)"
              strokeWidth={1.6}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.7 + i * 0.09 }}
            />
          ))}
          {persona.sigil.points.map(([x, y], i) => {
            const bright = i === persona.sigil.brightest;
            return (
              <motion.circle
                key={`p${i}`}
                cx={px(x)}
                cy={px(y)}
                r={bright ? 4 : 2.2}
                fill={bright ? "var(--color-accent)" : "var(--color-mute)"}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.75 + i * 0.07 }}
                style={bright ? { filter: "drop-shadow(0 0 4px var(--color-accent))" } : undefined}
              />
            );
          })}
        </svg>
        <div className="min-w-0">
          <div className="text-[0.55rem] tracking-[0.22em] uppercase text-dim">starsign</div>
          <div className="font-[family-name:var(--font-display)] text-[0.95rem] tracking-[-0.01em] text-fog">
            {persona.name}
          </div>
        </div>
      </div>
      <p className="max-w-[19rem] text-[0.64rem] leading-relaxed text-mute">{persona.line}</p>
      <div className="flex flex-wrap gap-1.5">
        {persona.traits.map((t) => (
          <span
            key={t}
            className="hairline rounded-full px-2 py-[3px] text-[0.55rem] tracking-[0.12em] uppercase text-dim"
          >
            {t}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

export function Hud({
  data,
  stats,
  mesh,
  variant,
  yearLabel,
  commitHours,
  persona,
}: {
  data: ContributionYear;
  stats: Stats;
  mesh: BuiltMesh;
  variant: Variant;
  /** Override for the year line: a range ("2019–2025") or "owner/repo". */
  yearLabel?: string;
  /** M16: the hour-of-day histogram, when a single user year is on screen. */
  commitHours?: CommitHoursData | null;
  /** The developer starsign, when the subject is a person rather than a repo. */
  persona?: Persona | null;
}) {
  /**
   * The full readout is seven lines tall. It needs a screen with the height to
   * hold them as much as the width: on a phone turned sideways the column ran
   * straight through the object and out under the dock. Height as well as
   * width, so a short landscape window gets the two-figure row instead.
   */
  const roomy = useMediaQuery("(min-width: 640px) and (min-height: 600px)");

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-6 px-5 pb-5 pt-14 sm:px-7 sm:pb-7 sm:pt-16">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,4vw,2rem)] leading-none tracking-[-0.03em] text-fog">
            {data.login}
          </h2>
          {data.demo && (
            <span className="hairline rounded-full px-2 py-[3px] text-[0.55rem] tracking-[0.16em] uppercase text-danger">
              sample data
            </span>
          )}
          {/* A year still being written is not a weak year. Without the tag,
            the current year's half-filled plate reads as someone slowing
            down rather than as a calendar that has not finished. */}
          {data.year === new Date().getUTCFullYear() && (
            <span className="hairline rounded-full px-2 py-[3px] text-[0.55rem] tracking-[0.16em] uppercase text-dim">
              year to date
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[0.66rem] tracking-[0.2em] uppercase text-dim">
          {yearLabel ?? data.year} · {variant}
        </div>
      </motion.div>

      {roomy && (
      <div className="flex w-fit max-w-[20rem] flex-col gap-2">
        <Row value={stats.total} label="contributions" delay={0.1} />
        <Row value={stats.activeDays} label="active days" delay={0.16} />
        <Row value={stats.longestStreak} label="longest streak" delay={0.22} />
        {stats.currentStreak > 0 && (
          <Row value={stats.currentStreak} label="running streak" delay={0.26} />
        )}
        {stats.bestDay && (
          <Row
            value={stats.bestDay.count}
            label={`peak · ${shortDate(stats.bestDay.date)}`}
            delay={0.3}
          />
        )}
        <Row
          value={stats.averagePerActiveDay}
          // Defensive on the weekday: a stats payload from another span shape
          // must degrade to a shorter label, never take the whole HUD down.
          label={`per active day${stats.busiestWeekday ? ` · ${stats.busiestWeekday.slice(0, 3).toLowerCase()} heaviest` : ""}`}
          delay={0.34}
          format={oneDecimal}
        />
        <motion.div
          className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-[0.6rem] tracking-[0.14em] uppercase text-dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.4 }}
        >
          <span className="tabular-nums">
            {mesh.size.x.toFixed(0)} × {mesh.size.z.toFixed(0)} × {mesh.size.y.toFixed(0)} mm
          </span>
          <span className="tabular-nums">{mesh.triangles.toLocaleString("en-GB")} triangles</span>
          {/* Composition, when the GraphQL path delivered it: what the year
            was made OF, not just how much of it there was. */}
          {data.totalPullRequests !== undefined && (
            <span className="tabular-nums">
              {(data.totalPullRequests ?? 0).toLocaleString("en-GB")} prs ·{" "}
              {(data.totalIssues ?? 0).toLocaleString("en-GB")} issues ·{" "}
              {(data.totalReviews ?? 0).toLocaleString("en-GB")} reviews
            </span>
          )}
          {persona && (
            <span className="tabular-nums">
              {Math.round(persona.metrics.weekendShare * 100)}% weekends · longest gap{" "}
              {persona.metrics.longestGap} days
            </span>
          )}
        </motion.div>
        {commitHours && <HourHistogram hours={commitHours} />}
        {persona && <PersonaCard persona={persona} />}
      </div>
      )}

      {!roomy && (
      <motion.div
        className="flex gap-5 text-[0.6rem] tracking-[0.14em] uppercase text-dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.12 }}
      >
        <span>
          <Ticker value={stats.total} className="text-fog tabular-nums" /> commits
        </span>
        <span>
          <Ticker value={stats.longestStreak} className="text-fog tabular-nums" /> streak
        </span>
      </motion.div>
      )}
    </div>
  );
}
