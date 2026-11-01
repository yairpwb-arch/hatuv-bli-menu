/**
 * Exercise tags in Hebrew only. The library mixes Hebrew muscle names with a
 * few English values (mostly equipment like "dumbbell"); anything we can't
 * translate is dropped rather than shown in English.
 */
import type { WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';

const MUSCLES: Record<string, string> = {
  chest: 'חזה', back: 'גב', shoulders: 'כתפיים', biceps: 'יד קדמית', triceps: 'יד אחורית',
  legs: 'רגליים', quads: 'ארבע ראשי', quadriceps: 'ארבע ראשי', hamstrings: 'המסטרינג', glutes: 'ישבן',
  calves: 'שוקיים', core: 'ליבה', abs: 'בטן', forearms: 'אמות', lats: 'גב רחב', traps: 'טרפזים',
};

const EQUIPMENT: Record<string, string> = {
  dumbbell: 'משקולות', dumbbells: 'משקולות', barbell: 'מוט', bodyweight: 'משקל גוף', machine: 'מכונה',
  cable: 'כבלים', band: 'גומייה', bands: 'גומייה', kettlebell: 'קטלבל', bench: 'ספסל',
};

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

function toHebrew(raw: string, dict: Record<string, string>): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (hasHebrew(v)) return v;
  return dict[v.toLowerCase()] ?? null;
}

export function muscleTags(muscles: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const m of muscles ?? []) {
    const he = toHebrew(m, MUSCLES);
    if (he && !out.includes(he)) out.push(he);
  }
  return out;
}

export function equipmentTag(equipment: string | null | undefined): string | null {
  return equipment ? toHebrew(equipment, EQUIPMENT) : null;
}

/**
 * Rough workout length: ~40s of work per set plus the rest after it, plus a
 * minute to set up each exercise. Rounded to 5 minutes.
 */
export function estimateMinutes(exercises: Pick<WorkoutPlanExercise, 'sets' | 'rest_seconds'>[]): number {
  const seconds = exercises.reduce((sum, e) => sum + e.sets * (40 + (e.rest_seconds ?? 60)) + 60, 0);
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}
