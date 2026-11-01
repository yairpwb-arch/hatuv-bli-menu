/**
 * On-device reminders (@capacitor/local-notifications). Bedtime differs per
 * trainee, so the "daily summary" nudge is scheduled on the phone itself:
 * one notification per night for the coming week, 30 minutes before bedtime,
 * rebuilt whenever the app opens or the sleep hours change.
 */
import { Capacitor } from '@capacitor/core';
import { addDays, format } from 'date-fns';
import { SleepSchedule, bedtimeOf } from '@/lib/sleepSchedule';
import { requestNavigate } from '@/lib/appNavigate';

const BEDTIME_IDS = Array.from({ length: 8 }, (_, i) => 7000 + i);
export const SUMMARY_ROUTE = '/app?summary=1';

async function plugin() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/**
 * Replaces the upcoming bedtime reminders. Never asks for permission: if
 * notifications aren't allowed yet, nothing is scheduled. `skipDay` is a day
 * whose summary is already filled in.
 */
export async function scheduleBedtimeReminders(s: SleepSchedule, opts: { enabled: boolean; skipDay?: string | null }) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const ln = await plugin();
    await ln.cancel({ notifications: BEDTIME_IDS.map((id) => ({ id })) });
    if (!opts.enabled) return;
    const { display } = await ln.checkPermissions();
    if (display !== 'granted') return;

    const now = Date.now();
    const notifications = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(new Date(), d);
      if (format(day, 'yyyy-MM-dd') === opts.skipDay) continue;
      const at = new Date(bedtimeOf(day, s).getTime() - 30 * 60_000);
      if (at.getTime() <= now) continue;
      notifications.push({
        id: BEDTIME_IDS[d],
        title: 'סיכום היום',
        body: 'רגע לפני השינה, איך היה היום? (20 שניות)',
        schedule: { at, allowWhileIdle: true },
        extra: { route: SUMMARY_ROUTE },
      });
    }
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
