/**
 * Who this project is. Change the two constants below if you fork it; nothing
 * else in the codebase hardcodes an owner.
 */
export const PROJECT = {
  name: "MONOLITH",
  repo: "noluyorAbi/monolith",
  url: process.env.NEXT_PUBLIC_PROJECT_URL || "https://github.com/noluyorAbi/monolith",
  licence: "PolyForm Noncommercial 1.0.0",
  /** The generated objects, as opposed to the code that generates them. */
  modelLicence: "CC BY 4.0",
  /** Where this is deployed. Drives canonicals, sitemap, robots and OG urls. */
  site: process.env.NEXT_PUBLIC_SITE_URL || "https://monolith-ebon-six.vercel.app",
  author: "noluyorAbi",
  tagline: "Your commit year, cast as an object.",
} as const;
