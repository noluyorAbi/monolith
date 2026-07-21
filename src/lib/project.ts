/**
 * Who this project is. Change the two constants below if you fork it; nothing
 * else in the codebase hardcodes an owner.
 */
export const PROJECT = {
  name: "MONOLITH",
  repo: "noluyorAbi/monolith",
  url: process.env.NEXT_PUBLIC_PROJECT_URL || "https://github.com/noluyorAbi/monolith",
  licence: "MIT",
  /** The generated objects, as opposed to the code that generates them. */
  modelLicence: "CC BY 4.0",
} as const;
