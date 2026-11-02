import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { CALENDAR_CHANGED } from '@/lib/localReminders';

// calendar_placements isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** A moved recurring item: "only this date" or "every <weekday>" (from a date on). */
export interface Placement {
  item_key: string;
  scope: 'date' | 'weekday';
  day: string | null;
  weekday: number | null;
  /** "HH:MM" */
  start_time: string;
  duration_min: number | null;
  /** weekday scope: applies from this day (yyyy-MM-dd); earlier days keep the previous time. */
  valid_from?: string;
}

/** All of the trainee's placements. */
export async function fetchPlacements(userId: string): Promise<{ list: Placement[] }> {
  const { data, error } = await db
    .from('calendar_placements')
    .select('item_key, scope, day, weekday, start_time, duration_min, valid_from')
    .eq('user_id', userId);
  if (error) console.error('[placements] load failed:', error.message);
  return { list: ((data ?? []) as Placement[]).map((p) => ({ ...p, start_time: p.start_time.slice(0, 5) })) };
}

/**
 * The placement for an item on a day: the date's own, else the latest weekday
 * time that had already started by then. A "today only" move always wins.
 */
export function placementFor(list: Placement[], itemKey: string, day: string, weekday: number): Placement | null {
  const dated = list.find((p) => p.item_key === itemKey && p.scope === 'date' && p.day === day);
  if (dated) return dated;
  return (
    list
      .filter((p) => p.item_key === itemKey && p.scope === 'weekday' && p.weekday === weekday && (p.valid_from ?? '0000') <= day)
      .sort((a, b) => ((a.valid_from ?? '') < (b.valid_from ?? '') ? 1 : -1))[0] ?? null
  );
}

/**
 * Saves moves. A date replaces that date's placement; a weekday starts today
 * (replacing any weekday time that started today or later) and leaves past days alone.
 */
export async function savePlacements(userId: string, items: Placement[]): Promise<boolean> {
  const today = format(new Date(), 'yyyy-MM-dd');
  for (const p of items.map((q) => (q.scope === 'weekday' ? { ...q, valid_from: today } : q))) {
    const del =
      p.scope === 'date'
        ? db.from('calendar_placements').delete().eq('user_id', userId).eq('item_key', p.item_key).eq('scope', 'date').eq('day', p.day)
        : db.from('calendar_placements').delete().eq('user_id', userId).eq('item_key', p.item_key).eq('scope', 'weekday').eq('weekday', p.weekday).gte('valid_from', today);
    const { error } = await del;
    const ins = error ? { error } : await db.from('calendar_placements').insert({ ...p, user_id: userId });
    if (ins.error) {
      console.error('[placements] save failed:', ins.error.message);
      return false;
    }
  }
  // The workout / walk reminders follow the new time.
  window.dispatchEvent(new Event(CALENDAR_CHANGED));
  return true;
}

/** One move. */
export const savePlacement = (userId: string, p: Placement) => savePlacements(userId, [p]);
