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

export function useStepCounter(userId?: string): UseStepCounterReturn {
  const [steps, setSteps] = useState(0);
  const [distance, setDistance] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNative = Capacitor.isNativePlatform();

  // Debounced save to Supabase
  const saveSteps = useCallback((count: number) => {
    if (!userId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      await (supabase as any)
        .from('steps_log')
        .upsert(
          { user_id: userId, date: today, steps: count, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' }
        );
    }, 3000);
  }, [userId]);

  // Start live updates
  const startTracking = useCallback(async () => {
    const pedometer = await getPedometer();
    if (!pedometer) return;

    // 1. Get today's cumulative step count from the health store (midnight → now)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let stepsAtTrackingStart = 0;
    try {
      const result = await pedometer.getMeasurement({
        start: todayStart.getTime(),
        end: Date.now(),
      });
      stepsAtTrackingStart = result.numberOfSteps ?? 0;
      setSteps(stepsAtTrackingStart);
      if (result.distance != null) setDistance(result.distance);
      saveSteps(stepsAtTrackingStart);
    } catch {
      // Not fatal — live updates will still work
    }

    // 2. Start real-time updates.
    //    startMeasurementUpdates() starts from "now", so event.numberOfSteps
    //    is the cumulative count SINCE tracking started (not from midnight).
    //    We record the first sensor value as a baseline and add the delta on top
    //    of the daily total we already fetched above.
    await pedometer.startMeasurementUpdates();

    let sensorBaseline: number | null = null;

    const handle = await pedometer.addListener('measurement', (event) => {
      const raw = event.numberOfSteps ?? 0;

      if (sensorBaseline === null) {
        // First event — record the sensor value at this moment as baseline
        sensorBaseline = raw;
      }

      const delta = Math.max(0, raw - sensorBaseline);
      const total = stepsAtTrackingStart + delta;

      setSteps(total);
      if (event.distance != null) setDistance(event.distance);
      saveSteps(total);
    });
    listenerRef.current = handle;
  }, [saveSteps]);

  // Initialise
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const pedometer = await getPedometer();
      if (!pedometer || cancelled) return;

      const isIOS = Capacitor.getPlatform() === 'ios';

      // Check current permission state
      const perm = await pedometer.checkPermissions();
      if (perm.activityRecognition === 'granted') {
        setHasPermission(true);
      }

      // On iOS, auto-request permission on first launch (system dialog)
      // instead of waiting for the user to tap "אפשר גישה"
      if (isIOS && perm.activityRecognition !== 'granted' && !cancelled) {
        try {
          const result = await pedometer.requestPermissions();
          if (!cancelled && result.activityRecognition === 'granted') {
            setHasPermission(true);
          }
        } catch {
          // Permission denied or not available
        }
      }

      const availability = await pedometer.isAvailable();
      if (cancelled) return;
      // Mark as available if sensor exists OR if permission not yet granted
      // (so the "allow access" button is shown on Android)
      if (availability.stepCounting || perm.activityRecognition !== 'granted') {
        setIsAvailable(true);
      }

      if (availability.stepCounting) {
        const finalPerm = await pedometer.checkPermissions();
        if (finalPerm.activityRecognition === 'granted') {
          await startTracking();
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      getPedometer().then(p => p?.stopMeasurementUpdates());
    };
  }, [startTracking]);

  const requestPermission = async () => {
    const pedometer = await getPedometer();
    if (!pedometer) return;
    const perm = await pedometer.requestPermissions();
    if (perm.activityRecognition === 'granted') {
      setHasPermission(true);
      await startTracking();
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
