import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay } from 'date-fns';

interface StreakData {
  currentStreak: number;
  bestStreak: number;
  perfectDaysThisMonth: number;
  isLoading: boolean;
}

export function useStreak(userId: string | undefined, currentWeek: number): StreakData {
  const [habitLogs, setHabitLogs] = useState<{ habit_id: string; completed_at: string }[]>([]);
  const [activityLogs, setActivityLogs] = useState<{ activity_type: string; completed_at: string }[]>([]);
  const [habitDefinitions, setHabitDefinitions] = useState<{ id: string; name: string }[]>([]);
  const [scheduledActivities, setScheduledActivities] = useState<{ activity_type: string; day_of_week: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Get last 60 days of data for streak calculation
    const startDate = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    const [habitsResult, activityResult, habitDefsResult, scheduleResult] = await Promise.all([
      supabase
        .from('daily_habits_log')
        .select('habit_id, completed_at')
        .eq('user_id', userId)
        .gte('completed_at', startDate)
        .lte('completed_at', today),
      supabase
        .from('activity_log')
        .select('activity_type, completed_at')
        .eq('user_id', userId)
        .gte('completed_at', startDate)
        .lte('completed_at', today),
      supabase
        .from('habit_definitions')
        .select('id, name')
        .lte('week_start', currentWeek)
        .or(`week_end.gte.${currentWeek},week_end.is.null`),
      supabase
        .from('user_activity_schedule')
        .select('activity_type, day_of_week')
        .eq('user_id', userId)
        .eq('is_active', true),
    ]);

    setHabitLogs(habitsResult.data || []);
    setActivityLogs(activityResult.data || []);
    // Filter out walk/workout related habits (those are handled by activity system)
    const staticHabits = (habitDefsResult.data || []).filter(h => 
      !h.name.includes('הליכה') && !h.name.includes('אימון')
    );
    setHabitDefinitions(staticHabits);
    setScheduledActivities(scheduleResult.data || []);
    setIsLoading(false);
  }, [userId, currentWeek]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when window gains focus (for sync between pages)
  useEffect(() => {
    const handleFocus = () => {
      fetchData();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);

  const { currentStreak, bestStreak, perfectDaysThisMonth } = useMemo(() => {
    if (isLoading || habitDefinitions.length === 0) {
      return { currentStreak: 0, bestStreak: 0, perfectDaysThisMonth: 0 };
    }

    const today = startOfDay(new Date());
    let streak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    let perfectDays = 0;
    let checkDate = subDays(today, 1); // Start from yesterday
    let streakBroken = false;

    // Calculate streak and best streak going backwards from yesterday
    for (let i = 0; i < 60; i++) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      const dayOfWeek = checkDate.getDay();
      
      // Get completed habits for this day
      const completedHabitsForDay = habitLogs.filter(h => h.completed_at === dateStr);
      const completedHabitCount = completedHabitsForDay.length;
      
      // Check if this day has scheduled activity
      const hasScheduledActivity = scheduledActivities.some(a => a.day_of_week === dayOfWeek);
      const activityCompletedForDay = activityLogs.some(a => a.completed_at === dateStr);
      
      // Total tasks = static habits + activity (if scheduled)
      const totalTasks = habitDefinitions.length + (hasScheduledActivity ? 1 : 0);
      const completedTasks = completedHabitCount + (hasScheduledActivity && activityCompletedForDay ? 1 : 0);
      
      const isPerfectDay = totalTasks > 0 && completedTasks >= totalTasks;
      
      // Count perfect days this month
      const isThisMonth = checkDate.getMonth() === today.getMonth() && checkDate.getFullYear() === today.getFullYear();
      if (isPerfectDay && isThisMonth) {
        perfectDays++;
      }
      
      // Calculate current streak (only if not broken yet)
      if (!streakBroken) {
        if (isPerfectDay) {
          streak++;
        } else if (totalTasks > 0) {
          streakBroken = true;
        }
      }
      
      // Calculate best streak (track all consecutive streaks)
      if (isPerfectDay) {
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
      
      checkDate = subDays(checkDate, 1);
    }

    // Check if today is also a perfect day (to add to streak)
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayDayOfWeek = today.getDay();
    const completedHabitsToday = habitLogs.filter(h => h.completed_at === todayStr).length;
    const hasActivityToday = scheduledActivities.some(a => a.day_of_week === todayDayOfWeek);
    const activityCompletedToday = activityLogs.some(a => a.completed_at === todayStr);
    const totalTasksToday = habitDefinitions.length + (hasActivityToday ? 1 : 0);
    const completedTasksToday = completedHabitsToday + (hasActivityToday && activityCompletedToday ? 1 : 0);
    const isTodayPerfect = totalTasksToday > 0 && completedTasksToday >= totalTasksToday;
    
    if (isTodayPerfect) {
      streak++;
      if (today.getMonth() === new Date().getMonth()) {
        perfectDays++;
      }
    }

    // Update best streak with current streak if it's better
    const finalBestStreak = Math.max(maxStreak, streak);

    return { currentStreak: streak, bestStreak: finalBestStreak, perfectDaysThisMonth: perfectDays };
  }, [habitLogs, activityLogs, habitDefinitions, scheduledActivities, isLoading]);

  return { currentStreak, bestStreak, perfectDaysThisMonth, isLoading };
}
