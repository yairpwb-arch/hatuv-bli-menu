/**
 * The device side of a tracked walk: location (keeps running with the screen
 * locked — on Android through a foreground service with a persistent
 * notification), steps from the existing pedometer, and keeping the screen on.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { CapacitorPedometer } from '@capgo/capacitor-pedometer';
import { StepCounter } from '@/plugins/StepCounterPlugin';
import type { TrackPoint } from '@/lib/walkTrack';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
const native = Capacitor.isNativePlatform();

export type GpsError = 'denied' | 'unavailable';

/**
 * Starts delivering location fixes (about every 5 m — battery-friendly).
 * Returns a stop function. On the web it uses the browser's geolocation.
 */
export async function watchLocation(onPoint: (p: TrackPoint) => void, onError: (e: GpsError) => void): Promise<() => void> {
  if (native) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'הליכה פעילה',
        backgroundMessage: 'מודדים את המסלול והמרחק — חזרו לאפליקציה כדי לראות',
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (location?: Location, error?: { code?: string }) => {
        if (error) {
          onError(error.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable');
          return;
        }
        if (!location) return;
        onPoint({ lat: location.latitude, lng: location.longitude, t: location.time ?? Date.now(), accuracy: location.accuracy, heading: location.bearing });
      },
    );
    return () => void BackgroundGeolocation.removeWatcher({ id });
  }
  if (!('geolocation' in navigator)) {
    onError('unavailable');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp, accuracy: pos.coords.accuracy, heading: pos.coords.heading }),
    (err) => onError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Opens this app's system settings (after a refused location permission). */
export const openLocationSettings = () => (native ? BackgroundGeolocation.openSettings() : Promise.resolve());

/** Steps since `startMs`, from the pedometer the app already uses. */
export async function stepsSince(startMs: number, baseline: number | null): Promise<number> {
  try {
    if (Capacitor.getPlatform() === 'ios') {
      const m = await CapacitorPedometer.getMeasurement({ start: startMs, end: Date.now() });
      return m.numberOfSteps ?? 0;
    }
    if (Capacitor.getPlatform() === 'android' && baseline != null) {
      const { steps } = await StepCounter.getDailySteps();
      return Math.max(0, steps - baseline);
    }
  } catch {
    /* no pedometer: steps stay 0 */
  }
  return 0;
}

/** Android counts steps per day; the walk's steps are the difference from the start. */
export async function stepBaseline(): Promise<number | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  try {
    return (await StepCounter.getDailySteps()).steps;
  } catch {
    return null;
  }
}

export const keepAwake = (on: boolean) => (native ? (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => undefined) : Promise.resolve());
