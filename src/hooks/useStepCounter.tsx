/**
 * useStepCounter — Daily step counter
 *
 * iOS:     CMPedometer (M-chip, direct hardware) as primary.
 *          HealthKit as fallback (includes Apple Watch + other sources).
 *          CMPedometer.getMeasurement() auto-prompts for Motion & Fitness
 *          permission on first call — no need for explicit checkPermissions.
 *
 * Android: Native StepCounterService (Foreground Service) with TYPE_STEP_COUNTER.
 *          Runs 24/7 with persistent notification. Steps survive app kills via SharedPreferences.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { StepCounter } from '@/plugins/StepCounterPlugin';

export const STEP_GOAL = 10_000;

export interface StepData {
  steps: number;
  distance: number | null;
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

// ─── Local cache ──────────────────────────────────────────────────────────────

function localCacheKey(date: string) { return `steps_cache_${date}`; }
function readLocalCache(date: string): number {
  try { const v = localStorage.getItem(localCacheKey(date)); return v ? parseInt(v, 10) : 0; }
  catch { return 0; }
}
function writeLocalCache(date: string, count: number) {
  try { localStorage.setItem(localCacheKey(date), String(count)); } catch {}
}

// ─── iOS: query steps via CMPedometer (primary) ───────────────────────────────
// getMeasurement() auto-requests Motion & Fitness permission on first call.
// No need for checkPermissions/requestPermissions — just call it directly.

async function queryCMPedometerToday(): Promise<number> {
  try {
    const { CapacitorPedometer } = await import('@capgo/capacitor-pedometer');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await CapacitorPedometer.getMeasurement({
      start: startOfDay.getTime(),
      end: Date.now(),
    });
    return result.numberOfSteps ?? 0;
  } catch (e) {
    console.warn('[Steps/CMPedometer]', e);
    return 0;
  }
}

// ─── iOS: query steps via HealthKit (fallback, includes Apple Watch) ──────────

async function queryHealthKitToday(): Promise<number> {
  try {
    const mod = await import('capacitor-health');
    const health = mod.Health;
    const available = await health.isHealthAvailable();
    if (!available.available) return 0;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await health.queryAggregated({
      startDate: startOfDay.toISOString(),
      endDate:   new Date().toISOString(),
      dataType:  'steps',
      bucket:    'day',
    });
    if (!result?.aggregatedData?.length) return 0;
    return Math.round(result.aggregatedData.reduce((s, r) => s + (r.value > 0 ? r.value : 0), 0));
  } catch (e) {
    console.warn('[Steps/HealthKit]', e);
    return 0;
  }
}

// ─── iOS: combined query — CMPedometer first, HealthKit fallback ─────────────

async function queryIOSStepsToday(userId?: string, today?: string): Promise<number> {
  // 1. CMPedometer (direct M-chip)
  const fromPedometer = await queryCMPedometerToday();
  if (fromPedometer > 0) return fromPedometer;

  // 2. HealthKit (Apple Watch + other sources)
  const fromHealthKit = await queryHealthKitToday();
  if (fromHealthKit > 0) return fromHealthKit;

  // 3. localStorage cache
  if (today) {
    const cached = readLocalCache(today);
    if (cached > 0) return cached;
  }

  // 4. Supabase DB
  if (userId && today) {
    try {
      const { data } = await (supabase as any)
        .from('steps_log').select('steps')
        .eq('user_id', userId).eq('date', today).maybeSingle();
      if (data?.steps > 0) return data.steps;
    } catch {}
  }

  return 0;
}

// ─── Android: resolve initial steps ──────────────────────────────────────────

async function resolveInitialStepsAndroid(userId: string | undefined, today: string): Promise<number> {
  try { const { steps } = await StepCounter.getDailySteps(); if (steps > 0) return steps; } catch {}
  const cached = readLocalCache(today);
  if (cached > 0) return cached;
  if (userId) {
    try {
      const { data } = await (supabase as any)
        .from('steps_log').select('steps')
        .eq('user_id', userId).eq('date', today).maybeSingle();
      if (data?.steps > 0) return data.steps;
    } catch {}
  }
  return 0;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStepCounter(userId?: string): UseStepCounterReturn {
  const [steps, setSteps]                 = useState(0);
  const [isAvailable, setIsAvailable]     = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const listenerRef  = useRef<{ remove: () => Promise<void> } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(-1);

  const isNative  = Capacitor.isNativePlatform();
  const isAndroid = Capacitor.getPlatform() === 'android';
  const isIOS     = Capacitor.getPlatform() === 'ios';

  // ── Debounced save ────────────────────────────────────────────────────────
  const saveSteps = useCallback((count: number) => {
    if (!userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    writeLocalCache(today, count);
    if (count === lastSavedRef.current) return;
    lastSavedRef.current = count;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await (supabase as any).from('steps_log').upsert(
          { user_id: userId, date: today, steps: count, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' },
        );
      } catch {}
    }, 3_000);
  }, [userId]);

  // ── Save user config to native SharedPreferences for background sync ─────
  const syncUserConfig = useCallback(async () => {
    if (!userId || !isAndroid) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await StepCounter.setUserConfig({
        userId,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        accessToken: session.access_token,
      });
    } catch {}
  }, [userId, isAndroid]);

  // ── Android: start Foreground Service ────────────────────────────────────
  const startAndroidTracking = useCallback(async () => {
    await StepCounter.startService();
    await syncUserConfig();
    const today = format(new Date(), 'yyyy-MM-dd');
    const initial = await resolveInitialStepsAndroid(userId, today);
    setSteps(initial);
    if (initial > 0) saveSteps(initial);
    const handle = await StepCounter.addListener('stepUpdate', (data) => {
      setSteps(data.steps);
      saveSteps(data.steps);
    });
    listenerRef.current = handle;
  }, [userId, saveSteps]);

  // ── iOS: refresh step count ───────────────────────────────────────────────
  const refreshIOSSteps = useCallback(async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const count = await queryIOSStepsToday(userId, today);
    setSteps(count);
    if (count > 0) saveSteps(count);
    return count;
  }, [userId, saveSteps]);

  // ── appStateChange: re-check / refresh on every foreground ───────────────
  useEffect(() => {
    if (hasPermission && !isIOS) return;

    let handle: { remove: () => void } | null = null;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', async ({ isActive }: { isActive: boolean }) => {
        if (!isActive) return;

        if (isAndroid) {
          try {
            const perm = await StepCounter.checkPermission();
            if (perm.activityRecognition === 'granted') {
              setHasPermission(true);
              await startAndroidTracking();
              handle?.remove(); handle = null;
            }
          } catch {}
          return;
        }

        if (isIOS) {
          // Refresh step count whenever app comes to foreground
          const count = await refreshIOSSteps();
          if (count > 0) setHasPermission(true);
        }
      }).then((h: { remove: () => void }) => { handle = h; });
    });
    return () => { handle?.remove(); };
  }, [isAndroid, isIOS, hasPermission, startAndroidTracking, refreshIOSSteps]);

  // ── Main init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
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

      if (isIOS) {
        setIsAvailable(true);
        if (cancelled) return;
        // queryCMPedometerToday() will show the Motion & Fitness dialog if needed
        const count = await queryIOSStepsToday(userId, format(new Date(), 'yyyy-MM-dd'));
        if (cancelled) return;
        setSteps(count);
        if (count >= 0) {
          setHasPermission(true); // CMPedometer either worked or silently failed — treat as available
          if (count > 0) saveSteps(count);
        }
      }
    };

    init().catch(console.error);
    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [startAndroidTracking, refreshIOSSteps, saveSteps, userId, isAndroid, isIOS]);

  // ── Manual "Allow" button ─────────────────────────────────────────────────
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

    if (isIOS) {
      // CMPedometer: getMeasurement auto-requests Motion & Fitness permission
      const count = await queryIOSStepsToday(userId, format(new Date(), 'yyyy-MM-dd'));
      setSteps(count);
      setHasPermission(true);
      if (count > 0) saveSteps(count);

      // Also request HealthKit permission for Apple Watch users
      try {
        const mod = await import('capacitor-health');
        await mod.Health.requestHealthPermissions({ permissions: ['READ_STEPS'] });
      } catch {}
    }
  };

  return {
    stepData: {
      steps,
      distance: null,
      goal: STEP_GOAL,
      percentage: Math.min(100, Math.round((steps / STEP_GOAL) * 100)),
    },
    isAvailable,
    isNative,
    hasPermission,
    requestPermission,
  };
}
