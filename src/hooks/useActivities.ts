import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { tallyType, type ActivityKind } from '@/lib/activityKinds';
import { CALENDAR_CHANGED } from '@/lib/localReminders';

// activities isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  custom_name: string | null;
  status: 'done' | 'planned';
  started_at: string;
  day: string;
  duration_min: number | null;
  distance_m: number | null;
  intensity: 'easy' | 'medium' | 'hard' | null;
  note: string | null;
  source: 'manual' | 'gps' | 'player' | 'watch';
  replaces: 'workout' | 'walk' | null;
  session_id: string | null;
  steps: number | null;
  calories: number | null;
  avg_pace_sec_km?: number | null;
}

export type ActivityInput = Omit<ActivityRow, 'id' | 'day' | 'status' | 'steps' | 'calories' | 'session_id' | 'avg_pace_sec_km'> & {
  session_id?: string | null;
  steps?: number | null;
  calories?: number | null;
  avg_pace_sec_km?: number | null;
};

export const activitiesKey = (userId: string | undefined) => ['activities', userId];

/**
 * The trainee's activities (last 90 days). Every one done counts like a
 * workout or a walk that day — activity_log keeps the streak, the week strip
 * and the weekly summary in step without changing how they're counted.
 */
export function useActivities(userId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: activitiesKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ActivityRow[]> => {
      const since = format(addDays(new Date(), -90), 'yyyy-MM-dd');
      const { data, error } = await db
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .gte('day', since)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: activitiesKey(userId) }),
      queryClient.invalidateQueries({ queryKey: ['activity-week', userId] }),
      queryClient.invalidateQueries({ queryKey: ['workout-sessions', userId] }),
    ]);

  /** That day counts as a workout / walk done (one tick per type per day, like before). */
  const tick = async (type: 'walk' | 'workout', day: string) => {
    const { error } = await db.from('activity_log').insert({ user_id: userId, activity_type: type, completed_at: day, source: 'manual' });
    if (error && error.code !== '23505') console.error('[activities] tick failed:', error.message);
  };

  /** Removes a day's tick when nothing else that day still accounts for it. */
  const untickIfAlone = async (type: 'walk' | 'workout', day: string, exceptId?: string) => {
    const { data: others } = await db.from('activities').select('id, kind').eq('user_id', userId).eq('day', day).eq('status', 'done');
    const stillThere = ((others ?? []) as { id: string; kind: string }[]).some((a) => a.id !== exceptId && tallyType(a.kind) === type);
    if (stillThere) return;
    if (type === 'workout') {
      const { count } = await db
        .from('workout_session_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('completed_at', new Date(`${day}T00:00:00`).toISOString())
        .lt('completed_at', addDays(new Date(`${day}T00:00:00`), 1).toISOString());
      if (count) return;
    }
    await db.from('activity_log').delete().eq('user_id', userId).eq('activity_type', type).eq('completed_at', day);
  };

  /** Saves an activity that was done (new, or an edit of an existing one). */
  const save = async (input: ActivityInput, existing?: ActivityRow | null): Promise<string | null> => {
    if (!userId) return null;
    const row = { ...input, user_id: userId, status: 'done', day: format(new Date(input.started_at), 'yyyy-MM-dd') };
    const res = existing
      ? await db.from('activities').update(row).eq('id', existing.id).select('id, day').single()
      : await db.from('activities').insert(row).select('id, day').single();
    if (res.error) {
      console.error('[activities] save failed:', res.error.message);
      return null;
    }
    await tick(tallyType(input.kind), res.data.day);
    // "This replaces today's workout / walk": the planned one counts as done too.
    if (input.replaces) await tick(input.replaces, res.data.day);
    if (existing && existing.day !== res.data.day) await untickIfAlone(tallyType(existing.kind), existing.day, existing.id);
    await refresh();
    return res.data.id as string;
  };

  const remove = async (a: ActivityRow) => {
    const { error } = await db.from('activities').delete().eq('id', a.id);
    if (error) return false;
    await untickIfAlone(tallyType(a.kind), a.day, a.id);
    if (a.replaces) await untickIfAlone(a.replaces, a.day, a.id);
    await refresh();
    return true;
  };

  /**
   * A future activity goes into the calendar as an event — once, or on fixed
   * weekdays (0 = Sunday) from its first day, until a day or with no end.
   */
  const plan = async (
    kind: ActivityKind,
    title: string,
    startsAt: Date,
    minutes: number | null,
    repeat?: { days: number[]; until: string | null } | null,
    /** A workout from "האימונים שלי": the calendar's "התחל אימון" runs it. */
    myWorkoutId?: string | null,
  ) => {
    const type = kind === 'walk' || kind === 'hike' ? 'walk' : kind === 'other' ? 'other' : 'workout';
    const row = {
      user_id: userId,
      type,
      title,
      starts_at: startsAt.toISOString(),
      ends_at: minutes ? new Date(startsAt.getTime() + minutes * 60_000).toISOString() : null,
      ...(repeat && repeat.days.length > 0
        ? { repeat_rule: 'weekly', repeat_days: [...repeat.days].sort(), repeat_until: repeat.until }
        : {}),
    };
    let { error } = await db.from('calendar_events').insert(myWorkoutId ? { ...row, my_workout_id: myWorkoutId } : row);
    // A database without the my_workout_id column yet: plan it without the link.
    if (error && myWorkoutId && /my_workout_id/.test(error.message ?? '')) ({ error } = await db.from('calendar_events').insert(row));
    // Its reminder is scheduled with the others.
    if (!error) window.dispatchEvent(new Event(CALENDAR_CHANGED));
    return !error;
  };

  return { activities: query.data ?? [], isLoading: query.isLoading, save, remove, plan, refresh };
}
