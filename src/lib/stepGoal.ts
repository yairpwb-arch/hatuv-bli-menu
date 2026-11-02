/**
 * The daily step goal. Until day 44 there's no target yet: the trainee's own
 * average so far. From day 44 (weeks 7–8, when steps start to count) it's
 * 6,000, or, for whoever already averages that, their average plus 2,000.
 * The push-notification function works it out the same way.
 */
export const STEPS_COUNT_FROM_DAY = 44;
export const STEP_FLOOR = 6_000;
export const STEP_RAISE = 2_000;

/** Before there's any average to go by. */
export const DEFAULT_STEP_GOAL = STEP_FLOOR;

const round100 = (n: number) => Math.round(n / 100) * 100;

/** `average`: the trainee's daily average since the start (days with steps, today left out). */
export function stepGoalFor(programDay: number, average: number | null): number {
  if (programDay < STEPS_COUNT_FROM_DAY) return average ? round100(average) : DEFAULT_STEP_GOAL;
  return average != null && average >= STEP_FLOOR ? round100(average + STEP_RAISE) : STEP_FLOOR;
}
