/**
 * Undoing "done" marks. Rows are deleted (none of these tables has a
 * deleted_at), and every insert path tolerates the unique keys, so marking
 * again never leaves a double row.
 */
import { differenceInCalendarDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// workout_set_logs / client_session_id aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Marks can be undone up to 7 days back. */
export const UNDO_DAYS = 7;
export const canUndo = (day: string, today = new Date()) =>
  differenceInCalendarDays(today, new Date(`${day}T12:00:00`)) <= UNDO_DAYS;

/** Removes a walk/workout tick (activity_log) for one day. */
export async function unmarkActivity(userId: string, type: 'walk' | 'workout', day: string): Promise<boolean> {
  const { error } = await supabase
    .from('activity_log')
    .delete()
    .eq('user_id', userId)
    .eq('activity_type', type)
    .eq('completed_at', day);
  if (error) console.error('[unmark] activity failed:', error.message);
  return !error;
}

/**
 * Removes a finished workout: its session, its sets in both logs, and any
 * workout tick for that day — so the day goes back to "not done".
 */
export async function deleteWorkoutSession(userId: string, sessionId: string, day: string): Promise<boolean> {
  const { data: session } = await db
    .from('workout_session_logs')
    .select('client_session_id')
    .eq('id', sessionId)
    .maybeSingle();
  await db.from('workout_exercise_logs').delete().eq('session_id', sessionId);
  // Its activity (a hand-marked workout) goes too — the foreign key would only unlink it.
  await db.from('activities').delete().eq('session_id', sessionId);
  if (session?.client_session_id) {
    await db.from('workout_set_logs').delete().eq('user_id', userId).eq('client_session_id', session.client_session_id);
  }
  const { error } = await db.from('workout_session_logs').delete().eq('id', sessionId);
  if (error) {
    console.error('[unmark] workout failed:', error.message);
    return false;
  }
  await unmarkActivity(userId, 'workout', day);
  return true;
}

/** How many sets were logged in a session (0 if none). */
export async function countSessionSets(sessionId: string): Promise<number> {
  const { count } = await db
    .from('workout_exercise_logs')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  return count ?? 0;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/** When an activity done on `day` happened: now if it's today, else midday. */
const startedAt = (day: string) =>
  day === format(new Date(), 'yyyy-MM-dd') ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString();

/**
 * Logs a workout done without the player: a workout_session_logs row (so it
 * counts like any workout) and its activity, which records that it was typed
 * in (source = manual) and how hard it was.
 */
export async function logManualWorkout(
  userId: string,
  planDayId: string,
  day: string,
  durationMin: number | null,
  difficulty: Difficulty | null,
): Promise<string | null> {
  const at = startedAt(day);
  const { data, error } = await db
    .from('workout_session_logs')
    .insert({ user_id: userId, plan_day_id: planDayId, completed_at: at, duration_minutes: durationMin, difficulty })
    .select('id')
    .single();
  if (error) {
    console.error('[manual] workout failed:', error.message);
    return null;
  }
  const act = await db.from('activities').insert({
    user_id: userId, kind: 'strength_gym', status: 'done', started_at: at, day,
    duration_min: durationMin, intensity: difficulty, source: 'manual', session_id: data.id,
  });
  if (act.error) console.error('[manual] activity failed:', act.error.message);
  return data.id as string;
}

/** Which of these workout sessions were marked by hand. */
export async function manualSessionIds(userId: string, sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const { data } = await db
    .from('activities')
    .select('session_id')
    .eq('user_id', userId)
    .eq('source', 'manual')
    .in('session_id', sessionIds);
  return new Set(((data ?? []) as { session_id: string }[]).map((r) => r.session_id));
}

/** A walk typed in by hand ("ביצעתי הליכה"): minutes and km, both optional. */
export async function logManualWalk(userId: string, day: string, d: { durationMin: number | null; distanceKm: number | null }) {
  const { error } = await db.from('activities').insert({
    user_id: userId, kind: 'walk', status: 'done', started_at: startedAt(day), day, source: 'manual',
    duration_min: d.durationMin, distance_m: d.distanceKm != null ? Math.round(d.distanceKm * 1000) : null,
  });
  if (error) console.error('[manual] walk failed:', error.message);
  return !error;
}

export async function readManualWalk(userId: string, day: string): Promise<{ durationMin: number | null; distanceKm: number | null } | null> {
  const { data } = await db
    .from('activities')
    .select('duration_min, distance_m')
    .eq('user_id', userId)
    .eq('kind', 'walk')
    .eq('source', 'manual')
    .eq('day', day)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { durationMin: data.duration_min, distanceKm: data.distance_m != null ? data.distance_m / 1000 : null } : null;
}

export const deleteManualWalks = (userId: string, day: string) =>
  db.from('activities').delete().eq('user_id', userId).eq('kind', 'walk').eq('source', 'manual').eq('day', day);

/** When a walk/workout was ticked for a day (activity_log.created_at), if it was. */
export async function markedAt(userId: string, type: 'walk' | 'workout', day: string): Promise<string | null> {
  const { data } = await supabase
    .from('activity_log')
    .select('created_at')
    .eq('user_id', userId)
    .eq('activity_type', type)
    .eq('completed_at', day)
    .maybeSingle();
  return data?.created_at ?? null;
}
