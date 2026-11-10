import { supabase } from '@/integrations/supabase/client';
import type { BuiltExercise } from '@/components/activities/WorkoutBuilder';
import type { Exercise } from '@/hooks/useWorkoutPlan';

// my_workouts isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** A saved workout ("האימונים שלי") ready for the workout player, or null if it's gone. */
export async function loadMyWorkout(id: string): Promise<{ name: string; items: BuiltExercise[] } | null> {
  const { data: w } = await db
    .from('my_workouts')
    .select('id, name, my_workout_exercises(exercise_id, position, sets, reps, weight_kg, duration_seconds)')
    .eq('id', id)
    .maybeSingle();
  if (!w) return null;
  const rows = [...(w.my_workout_exercises ?? [])].sort((a: { position: number }, b: { position: number }) => a.position - b.position) as {
    exercise_id: string; sets: number; reps: number | null; weight_kg: number | null; duration_seconds: number | null;
  }[];
  if (!rows.length) return { name: w.name, items: [] };
  const { data: ex } = await db
    .from('exercises')
    .select('id, name, description, muscle_groups, equipment, media_url, difficulty')
    .in('id', rows.map((r) => r.exercise_id));
  const byId = new Map(((ex ?? []) as Exercise[]).map((e) => [e.id, e]));
  return {
    name: w.name,
    items: rows
      .filter((r) => byId.has(r.exercise_id))
      .map((r) => ({ exercise: byId.get(r.exercise_id)!, sets: r.sets, reps: r.reps ?? 10, weightKg: r.weight_kg, seconds: r.duration_seconds ?? null })),
  };
}
