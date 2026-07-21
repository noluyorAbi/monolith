import type { SizeId } from "./build";

export interface Palette {
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
  /** Strength of the silhouette edge. Dark finishes need more of it. */
  rim: number;
  /** Contributions needed before this finish unlocks. */
  unlockAt?: number;
  note?: string;
}

export const PALETTES: Palette[] = [
  {
    id: "signal",
    name: "Signal",
    base: "#101418",
    ramp: ["#1b2126", "#12603a", "#12894a", "#2fc45f", "#4dee7c"],
    roughness: 0.62,
    metalness: 0.05,
    glow: 0.55,
    rim: 0.5,
    note: "The colours you already know",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    base: "#0f1114",
    ramp: ["#141618", "#22262a", "#363c42", "#535b64", "#7d8894"],
    roughness: 0.85,
    metalness: 0.02,
    glow: 0.22,
    rim: 0.62,
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
    rim: 0.16,
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
    rim: 0.3,
    note: "Brushed, cold to the touch",
  },
  {
    id: "solar",
    name: "Solar",
    base: "#141610",
    ramp: ["#1f2118", "#55671d", "#8bab22", "#b4dc2a", "#dcff52"],
    roughness: 0.4,
    metalness: 0.18,
    glow: 0.7,
    rim: 0.5,
    note: "House colour",
  },
  {
    id: "aurum",
    name: "Aurum",
    base: "#251b0a",
    ramp: ["#33270e", "#6b4e14", "#a2761c", "#d0a12c", "#f5cf5c"],
    roughness: 0.22,
    metalness: 1.0,
    glow: 0.3,
    rim: 0.34,
    unlockAt: 2000,
    note: "Unlocked past 2,000 contributions",
  },
];

/**
 * The landing backdrop. Unlit graphite rather than a dimmed copy of the real
 * palette, so the object reads as raw stock and the reveal is the moment it
 * gains colour.
 */
export const GHOST_PALETTE: Palette = {
  id: "ghost",
  name: "Ghost",
  base: "#0b0d0f",
  ramp: ["#0d0f11", "#101315", "#14181b", "#181d21", "#1d2429"],
  roughness: 0.94,
  metalness: 0.04,
  glow: 0.04,
  rim: 0.34,
};

export function paletteById(id: string): Palette {
  return PALETTES.find((f) => f.id === id) ?? PALETTES[0];
}

export interface Size {
  id: string;
  name: string;
  mm: number;
  blurb: string;
}

/**
 * What it costs us to print one and put it in the post. Not a price list: the
 * numbers below are the actual inputs, and the checkout shows them line by
 * line. There is no margin in here on purpose. If you own a printer, the file
 * is free and this page is pointless for you, which is the intended outcome.
 */
export const COST = {
  /** Bambu's own list price, EUR per gram. */
  filamentPerGram: 24.99 / 1000,
  /** Electricity at 0.35 EUR/kWh plus machine depreciation over 3000 hours. */
  machinePerHour: 0.37,
  /** Box, corner foam, label. */
  packaging: 1.8,
  /** Twenty minutes of someone's time: plate prep, removal, inspection, packing. */
  handling: 4.0,
  /** Tool changes on a four colour print purge a lot of filament. */
  multiColourPurge: 4.0,
} as const;

export const SHIPPING = [
  { id: "de", name: "Germany", price: 4.5 },
  { id: "eu", name: "Europe", price: 7.0 },
  { id: "world", name: "Rest of world", price: 14.0 },
] as const;

export type ShippingId = (typeof SHIPPING)[number]["id"];

export function shippingById(id: string) {
  return SHIPPING.find((s) => s.id === id) ?? SHIPPING[0];
}

export interface QuoteLine {
  label: string;
  detail: string;
  amount: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  shipping: number;
  total: number;
}

/** A quote built from this object's own geometry, not from a tier. */
export function quote(
  input: { grams: number; hours: number; slots: number },
  shippingId: ShippingId,
): Quote {
  const lines: QuoteLine[] = [
    {
      label: "Filament",
      detail: `${input.grams.toFixed(0)} g`,
      amount: input.grams * COST.filamentPerGram,
    },
    {
      label: "Machine time",
      detail: `${input.hours.toFixed(1)} h`,
      amount: input.hours * COST.machinePerHour,
    },
    { label: "Packaging", detail: "box and foam", amount: COST.packaging },
    { label: "Handling", detail: "prep, removal, packing", amount: COST.handling },
  ];
  if (input.slots > 1) {
    lines.push({
      label: "Colour changes",
      detail: `${input.slots} filaments, purge waste`,
      amount: COST.multiColourPurge,
    });
  }
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const shipping = shippingById(shippingId).price;
  return { lines, subtotal, shipping, total: Math.round((subtotal + shipping) * 2) / 2 };
}

export function formatPrice(euros: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}
