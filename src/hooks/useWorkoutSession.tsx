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

export interface SessionExtras {
  clientSessionId: string;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  setsDone: number;
  totalVolumeKg: number;
}

export interface ExerciseSetLog {
  exerciseId: string;
  sets: {
    reps: number;
    weightKg: number;
    setNumber?: number;
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
        .limit(20);

      if (error) {
        console.error('Error fetching workout sessions:', error);
        return [];
      }

      return (data ?? []) as WorkoutSessionLog[];
    },
    enabled: !!user,
  });

  const logSession = async (
    /** null for a workout the trainee built (not from the plan). */
    planDayId: string | null,
    durationMinutes: number,
    exerciseLogs: ExerciseSetLog[],
    extras?: SessionExtras,
  ): Promise<string | null> => {
    if (!user) return null;

    try {
      // Insert the session log
      const base = {
        user_id: user.id,
        plan_day_id: planDayId,
        duration_minutes: durationMinutes > 0 ? durationMinutes : null,
        completed_at: new Date().toISOString(),
      };
      const row = extras
        ? {
            ...base,
            client_session_id: extras.clientSessionId,
            difficulty: extras.difficulty,
            sets_done: extras.setsDone,
            total_volume_kg: extras.totalVolumeKg,
          }
        : base;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sessionData, error: sessionError } = await (supabase as any).from('workout_session_logs').insert(row).select().single();

      if (sessionError) {
        console.error('Error logging workout session:', sessionError);
        toast({
          title: 'שגיאה',
          description: 'לא ניתן לשמור את האימון',
          variant: 'destructive',
        });
        return null;
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
            set_number: set.setNumber ?? setIndex + 1,
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
      return sessionData.id as string;
    } catch (err) {
      console.error('Unexpected error logging session:', err);
      toast({
        title: 'שגיאה',
        description: 'אירעה שגיאה בעת שמירת האימון',
        variant: 'destructive',
      });
    }
    return null;
  };

  const deleteSession = async (sessionId: string) => {
    if (!user) return;
    await supabase.from('workout_exercise_logs').delete().eq('session_id', sessionId);
    await supabase.from('workout_session_logs').delete().eq('id', sessionId);
    await queryClient.invalidateQueries({ queryKey: ['workout-sessions', user.id] });
    toast({ title: 'האימון נמחק בהצלחה' });
  };

  return {
    sessions: sessionsQuery.data ?? [],
    logSession,
    deleteSession,
    isLoading: sessionsQuery.isLoading,
  };
}
