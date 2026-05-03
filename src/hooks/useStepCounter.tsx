/**
 * useStepCounter — Daily step counter using @capgo/capacitor-pedometer
 *
 * Platform behavior:
 *  • iOS:    CMPedometer (Core Motion). getMeasurement() supports time ranges,
 *            so we get the accurate midnight→now cumulative total.
 *  • Android: Step-counter hardware sensor. getMeasurement() does NOT support
 *            time ranges — it counts steps since device boot.
 *            Fix: if getMeasurement returns 0 or fails, load today's count from
 *            the DB as a starting baseline, then add live deltas on top.
 *
 * Offline support: today's count is cached in localStorage so it survives
 * network outages. Supabase receives a debounced upsert only when the count
 * actually changes.
 *
 * Permissions:
 *  • iOS: NSMotionUsageDescription in Info.plist, auto-requested on first launch.
 *  • Android: android.permission.ACTIVITY_RECOGNITION in AndroidManifest.xml,
 *             requested when the user taps "allow".
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// Lazy-load plugin only on native platforms
async function getPedometer() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import('@capgo/capacitor-pedometer');
    return mod.CapacitorPedometer;
  } catch {
    return null;
  }
}

export const STEP_GOAL = 10_000;

export interface StepData {
  steps: number;
  distance: number | null; // meters, iOS only
  goal: number;
  percentage: number;
}

interface UseStepCounterReturn {
  stepData: StepData;
  isAvailable: boolean;
  isNative: boolean;
  hasPermission: boolean;
  requestPermission: () => Promise<void>;
}

// ─── Local cache helpers (offline support) ────────────────────────────────────

function localCacheKey(date: string) {
  return `steps_cache_${date}`;
}

function readLocalCache(date: string): number {
  try {
    const v = localStorage.getItem(localCacheKey(date));
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

function writeLocalCache(date: string, count: number) {
  try {
    localStorage.setItem(localCacheKey(date), String(count));
  } catch {}
}

// ─── Determine initial step count ─────────────────────────────────────────────
// Priority:
//  1. getMeasurement() — works on iOS (time-scoped), may return 0 on Android
//  2. localStorage cache — survives app restarts / network issues
//  3. Supabase DB — persisted from previous sessions

async function resolveInitialSteps(
  pedometer: NonNullable<Awaited<ReturnType<typeof getPedometer>>>,
  userId: string | undefined,
  today: string,
): Promise<{ steps: number; distance: number | null }> {
  // 1. Try health store (correct on iOS, may return 0 on Android)
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); // local timezone midnight
    const result = await pedometer.getMeasurement({
      start: todayStart.getTime(),
      end: Date.now(),
    });
    const fromSensor = result.numberOfSteps ?? 0;
    if (fromSensor > 0) {
      return { steps: fromSensor, distance: result.distance ?? null };
    }
  } catch {
    // getMeasurement not supported on this platform/version — fall through
  }

  // 2. localStorage cache (fast, works offline)
  const cached = readLocalCache(today);
  if (cached > 0) return { steps: cached, distance: null };

  // 3. Supabase (previous session data)
  if (userId) {
    try {
      const { data } = await (supabase as any)
        .from('steps_log')
        .select('steps')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      if (data?.steps > 0) return { steps: data.steps, distance: null };
    } catch {}
  }

  return { steps: 0, distance: null };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStepCounter(userId?: string): UseStepCounterReturn {
  const [steps, setSteps] = useState(0);
  const [distance, setDistance] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(-1); // deduplication: skip save if unchanged
  const isNative = Capacitor.isNativePlatform();

  // Debounced save — only fires if count changed; writes local cache first
  const saveSteps = useCallback((count: number) => {
    if (!userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');

    // Always update local cache immediately (offline protection)
    writeLocalCache(today, count);

    // Deduplication: skip DB write if value hasn't changed
    if (count === lastSavedRef.current) return;
    lastSavedRef.current = count;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await (supabase as any)
          .from('steps_log')
          .upsert(
            { user_id: userId, date: today, steps: count, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,date' }
          );
      } catch {
        // Network error — data is already in localStorage, will sync on next save
      }
    }, 3_000);
  }, [userId]);

  // Start live sensor updates with a known baseline
  const startTracking = useCallback(async (baselineSteps: number) => {
    const pedometer = await getPedometer();
    if (!pedometer) return;

    await pedometer.startMeasurementUpdates();

    // The sensor emits cumulative steps since startMeasurementUpdates() was called.
    // We keep the first emitted value as a baseline and add deltas to our daily total.
    let sensorBaseline: number | null = null;

    const handle = await pedometer.addListener('measurement', (event: any) => {
      const raw = event.numberOfSteps ?? 0;

      if (sensorBaseline === null) {
        sensorBaseline = raw; // capture sensor value at tracking start
      }

      const delta = Math.max(0, raw - sensorBaseline);
      const total = baselineSteps + delta;

      setSteps(total);
      if (event.distance != null) setDistance(event.distance);
      saveSteps(total);
    });

    listenerRef.current = handle;
  }, [saveSteps]);

  // Initialise on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const pedometer = await getPedometer();
      if (!pedometer || cancelled) return;

      const isIOS = Capacitor.getPlatform() === 'ios';

      // Check / request permissions
      const perm = await pedometer.checkPermissions();
      if (perm.activityRecognition === 'granted') {
        setHasPermission(true);
      } else if (isIOS) {
        // iOS: auto-request so the OS dialog appears on first launch
        try {
          const result = await pedometer.requestPermissions();
          if (!cancelled && result.activityRecognition === 'granted') {
            setHasPermission(true);
          }
        } catch {}
      }

      const availability = await pedometer.isAvailable();
      if (cancelled) return;

      // Show component even if permission not yet granted (for the Allow button)
      if (availability.stepCounting || perm.activityRecognition !== 'granted') {
        setIsAvailable(true);
      }

      if (!availability.stepCounting) return;

      // Confirm permission again after potential request
      const finalPerm = await pedometer.checkPermissions();
      if (finalPerm.activityRecognition !== 'granted') return;

      // Determine today's starting count
      const today = format(new Date(), 'yyyy-MM-dd');
      const { steps: initialSteps, distance: initialDist } = await resolveInitialSteps(pedometer, userId, today);

      if (cancelled) return;

      setSteps(initialSteps);
      if (initialDist !== null) setDistance(initialDist);
      if (initialSteps > 0) saveSteps(initialSteps);

      await startTracking(initialSteps);
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      getPedometer().then(p => p?.stopMeasurementUpdates());
    };
  }, [startTracking, saveSteps, userId]);

  // Manual permission request (Android "allow" button)
  const requestPermission = async () => {
    const pedometer = await getPedometer();
    if (!pedometer) return;
    const perm = await pedometer.requestPermissions();
    if (perm.activityRecognition === 'granted') {
      setHasPermission(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      const { steps: initialSteps, distance: initialDist } = await resolveInitialSteps(pedometer, userId, today);
      setSteps(initialSteps);
      if (initialDist !== null) setDistance(initialDist);
      if (initialSteps > 0) saveSteps(initialSteps);
      await startTracking(initialSteps);
    }
  };

  return {
    stepData: {
      steps,
      distance,
      goal: STEP_GOAL,
      percentage: Math.min(100, Math.round((steps / STEP_GOAL) * 100)),
    },
    isAvailable,
    isNative,
    hasPermission,
    requestPermission,
  };
}
