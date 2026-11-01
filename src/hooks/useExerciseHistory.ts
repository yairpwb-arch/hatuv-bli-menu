import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SetRecord {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
}

export interface ExerciseHistory {
  /** Sets from the most recent workout that included this exercise. */
  last: SetRecord[];
  /** Heaviest weight ever logged for it (0 if none). */
  bestWeight: number;
}

// workout_set_logs isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Row {
  exercise_id: string;
  group: string;
  at: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
}

/**
 * Previous performance per exercise. Reads the per-set log (saved live since
 * this version) and the older end-of-workout log, so trainees who trained
 * before the update still see "last time".
 */
export function useExerciseHistory(userId: string | undefined, exerciseIds: string[]) {
  const [history, setHistory] = useState<Record<string, ExerciseHistory>>({});
  const [isLoading, setIsLoading] = useState(true);
  const idsKey = [...exerciseIds].sort().join(',');

  useEffect(() => {
    if (!userId || exerciseIds.length === 0) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [live, legacy] = await Promise.all([
        db
          .from('workout_set_logs')
          .select('exercise_id, client_session_id, set_number, reps, weight_kg, logged_at')
          .eq('user_id', userId)
          .in('exercise_id', exerciseIds)
          .order('logged_at', { ascending: false })
          .limit(1000),
        db
          .from('workout_exercise_logs')
          .select('exercise_id, session_id, set_number, reps, weight_kg, workout_session_logs!inner(user_id, completed_at)')
          .eq('workout_session_logs.user_id', userId)
          .in('exercise_id', exerciseIds)
          .limit(1000),
      ]);
      if (live.error) console.warn('[history] set log unavailable:', live.error.message);

      const rows: Row[] = [
        ...((live.data ?? []) as { exercise_id: string; client_session_id: string; set_number: number; reps: number | null; weight_kg: number | null; logged_at: string }[])
          .map((r) => ({ exercise_id: r.exercise_id, group: r.client_session_id, at: r.logged_at, set_number: r.set_number, reps: r.reps, weight_kg: r.weight_kg })),
        ...((legacy.data ?? []) as { exercise_id: string; session_id: string; set_number: number; reps: number | null; weight_kg: number | null; workout_session_logs: { completed_at: string } }[])
          .map((r) => ({ exercise_id: r.exercise_id, group: r.session_id, at: r.workout_session_logs.completed_at, set_number: r.set_number, reps: r.reps, weight_kg: r.weight_kg })),
      ];

      const out: Record<string, ExerciseHistory> = {};
      const latestGroup: Record<string, { group: string; at: string }> = {};
      for (const r of rows) {
        const h = (out[r.exercise_id] ??= { last: [], bestWeight: 0 });
        h.bestWeight = Math.max(h.bestWeight, Number(r.weight_kg) || 0);
        const cur = latestGroup[r.exercise_id];
        if (!cur || r.at > cur.at) latestGroup[r.exercise_id] = { group: r.group, at: r.at };
      }
      for (const r of rows) {
        if (latestGroup[r.exercise_id]?.group !== r.group) continue;
        out[r.exercise_id].last.push({
          setNumber: r.set_number,
          reps: r.reps,
          weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
        });
      }
      for (const h of Object.values(out)) h.last.sort((a, b) => a.setNumber - b.setNumber);

      if (!cancelled) {
        setHistory(out);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, idsKey]);

  return { history, isLoading };
}

/** Saves one set the moment it's marked done (re-marking overwrites it). */
export async function saveSet(row: {
  userId: string;
  clientSessionId: string;
  planDayId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  repsMaxTarget: number;
}): Promise<boolean> {
  const { error } = await db.from('workout_set_logs').upsert(
    {
      user_id: row.userId,
      client_session_id: row.clientSessionId,
      // A workout the trainee built ("custom:<id>") isn't a plan day.
      plan_day_id: row.planDayId?.startsWith('custom:') ? null : row.planDayId,
      exercise_id: row.exerciseId,
      set_number: row.setNumber,
      reps: row.reps,
      weight_kg: row.weightKg,
      reps_max_target: row.repsMaxTarget,
      logged_at: new Date().toISOString(),
    },
    { onConflict: 'client_session_id,exercise_id,set_number' },
  );
  if (error) console.error('[sets] save failed:', error.message);
  return !error;
}
