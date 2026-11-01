import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Droplets, Footprints, Timer, Moon, Target, Apple, Dumbbell } from 'lucide-react';
import { VisualKey, isHiddenKey, isTableKey, resolveVisualKey } from '@/lib/habitVisuals';

export interface Habit {
  id: string;
  name: string;
  icon: string;
  completed: boolean;
  is_bonus: boolean;
  /** One-line explanation, shown on long-press. */
  explanation: string | null;
  /** Drawn inside the plate (food portions) or around it. */
  plate_zone: 'plate' | 'side';
  /** Object on the home table / routine row it's drawn as; null = tag only. */
  visual_key: VisualKey | null;
}

interface HabitDefRow {
  id: string;
  name: string;
  icon: string | null;
  is_bonus: boolean | null;
  explanation?: string | null;
  plate_zone?: string | null;
  visual_key?: string | null;
  day_end?: number | null;
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
  /** Today's habits: this stage's, plus earlier stages' that stay part of the routine. */
  habits: Habit[];
  isLoading: boolean;
  toggleHabit: (habitId: string, completed: boolean) => Promise<void>;
  setHabitDone: (habitId: string, done: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useHabits(
  userId: string | undefined,
  currentDay: number,
  dateString: string,
  planDays?: number
): UseHabitsResult {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cap at planDays so habits from the last program day stay visible after program ends
  const effectiveDay = planDays != null ? Math.min(currentDay, planDays) : currentDay;

  const fetchHabits = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Get habit definitions unlocked by effectiveDay — global (user_id IS NULL) + personal for this user
    const { data: habitDefs, error: habitsError } = await supabase
      .from('habit_definitions')
      .select('*')
      .lte('day_start', effectiveDay)
      .or(`day_end.gte.${effectiveDay},day_end.is.null`)
      .or(`user_id.is.null,user_id.eq.${userId}`);

    if (habitsError) {
      console.error('Error fetching habits:', habitsError);
      setIsLoading(false);
      return;
    }

    // Earlier stages' habits (their window already closed) stay in the
    // routine: on the plate if they're drawn there, otherwise in the daily summary.
    const { data: pastDefs } = await supabase
      .from('habit_definitions')
      .select('*')
      .lt('day_end', effectiveDay)
      .or(`user_id.is.null,user_id.eq.${userId}`);

    // Get completed habits for the specified date
    const { data: completedHabits } = await supabase
      .from('daily_habits_log')
      .select('habit_id')
      .eq('user_id', userId)
      .eq('completed_at', dateString);

    const completedIds = new Set(completedHabits?.map((h) => h.habit_id) || []);

    // Filter out walk/workout habits (they have their own dedicated card)
    // These are handled by the activity scheduler
    // Also drop habits that are part of the plan but never ticked (slow eating,
    // the four meals) and ones retired with day_end = 0.
    const isStatic = (h: HabitDefRow) =>
      !h.name.includes('הליכה') && !h.name.includes('אימון') &&
      h.day_end !== 0 && !isHiddenKey(resolveVisualKey(h.visual_key));
    const toHabit = (h: HabitDefRow): Habit => ({
      id: h.id,
      name: h.name,
      icon: h.icon || 'target',
      completed: completedIds.has(h.id),
      is_bonus: h.is_bonus || false,
      explanation: h.explanation ?? null,
      plate_zone: h.plate_zone === 'plate' ? 'plate' : 'side',
      visual_key: resolveVisualKey(h.visual_key),
    });

    const current = ((habitDefs || []) as HabitDefRow[]).filter(isStatic).map(toHabit);
    // One habit per name, and one per table object — the current stage's wins —
    // so nothing shows twice (or both on the plate and in the summary).
    const names = new Set(current.map((h) => h.name));
    const tableKeys = new Set(current.map((h) => h.visual_key).filter(isTableKey));
    const past: Habit[] = [];
    for (const h of ((pastDefs || []) as HabitDefRow[]).filter((d) => isStatic(d) && !d.is_bonus).map(toHabit)) {
      if (names.has(h.name)) continue;
      if (isTableKey(h.visual_key)) {
        if (tableKeys.has(h.visual_key)) continue;
        tableKeys.add(h.visual_key);
      }
      names.add(h.name);
      past.push(h);
    }
    setHabits([...current, ...past]);
    setIsLoading(false);
  }, [userId, effectiveDay, dateString]);

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

  /** Sets a habit to an exact state (no-op when it's already there). */
  const setHabitDone = async (habitId: string, done: boolean) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit || habit.completed === done) return;
    await toggleHabit(habitId, habit.completed);
  };

  return { habits, isLoading, toggleHabit, setHabitDone, refetch: fetchHabits };
}
