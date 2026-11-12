// The client told the bot when he'll do today's workout / walk ("I'll do it at 18:00"):
// the bot marks it [שעה_היום אימון 18:00] and today's time in the app's calendar moves there
// (calendar_placements, a 'date' placement for today, as when he drags it in the app).
// The bot's "did it happen?" check then follows the new time (bot-jobs/talk.ts).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, any>;

export interface TodayTime { kind: 'workout' | 'walk'; time: string }

/** [שעה_היום אימון 18:00] / [שעה_היום הליכה 7:30] */
export const TODAY_TIME_RE = /\[שעה_היום\s+(אימון|הליכה)\s+(\d{1,2})[:.](\d{2})\]/g;

export function readTodayTimes(text: string): TodayTime[] {
  const out: TodayTime[] = [];
  for (const m of text.matchAll(TODAY_TIME_RE)) {
    const h = Number(m[2]);
    const min = Number(m[3]);
    if (h > 23 || min > 59) continue;
    out.push({ kind: m[1] === 'הליכה' ? 'walk' : 'workout', time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
  }
  return out;
}

function israelToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday };
}

/** Moves today's workout(s) / walk to the time he said. Only what's planned for today. */
export async function setTodayTimes(db: SupabaseClient, userId: string | null, times: TodayTime[]): Promise<string[]> {
  if (!userId || !times.length) return [];
  const { date, weekday } = israelToday();
  const moved: string[] = [];
  for (const t of times) {
    let keys: string[] = [];
    if (t.kind === 'workout') {
      const { data } = await db.from('workout_day_schedule').select('plan_day_id').eq('user_id', userId).eq('weekday', weekday);
      keys = ((data ?? []) as Row[]).map((r) => `workout:${r.plan_day_id}`);
    } else {
      const { data } = await db.from('user_walking_schedule').select('id').eq('user_id', userId).eq('is_active', true).eq('day_of_week', weekday).limit(1);
      if ((data ?? []).length) keys = ['walk'];
    }
    // Two workouts today: the first at that time (he said one time; the app stacks the other).
    for (const key of keys.slice(0, 1)) {
      // The same as the app: today's placement replaced, the duration he had kept.
      const { data: old } = await db.from('calendar_placements').select('duration_min').eq('user_id', userId).eq('item_key', key).eq('scope', 'date').eq('day', date).maybeSingle();
      await db.from('calendar_placements').delete().eq('user_id', userId).eq('item_key', key).eq('scope', 'date').eq('day', date);
      const { error } = await db.from('calendar_placements').insert({
        user_id: userId, item_key: key, scope: 'date', day: date, start_time: t.time, duration_min: old?.duration_min ?? null,
      });
      if (error) console.error('[schedule] could not move', key, error.message);
      else moved.push(`${key}@${t.time}`);
    }
    if (!keys.length) console.log(`[schedule] nothing planned today for ${t.kind}; ${t.time} not saved`);
  }
  return moved;
}
