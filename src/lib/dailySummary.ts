/**
 * The bedtime "daily summary": one tap per question, built from the active
 * habits that aren't on the table. Every answer is tied to its habit_id.
 */
import type { Habit } from '@/hooks/useHabits';

export type SummaryAnswer = 'yes' | 'partial' | 'no';

export interface SummaryQuestion {
  habit: Habit;
  text: string;
  /** Always yes → partial → no, labelled to fit the question. */
  options: { value: SummaryAnswer; label: string }[];
}

const YES_PARTIAL_NO = [
  { value: 'yes' as const, label: 'כן' },
  { value: 'partial' as const, label: 'חלקית' },
  { value: 'no' as const, label: 'לא' },
];

/** "3 שעות" / "שעתיים" / "שעה" in the habit name → hours, else the fallback. */
function hoursIn(name: string, fallback: number): number {
  const digits = name.match(/(\d+)\s*שעות/);
  if (digits) return Number(digits[1]);
  if (name.includes('שעתיים')) return 2;
  if (/(^|\s)שעה(\s|$)/.test(name)) return 1;
  return fallback;
}

export function hoursLabel(n: number): string {
  if (n === 1) return 'שעה';
  if (n === 2) return 'שעתיים';
  return `${n} שעות`;
}

export function questionFor(habit: Habit): SummaryQuestion {
  switch (habit.visual_key) {
    case 'routine_wake_eat':
      return { habit, text: `התחלת לאכול ${hoursLabel(hoursIn(habit.name, 3))} אחרי שקמת?`, options: YES_PARTIAL_NO };
    case 'routine_stop_eating':
      return { habit, text: `הפסקת לאכול ${hoursLabel(hoursIn(habit.name, 2))} לפני השינה?`, options: YES_PARTIAL_NO };
    case 'no_sweet_drinks':
      return {
        habit,
        text: 'שתייה מתוקה היום',
        options: [{ value: 'yes', label: 'לא בכלל' }, { value: 'partial', label: 'כוס אחת' }, { value: 'no', label: 'יותר' }],
      };
    case 'coffee_sugar':
      return {
        habit,
        text: 'סוכר בקפה',
        options: [{ value: 'yes', label: 'בלי' }, { value: 'partial', label: 'חצי' }, { value: 'no', label: 'רגיל' }],
      };
    case 'routine_sleep':
      return { habit, text: 'נכנסים למיטה בזמן הלילה?', options: YES_PARTIAL_NO };
    default:
      return { habit, text: habit.name.endsWith('?') ? habit.name : `${habit.name}?`, options: YES_PARTIAL_NO };
  }
}

/** "הרגל אחד" / "2 הרגלים". */
export const habitsCount = (n: number) => (n === 1 ? 'הרגל אחד' : `${n} הרגלים`);
