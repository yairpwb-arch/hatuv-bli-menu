/**
 * The daily step goal.
 *
 * Until day 44 there's no target yet: the trainee's own average so far.
 * Each steps habit then sets a floor from the day it opens: 6,000 from day 44
 * (weeks 7–8), 8,000 from day 86. On that day the trainee's average since the
 * start is set aside (the baseline): whoever is already at the floor gets
 * baseline + 2,000, everyone else the floor. The baseline stays put until the
 * next habit opens; walking more later doesn't move the goal up again.
 *
 * The baseline is "every whole day before the habit's opening day", so it's
 * worked out the same way every time, here and in the push-notification
 * function, without being stored.
 */
import { addDays, format } from 'date-fns';

export const STEP_RAISE = 2_000;
export const STEP_STAGES = [
  { fromDay: 44, floor: 6_000 },
  { fromDay: 86, floor: 8_000 },
] as const;
export const STEPS_COUNT_FROM_DAY = STEP_STAGES[0].fromDay;

/** Before there's any average to go by. */
export const DEFAULT_STEP_GOAL = STEP_STAGES[0].floor;

const round100 = (n: number) => Math.round(n / 100) * 100;

export type StepDay = { date: string; steps: number };

/** The steps habit in force on a program day, or null before the first one. */
export function stepStageOn(programDay: number) {
  return [...STEP_STAGES].reverse().find((s) => programDay >= s.fromDay) ?? null;
}

/** Average of days with steps, from the start and before `beforeDate` (yyyy-MM-dd). */
export function averageBefore(days: StepDay[], beforeDate: string): number | null {
  const whole = days.filter((d) => d.steps > 0 && d.date < beforeDate);
  return whole.length ? whole.reduce((s, d) => s + d.steps, 0) / whole.length : null;
}

/** The calendar date of a program day (day 1 = start date). */
export const dateOfProgramDay = (startDate: string, programDay: number) =>
  format(addDays(new Date(`${startDate}T12:00:00`), programDay - 1), 'yyyy-MM-dd');

/**
 * Today's goal. `days`: the trainee's steps_log since the start; `today`: yyyy-MM-dd
 * (left out of every average, it's still going).
 */
export function stepGoalFor(programDay: number, startDate: string, days: StepDay[], today: string): number {
  const stage = stepStageOn(programDay);
  if (!stage) {
    const average = averageBefore(days, today);
    return average ? round100(average) : DEFAULT_STEP_GOAL;
  }
  const baseline = averageBefore(days, dateOfProgramDay(startDate, stage.fromDay));
  return baseline != null && baseline >= stage.floor ? round100(baseline + STEP_RAISE) : stage.floor;
}
