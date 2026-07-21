import type { SizeId } from "./build";

export interface Finish {
  id: string;
  name: string;
  /** Plate / structural colour. */
  base: string;
  /** Contribution levels 0..4. */
  ramp: [string, string, string, string, string];
  roughness: number;
  metalness: number;
  /** How much light the contribution blocks carry on their own. */
  glow: number;
  /** Contributions needed before this finish unlocks. */
  unlockAt?: number;
  note?: string;
}

export const FINISHES: Finish[] = [
  {
    id: "signal",
    name: "Signal",
    base: "#0d1013",
    ramp: ["#1b2126", "#12603a", "#12894a", "#2fc45f", "#4dee7c"],
    roughness: 0.62,
    metalness: 0.05,
    glow: 0.55,
    note: "The colours you already know",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    base: "#08090a",
    ramp: ["#141618", "#22262a", "#363c42", "#535b64", "#7d8894"],
    roughness: 0.85,
    metalness: 0.02,
    glow: 0.22,
    note: "Matte black on black",
  },
  {
    id: "bone",
    name: "Bone",
    base: "#6d6a61",
    ramp: ["#8f8b7f", "#a9a495", "#c2bcab", "#d9d3c3", "#f2eee2"],
    roughness: 0.72,
    metalness: 0.0,
    glow: 0.1,
    note: "Cast resin, museum white",
  },
  {
    id: "titanium",
    name: "Titanium",
    base: "#2e3238",
    ramp: ["#454b52", "#5a626b", "#767f89", "#95a0ab", "#c2ccd6"],
    roughness: 0.28,
    metalness: 0.92,
    glow: 0.12,
    note: "Brushed, cold to the touch",
  },
  {
    id: "solar",
    name: "Solar",
    base: "#0e0f0a",
    ramp: ["#1f2118", "#55671d", "#8bab22", "#b4dc2a", "#dcff52"],
    roughness: 0.4,
    metalness: 0.18,
    glow: 0.7,
    note: "House colour",
  },
  {
    id: "aurum",
    name: "Aurum",
    base: "#1c1407",
    ramp: ["#33270e", "#6b4e14", "#a2761c", "#d0a12c", "#f5cf5c"],
    roughness: 0.22,
    metalness: 1.0,
    glow: 0.3,
    unlockAt: 2000,
    note: "Unlocked past 2,000 contributions",
  },
];

/**
 * The landing backdrop. Unlit graphite rather than a dimmed copy of the real
 * palette, so the object reads as raw stock and the reveal is the moment it
 * gains colour.
 */
export const GHOST_FINISH: Finish = {
  id: "ghost",
  name: "Ghost",
  base: "#0b0d0f",
  ramp: ["#0d0f11", "#101315", "#14181b", "#181d21", "#1d2429"],
  roughness: 0.94,
  metalness: 0.04,
  glow: 0.04,
};

export function finishById(id: string): Finish {
  return FINISHES.find((f) => f.id === id) ?? FINISHES[0];
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  size: SizeId;
  sizeMm: number;
  material: string;
  /** Cents, EUR. */
  price: number;
  lead: string;
  perks: string[];
  featured?: boolean;
}

export const PRODUCTS: Product[] = [
  {
    id: "print",
    name: "Print",
    tagline: "The one that lives next to your keyboard",
    size: "desk",
    sizeMm: 120,
    material: "Matte PLA, 0.08mm layers",
    price: 3900,
    lead: "Ships in 5 days",
    perks: ["120mm footprint", "Handle engraved in the plate", "Any finish", "Source STL included"],
  },
  {
    id: "object",
    name: "Object",
    tagline: "Cast, sanded, and heavy enough to notice",
    size: "shelf",
    sizeMm: 180,
    material: "Cast resin on a steel plate",
    price: 8900,
    lead: "Ships in 12 days",
    perks: [
      "180mm footprint",
      "Weighted steel base",
      "Serial number on the underside",
      "Source STL included",
    ],
    featured: true,
  },
  {
    id: "monument",
    name: "Monument",
    tagline: "For the year you will not shut up about",
    size: "statement",
    sizeMm: 260,
    material: "Machined aluminium, bead blasted",
    price: 24900,
    lead: "Ships in 21 days",
    perks: [
      "260mm footprint",
      "Solid aluminium, ~2.4kg",
      "Numbered edition card",
      "Source STL included",
    ],
  },
];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
