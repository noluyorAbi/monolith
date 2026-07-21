"use client";

import { useState } from "react";
import { VARIANTS } from "@/lib/build";
import type { Variant } from "@/lib/types";

/**
 * Production bench: rebuild any handle at any print size. This is the lever for
 * scaling an order up to whatever the machine on the floor actually wants.
 */
export function ProductionTool({
  defaultLogin = "",
  defaultYear,
  defaultVariant = "skyline",
  defaultMm = 180,
}: {
  defaultLogin?: string;
  defaultYear?: number;
  defaultVariant?: Variant;
  defaultMm?: number;
}) {
  const [login, setLogin] = useState(defaultLogin);
  const [year, setYear] = useState(defaultYear ?? new Date().getUTCFullYear());
  const [variant, setVariant] = useState<Variant>(defaultVariant);
  const [mm, setMm] = useState(defaultMm);

  const href = `/api/stl?login=${encodeURIComponent(login)}&year=${year}&variant=${variant}&mm=${mm}`;
  const ready = login.trim().length > 0;

  return (
    <div className="flex flex-col gap-4 border border-line p-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.55rem] tracking-[0.2em] uppercase text-dim">Handle</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="octocat"
            className="border-b border-line pb-1.5 text-[0.8rem] text-fog focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.55rem] tracking-[0.2em] uppercase text-dim">Year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border-b border-line pb-1.5 text-[0.8rem] tabular-nums text-fog focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.55rem] tracking-[0.2em] uppercase text-dim">Form</span>
          <select
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
            className="border-b border-line bg-void pb-1.5 text-[0.8rem] text-fog focus:border-accent"
          >
            {VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.55rem] tracking-[0.2em] uppercase text-dim">
            Longest edge · {mm}mm
          </span>
          <input
            type="range"
            min={60}
            max={400}
            step={5}
            value={mm}
            onChange={(e) => setMm(Number(e.target.value))}
            className="accent-accent"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={ready ? href : undefined}
          download
          aria-disabled={!ready}
          className={`rounded-[5px] px-4 py-2 text-[0.66rem] tracking-[0.12em] uppercase transition-all duration-150 ${
            ready
              ? "bg-accent text-void hover:brightness-110 active:scale-[0.98]"
              : "pointer-events-none border border-line text-dim"
          }`}
        >
          build stl at {mm}mm
        </a>
        <span className="text-[0.6rem] text-dim">
          Sizes clamp to 60–400mm. Everything scales uniformly, so wall thickness stays proportional.
        </span>
      </div>
    </div>
  );
}
