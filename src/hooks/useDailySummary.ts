import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SummaryAnswer } from '@/lib/dailySummary';

// daily_summaries isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DailySummaryRow {
  summary_date: string;
  answers: Record<string, SummaryAnswer>;
  habits_done: number | null;
}

export interface SummaryInput {
  answers: Record<string, SummaryAnswer>;
  energy?: number | null;
  hunger?: number | null;
  proudOf?: string | null;
}

/** The summary for one day (null = not filled in), plus sending it. */
export function useDailySummary(userId: string | undefined, day: string | null) {
  const queryClient = useQueryClient();
  const key = ['daily-summary', userId, day];

  const query = useQuery({
    queryKey: key,
    enabled: !!userId && !!day,
    queryFn: async () => {
      const { data, error } = await db
        .from('daily_summaries')
        .select('summary_date, answers, habits_done')
        .eq('user_id', userId)
        .eq('summary_date', day)
        .maybeSingle();
      if (error) console.warn('[summary] load failed:', error.message);
      return (data ?? null) as DailySummaryRow | null;
    },
  });

  /**
   * Saves the answers and mirrors them into daily_habits_log ("yes" = done
   * that day, anything else = not), so streaks and perfect days count them.
   * Returns how many habits were done that day, or null on failure.
   */
  const submit = async (input: SummaryInput): Promise<number | null> => {
    if (!userId || !day) return null;
    const entries = Object.entries(input.answers);
    const yes = entries.filter(([, a]) => a === 'yes').map(([id]) => id);
    const notYes = entries.filter(([, a]) => a !== 'yes').map(([id]) => id);

    if (yes.length) {
      const { error } = await supabase
        .from('daily_habits_log')
        .upsert(yes.map((habit_id) => ({ user_id: userId, habit_id, completed_at: day })), {
          onConflict: 'user_id,habit_id,completed_at',
          ignoreDuplicates: true,
        });
      if (error) console.warn('[summary] habit log failed:', error.message);
    }
    if (notYes.length) {
      await supabase.from('daily_habits_log').delete().eq('user_id', userId).eq('completed_at', day).in('habit_id', notYes);
    }

    const { count } = await supabase
      .from('daily_habits_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed_at', day);
    const habitsDone = count ?? yes.length;

    const { error } = await db.from('daily_summaries').upsert(
      {
        user_id: userId,
        summary_date: day,
        answers: input.answers,
        energy: input.energy ?? null,
        hunger: input.hunger ?? null,
        proud_of: input.proudOf?.trim() || null,
        habits_done: habitsDone,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,summary_date' },
    );
    if (error) {
      console.error('[summary] save failed:', error.message);
      return null;
    }
    queryClient.setQueryData(key, { summary_date: day, answers: input.answers, habits_done: habitsDone });
    return habitsDone;
  };

  return { summary: query.data ?? null, isLoading: query.isLoading && !!day, submit };
}
