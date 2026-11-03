/**
 * The weekly survey (Fridays). Built for each trainee from what they have:
 *
 *  - every week: today's weight, and a 1–10 for each habit they have that week;
 *  - every second week from the week their workouts started: how each workout
 *    went, progress in reps / weights, what to improve, anything else.
 *    Workouts open from the start → weeks 2, 4, 6…; workouts that opened with
 *    the weeks 5–6 video → weeks 6, 8, 10…
 *
 * Saved in weekly_checkin.answers as a list of { key, question, answer } in the
 * order asked, so the admin screen (and later the coaching bot) read it as is.
 */
import { pickGender } from '@/lib/guideBlocks';

export type SurveyOption = { value: string; label: string };

/** Program week whose survey includes the workout questions. */
export function hasWorkoutQuestions(currentWeek: number, workoutsFromWeek: number | null): boolean {
  if (workoutsFromWeek == null) return false;
  const since = currentWeek - workoutsFromWeek;
  return since >= 1 && since % 2 === 1;
}

/** Program week of a program day (day 1–7 = week 1). */
export const weekOfDay = (day: number) => Math.max(1, Math.ceil(day / 7));

export const T = {
  weight: 'מה המשקל שלך מהיום?',
  weightHint: 'הכי טוב משקילה של הבוקר. המשקל יתעדכן גם בהתקדמות.',
  habitsTitle: 'כמה הצלחת להתמיד בהרגלים השבוע?',
  habitsHint: '1 = בכלל לא, 10 = כל יום',
  workoutsTitle: 'התקדמות באימונים',
  workoutFeel: (name: string) => `איך היה האימון בכלליות (${name})?`,
  progressed: '{האם הצלחת|האם הצלחת} להעלות בחזרות או במשקלים מאימון קודם בתרגילים מסוימים?',
  progressedWhich: 'באיזה תרגילים ובכמה {עלית|עלית}?',
  improve: 'דברים {שאתה חושב שאתה צריך|שאת חושבת שאת צריכה} לשפר באימונים?',
  improveHint: 'אפשר לבחור כמה',
  improveOther: 'מה עוד?',
  share: 'דבר נוסף {שאתה רוצה|שאת רוצה} לשתף אותנו?',
  shareHint: 'לא חובה',
};

export const WORKOUT_FEEL: SurveyOption[] = [
  { value: 'great', label: 'מעולה, עשיתי הכל בלי בעיה' },
  { value: 'good', label: 'טוב, מאתגר אבל הצלחתי' },
  { value: 'hard', label: 'קשה, לא הצלחתי לסיים חלק מהתרגילים' },
  { value: 'too_easy', label: 'קל מדי, אפשר להעלות רמה' },
  { value: 'skipped', label: 'לא הספקתי לעשות אותו' },
];

export const YES_NO: SurveyOption[] = [
  { value: 'yes', label: 'כן' },
  { value: 'no', label: 'לא' },
];

export const PROGRESS_AMOUNT: SurveyOption[] = [
  { value: 'reps_1', label: 'חזרה אחת' },
  { value: 'reps_2_3', label: '2–3 חזרות' },
  { value: 'reps_4', label: '4 חזרות ומעלה' },
  { value: 'weight', label: 'עליתי במשקל' },
];

export const IMPROVE: SurveyOption[] = [
  { value: 'technique', label: 'טכניקה בתרגילים' },
  { value: 'consistency', label: 'להגיע לכל האימונים' },
  { value: 'weights', label: 'להעלות משקלים' },
  { value: 'effort', label: 'להתאמץ יותר בכל סט' },
  { value: 'rest', label: 'לשמור על זמני המנוחה' },
  { value: 'warmup', label: 'חימום לפני האימון' },
  { value: 'recovery', label: 'שינה והתאוששות' },
  { value: 'nothing', label: 'כרגע אין' },
  { value: 'other', label: 'אחר' },
];

export const HABIT_SCALE = Array.from({ length: 10 }, (_, i) => i + 1);

/** A label for a stored option value. */
export const labelOf = (options: SurveyOption[], value: unknown) => options.find((o) => o.value === value)?.label ?? String(value ?? '');

/** The texts in the trainee's gender. */
export const say = (text: string, gender: string | null | undefined) => pickGender(text, gender);

export interface SurveyItem {
  key: string;
  question: string;
  answer: string | number;
}
