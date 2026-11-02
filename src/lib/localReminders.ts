/**
 * On-device reminders (@capacitor/local-notifications). The calendar works out
 * each trainee's workout and walk times on the phone, so those reminders are
 * scheduled there: two hours before each, for the coming week, rebuilt whenever
 * the app opens or a time changes.
 */
import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import type { CalEvent } from '@/hooks/useCalendar';
import { requestNavigate } from '@/lib/appNavigate';

/** Fired after a change that moves a workout or walk, to rebuild the reminders. */
export const CALENDAR_CHANGED = 'calendar-changed';

const BEDTIME_IDS = Array.from({ length: 8 }, (_, i) => 7000 + i);
const ACTIVITY_IDS = Array.from({ length: 24 }, (_, i) => 7100 + i);
const LEAD_MS = 2 * 60 * 60_000;

async function plugin() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/** The bedtime "daily summary" reminders older versions left scheduled. */
export async function cancelBedtimeReminders() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const ln = await plugin();
    await ln.cancel({ notifications: BEDTIME_IDS.map((id) => ({ id })) });
  } catch (err) {
    console.warn('[reminders] could not cancel', err);
  }
}

/**
 * Replaces the upcoming workout and walk reminders. Never asks for permission:
 * if notifications aren't allowed yet, nothing is scheduled.
 */
export async function scheduleActivityReminders(events: CalEvent[], enabled: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const ln = await plugin();
    await ln.cancel({ notifications: ACTIVITY_IDS.map((id) => ({ id })) });
    if (!enabled) return;
    const { display } = await ln.checkPermissions();
    if (display !== 'granted') return;
    const now = Date.now();
    const upcoming = events
      // The plan's workouts and walks, and the ones the trainee put in the calendar
      // (once or on fixed days), which come as custom events typed walk/workout.
      .filter((e) => (e.type === 'workout' || e.type === 'walk') && e.source !== 'activity')
      .filter((e) => !e.done && e.start.getTime() - LEAD_MS > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, ACTIVITY_IDS.length);
    const notifications = upcoming.map((e, i) => ({
      id: ACTIVITY_IDS[i],
      title: e.type === 'walk' ? 'יש לך הליכה היום' : `יש לך אימון היום: ${e.title}`,
      body: `בעוד שעתיים, ב-${format(e.start, 'HH:mm')}. אפשר לשנות את השעה בדף האימונים.`,
      schedule: { at: new Date(e.start.getTime() - LEAD_MS), allowWhileIdle: true },
      extra: { route: '/app/workouts' },
    }));
    if (notifications.length) await ln.schedule({ notifications });
  } catch (err) {
    console.warn('[reminders] could not schedule', err);
  }
}

/** Tapping a local notification opens the screen it points to. */
export async function listenForReminderTaps(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  try {
    const ln = await plugin();
    const handle = await ln.addListener('localNotificationActionPerformed', (a) => {
      const route = (a.notification.extra as { route?: string } | undefined)?.route;
      if (route) requestNavigate(route);
    });
    return () => handle.remove();
  } catch {
    return () => undefined;
  }
}
