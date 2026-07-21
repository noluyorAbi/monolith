/**
 * Real spool colours, so a choice on screen maps to something orderable
 * rather than to an arbitrary hex. Names and values follow Bambu Lab's
 * PLA Basic range.
 */
export interface Swatch {
  id: string;
  name: string;
  hex: string;
  /** Light swatches need dark text sitting on them. */
  light?: boolean;
}

export const SWATCHES: Swatch[] = [
  { id: "black", name: "Black", hex: "#1a1a1a" },
  { id: "jade-white", name: "Jade White", hex: "#f4f4f4", light: true },
  { id: "silver", name: "Silver", hex: "#a6a9aa", light: true },
  { id: "gray", name: "Gray", hex: "#8e9089", light: true },
  { id: "bambu-green", name: "Bambu Green", hex: "#00ae42" },
  { id: "mistletoe", name: "Mistletoe Green", hex: "#3f8e43" },
  { id: "cyan", name: "Cyan", hex: "#0086d6" },
  { id: "blue", name: "Blue", hex: "#0a2989" },
  { id: "purple", name: "Purple", hex: "#5e43b7" },
  { id: "magenta", name: "Magenta", hex: "#ec008c" },
  { id: "red", name: "Red", hex: "#c12e1f" },
  { id: "orange", name: "Orange", hex: "#ff6a13" },
  { id: "yellow", name: "Yellow", hex: "#f4ee2a", light: true },
  { id: "gold", name: "Gold", hex: "#e4bd68", light: true },
];

export function swatchById(id: string): Swatch {
  return SWATCHES.find((s) => s.id === id) ?? SWATCHES[0];
}

/**
 * Defaults per filament slot: a dark plinth and a green ramp, which is the
 * arrangement the viewer shows and the one that reads from across a room.
 */
export const DEFAULT_SLOT_COLOURS = ["black", "mistletoe", "bambu-green", "yellow"];
