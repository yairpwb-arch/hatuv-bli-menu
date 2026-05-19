/**
 * useStepCounter — Daily step counter
 *
 * Platform behavior:
 *  • iOS:     CMPedometer (Core Motion) via @capgo/capacitor-pedometer.
 *             getMeasurement(midnight → now) gives the accurate daily total even
 *             if the app was closed all day — the coprocessor counts 24/7.
 *             startMeasurementUpdates() adds live UI updates while app is open.
 *
 *  • Android: Native StepCounterService (Foreground Service) with TYPE_STEP_COUNTER.
 *             The service runs 24/7 with a visible notification and saves the daily
 *             count to SharedPreferences.  Steps are NOT lost when the app is killed.
 *             The JS layer reads from SharedPreferences via StepCounterPlugin and
 *             receives live broadcasts via the 'stepUpdate' event.
 *
 * Offline support:  today's count is cached in localStorage so the UI is instant
 *                   even before the native layer responds.
 * Supabase sync:    debounced upsert (3 s) triggered only when the count changes.
 *
 * Permissions:
 *  • iOS:     NSMotionUsageDescription in Info.plist, auto-requested on first launch.
 *  • Android: android.permission.ACTIVITY_RECOGNITION, requested via UI button.
 *             Foreground-service permissions are declared in AndroidManifest.xml and
 *             require no runtime grant from the user.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { StepCounter } from '@/plugins/StepCounterPlugin';

// ─── Lazy-load @capgo/capacitor-pedometer (iOS permissions + step updates) ───

async function getPedometer() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import('@capgo/capacitor-pedometer');
    return mod.CapacitorPedometer;
  } catch {
    return null;
  }
}

// ─── Constants & types ────────────────────────────────────────────────────────

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

// ─── Local cache helpers (offline / instant UI) ───────────────────────────────

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

// ─── Resolve initial step count for iOS ──────────────────────────────────────
// Priority:
//  1. getMeasurement(midnight → now) — accurate even after app was closed (iOS only)
//  2. localStorage cache — fast, works offline
//  3. Supabase DB — persisted from previous sessions

async function resolveInitialStepsIOS(
  pedometer: NonNullable<Awaited<ReturnType<typeof getPedometer>>>,
  userId: string | undefined,
  today: string,
): Promise<{ steps: number; distance: number | null }> {
  // 1. CMPedometer historical query (iOS)
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await pedometer.getMeasurement({
      start: todayStart.getTime(),
      end: Date.now(),
    });
    const fromSensor = result.numberOfSteps ?? 0;
    if (fromSensor > 0) {
      return { steps: fromSensor, distance: result.distance ?? null };
    }
  } catch {
    // getMeasurement not supported — fall through
  }

  // 2. localStorage cache
  const cached = readLocalCache(today);
  if (cached > 0) return { steps: cached, distance: null };

  // 3. Supabase DB
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

// ─── Resolve initial step count for Android ───────────────────────────────────
// Priority:
//  1. SharedPreferences via StepCounterPlugin.getDailySteps() — most accurate
//  2. localStorage cache
//  3. Supabase DB

async function resolveInitialStepsAndroid(
  userId: string | undefined,
  today: string,
): Promise<number> {
  // 1. Native SharedPreferences (written by StepCounterService)
  try {
    const { steps } = await StepCounter.getDailySteps();
    if (steps > 0) return steps;
  } catch {}

  // 2. localStorage cache
  const cached = readLocalCache(today);
  if (cached > 0) return cached;

  // 3. Supabase DB
  if (userId) {
    try {
      const { data } = await (supabase as any)
        .from('steps_log')
        .select('steps')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      if (data?.steps > 0) return data.steps;
    } catch {}
  }

  return 0;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStepCounter(userId?: string): UseStepCounterReturn {
  const [steps, setSteps]               = useState(0);
  const [distance, setDistance]         = useState<number | null>(null);
  const [isAvailable, setIsAvailable]   = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const listenerRef    = useRef<{ remove: () => Promise<void> } | null>(null);
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef   = useRef<number>(-1);

  const isNative   = Capacitor.isNativePlatform();
  const isAndroid  = Capacitor.getPlatform() === 'android';
  const isIOS      = Capacitor.getPlatform() === 'ios';

  // ── Debounced save: writes localStorage + Supabase on every count change ──
  const saveSteps = useCallback((count: number) => {
    if (!userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');

    writeLocalCache(today, count);

    if (count === lastSavedRef.current) return;
    lastSavedRef.current = count;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await (supabase as any)
          .from('steps_log')
          .upsert(
            { user_id: userId, date: today, steps: count, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,date' },
          );
      } catch {
        // Network error — data is in localStorage, will sync on next save
      }
    }, 3_000);
  }, [userId]);

  // ── iOS: start live CMPedometer updates on top of the initial count ────────
  const startIOSTracking = useCallback(async (baselineSteps: number) => {
    const pedometer = await getPedometer();
    if (!pedometer) return;

    await pedometer.startMeasurementUpdates();

    // CMPedometer sends steps since startUpdates() was called (not since midnight).
    // We track a sensorBaseline so we can add the delta to our midnight baseline.
    let sensorBaseline: number | null = null;

    const handle = await pedometer.addListener('measurement', (event: any) => {
      const raw = event.numberOfSteps ?? 0;

      if (sensorBaseline === null) {
        sensorBaseline = raw;
      }

      const delta = Math.max(0, raw - sensorBaseline);
      const total = baselineSteps + delta;

      setSteps(total);
      if (event.distance != null) setDistance(event.distance);
      saveSteps(total);
    });

    listenerRef.current = handle;
  }, [saveSteps]);

  // ── Android: start Foreground Service + listen for broadcast updates ───────
  const startAndroidTracking = useCallback(async () => {
    // Start the native Foreground Service (idempotent — safe to call again)
    await StepCounter.startService();

    const today = format(new Date(), 'yyyy-MM-dd');
    const initialSteps = await resolveInitialStepsAndroid(userId, today);

    setSteps(initialSteps);
    if (initialSteps > 0) saveSteps(initialSteps);

    // Live updates come from the service via BroadcastReceiver → JS event
    const handle = await StepCounter.addListener('stepUpdate', (data) => {
      setSteps(data.steps);
      saveSteps(data.steps);
    });

    listenerRef.current = handle;
  }, [userId, saveSteps]);

  // ── Android: re-check permission when app returns to foreground ──────────────
  // Needed because StepPermissionTrigger (App.tsx) shows the OS dialog before
  // this hook's init can see 'granted'. When the dialog closes and app regains
  // focus, we detect the new permission state and start tracking.
  useEffect(() => {
    if (!isAndroid || hasPermission) return;

    let handle: { remove: () => void } | null = null;

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', async ({ isActive }: { isActive: boolean }) => {
        if (!isActive) return;
        try {
          const perm = await StepCounter.checkPermission();
          if (perm.activityRecognition === 'granted') {
            setHasPermission(true);
            await startAndroidTracking();
            handle?.remove();
            handle = null;
          }
        } catch {}
      }).then((h: { remove: () => void }) => { handle = h; });
    });

    return () => { handle?.remove(); };
  }, [isAndroid, hasPermission, startAndroidTracking]);

  // ── Main initialisation effect ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // ── Android: use StepCounter plugin directly (no @capgo/capacitor-pedometer) ──
      if (isAndroid) {
        setIsAvailable(true);
        try {
          const perm = await StepCounter.checkPermission();
          if (perm.activityRecognition === 'granted') {
            setHasPermission(true);
            if (!cancelled) await startAndroidTracking();
          }
        } catch {}
        return;
      }

      // ── iOS: use @capgo/capacitor-pedometer ────────────────────────────────
      const pedometer = await getPedometer();
      if (!pedometer || cancelled) return;

      const perm = await pedometer.checkPermissions();

      if (perm.activityRecognition === 'granted') {
        setHasPermission(true);
      } else if (
        perm.activityRecognition === 'prompt' ||
        perm.activityRecognition === 'prompt-with-rationale'
      ) {
        try {
          const result = await pedometer.requestPermissions();
          if (!cancelled && result.activityRecognition === 'granted') {
            setHasPermission(true);
          }
        } catch {}
      }

      const availability = await pedometer.isAvailable();
      if (cancelled) return;

      if (availability.stepCounting || perm.activityRecognition !== 'granted') {
        setIsAvailable(true);
      }

      if (!availability.stepCounting) return;

      const finalPerm = await pedometer.checkPermissions();
      if (finalPerm.activityRecognition !== 'granted') return;
      if (cancelled) return;

      const today = format(new Date(), 'yyyy-MM-dd');
      const { steps: initialSteps, distance: initialDist } =
        await resolveInitialStepsIOS(pedometer, userId, today);

      if (cancelled) return;

      setSteps(initialSteps);
      if (initialDist !== null) setDistance(initialDist);
      if (initialSteps > 0) saveSteps(initialSteps);

      await startIOSTracking(initialSteps);
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      // iOS: stop CMPedometer updates
      // Android: do NOT stop the service — it should keep running in background
      if (isIOS) {
        getPedometer().then(p => p?.stopMeasurementUpdates());
      }
    };
  }, [startAndroidTracking, startIOSTracking, saveSteps, userId, isAndroid, isIOS]);

  // ── Manual "Allow" button handler ─────────────────────────────────────────
  const requestPermission = async () => {
    if (isAndroid) {
      try {
        const perm = await StepCounter.requestPermission();
        if (perm.activityRecognition !== 'granted') return;
        setHasPermission(true);
        await startAndroidTracking();
      } catch {}
      return;
    }

    const pedometer = await getPedometer();
    if (!pedometer) return;

    const perm = await pedometer.requestPermissions();
    if (perm.activityRecognition !== 'granted') return;

    setHasPermission(true);

    const today = format(new Date(), 'yyyy-MM-dd');
    const { steps: initialSteps, distance: initialDist } =
      await resolveInitialStepsIOS(pedometer, userId, today);
    setSteps(initialSteps);
    if (initialDist !== null) setDistance(initialDist);
    if (initialSteps > 0) saveSteps(initialSteps);
    await startIOSTracking(initialSteps);
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
