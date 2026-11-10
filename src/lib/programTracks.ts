import { addDays, format } from 'date-fns';

/**
 * The program's length, chosen per trainee when they're added. Whole weeks,
 * since every week starts on a Saturday: 6 months = 26 weeks, 10 = 40.
 * Stored as profiles.plan_duration_days.
 */
export const TRACKS = [
  { days: 26 * 7, label: '6 חודשים' },
  { days: 40 * 7, label: '10 חודשים' },
] as const;

/** "6 חודשים" / "10 חודשים", or "N שבועות" for a length set any other way. */
export function trackLabel(days: number | null | undefined): string {
  if (!days) return '-';
  return TRACKS.find((t) => t.days === days)?.label ?? `${Math.round(days / 7)} שבועות`;
}

/** The program's last day (yyyy-MM-dd) for a start date and a length. */
export function programEnd(startYmd: string, days: number): string {
  return format(addDays(new Date(`${startYmd}T12:00:00`), days - 1), 'yyyy-MM-dd');
}
