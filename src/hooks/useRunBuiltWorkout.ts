import { useActiveWorkout } from '@/contexts/ActiveWorkoutContext';
import { useAuth } from '@/hooks/useAuth';
import { useActivities } from '@/hooks/useActivities';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import type { BuiltExercise } from '@/components/activities/WorkoutBuilder';
import type { ActivityKind } from '@/lib/activityKinds';

/**
 * Runs a workout the trainee built in the regular workout player. Its sets
 * are logged like any workout; it's saved as an activity (source = player)
 * so it counts in the streak and the weekly summary.
 */
export function useRunBuiltWorkout(onDone?: () => void) {
  const { user } = useAuth();
  const { start } = useActiveWorkout();
  const { logSession } = useWorkoutSession();
  const { save } = useActivities(user?.id);

  return (name: string, items: BuiltExercise[], kind: ActivityKind, myWorkoutId: string | null) => {
    // Not a plan day: the "custom:" prefix keeps it out of plan-day foreign keys.
    const id = `custom:${myWorkoutId ?? Date.now()}`;
    const planDay = { id, plan_id: '', day_number: 0, name, description: null, notes: null } as WorkoutPlanDay;
    const exercises = items.map((it, i) => ({
      id: `${id}:${i}`,
      plan_day_id: id,
      exercise_id: it.exercise.id,
      sets: it.sets,
      reps_min: it.reps,
      reps_max: it.reps,
      rest_seconds: 60,
      target_seconds: it.seconds,
      notes: it.seconds == null && it.weightKg != null ? `${it.weightKg} ק"ג` : null,
      sort_order: i,
      exercises: it.exercise,
    })) as WorkoutPlanExercise[];
    start({
      planDay,
      exercises,
      onFinish: async (result) => {
        const sessionId = await logSession(null, result.durationMinutes, result.logs, {
          clientSessionId: result.clientSessionId,
          difficulty: result.difficulty,
          setsDone: result.setsDone,
          totalVolumeKg: result.totalVolumeKg,
        });
        if (sessionId) {
          await save({
            kind,
            custom_name: null,
            started_at: new Date(Date.now() - result.durationMinutes * 60_000).toISOString(),
            duration_min: result.durationMinutes || null,
            distance_m: null,
            intensity: result.difficulty ?? null,
            note: name,
            source: 'player',
            replaces: null,
            session_id: sessionId,
          });
        }
        onDone?.();
      },
    });
  };
}
