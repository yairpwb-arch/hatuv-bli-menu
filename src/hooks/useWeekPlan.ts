import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import { useActivityUnlocks } from '@/hooks/useActivityUnlocks';
import { deleteWorkoutSession, unmarkActivity } from '@/lib/activityMarks';
import { CALENDAR_CHANGED } from '@/lib/localReminders';

// These tables aren't all in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface WalkEntry {
  id: string;
  walk_number: 1 | 2;
  week_start: number;
  day_of_week: number | null;
  is_active: boolean;
}

export type ActivitySource = 'manual' | 'late' | 'health' | 'watch';

/** The current Sunday–Saturday week as yyyy-MM-dd strings. */
export function currentWeekDates(today = new Date()): string[] {
  const start = startOfWeek(today, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
}

/** Schedules, this week's logs and every plan day's exercises — what the "this week" view needs. */
export function useWeekPlan(userId: string | undefined, currentWeek: number, planDays: WorkoutPlanDay[]) {
  const queryClient = useQueryClient();
  const week = currentWeekDates();
  const { unlocked, isLoading: unlocksLoading } = useActivityUnlocks(userId);

  const schedule = useQuery({
    queryKey: ['workout-day-schedule', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await db.from('workout_day_schedule').select('plan_day_id, weekday').eq('user_id', userId);
      return (data ?? []) as { plan_day_id: string; weekday: number }[];
    },
  });

  const walks = useQuery({
    queryKey: ['walking-schedule', userId, currentWeek, [...unlocked].sort().join()],
    enabled: !!userId && !unlocksLoading,
    queryFn: async () => {
      const { data: existing } = await db.from('user_walking_schedule').select('*').eq('user_id', userId).order('walk_number');
      let list = (existing || []) as WalkEntry[];

      // A walk opens when its video is watched (week 1, week 4).
      for (const [number, weekStart] of [[1, 1], [2, 4]] as const) {
        if (!unlocked.has(`walk_${number}`) || list.find((w) => w.walk_number === number)) continue;
        const { data } = await db.from('user_walking_schedule').insert({ user_id: userId, walk_number: number, week_start: weekStart }).select().single();
        if (data) list = [...list, data as WalkEntry];
      }
      // One with a day already chosen stays; one without waits for its video.
      return {
        active: list
          .filter((w) => w.is_active && (w.day_of_week !== null || unlocked.has(`walk_${w.walk_number}`)))
          .sort((a, b) => a.walk_number - b.walk_number),
        removed: list.filter((w) => !w.is_active),
      };
    },
  });

  const logs = useQuery({
    queryKey: ['activity-week', userId, week[0]],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('activity_type, completed_at')
        .eq('user_id', userId!)
        .gte('completed_at', week[0])
        .lte('completed_at', week[6]);
      return (data ?? []) as { activity_type: string; completed_at: string }[];
    },
  });

  const dayIds = planDays.map((d) => d.id);
  const exercises = useQuery({
    queryKey: ['plan-exercises-all', dayIds.join(',')],
    enabled: dayIds.length > 0,
    queryFn: async () => {
      const { data } = await db
        .from('workout_plan_exercises')
        .select('*, exercises(*)')
        .in('plan_day_id', dayIds)
        .order('sort_order', { ascending: true });
      const byDay: Record<string, WorkoutPlanExercise[]> = {};
      for (const pe of (data ?? []) as WorkoutPlanExercise[]) (byDay[pe.plan_day_id] ??= []).push(pe);
      return byDay;
    },
  });

  /** Marks a walk (or workout) done for a date. `late` = ticked after the day passed. */
  const markActivity = async (type: 'walk' | 'workout', date: string, source: ActivitySource) => {
    if (!userId) return false;
    const row = { user_id: userId, activity_type: type, completed_at: date };
    const { error } = await db.from('activity_log').insert({ ...row, source });
    if (error && error.code !== '23505') {
      console.error('[week] mark failed:', error.message);
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ['activity-week', userId] });
    return true;
  };

  /** Everything that shows a mark: this week's ticks, finished workouts (dots, cards, weekly summary). */
  const refreshMarks = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['activity-week', userId] }),
      queryClient.invalidateQueries({ queryKey: ['workout-sessions', userId] }),
    ]);

  /** Undoes a walk/workout tick for a day. */
  const unmark = async (type: 'walk' | 'workout', date: string) => {
    if (!userId) return false;
    const ok = await unmarkActivity(userId, type, date);
    await refreshMarks();
    return ok;
  };

  /** Undoes a finished workout, sets included. */
  const unmarkWorkoutSession = async (sessionId: string, date: string) => {
    if (!userId) return false;
    const ok = await deleteWorkoutSession(userId, sessionId, date);
    await refreshMarks();
    return ok;
  };

  /** Takes a walk out of the plan, or puts it back (its day is kept). */
  const setWalkActive = async (id: string, active: boolean) => {
    const { error } = await db.from('user_walking_schedule').update({ is_active: active }).eq('id', id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['walking-schedule', userId] }),
      queryClient.invalidateQueries({ queryKey: ['walk-days', userId] }),
    ]);
    window.dispatchEvent(new Event(CALENDAR_CHANGED));
    return !error;
  };

  /** Saves the weekday of every workout and walk at once (null = no day). */
  const saveDays = async (workoutDays: Map<string, number | null>, walkDays: Map<string, number | null>) => {
    if (!userId) return;
    await Promise.all([
      ...Array.from(workoutDays.entries()).map(([planDayId, weekday]) =>
        weekday === null
          ? db.from('workout_day_schedule').delete().eq('user_id', userId).eq('plan_day_id', planDayId)
          : db.from('workout_day_schedule').upsert({ user_id: userId, plan_day_id: planDayId, weekday }, { onConflict: 'user_id,plan_day_id' }),
      ),
      ...Array.from(walkDays.entries()).map(([id, day]) => db.from('user_walking_schedule').update({ day_of_week: day }).eq('id', id)),
    ]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workout-day-schedule', userId] }),
      queryClient.invalidateQueries({ queryKey: ['walking-schedule', userId] }),
      queryClient.invalidateQueries({ queryKey: ['unified-workout-days', userId] }),
      queryClient.invalidateQueries({ queryKey: ['today-workout', userId] }),
      queryClient.invalidateQueries({ queryKey: ['walk-days', userId] }),
    ]);
    window.dispatchEvent(new Event(CALENDAR_CHANGED));
  };

  return {
    week,
    schedule: schedule.data ?? [],
    walks: walks.data?.active ?? [],
    removedWalks: walks.data?.removed ?? [],
    setWalkActive,
    logs: logs.data ?? [],
    exercisesByDay: exercises.data ?? {},
    isLoading: schedule.isLoading || walks.isLoading || unlocksLoading || logs.isLoading || (dayIds.length > 0 && exercises.isLoading),
    markActivity,
    unmark,
    unmarkWorkoutSession,
    refreshMarks,
    saveDays,
  };
}
