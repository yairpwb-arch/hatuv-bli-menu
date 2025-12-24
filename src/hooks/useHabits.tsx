import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Droplets, Footprints, Timer, Moon, Target, Apple, Dumbbell } from 'lucide-react';

export interface Habit {
  id: string;
  name: string;
  icon: string;
  completed: boolean;
}

export const iconMap: Record<string, typeof Droplets> = {
  droplets: Droplets,
  footprints: Footprints,
  timer: Timer,
  moon: Moon,
  target: Target,
  apple: Apple,
  dumbbell: Dumbbell,
};

interface UseHabitsResult {
  habits: Habit[];
  isLoading: boolean;
  toggleHabit: (habitId: string, completed: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useHabits(
  userId: string | undefined,
  currentWeek: number,
  dateString: string
): UseHabitsResult {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHabits = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);

    // Get habit definitions for current week (cumulative - all habits from week_start <= currentWeek)
    const { data: habitDefs, error: habitsError } = await supabase
      .from('habit_definitions')
      .select('*')
      .lte('week_start', currentWeek)
      .or(`week_end.gte.${currentWeek},week_end.is.null`);

    if (habitsError) {
      console.error('Error fetching habits:', habitsError);
      setIsLoading(false);
      return;
    }

    // Get completed habits for the specified date
    const { data: completedHabits } = await supabase
      .from('daily_habits_log')
      .select('habit_id')
      .eq('user_id', userId)
      .eq('completed_at', dateString);

    const completedIds = new Set(completedHabits?.map((h) => h.habit_id) || []);

    // Filter out walk/workout habits (they have their own dedicated card)
    // These are handled by the activity scheduler
    const staticHabits = (habitDefs || []).filter(h => 
      !h.name.includes('הליכה') && !h.name.includes('אימון')
    );

    const habitsWithStatus = staticHabits.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon || 'target',
      completed: completedIds.has(h.id),
    }));

    setHabits(habitsWithStatus);
    setIsLoading(false);
  }, [userId, currentWeek, dateString]);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  // Also refetch when window gains focus (for sync between pages)
  useEffect(() => {
    const handleFocus = () => {
      fetchHabits();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchHabits]);

  const toggleHabit = async (habitId: string, completed: boolean) => {
    if (!userId) return;

    if (completed) {
      // Remove completion
      await supabase
        .from('daily_habits_log')
        .delete()
        .eq('user_id', userId)
        .eq('habit_id', habitId)
        .eq('completed_at', dateString);
    } else {
      // Add completion
      await supabase
        .from('daily_habits_log')
        .insert({ user_id: userId, habit_id: habitId, completed_at: dateString });
    }

    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, completed: !completed } : h))
    );
  };

  return { habits, isLoading, toggleHabit, refetch: fetchHabits };
}
