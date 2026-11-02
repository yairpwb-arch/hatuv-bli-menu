import { Capacitor } from '@capacitor/core';
import { subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Smartwatch workouts via the phone's health store: Apple Health on iOS
 * (Apple Watch and anything that syncs into it), Health Connect on Android
 * (Garmin, Samsung, Fitbit… through their own apps). Permission is asked
 * only from the "connect watch" button — never on screen entry.
 */

export type WatchKind = 'strength' | 'walk' | 'run' | 'cycling' | 'swim' | 'other';

export interface WatchWorkout {
  id: string;
  kind: WatchKind;
  raw_type: string | null;
  started_at: string;
  ended_at: string;
  duration_min: number;
  calories: number | null;
  avg_heart_rate: number | null;
  source_name: string | null;
}

// Android: exactly what's declared in the Health Connect form in Play Console,
// the workouts only (Play turned down calories and heart rate). Apple Health
// also gives calories and heart rate, shown on the workout card when present.
const PERMISSIONS = Capacitor.getPlatform() === 'android'
  ? (['READ_WORKOUTS'] as const)
  : (['READ_WORKOUTS', 'READ_ACTIVE_CALORIES', 'READ_HEART_RATE'] as const);
const LOOKBACK_DAYS = 30;

const connectedKey = (userId: string) => `watchConnected:${userId}`;

export const isWatchSupported = () => Capacitor.isNativePlatform();

export function isWatchConnected(userId: string): boolean {
  try {
    return localStorage.getItem(connectedKey(userId)) === '1';
  } catch {
    return false;
  }
}

function setConnected(userId: string, on: boolean) {
  try {
    if (on) localStorage.setItem(connectedKey(userId), '1');
    else localStorage.removeItem(connectedKey(userId));
  } catch {
    // Without storage the trainee just taps "connect" again next time.
  }
}

/** Health-store workout type → our kind (iOS camelCase, Android UPPER_SNAKE). */
export function kindOf(rawType: string | undefined): WatchKind {
  const t = (rawType || '').toLowerCase();
  if (/strength|weightlifting|calisthenics|crosstraining|core|hiit|high_intensity|boot_camp/.test(t)) return 'strength';
  if (/walking|hiking/.test(t)) return 'walk';
  if (/running/.test(t)) return 'run';
  if (/cycling|biking/.test(t)) return 'cycling';
  if (/swimming/.test(t)) return 'swim';
  return 'other';
}

export const KIND_LABELS: Record<WatchKind, string> = {
  strength: 'אימון כוח',
  walk: 'הליכה',
  run: 'ריצה',
  cycling: 'רכיבה',
  swim: 'שחייה',
  other: 'אימון',
};

export type ConnectResult = 'connected' | 'denied' | 'unavailable' | 'needs-health-connect';

export async function connectWatch(userId: string): Promise<ConnectResult> {
  if (!isWatchSupported()) return 'unavailable';
  const { Health } = await import('capacitor-health');
  const { available } = await Health.isHealthAvailable();
  if (!available) {
    if (Capacitor.getPlatform() === 'android') {
      await Health.showHealthConnectInPlayStore().catch(() => undefined);
      return 'needs-health-connect';
    }
    return 'unavailable';
  }
  const res = await Health.requestHealthPermissions({ permissions: [...PERMISSIONS] });
  // iOS never says whether read access was granted; Android does.
  const granted =
    Capacitor.getPlatform() === 'ios' ||
    res.permissions.some((p) => Object.entries(p).some(([k, v]) => k === 'READ_WORKOUTS' && v));
  setConnected(userId, granted);
  return granted ? 'connected' : 'denied';
}

export function disconnectWatch(userId: string) {
  setConnected(userId, false);
}

/** Pulls the last month's workouts from the health store into Supabase. */
export async function syncWatchWorkouts(userId: string): Promise<number> {
  if (!isWatchSupported() || !isWatchConnected(userId)) return 0;
  const { Health } = await import('capacitor-health');
  const end = new Date();
  const { workouts } = await Health.queryWorkouts({
    startDate: subDays(end, LOOKBACK_DAYS).toISOString(),
    endDate: end.toISOString(),
    includeHeartRate: Capacitor.getPlatform() !== 'android',
    includeRoute: false,
    includeSteps: false,
  });

  const provider = Capacitor.getPlatform() === 'ios' ? 'healthkit' : 'health_connect';
  const rows = workouts
    .filter((w) => w.duration >= 5 * 60) // ignore accidental 1–2 minute sessions
    .map((w) => {
      const hr = w.heartRate ?? [];
      return {
        user_id: userId,
        provider,
        external_id: w.id || `${w.sourceBundleId}:${w.startDate}`,
        kind: kindOf(w.workoutType),
        raw_type: w.workoutType ?? null,
        started_at: w.startDate,
        ended_at: w.endDate,
        duration_min: Math.round(w.duration / 60),
        calories: w.calories ? Math.round(w.calories) : null,
        avg_heart_rate: hr.length ? Math.round(hr.reduce((s, x) => s + x.bpm, 0) / hr.length) : null,
        source_name: w.sourceName || null,
      };
    });
  if (rows.length === 0) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('external_workouts')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

export async function fetchWatchWorkouts(userId: string, since: Date): Promise<WatchWorkout[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('external_workouts')
    .select('id, kind, raw_type, started_at, ended_at, duration_min, calories, avg_heart_rate, source_name')
    .eq('user_id', userId)
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: false });
  if (error) return [];
  return data as WatchWorkout[];
}
