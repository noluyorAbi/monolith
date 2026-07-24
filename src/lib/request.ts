import { DEFAULT_SIZE_ID, VARIANTS, sizeById } from "./build";
import { LOGIN_RE, parseYear } from "./contributions";
import { materialById, printerById, qualityById, type Material, type Printer, type Quality } from "./print";
import { SLOT_CHOICES, type ColourSlots } from "./slots";
import { DEFAULT_PALETTE_ID, PALETTES } from "./palettes";
import type { Variant } from "./types";

/**
 * The download contract, in one place.
 *
 * Four endpoints and one component all speak this query string. When each
 * wrote its own version they drifted: the browser was sending a `finish`
 * parameter that no route read, and the size clamp was spelled two different
 * ways. Parsing and building it here means a new option lands once.
 */

export const MIN_SIZE_MM = 60;
export const MAX_SIZE_MM = 400;

/** Which window of time the object covers. */
export type ModelSpan = "year" | "lifetime" | "range";
/** What the object is a picture of: an account, or one repository. */
export type ModelSubject = "user" | "repo";

/** GitHub repository names: word characters, dots and dashes. */
export const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ModelRequest {
  login: string;
  year: number;
  variant: Variant;
  sizeMm: number;
  printer: Printer;
  material: Material;
  quality: Quality;
  slots: ColourSlots;
  /** The finish the viewer chose. Optional: a shared link without it falls back to the default. */
  paletteId: string;
  /** Outlier compression 0..1. Optional; a link without it defaults to 0. M13. */
  dampening: number;
  /** year (default), lifetime, or an arbitrary from/to range. M11/M12/M13. */
  span: ModelSpan;
  /** Only meaningful when span is "range"; empty strings otherwise. */
  from: string;
  to: string;
  /** user (default) or a single repository's commit skyline. M14. */
  subject: ModelSubject;
  /** Only meaningful when subject is "repo"; empty strings otherwise. */
  repoOwner: string;
  repoName: string;
}

/** Bump this if the query shape changes, so a link built before the change still parses. */
export const SHARE_VERSION = 1 as const;

export function parseModelRequest(url: URL): ModelRequest {
  const variant = url.searchParams.get("variant") ?? "";
  const slots = Number(url.searchParams.get("slots"));
  const paletteId = url.searchParams.get("palette") ?? "";
  const dampening = Number(url.searchParams.get("dampening"));
  // Subject and span both degrade to the single-year user default when their
  // supporting parameters are missing or malformed: a hand-edited link gets
  // the plainest valid object, never an error from the parser itself.
  const repoOwner = url.searchParams.get("owner") ?? "";
  const repoName = url.searchParams.get("repo") ?? "";
  const subject: ModelSubject =
    url.searchParams.get("subject") === "repo" && LOGIN_RE.test(repoOwner) && REPO_RE.test(repoName)
      ? "repo"
      : "user";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const rawSpan = url.searchParams.get("span");
  const span: ModelSpan =
    rawSpan === "lifetime"
      ? "lifetime"
      : rawSpan === "range" && DATE_RE.test(from) && DATE_RE.test(to)
        ? "range"
        : "year";
  return {
    login: url.searchParams.get("login") ?? "",
    year: parseYear(url.searchParams.get("year")),
    variant: (VARIANTS.some((v) => v.id === variant) ? variant : "skyline") as Variant,
    sizeMm: Math.min(
      MAX_SIZE_MM,
      Math.max(MIN_SIZE_MM, Number(url.searchParams.get("mm")) || sizeById(DEFAULT_SIZE_ID).mm),
    ),
    printer: printerById(url.searchParams.get("printer") ?? ""),
    material: materialById(url.searchParams.get("material") ?? ""),
    quality: qualityById(url.searchParams.get("quality") ?? ""),
    slots: (SLOT_CHOICES.some((c) => c.slots === slots) ? slots : 1) as ColourSlots,
    // A palette that does not exist degrades to the default rather than erroring.
    paletteId: PALETTES.some((p) => p.id === paletteId) ? paletteId : DEFAULT_PALETTE_ID,
    // Dampening outside 0..1 is meaningless; clamp it so a hand-edited link cannot
    // produce a broken object. M13.
    dampening: Number.isFinite(dampening) ? Math.min(1, Math.max(0, dampening)) : 0,
    span,
    from: span === "range" ? from : "",
    to: span === "range" ? to : "",
    subject,
    repoOwner: subject === "repo" ? repoOwner : "",
    repoName: subject === "repo" ? repoName : "",
  };
}

export interface ModelQuery {
  login: string;
  year: number;
  variant: string;
  sizeMm: number;
  printerId?: string;
  materialId?: string;
  qualityId?: string;
  slots?: number;
  paletteId?: string;
  dampening?: number;
  span?: ModelSpan;
  from?: string;
  to?: string;
  subject?: ModelSubject;
  repoOwner?: string;
  repoName?: string;
}

/** The other half of the contract, so the browser cannot invent a parameter. */
export function modelQuery(input: ModelQuery): string {
  const params = new URLSearchParams({
    login: input.login,
    year: String(input.year),
    variant: input.variant,
    mm: String(input.sizeMm),
  });
  if (input.printerId) params.set("printer", input.printerId);
  if (input.materialId) params.set("material", input.materialId);
  if (input.qualityId) params.set("quality", input.qualityId);
  if (input.slots) params.set("slots", String(input.slots));
  if (input.paletteId) params.set("palette", input.paletteId);
  if (input.dampening) params.set("dampening", String(input.dampening));
  // Subject and span, only when they differ from the default. A repo object
  // has no meaningful span; the parameters are mutually exclusive by design.
  if (input.subject === "repo" && input.repoOwner && input.repoName) {
    params.set("subject", "repo");
    params.set("owner", input.repoOwner);
    params.set("repo", input.repoName);
  } else if (input.span === "lifetime") {
    params.set("span", "lifetime");
  } else if (input.span === "range" && input.from && input.to) {
    params.set("span", "range");
    params.set("from", input.from);
    params.set("to", input.to);
  }
  return params.toString();
}

/**
 * The "Open in Bambu Studio" hand-off. Bambu Studio registers the
 * `bambustudioopen:` scheme, and it fetches the model itself from a URL, so we
 * hand it an absolute https URL to our own 3MF endpoint — never a local path,
 * never a `file:` or `javascript:` scheme. F0: this is the one place in the app
 * that launches an external local app, so it is the single choke point that
 * must refuse anything that is not a clean https origin.
 */
export function buildBambuLink(origin: string, query: string, login: string, year: number): string {
  let safe: URL;
  try {
    safe = new URL(origin);
  } catch {
    throw new Error("refusing to build a Bambu link from a non-URL origin");
  }
  if (safe.protocol !== "https:" && safe.protocol !== "http:") {
    throw new Error(`refusing to hand a ${safe.protocol} origin to a local app`);
  }
  const model = `${safe.origin}/api/3mf?${query}`;
  const name = `monolith-${login}-${year}.3mf`;
  return `bambustudioopen://open?file=${encodeURIComponent(model)}&name=${encodeURIComponent(name)}`;
}
