/**
 * The questionnaires as the coaches edit them (admin → שאלונים → שאלות).
 *
 * The questions are defined in code (onboarding.ts, weeklySurvey.ts); a row in
 * questionnaire_texts changes how a built-in question reads (title, subtitle,
 * option labels), hides it (only when the app doesn't rely on it), or is a
 * question the coaches added (is_custom). The catalog below lists every
 * built-in question of each questionnaire, with its default text, for the admin.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUESTIONS, type Option, type Question } from '@/lib/onboarding';
import { IMPROVE, PROGRESS_AMOUNT, T, WORKOUT_FEEL, YES_NO } from '@/lib/weeklySurvey';

export type QuestionnaireId = 'onboarding' | 'weekly' | 'workout';
export type CustomKind = 'text' | 'long_text' | 'number' | 'single' | 'multi' | 'scale' | 'yes_no';

export interface TextRow {
  id?: string;
  questionnaire: QuestionnaireId;
  key: string;
  title: string | null;
  subtitle: string | null;
  options: Option[] | null;
  hidden: boolean;
  is_custom: boolean;
  kind: CustomKind | null;
  required: boolean;
  sort_order: number;
}

// questionnaire_texts isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const TEXTS_KEY = ['questionnaire-texts'];

/** Every row (they're few), cached; the admin invalidates TEXTS_KEY after a save. */
export function useQuestionnaireTexts() {
  return useQuery({
    queryKey: TEXTS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TextRow[]> => {
      const { data, error } = await db.from('questionnaire_texts').select('*').order('sort_order').order('updated_at');
      // Before the table exists (or offline): the questionnaires as written in the code.
      if (error) return [];
      return (data ?? []) as TextRow[];
    },
  });
}

/** One questionnaire's edits, applied on top of the code's defaults. */
export function textsFor(rows: TextRow[] | undefined, q: QuestionnaireId) {
  const mine = (rows ?? []).filter((r) => r.questionnaire === q);
  const byKey = new Map(mine.filter((r) => !r.is_custom).map((r) => [r.key, r]));
  return {
    title: (key: string, fallback: string) => byKey.get(key)?.title?.trim() || fallback,
    subtitle: (key: string, fallback?: string) => {
      const r = byKey.get(key);
      // An emptied subtitle in the admin means "no subtitle".
      return r && r.subtitle != null ? r.subtitle.trim() || undefined : fallback;
    },
    /** Same values as the code (the app relies on them), the coaches' labels. */
    options: <O extends Option>(key: string, fallback: O[]): O[] => {
      const edited = byKey.get(key)?.options;
      if (!edited?.length) return fallback;
      return fallback.map((o) => ({ ...o, label: edited.find((e) => e.value === o.value)?.label?.trim() || o.label }));
    },
    hidden: (key: string) => !!byKey.get(key)?.hidden && !LOCKED[q].has(key),
    custom: mine.filter((r) => r.is_custom && !r.hidden).sort((a, b) => a.sort_order - b.sort_order),
  };
}

// ── What can't be hidden: the app or the bot builds on the answer ────────────

const ONBOARDING_LOCKED = [
  'name', 'age', 'gender', 'height', 'weight', 'target_weight', 'goal', 'walks',
  'trains', 'training_types', 'training_duration', 'strength_per_week', 'strength_location', 'session_length',
  'max_pullups', 'max_pushups', 'max_squats', 'injuries', 'medical', 'preferred_location',
];
export const LOCKED: Record<QuestionnaireId, Set<string>> = {
  onboarding: new Set([...ONBOARDING_LOCKED, ...QUESTIONS.filter((q) => q.id.endsWith('_per_week')).map((q) => q.id)]),
  weekly: new Set(['weight', 'habits', 'habit_sleep', 'measurements']),
  workout: new Set(['workout_feel', 'section']),
};

/** Why a question can't be hidden (shown next to the lock in the admin). */
export const LOCK_REASON: Record<QuestionnaireId, string> = {
  onboarding: 'המסלול, התוכנית או הבוט נשענים על התשובה: אפשר לשנות נוסח, לא להסתיר',
  weekly: 'חלק קבוע בשאלון: אפשר לשנות נוסח, לא להסתיר',
  workout: 'חלק קבוע בשאלות האימונים: אפשר לשנות נוסח, לא להסתיר',
};

// ── The catalog: every built-in question, as the admin lists it ──────────────

export interface CatalogItem {
  key: string;
  title: string;
  subtitle?: string;
  options?: Option[];
  /** What kind of answer, in Hebrew (a badge). */
  type: string;
  /** When it's asked, if not always. */
  note?: string;
}

const TYPE_HE: Record<Question['kind'], string> = {
  text: 'טקסט', number: 'מספר', single: 'בחירה אחת', multi: 'בחירה מרובה', photos: 'תמונות', measurements: 'היקפים',
};
const ONBOARDING_NOTES: Record<string, string> = {
  training_types: 'רק למי שמתאמן באופן קבוע',
  training_duration: 'רק למי שמתאמן באופן קבוע',
  session_length: 'רק למי שמתאמן באופן קבוע',
  strength_per_week: 'רק למי שעושה אימוני כוח',
  strength_location: 'רק למי שעושה אימוני כוח',
};

