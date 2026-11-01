import { format } from 'date-fns';

export interface WeightEntry {
  id: string;
  recorded_at: string;
  weight: number;
  created_at?: string | null;
}

/** 6085 → "6,085" */
export const formatNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/** 78.25 → "78.3", 80 → "80" */
export const formatKg = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** recorded_at is a plain yyyy-MM-dd date; parse it as local midnight, not UTC. */
export const parseDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00`);

export const dayLabel = (day: string) => format(parseDay(day), 'd/M');

/** Weigh-ins oldest → newest; same-day entries ordered by insert time. */
export function sortWeights(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.recorded_at.localeCompare(b.recorded_at) ||
      (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );
}

/** The last weigh-in on or before `day`, if any. */
export function weightOnOrBefore(sorted: WeightEntry[], day: string): number | null {
  let found: number | null = null;
  for (const w of sorted) {
    if (w.recorded_at.slice(0, 10) <= day.slice(0, 10)) found = w.weight;
    else break;
  }
  return found;
}
