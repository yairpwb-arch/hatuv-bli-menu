/**
 * Where each habit lives in the app:
 * - table:   an object on the home-screen table, ticked by tapping it;
 * - summary: a question in the bedtime "daily summary";
 * - hidden:  part of the plan but never shown as something to tick.
 *
 * The key comes from habit_definitions.visual_key; rows the admin hasn't
 * tagged yet fall back to a guess from the name.
 */

export type TableKey =
  | 'water_before_meal'
  | 'plate_thirds'
  | 'plate_veggies'
  | 'plate_protein'
  | 'one_plate'
  | 'one_sauce'
  | 'olive_oil'
  | 'fruit_snack'
  | 'water_before_snack';

export type SummaryKey = 'routine_wake_eat' | 'routine_stop_eating' | 'no_sweet_drinks' | 'coffee_sugar' | 'routine_sleep';

export type HiddenKey = 'slow_eating' | 'meals_4';

export type VisualKey = TableKey | SummaryKey | HiddenKey;

const TABLE_KEYS: TableKey[] = [
  'water_before_meal', 'plate_thirds', 'plate_veggies', 'plate_protein', 'one_plate', 'one_sauce',
  'olive_oil', 'fruit_snack', 'water_before_snack',
];
/** In the order they're asked; the summary shows at most 4. */
export const SUMMARY_KEYS: SummaryKey[] = ['routine_wake_eat', 'routine_stop_eating', 'no_sweet_drinks', 'coffee_sugar', 'routine_sleep'];
const HIDDEN_KEYS: HiddenKey[] = ['slow_eating', 'meals_4'];
const ALL_KEYS: string[] = [...TABLE_KEYS, ...SUMMARY_KEYS, ...HIDDEN_KEYS];

export const isTableKey = (k: VisualKey | null): k is TableKey => !!k && (TABLE_KEYS as string[]).includes(k);
export const isSummaryKey = (k: VisualKey | null): k is SummaryKey => !!k && (SUMMARY_KEYS as string[]).includes(k);
export const isHiddenKey = (k: VisualKey | null): k is HiddenKey => !!k && (HIDDEN_KEYS as string[]).includes(k);


export function resolveVisualKey(stored: string | null | undefined): VisualKey | null {
  return stored && ALL_KEYS.includes(stored) ? (stored as VisualKey) : null;
}

/** Short tag names (up to 3 words) so 2–3 fit per row; the full name shows on long press. */
const SHORT_LABELS: Record<TableKey, string> = {
  water_before_meal: '2 כוסות מים',
  one_sauce: 'רוטב אחד',
  one_plate: 'צלחת אחת',
  plate_thirds: 'שליש-שליש-שליש',
  plate_veggies: 'ירקות בכל ארוחה',
  plate_protein: 'חלבון בכל ארוחה',
  fruit_snack: 'מאכלים בריאים',
  water_before_snack: 'מים לפני נשנוש',
  olive_oil: 'שמן זית',
};

export function shortLabel(h: { name: string; visual_key: VisualKey | null }): string {
  if (isTableKey(h.visual_key)) return SHORT_LABELS[h.visual_key];
  return h.name.split(/\s+/).slice(0, 3).join(' ');
}

/*
 * Table geometry, in units of the table's width (W), so spacing holds at any
 * screen size: a laid table, plate in the middle, fork left and knife right,
 * and the habit objects in the four corners, clear of both (12px+ at the
 * usual ~260px table, i.e. about 0.046 W).
 */

/** Table height ÷ width. */
export const TABLE_H = 0.81;

/** Plate centre and diameter. */
export const PLATE = { cx: 0.5, cy: 0.4, d: 0.4 };

/** Fork and knife: 90% of the plate's diameter long, ~10px from the rim. */
export const CUTLERY = { length: PLATE.d * 0.9, gap: 0.035 };

/** Each corner object's centre, width, and height÷width of its drawing. */
export const TABLE_SLOTS: Record<Exclude<TableKey, 'plate_thirds' | 'plate_veggies' | 'plate_protein' | 'one_plate'>, { cx: number; cy: number; w: number; ratio: number }> = {
  // top-left
  water_before_meal: { cx: 0.15, cy: 0.1, w: 0.235, ratio: 80 / 122 },
  // top-right
  one_sauce: { cx: 0.855, cy: 0.095, w: 0.15, ratio: 1 },
  // bottom-left: the apple with the small glass beside it
  fruit_snack: { cx: 0.105, cy: 0.705, w: 0.15, ratio: 1 },
  water_before_snack: { cx: 0.25, cy: 0.715, w: 0.12, ratio: 80 / 64 },
  // bottom-right
  olive_oil: { cx: 0.9, cy: 0.705, w: 0.09, ratio: 2 },
};

/** CSS position (in % of the table box) for a centre given in W units. */
/** Tap area over an object: the drawing's box, but never under 44×44px. */
export const hitAreaAt = (cx: number, cy: number, w: number, ratio: number) => ({
  left: `${cx * 100}%`,
  top: `${(cy / TABLE_H) * 100}%`,
  width: `max(${w * 100}%, 44px)`,
  height: `max(${((w * ratio) / TABLE_H) * 100}%, 44px)`,
});

export const placeAt = (cx: number, cy: number, w: number) => ({
  left: `${cx * 100}%`,
  top: `${(cy / TABLE_H) * 100}%`,
  width: `${w * 100}%`,
});
