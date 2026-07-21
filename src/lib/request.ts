import { DEFAULT_SIZE_ID, VARIANTS, sizeById } from "./build";
import { parseYear } from "./contributions";
import { materialById, printerById, qualityById, type Material, type Printer, type Quality } from "./print";
import { SLOT_CHOICES, type ColourSlots } from "./slots";
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

export interface ModelRequest {
  login: string;
  year: number;
  variant: Variant;
  sizeMm: number;
  printer: Printer;
  material: Material;
  quality: Quality;
  slots: ColourSlots;
}

export function parseModelRequest(url: URL): ModelRequest {
  const variant = url.searchParams.get("variant") ?? "";
  const slots = Number(url.searchParams.get("slots"));
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
  return params.toString();
}
