/** Hebrew durations with correct singular/plural ("דקה", "2 דקות", "דקת מנוחה"). */

export function minutesLabel(n: number): string {
  if (n === 1) return 'דקה';
  if (n === 2) return '2 דקות';
  return `${n} דקות`;
}

export function secondsLabel(n: number): string {
  return n === 1 ? 'שנייה' : `${n} שניות`;
}

/** 60 → "דקה", 120 → "2 דקות", 90 → "90 שניות". Whole minutes only above a minute. */
export function durationLabel(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return minutesLabel(seconds / 60);
  return secondsLabel(seconds);
}

/** "דקת מנוחה" / "2 דקות מנוחה" / "90 שניות מנוחה". */
export function restLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds === 60) return 'דקת מנוחה';
  return `${durationLabel(seconds)} מנוחה`;
}

/** "3 × 8–12" (or "3 × 10" when the range is a single number). */
export function setsRepsLabel(sets: number, repsMin: number, repsMax: number): string {
  return repsMin === repsMax ? `${sets} × ${repsMin}` : `${sets} × ${repsMin}–${repsMax}`;
}
