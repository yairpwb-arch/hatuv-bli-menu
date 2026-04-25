import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface WorkoutPlanDay {
  id: string;
  plan_id: string;
  day_number: number;
  name: string;
  description: string | null;
  notes: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_groups: string[] | null;
  equipment: string | null;
  media_url: string | null;
  difficulty: string | null;
}

export interface WorkoutPlanExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  notes: string | null;
  sort_order: number;
  exercises: Exercise;
}

export interface UserWorkoutAssignment {
  id: string;
  user_id: string;
  plan_id: string;
  is_active: boolean;
  start_date: string | null;
  created_at: string;
  workout_plans: WorkoutPlan;
}

export function useWorkoutPlan() {
  const { user, currentDay } = useAuth();

  const assignmentQuery = useQuery({
    queryKey: ['workout-assignment', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from('user_workout_assignments')
        .select(`*, workout_plans (*)`)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching workout assignment:', error);
        return null;
      }

      return data as UserWorkoutAssignment | null;
    },
    enabled: !!user,
  });

  const assignment = assignmentQuery.data ?? null;
  const plan = assignment?.workout_plans ?? null;

  const planDaysQuery = useQuery({
    queryKey: ['workout-plan-days', plan?.id],
    queryFn: async () => {
      if (!plan) return [];

      const { data, error } = await (supabase as any)
        .from('workout_plan_days')
        .select('*')
        .eq('plan_id', plan.id)
        .order('day_number', { ascending: true });

      if (error) {
        console.error('Error fetching workout plan days:', error);
        return [];
      }

      return (data ?? []) as WorkoutPlanDay[];
    },
    enabled: !!plan?.id,
  });

  const planDays = planDaysQuery.data ?? [];

  const totalDaysInPlan = planDays.length;
  const todayPlanDay: WorkoutPlanDay | null =
    totalDaysInPlan > 0
      ? planDays[(currentDay - 1) % totalDaysInPlan] ?? null
      : null;

  // Fetch exercises for today's plan day (for active session)
  const exercisesQuery = useQuery({
    queryKey: ['workout-plan-exercises', todayPlanDay?.id],
    queryFn: async () => {
      if (!todayPlanDay) return [];

      const { data, error } = await (supabase as any)
        .from('workout_plan_exercises')
        .select(`*, exercises (*)`)
        .eq('plan_day_id', todayPlanDay.id)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error fetching workout exercises:', error);
        return [];
      }

      return (data ?? []) as WorkoutPlanExercise[];
    },
    enabled: !!todayPlanDay?.id,
  });

  const todayExercises = exercisesQuery.data ?? [];
  const isLoading = assignmentQuery.isLoading || planDaysQuery.isLoading;

  return {
    assignment,
    plan,
    planDays,
    todayPlanDay,
    todayExercises,
    isLoading,
  };
}
