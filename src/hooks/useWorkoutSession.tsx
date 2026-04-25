import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface WorkoutSessionLog {
  id: string;
  user_id: string;
  plan_day_id: string;
  completed_at: string;
  duration_minutes: number | null;
  workout_plan_days?: {
    id: string;
    name: string;
    day_number: number;
  } | null;
}

export interface ExerciseSetLog {
  exerciseId: string;
  sets: {
    reps: number;
    weightKg: number;
  }[];
}

export function useWorkoutSession() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['workout-sessions', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('workout_session_logs')
        .select(`
          *,
          workout_plan_days (
            id,
            name,
            day_number
          )
        `)
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching workout sessions:', error);
        return [];
      }

      return (data ?? []) as WorkoutSessionLog[];
    },
    enabled: !!user,
  });

  const logSession = async (
    planDayId: string,
    durationMinutes: number,
    exerciseLogs: ExerciseSetLog[]
  ) => {
    if (!user) return;

    try {
      // Insert the session log
      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_session_logs')
        .insert({
          user_id: user.id,
          plan_day_id: planDayId,
          duration_minutes: durationMinutes > 0 ? durationMinutes : null,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error logging workout session:', sessionError);
        toast({
          title: 'שגיאה',
          description: 'לא ניתן לשמור את האימון',
          variant: 'destructive',
        });
        return;
      }

      // Insert exercise logs for each exercise and its sets
      const exerciseLogRows: {
        session_id: string;
        exercise_id: string;
        set_number: number;
        reps: number;
        weight_kg: number;
      }[] = [];

      for (const exerciseLog of exerciseLogs) {
        exerciseLog.sets.forEach((set, setIndex) => {
          exerciseLogRows.push({
            session_id: sessionData.id,
            exercise_id: exerciseLog.exerciseId,
            set_number: setIndex + 1,
            reps: set.reps,
            weight_kg: set.weightKg,
          });
        });
      }

      if (exerciseLogRows.length > 0) {
        const { error: exerciseError } = await supabase
          .from('workout_exercise_logs')
          .insert(exerciseLogRows);

        if (exerciseError) {
          console.error('Error logging exercise sets:', exerciseError);
        }
      }

      toast({
        title: 'כל הכבוד!',
        description: 'האימון נרשם בהצלחה',
      });

      // Invalidate sessions cache so UI updates
      await queryClient.invalidateQueries({ queryKey: ['workout-sessions', user.id] });
    } catch (err) {
      console.error('Unexpected error logging session:', err);
      toast({
        title: 'שגיאה',
        description: 'אירעה שגיאה בעת שמירת האימון',
        variant: 'destructive',
      });
    }
  };

  return {
    sessions: sessionsQuery.data ?? [],
    logSession,
    isLoading: sessionsQuery.isLoading,
  };
}
