import { addDays, format } from 'date-fns';

/**
 * The program always starts on a Saturday: day 1 = Saturday, so every week's
 * content opens on a Saturday and its habits the Sunday after.
 */
export const SATURDAY = 6;

/** The given day if it's a Saturday, otherwise the next Saturday (yyyy-MM-dd). */
export function nextSaturday(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return format(addDays(d, (SATURDAY - d.getDay() + 7) % 7), 'yyyy-MM-dd');
}

export const isSaturday = (ymd: string) => new Date(`${ymd}T12:00:00`).getDay() === SATURDAY;
