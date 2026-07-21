export type ColourSlots = 1 | 2 | 4;

export const SLOT_CHOICES: { slots: ColourSlots; name: string; note: string }[] = [
  { slots: 1, name: "One colour", note: "Any printer. Nothing to set up." },
  { slots: 2, name: "Two", note: "Plinth in one colour, the year in another." },
  { slots: 4, name: "Four", note: "A base plus a three step ramp. AMS or MMU." },
];

/**
 * Which filament a part belongs to.
 *
 * Four slots buy a base colour plus a three step ramp rather than four nearly
 * identical greens, which is what actually reads from across a room.
 */
export function slotForLevel(level: number, slots: ColourSlots): number {
  if (slots === 1) return 1;
  if (level < 0) return 1;
  if (slots === 2) return 2;
  if (level <= 2) return 2;
  if (level === 3) return 3;
  return 4;
}
