import { test } from "vitest";
import assert from "node:assert/strict";

import { computePersonaMetrics, derivePersona, deriveSign } from "@/lib/persona";
import { buildOptionsFrom } from "@/lib/extras";
import { parseRepoInput } from "@/lib/request";
import { computeStats, yearFromDays } from "@/lib/contributions";
import type { CommitHoursData, Day } from "@/lib/types";

/** A crafted year: which days carry commits decides the sign. */
function year(fill: (dayIndex: number, weekday: number) => number) {
  const days: Day[] = [];
  const start = new Date("2025-01-01T00:00:00Z");
  for (let i = 0; i < 365; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const count = fill(i, d.getUTCDay());
    days.push({
      date: d.toISOString().slice(0, 10),
      count,
      level: (count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 14 ? 3 : 4) as Day["level"],
    });
  }
  return yearFromDays("octocat", 2025, days);
}

function hoursPeaking(hour: number): CommitHoursData {
  const hours = new Array(24).fill(1);
  hours[hour] = 40;
  return { login: "octocat", year: 2025, hours, total: 63, sampled: 63, capped: false };
}

test("metrics read cadence, weekends, spikes and gaps off the calendar", () => {
  const data = year((i, wd) => (wd === 0 || wd === 6 ? 8 : i % 10 === 0 ? 2 : 0));
  const stats = computeStats(data);
  const m = computePersonaMetrics(data, stats);
  assert.ok(m.weekendShare > 0.8, `weekend-heavy year must read as such (${m.weekendShare})`);
  assert.ok(m.cadence > 0.2 && m.cadence < 0.5, `cadence ${m.cadence}`);
  assert.ok(m.longestGap >= 1);
  assert.equal(m.peakHour, null, "no histogram means no peak hour");
});

test("a weekend-heavy year casts the Weekend Alchemist", () => {
  const data = year((_, wd) => (wd === 0 || wd === 6 ? 6 : 1));
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "alchemist");
  assert.ok(p.traits.some((t) => t.includes("weekends")));
});

test("a literally-every-day even year casts the legendary Perennial", () => {
  const data = year(() => 3);
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "perennial");
  assert.equal(p.tier, "legendary");
});

test("a steady but not daily year casts the Metronome, with an earned ascendant", () => {
  const data = year((i) => (i % 4 === 3 ? 0 : 3));
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "metronome");
  assert.equal(p.ascendant?.id, "lantern", "the next matching sign down the ladder");
});

test("months of silence broken by a towering return cast the Eclipse", () => {
  const data = year((i) => (i < 200 ? (i % 2 ? 2 : 1) : i === 300 ? 50 : 0));
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "eclipse");
  assert.equal(p.tier, "legendary");
  assert.ok(p.traits.some((t) => t.includes("silent")), "the gap is the evidence");
});

test("two genuine commit-hour peaks cast the Twin Flame", () => {
  const data = year(() => 2);
  const hours = new Array(24).fill(0);
  hours[7] = 30;
  hours[23] = 20;
  const p = derivePersona(data, computeStats(data), {
    login: "octocat",
    year: 2025,
    hours,
    total: 50,
    sampled: 50,
    capped: false,
  });
  assert.equal(p.id, "twinflame");
  assert.ok(p.traits.some((t) => t.includes("07:00") && t.includes("23:00")));
});

test("a colossal day over a busy calendar casts the Supernova, not the Comet", () => {
  const data = year((i) => (i === 100 ? 200 : 1));
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "supernova");
});

test("a strict weekday machine casts the Clockwork", () => {
  const data = year((_, wd) => (wd === 0 || wd === 6 ? 0 : 4));
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "clockwork");
  assert.ok(p.traits.some((t) => t.includes("weekdays")));
});

test("a night peak on a steady year casts the Nightsmith", () => {
  const data = year(() => 3);
  const p = derivePersona(data, computeStats(data), hoursPeaking(23));
  assert.equal(p.id, "nightsmith");
  assert.ok(p.traits.some((t) => t.includes("23:00")));
});

test("a dawn peak casts the Dawnwright", () => {
  const data = year((i) => (i % 3 === 0 ? 4 : 0));
  const p = derivePersona(data, computeStats(data), hoursPeaking(6));
  assert.equal(p.id, "dawnwright");
});

