import { test } from "vitest";
import assert from "node:assert/strict";
import { buildMonolith } from "@/lib/build";
import { splitByLevel } from "@/lib/parts";
import { estimate, materialById, qualityById } from "@/lib/print";
import { syntheticYear } from "@/lib/github";
import { fetchContributionYear } from "@/lib/github";

/** Measured with Bambu Studio 02.00.03.54 on noluyorAbi 2025, skyline, 180mm, PLA. */
const GROUND_TRUTH = [
  { quality: "fine", filamentMm: 6988.48, seconds: 4 * 3600 + 35 * 60 + 20 },
  { quality: "standard", filamentMm: 7375.91, seconds: 3 * 3600 + 53 * 60 + 10 },
  { quality: "fast", filamentMm: 7801.98, seconds: 3 * 3600 + 37 * 60 + 2 },
];

test("the filament and time estimates track a real slicer", async () => {
  const data = await fetchContributionYear("noluyorAbi", 2025).catch(() => syntheticYear("noluyorAbi", 2025));
  if (data.demo) return; // offline: nothing to compare against
  const mesh = buildMonolith(data, { variant: "skyline", sizeMm: 180, label: true });
  const parts = splitByLevel(mesh);

  for (const truth of GROUND_TRUTH) {
    const est = estimate(parts, materialById("pla"), qualityById(truth.quality));
    const realCm3 = (truth.filamentMm * Math.PI * 0.875 ** 2) / 1000;
    const volumeError = Math.abs(est.materialCm3 - realCm3) / realCm3;
    assert.ok(volumeError < 0.1, `${truth.quality}: filament off by ${(volumeError * 100).toFixed(1)}%`);

    const realHours = truth.seconds / 3600;
    assert.ok(
      realHours >= est.hoursLow && realHours <= est.hoursHigh,
      `${truth.quality}: real ${realHours.toFixed(2)}h outside ${est.hoursLow.toFixed(2)}-${est.hoursHigh.toFixed(2)}h`,
    );
  }
}, 60000);
