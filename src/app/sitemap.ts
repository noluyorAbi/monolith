import type { MetadataRoute } from "next";
import { PROJECT } from "@/lib/project";
import { availableYears } from "@/lib/contributions";

/**
 * Share pages are generated per handle, so there is no finite set to list.
 * What goes in is the landing page plus a handful of real accounts, which
 * gives a crawler something concrete to reach the /s/ route through.
 */
const SHOWCASE = ["noluyorAbi", "torvalds", "sindresorhus"];

export default function sitemap(): MetadataRoute.Sitemap {
  const year = availableYears(1)[0];
  return [
    {
      url: PROJECT.site,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...SHOWCASE.map((login) => ({
      url: `${PROJECT.site}/s/${login}?year=${year}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
