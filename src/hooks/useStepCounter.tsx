/**
 * useStepCounter — Daily step counter
 *
 * iOS:     CMPedometer (M-chip) + HealthKit (includes Apple Watch). The phone
 *          records steps on its own all day, so every time the app opens we
 *          backfill the last 7 days — a day the app wasn't opened is still
 *          recorded. In the background, HealthKit wakes the app (up to hourly)
 *          and StepSyncHelper uploads the same 7-day window natively.
 *
 * Android: Native StepCounterService (Foreground Service) with TYPE_STEP_COUNTER.
 *          Runs 24/7, keeps a 14-day history, uploads hourly + while walking,
 *          and restarts itself after a reboot or app update.
 *
 * Background uploads authenticate with a per-device sync token (see
 * lib/stepSync.ts) instead of the login session, which expires after ~1 hour.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { StepCounter } from '@/plugins/StepCounterPlugin';
import { StepSync } from '@/plugins/StepSyncPlugin';
import { getOrCreateStepSyncToken, syncStepEntries, type StepEntry } from '@/lib/stepSync';

export const STEP_GOAL = 10_000;

const IOS_HISTORY_DAYS = 7; // CMPedometer keeps 7 days of history

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

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

// ─── Local cache ──────────────────────────────────────────────────────────────

function localCacheKey(date: string) { return `steps_cache_${date}`; }
function readLocalCache(date: string): number {
  try { const v = localStorage.getItem(localCacheKey(date)); return v ? parseInt(v, 10) : 0; }
  catch { return 0; }
}
function writeLocalCache(date: string, count: number) {
  try { localStorage.setItem(localCacheKey(date), String(count)); } catch {}
}

async function readTodayFromDb(userId: string | undefined, today: string): Promise<number> {
  if (!userId) return 0;
  try {
    const { data } = await (supabase as any)
      .from('steps_log').select('steps')
      .eq('user_id', userId).eq('date', today).maybeSingle();
    return data?.steps > 0 ? data.steps : 0;
  } catch {
    return 0;
  }
}

// ─── iOS: step history ────────────────────────────────────────────────────────
// getMeasurement() auto-requests Motion & Fitness permission on first call.

async function queryCMPedometerRange(start: Date, end: Date): Promise<number> {
  try {
    const { CapacitorPedometer } = await import('@capgo/capacitor-pedometer');
    const result = await CapacitorPedometer.getMeasurement({ start: start.getTime(), end: end.getTime() });
    return result.numberOfSteps ?? 0;
  } catch (e) {
    console.warn('[Steps/CMPedometer]', e);
    return 0;
  }
}

async function queryHealthKitDaily(days: number): Promise<Map<string, number>> {
  const byDay = new Map<string, number>();
  try {
    const { Health } = await import('capacitor-health');
    const available = await Health.isHealthAvailable();
    if (!available.available) return byDay;

    const result = await Health.queryAggregated({
      startDate: startOfDay(subDays(new Date(), days - 1)).toISOString(),
      endDate: new Date().toISOString(),
      dataType: 'steps',
      bucket: 'day',
    });
    for (const sample of result?.aggregatedData ?? []) {
      if (!(sample.value > 0)) continue;
      const key = dayKey(new Date(sample.startDate));
      byDay.set(key, (byDay.get(key) ?? 0) + Math.round(sample.value));
    }
  } catch (e) {
    console.warn('[Steps/HealthKit]', e);
  }
  return byDay;
}

/** Last N days, newest first. Per day, the larger of CMPedometer (phone only)
 *  and HealthKit (phone + Apple Watch, de-duplicated by iOS). */
async function queryIOSStepsHistory(days: number): Promise<StepEntry[]> {
  const healthKit = await queryHealthKitDaily(days);
  const now = new Date();
  const entries: StepEntry[] = [];
  for (let i = 0; i < days; i++) {
    const day = subDays(now, i);
    const end = i === 0 ? now : endOfDay(day);
    const fromPedometer = await queryCMPedometerRange(startOfDay(day), end);
    const date = dayKey(day);
    entries.push({ date, steps: Math.max(fromPedometer, healthKit.get(date) ?? 0) });
  }
  return entries;
}

async function requestHealthKitStepsPermission() {
  try {
    const { Health } = await import('capacitor-health');
    await Health.requestHealthPermissions({ permissions: ['READ_STEPS'] });
  } catch {}
}

// ─── Android: resolve initial steps ──────────────────────────────────────────

async function resolveInitialStepsAndroid(userId: string | undefined, today: string): Promise<number> {
  try { const { steps } = await StepCounter.getDailySteps(); if (steps > 0) return steps; } catch {}
  const cached = readLocalCache(today);
  if (cached > 0) return cached;
  return readTodayFromDb(userId, today);
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

  // ── Debounced save of today's live count ─────────────────────────────────
  const saveSteps = useCallback((count: number) => {
    if (!userId) return;
    const today = dayKey(new Date());
    writeLocalCache(today, count);
    if (count === lastSavedRef.current) return;
    lastSavedRef.current = count;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      syncStepEntries(userId, [{ date: today, steps: count }]).catch(() => {});
    }, 3_000);
  }, [userId]);

  // ── Hand the native background code what it needs to upload on its own ──
  const syncUserConfig = useCallback(async () => {
    if (!userId) return;
    try {
      const syncToken = await getOrCreateStepSyncToken(userId);
      if (!syncToken) return;
      const config = {
        userId,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
        anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        syncToken,
      };
      if (isAndroid) await StepCounter.setUserConfig(config);
      if (isIOS)     await StepSync.setUserConfig(config);
    } catch {}
  }, [userId, isAndroid, isIOS]);

  // ── Android: start Foreground Service ────────────────────────────────────
  const startAndroidTracking = useCallback(async () => {
    // Config first, so the service's on-start upload already has credentials.
    await syncUserConfig();
    await StepCounter.startService();
    const today = dayKey(new Date());
    const initial = await resolveInitialStepsAndroid(userId, today);
    setSteps(initial);
    if (initial > 0) saveSteps(initial);
    listenerRef.current?.remove();
    listenerRef.current = await StepCounter.addListener('stepUpdate', (data) => {
      setSteps(data.steps);
      saveSteps(data.steps);
    });
  }, [userId, saveSteps, syncUserConfig]);

  // ── iOS: refresh today + backfill recent days the app wasn't opened ──────
  const refreshIOSSteps = useCallback(async () => {
    await syncUserConfig();
    const today = dayKey(new Date());
    const history = await queryIOSStepsHistory(IOS_HISTORY_DAYS);
    let count = history.find((e) => e.date === today)?.steps ?? 0;
    if (count === 0) count = readLocalCache(today) || (await readTodayFromDb(userId, today));
    setSteps(count);
    if (count > 0) writeLocalCache(today, count);
    if (userId) syncStepEntries(userId, history).catch(() => {});
    return count;
  }, [userId, syncUserConfig]);

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
        // HealthKit access is what lets iOS wake the app in the background
        // (hourly at most) to upload steps — ask before configuring it.
        // No-op once the user has already answered.
        await requestHealthKitStepsPermission();
        if (cancelled) return;
        await refreshIOSSteps();
        if (!cancelled) setHasPermission(true); // CMPedometer either worked or silently failed — treat as available
      }
    };

    init().catch(console.error);
    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [startAndroidTracking, refreshIOSSteps, userId, isAndroid, isIOS]);

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
      await requestHealthKitStepsPermission();
      await refreshIOSSteps();
      setHasPermission(true);
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
