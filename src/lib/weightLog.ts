import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/** Window event: a weight was saved (the home card, the progress chart and the reminders refresh). */
export const WEIGHT_CHANGED = 'weight-changed';

/**
 * One weigh-in per day: a day that already has a weight gets it replaced (no second row).
 * Extra rows left from before for that day are removed. profiles.current_weight follows by trigger.
 */
export async function saveDayWeight(userId: string, weight: number, day: string = format(new Date(), 'yyyy-MM-dd')): Promise<{ error: string | null }> {
  const { data: rows, error: readError } = await supabase.from('weight_log').select('id').eq('user_id', userId).eq('recorded_at', day).order('created_at', { ascending: true });
  if (readError) return { error: readError.message };
  const [first, ...extra] = (rows ?? []) as { id: string }[];
  const { error } = first
    ? await supabase.from('weight_log').update({ weight }).eq('id', first.id)
    : await supabase.from('weight_log').insert({ user_id: userId, weight, recorded_at: day });
  if (error) return { error: error.message };
  if (extra.length) await supabase.from('weight_log').delete().in('id', extra.map((r) => r.id));
  window.dispatchEvent(new Event(WEIGHT_CHANGED));
  return { error: null };
}

/** Weighed in on that day already? */
export async function weighedOn(userId: string, day: string = format(new Date(), 'yyyy-MM-dd')): Promise<boolean> {
  const { data } = await supabase.from('weight_log').select('id').eq('user_id', userId).eq('recorded_at', day).limit(1);
  return (data ?? []).length > 0;
}
