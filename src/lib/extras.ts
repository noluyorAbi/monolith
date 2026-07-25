import { computeStats } from "./contributions";
import { derivePersona, signName, sigilFor } from "./persona";
import type { ModelRequest } from "./request";
import type { BuildOptions, ContributionYear, LangShare, MultiYearData } from "./types";

/**
 * Turns a parsed model request plus a resolved source into the one
 * BuildOptions every download route uses, so an opt-in flag lands in all four
 * exports the moment it exists in the contract. The sigil prefers the sign id
 * the page carried (an hour-refined reading the server cannot reproduce);
 * without one it derives the sign from the calendar alone. `langs` is the
 * pre-fetched language split, honoured only when the flag asks for it.
 */
export function buildOptionsFrom(
  req: Pick<ModelRequest, "variant" | "sizeMm" | "dampening" | "flags" | "sign">,
  src: {
    data: ContributionYear;
    multi?: MultiYearData | null;
    spanLabel: string;
    who: string;
  },
  langs?: LangShare[] | null,
): BuildOptions {
  const o: BuildOptions = {
    variant: req.variant,
    sizeMm: req.sizeMm,
    label: true,
    dampening: req.dampening,
  };
  if (req.flags.includes("peak")) o.peak = true;
  if (req.flags.includes("loop")) o.loop = true;
  if (req.flags.includes("langs") && langs?.length) o.langs = langs;
  if (req.flags.includes("sigil")) {
    let id = req.sign && signName(req.sign) ? req.sign : "";
    if (!id) {
      const base = src.multi
        ? {
            ...src.data,
            days: src.multi.years.flatMap((y) => y.days),
            total: src.multi.totalCommits,
          }
        : src.data;
      id = derivePersona(base, computeStats(base), null, src.spanLabel).id;
    }
    o.sigil = sigilFor(src.who, id, src.spanLabel);
  }
  return o;
}
