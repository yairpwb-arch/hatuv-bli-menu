import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { stepGoalFor } from '@/lib/stepGoal';

// steps_log isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Today's step goal (lib/stepGoal), from the trainee's average since the start. */
export function useStepGoal() {
  const { user, currentDay, profile } = useAuth();
  const startDate = profile?.start_date ?? null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const query = useQuery({
    queryKey: ['step-average', user?.id, startDate, today],
    enabled: !!user && !!startDate,
    queryFn: async () => {
      // Whole days only: today is still going, and would move the goal as it does.
      const { data } = await db
        .from('steps_log')
        .select('steps')
        .eq('user_id', user!.id)
        .gte('date', startDate)
        .lt('date', today)
        .gt('steps', 0);
      const rows = (data ?? []) as { steps: number }[];
      return rows.length ? Math.round(rows.reduce((s, r) => s + r.steps, 0) / rows.length) : null;
    },
  });
  const average = query.data ?? null;
  return { goal: stepGoalFor(currentDay, average), average };
}
