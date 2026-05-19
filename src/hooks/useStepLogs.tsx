import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, subDays } from 'date-fns';

export interface StepLog {
  id: string;
  user_id: string;
  date: string;
  steps: number;
}

interface UseStepLogsResult {
  logs: StepLog[];
  todaySteps: number;
  weeklyAverage: number | null;
  updateSteps: (date: string, stepCount: number) => Promise<void>;
  isLoading: boolean;
}

export function useStepLogs(): UseStepLogsResult {
  const { user } = useAuth();
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');
  const sevenDaysAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd');

  const fetchLogs = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase
      .from('steps_log')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', sevenDaysAgo)
      .lte('date', today)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching step logs:', error);
      setIsLoading(false);
      return;
    }

    setLogs((data as StepLog[]) || []);
    setIsLoading(false);
  }, [user, today, sevenDaysAgo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const updateSteps = async (date: string, stepCount: number) => {
    if (!user) return;

    const { error } = await supabase
      .from('steps_log')
      .upsert(
        { user_id: user.id, date, steps: stepCount },
        { onConflict: 'user_id,date' }
      );

    if (error) {
      console.error('Error updating step logs:', error);
      return;
    }

    await fetchLogs();
  };

  const todayLog = logs.find((log) => log.date === today);
  const todaySteps = todayLog?.steps ?? 0;

  // Average over days that have actual step data (excludes zero-step days)
  const activeLogs = logs.filter(l => l.steps > 0);
  const weeklyAverage = activeLogs.length > 0
    ? Math.round(activeLogs.reduce((sum, l) => sum + l.steps, 0) / activeLogs.length)
    : null;

  return { logs, todaySteps, weeklyAverage, updateSteps, isLoading };
}
