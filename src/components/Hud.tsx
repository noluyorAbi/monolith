"use client";

import { motion } from "motion/react";
import { Ticker } from "./Ticker";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { BuiltMesh, ContributionYear, Stats, Variant } from "@/lib/types";

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

export function Hud({
  data,
  stats,
  mesh,
  variant,
  yearLabel,
}: {
  data: ContributionYear;
  stats: Stats;
  mesh: BuiltMesh;
  variant: Variant;
  /** Override for the year line: a range ("2019–2025") or "owner/repo". */
  yearLabel?: string;
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
          label={`per active day · ${stats.busiestWeekday.slice(0, 3).toLowerCase()} heaviest`}
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
        </motion.div>
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
