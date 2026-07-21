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
 * What one print actually costs us, shipped from Germany. Not a price list:
 * these are the inputs, and the checkout shows them line by line with their
 * rates. There is no margin on top. If you own a printer the files are free
 * and this page is pointless for you, which is the intended outcome.
 *
 * Every number here is meant to be edited by whoever is running the printer.
 */
export const COST = {
  /** EUR per kg. Bambu refill without the spool, which is what we rebuy. */
  filamentPerKg: 19.99,
  /** Power, wear over roughly 3000 printer hours, and a failed-print allowance. */
  machinePerHour: 0.35,
  /** Plate prep, removal, inspection, packing. */
  labourPerHour: 15.0,
  labourMinutes: 20,
  /** Box, corner foam, label. */
  packaging: 2.2,
  /** Grams flushed per filament change on a four colour plate. */
  purgeGrams: 35,
  /**
   * Tool changes dominate a multi colour print of 371 towers, so the machine
   * runs far longer than the single colour version rather than a little.
   */
  timeMultiplier: { 1: 1, 2: 1.5, 4: 2.4 } as Record<number, number>,
} as const;

/** DHL from Germany. Update when Deutsche Post moves its prices, which it will. */
export const SHIPPING = [
  { id: "de", name: "Germany", price: 5.49, detail: "DHL Paket, 2 kg" },
  { id: "eu", name: "EU", price: 13.9, detail: "DHL Paket EU" },
  { id: "world", name: "Rest of world", price: 24.9, detail: "DHL Paket International" },
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
  shippingDetail: string;
  total: number;
  /** Hours the machine is actually tied up, after colour changes. */
  hours: number;
  grams: number;
}

/** A quote built from this object's own geometry, not from a tier. */
export function quote(
  input: { grams: number; hours: number; slots: number },
  shippingId: ShippingId,
): Quote {
  const multiplier = COST.timeMultiplier[input.slots] ?? 1;
  const hours = input.hours * multiplier;
  const purge = input.slots > 1 ? COST.purgeGrams * (input.slots - 1) * 0.5 : 0;
  const grams = input.grams + purge;

  const lines: QuoteLine[] = [
    {
      label: "Filament",
      detail: `${grams.toFixed(0)} g at ${COST.filamentPerKg.toFixed(2)} EUR/kg`,
      amount: (grams / 1000) * COST.filamentPerKg,
    },
    {
      label: "Machine time",
      detail: `${hours.toFixed(1)} h at ${COST.machinePerHour.toFixed(2)} EUR/h`,
      amount: hours * COST.machinePerHour,
    },
    {
      label: "Our time",
      detail: `${COST.labourMinutes} min at ${COST.labourPerHour.toFixed(0)} EUR/h`,
      amount: (COST.labourMinutes / 60) * COST.labourPerHour,
    },
    { label: "Packaging", detail: "box, foam, label", amount: COST.packaging },
  ];

  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const post = shippingById(shippingId);
  return {
    lines,
    subtotal,
    shipping: post.price,
    shippingDetail: post.detail,
    // Rounded to the nearest 50 cents so it reads as a price, not a readout.
    total: Math.round((subtotal + post.price) * 2) / 2,
    hours,
    grams,
  };
}

export function formatPrice(euros: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}
