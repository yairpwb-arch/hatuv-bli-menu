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

    // Get today's baseline first
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    try {
      const result = await pedometer.getMeasurement({
        start: todayStart.getTime(),
        end: Date.now(),
      });
      const initialSteps = result.numberOfSteps ?? 0;
      setSteps(initialSteps);
      if (result.distance != null) setDistance(result.distance);
      saveSteps(initialSteps);
    } catch {
      // Not fatal — live updates will still work
    }

    // Start real-time updates
    await pedometer.startMeasurementUpdates();
    const handle = await pedometer.addListener('measurement', (event) => {
      const count = event.numberOfSteps ?? 0;
      setSteps(count);
      if (event.distance != null) setDistance(event.distance);
      saveSteps(count);
    });
    listenerRef.current = handle;
  }, [saveSteps]);

  // Initialise
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const pedometer = await getPedometer();
      if (!pedometer || cancelled) return;

      const availability = await pedometer.isAvailable();
      if (!availability.stepCounting || cancelled) return;
      setIsAvailable(true);

      const perm = await pedometer.checkPermissions();
      if (perm.activityRecognition === 'granted') {
        setHasPermission(true);
        await startTracking();
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
