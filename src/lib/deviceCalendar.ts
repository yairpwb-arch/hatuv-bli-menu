import { Capacitor } from '@capacitor/core';
import { addDays, format } from 'date-fns';
import type { CalEvent } from '@/hooks/useCalendar';
import { SleepSchedule, bedtimeOf, isLegacySleepKey, sleepEventKey, wakeEventKey, wakeOf } from '@/lib/sleepSchedule';

/**
 * Copies calendar events into the phone's own calendar. Each event is copied
 * once per device: the mapping (our key → device event id) is kept locally,
 * since device event ids mean nothing on another phone.
 */

const mapKey = (userId: string) => `deviceCalendarSync:${userId}`;

function readMap(userId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(mapKey(userId)) || '{}');
  } catch {
    return {};
  }
}

function writeMap(userId: string, map: Record<string, string>) {
  try {
    localStorage.setItem(mapKey(userId), JSON.stringify(map));
  } catch {
    // Storage blocked: the next sync may add duplicates, nothing worse.
  }
}

export const isDeviceCalendarAvailable = () => Capacitor.isNativePlatform();

/** True once the trainee has copied events to the phone calendar on this device. */
export const hasSyncedToDevice = (userId: string) => Object.keys(readMap(userId)).length > 0;

/**
 * After the sleep hours change: if the trainee already syncs to the phone
 * calendar, replace the next two weeks of wake-up / bedtime events there too.
 */
export async function resyncSleepToDevice(userId: string, s: SleepSchedule): Promise<void> {
  if (!isDeviceCalendarAvailable() || !hasSyncedToDevice(userId)) return;
  const events: CalEvent[] = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(new Date(), i);
    const key = format(day, 'yyyy-MM-dd');
    return [
      { key: wakeEventKey(key, s), source: 'sleep', type: 'wake', title: 'קימה', start: wakeOf(day, s), day: key, hasTime: true, done: false, readOnly: true },
      { key: sleepEventKey(key, s), source: 'sleep', type: 'sleep', title: 'שינה', start: bedtimeOf(day, s), day: key, hasTime: true, done: false, readOnly: true },
    ] as CalEvent[];
  }).flat();
  await syncToDeviceCalendar(userId, events);
}

/** Wake-up / bedtime copies are short markers (5 minutes), not blocks. */
const SLEEP_MARK_MIN = 5;

export type SyncResult = { status: 'ok'; added: number } | { status: 'denied' } | { status: 'unavailable' };

/** Asks for calendar access (the OS only prompts the first time) and adds new events. */
export async function syncToDeviceCalendar(userId: string, events: CalEvent[]): Promise<SyncResult> {
  if (!isDeviceCalendarAvailable()) return { status: 'unavailable' };
  const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');

  // iOS 17+ can grant write-only access, which is all we need. Android has
  // no write-only mode, and inserting needs the default calendar's id.
  const { result } =
    Capacitor.getPlatform() === 'ios'
      ? await CapacitorCalendar.requestWriteOnlyCalendarAccess()
      : await CapacitorCalendar.requestFullCalendarAccess();
  if (result !== 'granted') return { status: 'denied' };

  const map = readMap(userId);

  // A day whose sleep hours changed: remove the old copy before adding the new
  // one. The old all-night "שינה" blocks go entirely, whatever the day.
  const isSleepKey = (k: string) => k.startsWith('sleep:') || k.startsWith('wake:') || k.startsWith('habit:');
  const dayOf = (k: string) => `${k.split(':')[0]}:${k.split(':')[1]}`;
  const days = new Set(events.filter((e) => isSleepKey(e.key)).map((e) => dayOf(e.key)));
  const current = new Set(events.map((e) => e.key));
  for (const [key, id] of Object.entries(map)) {
    const stale = isLegacySleepKey(key) || (isSleepKey(key) && !current.has(key) && days.has(dayOf(key)));
    if (!stale) continue;
    try {
      await CapacitorCalendar.deleteEvent({ id });
    } catch (err) {
      console.warn('[deviceCalendar] could not remove', key, err);
    }
    delete map[key];
  }

  let added = 0;
  for (const e of events) {
    if (map[e.key]) continue;
    const start = e.hasTime ? e.start : new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
    const minutes = e.source === 'sleep' || e.source === 'habit' ? SLEEP_MARK_MIN : e.hasTime ? 30 : 24 * 60;
    const end = e.end ?? new Date(start.getTime() + minutes * 60_000);
    try {
      const { id } = await CapacitorCalendar.createEvent({
        title: e.title,
        startDate: start.getTime(),
        endDate: end.getTime(),
        isAllDay: !e.hasTime,
        description: 'חטוב בלי תפריט',
      });
      map[e.key] = id;
      added++;
    } catch (err) {
      console.warn('[deviceCalendar] could not add', e.key, err);
    }
  }
  writeMap(userId, map);
  return { status: 'ok', added };
}
