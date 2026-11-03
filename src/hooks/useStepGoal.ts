import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { averageBefore, stepGoalFor, type StepDay } from '@/lib/stepGoal';

// steps_log isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Today's step goal (lib/stepGoal), from the trainee's steps since the start. */
export function useStepGoal() {
  const { user, currentDay, profile } = useAuth();
  const startDate = profile?.start_date ?? null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const query = useQuery({
    queryKey: ['step-days', user?.id, startDate, today],
    enabled: !!user && !!startDate,
    queryFn: async () => {
      const { data } = await db
        .from('steps_log')
        .select('date, steps')
        .eq('user_id', user!.id)
        .gte('date', startDate)
        .lt('date', today)
        .gt('steps', 0);
      return (data ?? []) as StepDay[];
    },
  });
  const days = query.data ?? [];
  return {
    goal: startDate ? stepGoalFor(currentDay, startDate, days, today) : stepGoalFor(0, today, [], today),
    average: averageBefore(days, today),
  };
}
