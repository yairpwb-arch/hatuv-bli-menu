/**
 * useStepCounter — Daily step counter
 *
 * Platform behavior:
 *  • iOS:     HealthKit via capacitor-health.
 *             queryAggregated(midnight → now, dataType: 'steps') returns the total
 *             from ALL sources (iPhone + Apple Watch + third-party apps).
 *             Refreshes on every app foreground so background steps appear immediately.
 *
 *  • Android: Native StepCounterService (Foreground Service) with TYPE_STEP_COUNTER.
 *             The service runs 24/7 with a visible notification and saves the daily
 *             count to SharedPreferences. Steps are NOT lost when the app is killed.
 *             The JS layer reads from SharedPreferences via StepCounterPlugin and
 *             receives live broadcasts via the 'stepUpdate' event.
 *
 * Offline support:  today's count is cached in localStorage so the UI is instant
 *                   even before the native layer responds.
 * Supabase sync:    debounced upsert (3 s) triggered only when the count changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { StepCounter } from '@/plugins/StepCounterPlugin';

// ─── Lazy-load capacitor-health (iOS HealthKit) ───────────────────────────────

async function getHealth() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import('capacitor-health');
    return mod.Health;
  } catch {
    return null;
  }
}

// ─── Constants & types ────────────────────────────────────────────────────────

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

// ─── Local cache helpers ──────────────────────────────────────────────────────

function localCacheKey(date: string) { return `steps_cache_${date}`; }

function readLocalCache(date: string): number {
  try { const v = localStorage.getItem(localCacheKey(date)); return v ? parseInt(v, 10) : 0; }
  catch { return 0; }
}

function writeLocalCache(date: string, count: number) {
  try { localStorage.setItem(localCacheKey(date), String(count)); } catch {}
}

// ─── iOS: ISO date with fractional seconds (required by capacitor-health) ────

function toHealthKitISO(date: Date): string {
  // capacitor-health Swift parser requires fractional seconds: 2026-05-30T05:44:30.000Z
  return date.toISOString(); // already includes .sssZ
}

// ─── iOS: query today's steps from HealthKit ─────────────────────────────────

async function queryHealthKitStepsToday(
  health: NonNullable<Awaited<ReturnType<typeof getHealth>>>,
): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();

    const result = await health.queryAggregated({
      startDate: toHealthKitISO(todayStart),
      endDate:   toHealthKitISO(now),
      dataType:  'steps',
      bucket:    'day',
    });

    if (!result?.aggregatedData?.length) return 0;
    const total = result.aggregatedData.reduce((sum, s) => sum + (s.value > 0 ? s.value : 0), 0);
    return Math.round(total);
  } catch (e) {
    console.warn('[HealthKit] queryAggregated failed:', e);
    return 0;
  }
}

// ─── iOS: resolve initial steps (HealthKit → cache → DB) ─────────────────────

async function resolveInitialStepsIOS(
  health: NonNullable<Awaited<ReturnType<typeof getHealth>>>,
  userId: string | undefined,
  today: string,
): Promise<number> {
  // 1. HealthKit (most accurate — all sources including Apple Watch)
  const fromHealth = await queryHealthKitStepsToday(health);
  if (fromHealth > 0) return fromHealth;

  // 2. localStorage cache
  const cached = readLocalCache(today);
  if (cached > 0) return cached;

  // 3. Supabase DB
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

// ─── Android: resolve initial steps (SharedPrefs → cache → DB) ───────────────

async function resolveInitialStepsAndroid(
  userId: string | undefined,
  today: string,
): Promise<number> {
  try { const { steps } = await StepCounter.getDailySteps(); if (steps > 0) return steps; }
  catch {}
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

  // ── Debounced save to localStorage + Supabase ─────────────────────────────
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

  // ── Android: start Foreground Service + live broadcast listener ───────────
  const startAndroidTracking = useCallback(async () => {
    await StepCounter.startService();
    const today = format(new Date(), 'yyyy-MM-dd');
    const initialSteps = await resolveInitialStepsAndroid(userId, today);
    setSteps(initialSteps);
    if (initialSteps > 0) saveSteps(initialSteps);
    const handle = await StepCounter.addListener('stepUpdate', (data) => {
      setSteps(data.steps);
      saveSteps(data.steps);
    });
    listenerRef.current = handle;
  }, [userId, saveSteps]);

  // ── iOS: request HealthKit permission + initial read ─────────────────────
  const startIOSTracking = useCallback(async (health: NonNullable<Awaited<ReturnType<typeof getHealth>>>) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const initialSteps = await resolveInitialStepsIOS(health, userId, today);
    setSteps(initialSteps);
    if (initialSteps > 0) saveSteps(initialSteps);
  }, [userId, saveSteps]);

  // ── appStateChange: re-check permissions + refresh on foreground ──────────
  // Android: detects when user comes back from Settings after granting permission
  // iOS:     refreshes HealthKit step total on every app foreground
  useEffect(() => {
    if (hasPermission && !isIOS) return;

    let handle: { remove: () => void } | null = null;

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', async ({ isActive }: { isActive: boolean }) => {
        if (!isActive) return;

        // ── Android ──────────────────────────────────────────────────────────
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

        // ── iOS: refresh HealthKit on every foreground ────────────────────
        if (isIOS) {
          const health = await getHealth();
          if (!health) return;
          try {
            const available = await health.isHealthAvailable();
            if (!available.available) return;

            if (!hasPermission) {
              // Try to get permission and start tracking
              await health.requestHealthPermissions({ permissions: ['READ_STEPS'] });
              setHasPermission(true);
              await startIOSTracking(health);
            } else {
              // Already permitted — just refresh the count
              const fresh = await queryHealthKitStepsToday(health);
              if (fresh >= 0) {
                setSteps(fresh);
                saveSteps(fresh);
              }
            }
          } catch {}
        }
      }).then((h: { remove: () => void }) => { handle = h; });
    });

    return () => { handle?.remove(); };
  }, [isAndroid, isIOS, hasPermission, startAndroidTracking, startIOSTracking, saveSteps]);

  // ── Main initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {

      // ── Android ────────────────────────────────────────────────────────────
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

      // ── iOS: HealthKit ─────────────────────────────────────────────────────
      if (isIOS) {
        const health = await getHealth();
        if (!health || cancelled) return;

        try {
          const available = await health.isHealthAvailable();
          if (!available.available) return;
          setIsAvailable(true);

          // Request READ_STEPS permission
          await health.requestHealthPermissions({ permissions: ['READ_STEPS'] });
          // Note: on iOS we can't detect if user denied — plugin assumes granted
          setHasPermission(true);

          if (cancelled) return;
          await startIOSTracking(health);
        } catch {}
        return;
      }
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [startAndroidTracking, startIOSTracking, isAndroid, isIOS]);

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

    if (isIOS) {
      const health = await getHealth();
      if (!health) return;
      try {
        await health.requestHealthPermissions({ permissions: ['READ_STEPS'] });
        setHasPermission(true);
        const fresh = await queryHealthKitStepsToday(health);
        if (fresh >= 0) { setSteps(fresh); saveSteps(fresh); }
        // If still 0, guide user to open Health settings
        if (fresh === 0) {
          await health.openAppleHealthSettings();
        }
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
