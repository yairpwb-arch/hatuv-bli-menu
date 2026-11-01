/**
 * The trainee's sleep hours: stored on the profile (Settings), defaulting to
 * the intake questionnaire. They drive the bedtime summary window, night
 * mode, quiet hours and the nightly "sleep" calendar event.
 */
import { addDays, format } from 'date-fns';
import type { Answers } from '@/lib/onboarding';

export interface SleepSchedule {
  /** "HH:MM" */
  bed: string;
  /** "HH:MM" */
  wake: string;
}

export const DEFAULT_SLEEP: SleepSchedule = { bed: '23:00', wake: '07:00' };

/** Questionnaire answer buckets → a representative clock time. */
const BED_ANSWER: Record<string, string> = {
  before22: '21:30', '22-23': '22:30', '23-00': '23:30', '00-01': '00:30', after01: '01:00',
};
const WAKE_ANSWER: Record<string, string> = {
  before6: '05:30', '6-7': '06:30', '7-8': '07:30', '8-9': '08:30', after9: '09:30',
};

export function sleepFromAnswers(answers: Answers | null | undefined): SleepSchedule {
  return {
    bed: BED_ANSWER[String(answers?.bedtime ?? '')] ?? DEFAULT_SLEEP.bed,
    wake: WAKE_ANSWER[String(answers?.wake_time ?? '')] ?? DEFAULT_SLEEP.wake,
  };
}

/** "23:00:00" (Postgres TIME) or "23:00" → "23:00". */
export const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const clock = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Between bedtime and wake-up (handles nights that cross midnight). */
export function isNight(s: SleepSchedule, now = new Date()): boolean {
  const n = minutesOf(now);
  const bed = toMinutes(s.bed);
  const wake = toMinutes(s.wake);
  return bed <= wake ? n >= bed && n < wake : n >= bed || n < wake;
}

/** The moment a given day's bedtime happens (a 00:30 bedtime belongs to the evening before). */
export function bedtimeOf(day: Date, s: SleepSchedule): Date {
  const bed = toMinutes(s.bed);
  // Built from calendar fields, not midnight + milliseconds, so the clock
  // change (DST) night still lands on the right hour.
  const nextDay = bed < 12 * 60 ? 1 : 0;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + nextDay, Math.floor(bed / 60), bed % 60, 0, 0);
}

/** One night's sleep block: that day's bedtime until the next wake-up. */
export function sleepBlock(day: Date, s: SleepSchedule): { start: Date; end: Date } {
  const start = bedtimeOf(day, s);
  const wakeMin = toMinutes(s.wake);
  const end = new Date(start);
  end.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

/** The moment a given day's wake-up happens. */
export function wakeOf(day: Date, s: SleepSchedule): Date {
  const wake = toMinutes(s.wake);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(wake / 60), wake % 60, 0, 0);
}

/**
 * Calendar keys for a day's two moments; the time is part of the key so a
 * changed hour means a new event (and the phone copy gets replaced).
 */
export const sleepEventKey = (day: string, s: SleepSchedule) => `sleep:${day}:${s.bed}`;
export const wakeEventKey = (day: string, s: SleepSchedule) => `wake:${day}:${s.wake}`;
/** Keys of the old one-block-per-night events ("sleep:<day>:<bed>-<wake>"). */
export const isLegacySleepKey = (key: string) => /^sleep:[^:]+:\d\d:\d\d-/.test(key);

/*
 * Sleep-hour history, so a change in Settings moves the coming days only:
 * days before the change keep the hours they had. Kept on the device.
 */
interface SleepChange extends SleepSchedule {
  /** yyyy-MM-dd the hours apply from. */
  from: string;
}
const historyKey = (userId: string) => `sleepHistory:${userId}`;

function readHistory(userId: string): SleepChange[] {
  try {
    return JSON.parse(localStorage.getItem(historyKey(userId)) ?? '[]') as SleepChange[];
  } catch {
    return [];
  }
}

/** Remember a change: the old hours up to yesterday, the new ones from today. */
export function recordSleepChange(userId: string, prev: SleepSchedule, next: SleepSchedule, today = new Date()) {
  const from = format(today, 'yyyy-MM-dd');
  const history = readHistory(userId).filter((h) => h.from < from);
  if (history.length === 0) history.push({ from: '0000-00-00', ...prev });
  history.push({ from, ...next });
  try {
    localStorage.setItem(historyKey(userId), JSON.stringify(history));
  } catch {
    /* storage unavailable: past days follow the current hours, nothing else lost */
  }
}

/** The hours that applied on a day: the last change on or before it, else the current hours. */
export function scheduleOn(userId: string, day: string, current: SleepSchedule): SleepSchedule {
  if (day >= format(new Date(), 'yyyy-MM-dd')) return current;
  const hit = readHistory(userId).filter((h) => h.from <= day).pop();
  return hit ? { bed: hit.bed, wake: hit.wake } : current;
}

export const SUMMARY_BEFORE_MIN = 60;
export const SUMMARY_AFTER_MIN = 60;

/**
 * The bedtime summary is open from an hour before bedtime to an hour after.
 * Returns the day being summarised while it's open, otherwise null.
 */
export function openSummaryDay(s: SleepSchedule, now = new Date()): string | null {
  for (const offset of [0, -1]) {
    const day = addDays(now, offset);
    const bed = bedtimeOf(day, s).getTime();
    const t = now.getTime();
    if (t >= bed - SUMMARY_BEFORE_MIN * 60_000 && t <= bed + SUMMARY_AFTER_MIN * 60_000) return format(day, 'yyyy-MM-dd');
  }
  return null;
}

/** Thursday's summary carries the three weekly check-in questions. */
export const isWeeklyCheckinDay = (day: string) => new Date(`${day}T12:00:00`).getDay() === 4;

// Last known schedule per trainee, so night mode can decide before the network answers.
const cacheKey = (userId: string) => `sleepSchedule:${userId}`;
export function readCachedSleep(userId: string): SleepSchedule | null {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null');
    return v?.bed && v?.wake ? v : null;
  } catch {
    return null;
  }
}
export function writeCachedSleep(userId: string, s: SleepSchedule) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(s));
  } catch {
    /* storage blocked: we'll just wait for the network next time */
  }
}
