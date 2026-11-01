import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledHabitDef } from '@/lib/habitSchedule';

// schedule_rule / meal_times aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface HabitScheduleData {
  startDate: string | null;
  habits: ScheduledHabitDef[];
  /** The trainee's own meal times by meal key ("HH:MM"), from profiles.meal_times. */
  mealTimes: Record<string, string>;
}

export const habitScheduleKey = (userId: string | undefined) => ['habit-schedule', userId];

export async function fetchHabitSchedule(userId: string): Promise<HabitScheduleData> {
  const [profile, habits] = await Promise.all([
    db.from('profiles').select('start_date, meal_times').eq('id', userId).maybeSingle(),
    db.from('habit_definitions').select('*').or(`user_id.is.null,user_id.eq.${userId}`),
  ]);
  return {
    startDate: profile.data?.start_date ?? null,
    habits: (habits.data ?? []) as ScheduledHabitDef[],
    mealTimes: profile.data?.meal_times ?? {},
  };
}

/** Timed habits + the trainee's meal times, cached across screens. */
export function useHabitSchedule(userId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: habitScheduleKey(userId),
    queryFn: () => fetchHabitSchedule(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  /** Saves the trainee's own meal times (an empty object = back to the recommended times). */
  const saveMealTimes = async (times: Record<string, string>) => {
    if (!userId) return false;
    const { error } = await db.from('profiles').update({ meal_times: times }).eq('id', userId);
    if (error) return false;
    queryClient.setQueryData(habitScheduleKey(userId), (d: HabitScheduleData | undefined) => (d ? { ...d, mealTimes: times } : d));
    return true;
  };

  return { data: query.data, isLoading: query.isLoading, saveMealTimes };
}
