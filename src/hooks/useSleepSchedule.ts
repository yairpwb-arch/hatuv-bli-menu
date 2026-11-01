import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Answers } from '@/lib/onboarding';
import {
  DEFAULT_SLEEP, SleepSchedule, hhmm, readCachedSleep, sleepFromAnswers, writeCachedSleep,
} from '@/lib/sleepSchedule';

// sleep_time / wake_time and onboarding_responses aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const sleepQueryKey = (userId: string | undefined) => ['sleep-schedule', userId];

/** Profile values first, then the intake questionnaire, then 23:00–07:00. */
export async function fetchSleepSchedule(userId: string): Promise<SleepSchedule> {
  const [profile, onboarding] = await Promise.all([
    db.from('profiles').select('sleep_time, wake_time').eq('id', userId).maybeSingle(),
    db.from('onboarding_responses').select('answers').eq('user_id', userId).maybeSingle(),
  ]);
  const fromQuestionnaire = sleepFromAnswers((onboarding.data?.answers ?? null) as Answers | null);
  const s = {
    bed: hhmm(profile.data?.sleep_time) ?? fromQuestionnaire.bed,
    wake: hhmm(profile.data?.wake_time) ?? fromQuestionnaire.wake,
  };
  writeCachedSleep(userId, s);
  return s;
}

export function useSleepSchedule(userId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: sleepQueryKey(userId),
    enabled: !!userId,
    queryFn: () => fetchSleepSchedule(userId!),
    initialData: userId ? readCachedSleep(userId) ?? undefined : undefined,
    // The cache is only a head start; always confirm with the server once.
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
  });

  const save = async (next: SleepSchedule): Promise<boolean> => {
    if (!userId) return false;
    const { error } = await db.from('profiles').update({ sleep_time: next.bed, wake_time: next.wake }).eq('id', userId);
    if (error) {
      console.error('[sleep] save failed:', error.message);
      return false;
    }
    writeCachedSleep(userId, next);
    queryClient.setQueryData(sleepQueryKey(userId), next);
    return true;
  };

  return {
    schedule: query.data ?? DEFAULT_SLEEP,
    isLoading: !query.data && query.isLoading,
    /** The server answered at least once (the cached value may be stale before that). */
    isReady: query.isFetched,
    save,
  };
}
