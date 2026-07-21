import assert from "node:assert/strict";
import { test } from "vitest";
import { buildMonolith } from "@/lib/build";
import { splitByLevel } from "@/lib/parts";
import { estimate, materialById, qualityById } from "@/lib/print";
import { yearFromDays } from "@/lib/github";
import type { ContributionYear, Day } from "@/lib/types";
import fixture from "./fixtures/contributions-2025.json";

/**
 * Measured with Bambu Studio 02.00.03.54 slicing the frozen year below at
 * 180 mm in PLA, three times. These numbers are what SHELL_CALIBRATION,
 * LAYER_BULK, FLOW_INTERCEPT and FLOW_SLOPE in src/lib/print.ts were fitted to.
 */
const GROUND_TRUTH = [
  { quality: "fine", filamentMm: 6988.48, seconds: 4 * 3600 + 35 * 60 + 20 },
  { quality: "standard", filamentMm: 7375.91, seconds: 3 * 3600 + 53 * 60 + 10 },
  { quality: "fast", filamentMm: 7801.98, seconds: 3 * 3600 + 37 * 60 + 2 },
];

/** 1.75 mm filament, so length converts to volume by its cross section. */
const FILAMENT_AREA_MM2 = Math.PI * 0.875 ** 2;

/**
 * The year is committed rather than fetched. An earlier version of this test
 * called GitHub and returned early when the network was unavailable, so it
 * passed with zero assertions exactly when it was needed most: in CI, from
 * shared runners that GitHub rate limits.
 */
function frozenYear(): ContributionYear {
  return yearFromDays(fixture.login, fixture.year, fixture.days as Day[]);
}

function partsOf(year: ContributionYear) {
  return splitByLevel(buildMonolith(year, { variant: "skyline", sizeMm: 180, label: true }));
}

test("the frozen fixture is a real year, not a synthetic stand-in", () => {
  assert.equal(fixture.source, "html");
  assert.equal(fixture.days.length, 365);
  assert.equal(
    fixture.total,
    (fixture.days as Day[]).reduce((a, d) => a + d.count, 0),
  );
});

test("the filament estimate tracks a real slicer at every layer height", () => {
  const parts = partsOf(frozenYear());

  for (const truth of GROUND_TRUTH) {
    const est = estimate(parts, materialById("pla"), qualityById(truth.quality));
    const realCm3 = (truth.filamentMm * FILAMENT_AREA_MM2) / 1000;
    const error = Math.abs(est.materialCm3 - realCm3) / realCm3;
    assert.ok(
      error < 0.05,
      `${truth.quality}: estimated ${est.materialCm3.toFixed(2)} cm3 against a measured ${realCm3.toFixed(2)}, off by ${(error * 100).toFixed(1)}%`,
    );
  }
});

test("the print time range contains what the slicer actually reported", () => {
  const parts = partsOf(frozenYear());

  for (const truth of GROUND_TRUTH) {
    const est = estimate(parts, materialById("pla"), qualityById(truth.quality));
    const realHours = truth.seconds / 3600;
    assert.ok(
      realHours >= est.hoursLow && realHours <= est.hoursHigh,
      `${truth.quality}: measured ${realHours.toFixed(2)} h outside the quoted ${est.hoursLow.toFixed(2)} to ${est.hoursHigh.toFixed(2)} h`,
    );
  }
});

test("a denser year costs more filament and more time than a sparse one", () => {
  const busy = frozenYear();
  const sparse = yearFromDays(
    busy.login,
    busy.year,
    busy.days.map((d, i) => (i % 30 === 0 ? d : { ...d, count: 0, level: 0 as Day["level"] })),
  );
  const material = materialById("pla");
  const quality = qualityById("standard");
  const of = (year: ContributionYear) => estimate(partsOf(year), material, quality);

  assert.ok(of(busy).grams > of(sparse).grams);
  assert.ok(of(busy).hoursHigh > of(sparse).hoursHigh);
});