test("rare huge days over a sparse routine cast the Comet", () => {
  // Mostly single-commit days, one day that towers fifty times over them.
  const data = year((i) => (i === 100 ? 100 : i % 4 === 0 ? 1 : 0));
  const p = derivePersona(data, computeStats(data));
  assert.equal(p.id, "comet");
});

test("every shape of year gets a sign, and the sigil is stable and in bounds", () => {
  const shapes = [
    year(() => 0),
    year(() => 1),
    year((i) => (i < 30 ? 5 : 0)),
    year((i, wd) => (wd === 3 ? 2 : 0)),
  ];
  for (const data of shapes) {
    const p = derivePersona(data, computeStats(data));
    assert.ok(p.name.length > 0);
    assert.ok(p.line.length > 0);
    assert.ok(p.sigil.points.length >= 6);
    for (const [x, y] of p.sigil.points) {
      assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `point ${x},${y} out of the box`);
    }
    for (const [a, b] of p.sigil.edges) {
      assert.ok(a >= 0 && b >= 0 && a < p.sigil.points.length && b < p.sigil.points.length);
    }
    const again = derivePersona(data, computeStats(data));
    assert.deepEqual(again.sigil, p.sigil, "the sigil must be deterministic");
    assert.equal(again.id, p.id, "the sign must be deterministic");
  }
});

test("the same sign wears a different constellation for a different window", () => {
  const data = year(() => 3);
  const stats = computeStats(data);
  const y2026 = derivePersona(data, stats, null, "2026");
  const range = derivePersona(data, stats, null, "2023-2026");
  assert.equal(y2026.id, range.id, "same shape, same sign");
  assert.notDeepEqual(
    y2026.sigil.points,
    range.sigil.points,
    "the reading belongs to the window, so the stars must differ",
  );
  // Still deterministic per window.
  assert.deepEqual(derivePersona(data, stats, null, "2026").sigil, y2026.sigil);
});

test("deriveSign agrees with the full persona for the same calendar", () => {
  for (const data of [year(() => 3), year((i) => (i === 100 ? 100 : i % 4 === 0 ? 1 : 0))]) {
    const stats = computeStats(data);
    assert.equal(deriveSign(data, stats).id, derivePersona(data, stats).id);
  }
});

test("buildOptionsFrom honours the carried sign and derives one when absent", () => {
  const data = year(() => 3);
  const src = { data, multi: null, spanLabel: "2025", who: "octocat" };
  const base = { variant: "skyline" as const, sizeMm: 180, dampening: 0 };

  const carried = buildOptionsFrom({ ...base, flags: ["sigil", "peak"], sign: "comet" }, src);
  assert.equal(carried.sigil?.name, "The Comet", "the page's sign wins");
  assert.equal(carried.peak, true);

  const derived = buildOptionsFrom({ ...base, flags: ["sigil"], sign: "" }, src);
  assert.equal(derived.sigil?.name, "The Perennial", "no sign carried: derive from the calendar");
  assert.ok(derived.peak === undefined || derived.peak === false);

  const off = buildOptionsFrom({ ...base, flags: [], sign: "comet" }, src);
  assert.ok(!off.sigil && !off.peak, "no flags, no extras");

  const junk = buildOptionsFrom({ ...base, flags: ["sigil"], sign: "notasign" }, src);
  assert.equal(junk.sigil?.name, "The Perennial", "an unknown sign id falls back to deriving");
});

test("parseRepoInput accepts what people actually paste", () => {
  for (const raw of [
    "https://github.com/vercel/next.js",
    "http://www.github.com/vercel/next.js/",
    "github.com/vercel/next.js/tree/main/packages",
    "git@github.com:vercel/next.js.git",
    "vercel/next.js",
    "  vercel/next.js.git ",
  ]) {
    const parsed = parseRepoInput(raw);
    assert.ok(parsed, `should parse: ${raw}`);
    assert.equal(parsed!.owner, "vercel", raw);
    assert.equal(parsed!.name, "next.js", raw);
  }
  for (const raw of ["", "vercel", "https://gitlab.com/a/b", "not a repo", "a//b"]) {
    assert.equal(parseRepoInput(raw), null, `should refuse: ${raw}`);
  }
});