export const CATALOG: Record<QuestionnaireId, CatalogItem[]> = {
  onboarding: QUESTIONS.map((q) => ({
    key: q.id,
    title: q.title,
    subtitle: q.subtitle,
    options: q.kind === 'single' || q.kind === 'multi' ? q.options : undefined,
    type: TYPE_HE[q.kind],
    note: ONBOARDING_NOTES[q.id] ?? (q.id.endsWith('_per_week') ? 'רק למי שבחר את סוג האימון הזה' : q.optional ? 'לא חובה' : undefined),
  })),
  weekly: [
    { key: 'weight', title: T.weight, subtitle: T.weightHint, type: 'מספר' },
    { key: 'measurements', title: 'מדידת היקפים', type: 'היקפים', note: 'פעם בחודשיים' },
    { key: 'habits', title: T.habitsTitle, subtitle: T.habitsHint, type: 'כותרת', note: 'אחריה: ציון 1–10 לכל הרגל פעיל של המתאמן באותו שבוע (שמות ההרגלים נערכים בדף ההרגלים)' },
    { key: 'habit_sleep', title: 'שינה: הלכת לישון וקמת בשעות הקבועות שלך', type: 'סקאלה 1–10', note: 'במקום השם של הרגל השינה (שהוא נוסחה)' },
  ],
  workout: [
    { key: 'section', title: T.workoutsTitle, type: 'כותרת', note: 'כל שבועיים, מהשבוע שהאימונים שלו התחילו' },
    { key: 'workout_feel', title: T.workoutFeel, subtitle: undefined, options: WORKOUT_FEEL, type: 'בחירה אחת', note: 'שאלה לכל יום אימון שלו; {name} = שם האימון' },
    { key: 'progressed', title: T.progressed, options: YES_NO, type: 'כן/לא' },
    { key: 'progressed_which', title: T.progressedWhich, subtitle: 'בוחרים תרגיל, ואז בכמה', options: PROGRESS_AMOUNT, type: 'תרגילים + כמה', note: 'רק אם ענה כן' },
    { key: 'improve', title: T.improve, subtitle: T.improveHint, options: IMPROVE, type: 'בחירה מרובה' },
    { key: 'share', title: T.share, subtitle: T.shareHint, type: 'טקסט ארוך' },
  ],
};

export const QUESTIONNAIRE_INFO: Record<QuestionnaireId, { label: string; when: string }> = {
  onboarding: { label: 'שאלון התחלתי', when: 'פעם אחת, כשמצטרפים לתוכנית' },
  weekly: { label: 'שאלון שבועי', when: 'כל יום שישי' },
  workout: { label: 'שאלות אימונים', when: 'חלק מהשאלון השבועי, כל שבועיים מהשבוע שהאימונים התחילו' },
};

export const CUSTOM_KINDS: { value: CustomKind; label: string }[] = [
  { value: 'text', label: 'טקסט קצר' },
  { value: 'long_text', label: 'טקסט ארוך' },
  { value: 'number', label: 'מספר' },
  { value: 'scale', label: 'סקאלה 1–10' },
  { value: 'yes_no', label: 'כן/לא' },
  { value: 'single', label: 'בחירה אחת' },
  { value: 'multi', label: 'בחירה מרובה' },
];

/** The options a custom question shows (yes/no and 1–10 have their own). */
export function customOptions(r: TextRow): Option[] {
  if (r.kind === 'yes_no') return YES_NO;
  if (r.kind === 'scale') return Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  return (r.options ?? []).filter((o) => o.label?.trim());
}

/** A custom row as an opening-questionnaire question (the screen renders it like the others). */
export function customAsQuestion(r: TextRow): Question {
  const base = { id: r.key, title: r.title ?? '', subtitle: r.subtitle ?? undefined, optional: !r.required };
  if (r.kind === 'number') return { ...base, kind: 'number', unit: '', min: 0, max: 100000, step: 1, decimals: true };
  if (r.kind === 'text' || r.kind === 'long_text') return { ...base, kind: 'text' };
  return { ...base, kind: r.kind === 'multi' ? 'multi' : 'single', options: customOptions(r) };
}

/**
 * The opening questionnaire as the coaches edited it: texts and option labels,
 * hidden questions out, and the added questions before the photos at the end.
 */
export function editOnboarding(questions: Question[], rows: TextRow[] | undefined): Question[] {
  const t = textsFor(rows, 'onboarding');
  const edited = questions
    .filter((q) => !t.hidden(q.id))
    .map((q) => {
      const out = { ...q, title: t.title(q.id, q.title), subtitle: t.subtitle(q.id, q.subtitle) } as Question;
      if ((out.kind === 'single' || out.kind === 'multi') && 'options' in q) out.options = t.options(q.id, q.options);
      return out;
    });
  const added = t.custom.map(customAsQuestion);
  const at = edited.findIndex((q) => q.kind === 'photos' || q.kind === 'measurements');
  return at < 0 ? [...edited, ...added] : [...edited.slice(0, at), ...added, ...edited.slice(at)];
}

/** An answer of a custom question, readable (admin, bot). */
export function customAnswerText(r: TextRow, v: unknown): string {
  const opts = customOptions(r);
  const label = (x: unknown) => opts.find((o) => o.value === x)?.label ?? String(x ?? '');
  if (Array.isArray(v)) return v.map(label).join(' · ');
  return r.kind === 'single' || r.kind === 'yes_no' ? label(v) : String(v ?? '');
}

/** Has a custom question been answered (a required one blocks sending until it is)? */
export function customAnswered(r: TextRow, v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' ? v.trim().length > 0 : v != null;
}
