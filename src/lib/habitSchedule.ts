/**
 * Habits with a time of day (the eating window, the meal layout) as calendar
 * moments. Which habits apply on a day comes from habit_definitions
 * (day_start / day_end against the trainee's program day); how they're timed
 * comes from habit_definitions.schedule_rule.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { SleepSchedule, bedtimeOf, clock, toMinutes, wakeOf } from '@/lib/sleepSchedule';

export interface AnchorRule {
  anchor: 'wake' | 'sleep';
  offset_minutes: number;
  label: string;
}
export interface MealRule {
  key: string;
  label: string;
  size: 'big' | 'small';
  optional?: boolean;
  explanation?: string;
}
export interface MealsRule {
  type: 'meals';
  meals: MealRule[];
}
export type ScheduleRule = AnchorRule | MealsRule;

export interface ScheduledHabitDef {
  id: string;
  name: string;
  day_start: number | null;
  day_end: number | null;
  user_id?: string | null;
  explanation?: string | null;
  schedule_rule?: ScheduleRule | null;
}

const isAnchor = (r: ScheduleRule): r is AnchorRule => 'anchor' in r;

/** The habit's time-of-day rule (habit_definitions.schedule_rule); none = not in the calendar. */
export function ruleOf(h: ScheduledHabitDef): ScheduleRule | null {
  return h.schedule_rule ?? null;
}

/** Program day (1-based) of a calendar day. */
export const programDay = (startDate: string, day: Date) =>
  differenceInCalendarDays(day, new Date(`${startDate}T12:00:00`)) + 1;

const activeOn = (h: ScheduledHabitDef, n: number) =>
  h.day_end !== 0 && (h.day_start ?? 1) <= n && (h.day_end == null || h.day_end >= n);

/** Rounds a Date to the nearest quarter hour. */
const quarter = (d: Date) => {
  const q = 15 * 60_000;
  return new Date(Math.round(d.getTime() / q) * q);
};

export interface DayMoment {
  habitId: string;
  /** 'eat_start' / 'eat_stop' for the window, 'meal' for a meal. */
  kind: 'eat_start' | 'eat_stop' | 'meal';
  label: string;
  at: Date;
  meal?: MealRule;
  explanation?: string | null;
}

export interface DayPlan {
  moments: DayMoment[];
  /** The hours leave no eating window (start ≥ stop): window and meals are hidden. */
  noWindow: boolean;
}

/**
 * The timed habits of one day. `mealTimes` are the trainee's own times
 * ("HH:MM" per meal key); meals without one follow the recommended times,
 * which move with the window.
 */
export function planDay(
  day: Date,
  n: number,
  hours: SleepSchedule,
  habits: ScheduledHabitDef[],
  mealTimes: Record<string, string> = {},
): DayPlan {
  const active = habits.filter((h) => activeOn(h, n) && ruleOf(h));
  // A personal habit replaces the global one with the same role.
  let start: DayMoment | null = null;
  let stop: DayMoment | null = null;
  let meals: { habit: ScheduledHabitDef; rule: MealsRule } | null = null;
  for (const h of active) {
    const rule = ruleOf(h)!;
    if (isAnchor(rule)) {
      const base = rule.anchor === 'wake' ? wakeOf(day, hours) : bedtimeOf(day, hours);
      const m: DayMoment = {
        habitId: h.id,
        kind: rule.anchor === 'wake' ? 'eat_start' : 'eat_stop',
        label: rule.label,
        at: new Date(base.getTime() + rule.offset_minutes * 60_000),
        explanation: h.explanation,
      };
      if (m.kind === 'eat_start') start = !start || h.user_id ? m : start;
      else stop = !stop || h.user_id ? m : stop;
    } else if (!meals || h.user_id) {
      meals = { habit: h, rule };
    }
  }

  if (start && stop && start.at >= stop.at) return { moments: [], noWindow: true };

  const moments: DayMoment[] = [];
  if (start) moments.push(start);

  if (meals) {
    // Recommended times from the window (wake + 3h / bedtime − 1h when the window habits aren't on yet).
    const open = start?.at ?? new Date(wakeOf(day, hours).getTime() + 180 * 60_000);
    const close = stop?.at ?? new Date(bedtimeOf(day, hours).getTime() - 60 * 60_000);
    const dinner = new Date(close.getTime() - 150 * 60_000);
    const recommended: Record<string, Date> = {
      brunch: open,
      dinner,
      snack: new Date((open.getTime() + dinner.getTime()) / 2),
      small: new Date((open.getTime() + dinner.getTime()) / 2),
      sweet: new Date(dinner.getTime() - 90 * 60_000),
    };
    for (const meal of meals.rule.meals) {
      const own = mealTimes[meal.key];
      let at = recommended[meal.key] ? quarter(recommended[meal.key]) : null;
      if (own) {
        const t = toMinutes(own);
        // Times before the wake-up hour belong to the night after this day.
        at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(t / 60), t % 60);
        if (t < toMinutes(hours.wake)) at = addDays(at, 1);
      }
      if (!at) continue;
      moments.push({ habitId: meals.habit.id, kind: 'meal', label: meal.label, at, meal, explanation: meal.explanation ?? meals.habit.explanation });
    }
  }

  if (stop) moments.push(stop);
  return { moments, noWindow: false };
}

/** The window for validating a meal time typed in Settings ("HH:MM" bounds), or null when there's none. */
export function windowBounds(plan: DayPlan): { open: string; close: string } | null {
  const s = plan.moments.find((m) => m.kind === 'eat_start');
  const e = plan.moments.find((m) => m.kind === 'eat_stop');
  if (!s || !e) return null;
  return { open: format(s.at, 'HH:mm'), close: format(e.at, 'HH:mm') };
}

/** Minutes since wake-up, so times after midnight compare as later in the day. */
export const minutesFromWake = (t: string, hours: SleepSchedule) =>
  (toMinutes(t) - toMinutes(hours.wake) + 1440) % 1440;

export { clock };
