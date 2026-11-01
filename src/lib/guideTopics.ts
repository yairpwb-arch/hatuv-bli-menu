import { Dumbbell, Luggage, Moon, Scale, UtensilsCrossed, Wine, Zap, BookOpen, type LucideIcon } from 'lucide-react';

/**
 * Guide topics for the guides library. program_content.category when the
 * column exists (migration 20261031000001); until then, read from the title.
 */
export type GuideCategory = 'nutrition' | 'events' | 'training' | 'sleep';

export const GUIDE_CATEGORIES: { value: GuideCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'nutrition', label: 'תזונה' },
  { value: 'events', label: 'אירועים ויציאות' },
  { value: 'training', label: 'אימונים' },
  { value: 'sleep', label: 'שינה ושגרה' },
];

const has = (title: string, ...words: string[]) => words.some((w) => title.includes(w));

export function guideCategory(item: { title: string; category?: string | null }): GuideCategory {
  const c = item.category;
  if (c === 'nutrition' || c === 'events' || c === 'training' || c === 'sleep') return c;
  const t = item.title;
  if (has(t, 'מסעד', 'אירוע', 'חו"ל', 'חו״ל', 'טיסה', 'נופש', 'חופש', 'יציא', 'מסיב', 'חג')) return 'events';
  if (has(t, 'אימון', 'כוח', 'הליכ', 'ריצ', 'כושר')) return 'training';
  if (has(t, 'שינה', 'שגרה', 'בוקר', 'לילה', 'קימה')) return 'sleep';
  return 'nutrition';
}

/** A specific icon from the title where one fits, else the topic's icon. */
export function guideIcon(item: { title: string; category?: string | null }): LucideIcon {
  const t = item.title;
  if (has(t, 'שקיל', 'משקל')) return Scale;
  if (has(t, 'מסעד', 'אירוע', 'מסיב')) return Wine;
  if (has(t, 'חו"ל', 'חו״ל', 'טיסה', 'נופש', 'חופש')) return Luggage;
  if (has(t, 'לא צפוי', 'פתאום', 'מפתיע', 'חירום')) return Zap;
  if (has(t, 'צלחת', 'ארוח')) return UtensilsCrossed;
  switch (guideCategory(item)) {
    case 'training':
      return Dumbbell;
    case 'sleep':
      return Moon;
    case 'events':
      return Wine;
    case 'nutrition':
      return UtensilsCrossed;
    default:
      return BookOpen;
  }
}

/** Titles sometimes come wrapped in quotes ("מדריך "איך להישקל נכון?""); the card shows them bare. */
export const bareTitle = (title: string) => title.replace(/["“”״]/g, '').replace(/\s+/g, ' ').trim();
