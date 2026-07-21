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
 *
 * The ramp used to top out at #1d2429, which against a #060708 page left the
 * object as a smudge: you could not tell where it began or ended. It is still
 * colourless, but each step now separates against the void and against the
 * one below it.
 */
export const GHOST_PALETTE: Palette = {
  id: "ghost",
  name: "Ghost",
  base: "#0f1215",
  ramp: ["#15191d", "#1d2329", "#272f36", "#333d46", "#414d58"],
  roughness: 0.9,
  metalness: 0.05,
  glow: 0.1,
  rim: 0.5,
};

/**
 * The finish the landing page shows before a handle is typed.
 *
 * The ghost above is a grey the object almost disappears into, which was right
 * while the object sat behind the headline and wrong now that it has a column
 * of its own: what the landing sells is a year of contributions, so the landing
 * has to show one. This is the default finish with the glow pulled back, so it
 * reads as the product at rest rather than as a second, brighter product.
 */
export const AMBIENT_PALETTE: Palette = {
  ...(PALETTES.find((p) => p.id === "signal") ?? PALETTES[0]),
  id: "ambient",
  name: "Ambient",
  glow: 0.26,
  rim: 0.46,
};

export const DEFAULT_PALETTE_ID = "signal";

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? defaultPalette();
}

/** The palette the viewer opens with, and the one the artwork must match. */
export function defaultPalette(): Palette {
  return PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID) ?? PALETTES[0];
}
