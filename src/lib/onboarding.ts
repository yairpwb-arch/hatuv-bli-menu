/**
 * New-trainee intake questionnaire: the questions, which ones apply, and the
 * plan values derived from the answers once it's done.
 */

export type Answers = Record<string, unknown>;

export interface Option {
  value: string;
  label: string;
}

interface BaseQuestion {
  id: string;
  title: string;
  subtitle?: string;
  /** Optional screens show a "skip" link and may advance empty. */
  optional?: boolean;
  /** Only asked when this returns true for the answers so far. */
  when?: (a: Answers) => boolean;
  /** A title built from earlier answers (e.g. the trainee's own "other" text). */
  dynamicTitle?: (a: Answers) => string;
  /** Picking this option opens a text field for the details (like "other"). */
  details?: { value: string; placeholder: string };
}

export type Question =
  | (BaseQuestion & { kind: 'text'; placeholder?: string })
  | (BaseQuestion & { kind: 'number'; unit: string; min: number; max: number; step: number; decimals?: boolean })
  | (BaseQuestion & { kind: 'single'; options: Option[] })
  | (BaseQuestion & { kind: 'multi'; options: Option[] })
  | (BaseQuestion & { kind: 'photos' })
  | (BaseQuestion & { kind: 'measurements' });

const PER_WEEK: Option[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5+', label: '5 ומעלה' },
];

const trains = (a: Answers) => a.trains === 'yes';
const types = (a: Answers) => (Array.isArray(a.training_types) ? (a.training_types as string[]) : []);
const doesStrength = (a: Answers) => trains(a) && types(a).includes('strength');
const doesOther = (a: Answers) => trains(a) && types(a).some((t) => t !== 'strength');

/** One "how many a week" question per non-strength training type picked. */
const PER_TYPE_TITLES: Record<string, string> = {
  running: 'כמה ריצות את/ה עושה בשבוע?',
  cycling: 'כמה רכיבות אופניים את/ה עושה בשבוע?',
  team: 'כמה אימוני ספורט קבוצתי את/ה עושה בשבוע?',
  swimming: 'כמה אימוני שחייה את/ה עושה בשבוע?',
  martial: 'כמה אימוני אומנויות לחימה את/ה עושה בשבוע?',
  other: 'כמה אימונים מהסוג האחר את/ה עושה בשבוע?',
};
export const perWeekId = (type: string) => `${type}_per_week`;
const perTypeQuestions: Question[] = Object.entries(PER_TYPE_TITLES).map(([type, title]) => ({
  id: perWeekId(type),
  kind: 'single',
  title,
  options: PER_WEEK,
  when: (a: Answers) => trains(a) && types(a).includes(type),
  ...(type === 'other'
    ? {
        dynamicTitle: (a: Answers) => {
          const typed = String(a.training_types_other ?? '').trim();
          return typed ? `כמה אימוני ${typed} את/ה עושה בשבוע?` : title;
        },
      }
    : {}),
}));

export const QUESTIONS: Question[] = [
  { id: 'name', kind: 'text', title: 'איך קוראים לך?', placeholder: 'שם מלא' },
  { id: 'age', kind: 'number', title: 'בן/בת כמה את/ה?', unit: 'שנים', min: 12, max: 99, step: 1 },
  {
    id: 'gender', kind: 'single', title: 'מין',
    options: [{ value: 'male', label: 'זכר' }, { value: 'female', label: 'נקבה' }],
  },
  { id: 'height', kind: 'number', title: 'מה הגובה שלך?', unit: 'ס"מ', min: 120, max: 230, step: 1 },
  { id: 'weight', kind: 'number', title: 'מה המשקל הנוכחי שלך?', subtitle: 'הכי טוב משקילה של הבוקר', unit: 'ק"ג', min: 30, max: 300, step: 0.1, decimals: true },
  {
    id: 'occupation', kind: 'single', title: 'מה את/ה עושה בחיים?',
    options: [
      { value: 'student', label: 'תלמיד/ה' },
      { value: 'army', label: 'בצבא' },
      { value: 'university', label: 'סטודנט/ית' },
      { value: 'work', label: 'עבודה' },
      { value: 'other', label: 'אחר' },
    ],
  },
  {
    id: 'sleep_hours', kind: 'single', title: 'כמה שעות את/ה ישן/ה בלילה?',
    options: [
      { value: 'lt5', label: 'פחות מ-5' },
      { value: '5-6', label: '5–6' },
      { value: '6-7', label: '6–7' },
      { value: '7-8', label: '7–8' },
      { value: 'gt8', label: 'יותר מ-8' },
    ],
  },
  {
    id: 'bedtime', kind: 'single', title: 'מתי את/ה הולך/ת לישון?',
    options: [
      { value: 'before22', label: 'לפני 22:00' },
      { value: '22-23', label: '22:00–23:00' },
      { value: '23-00', label: '23:00–00:00' },
      { value: '00-01', label: '00:00–01:00' },
      { value: 'after01', label: 'אחרי 01:00' },
    ],
  },
  {
    id: 'wake_time', kind: 'single', title: 'מתי את/ה קם/ה?',
    options: [
      { value: 'before6', label: 'לפני 6:00' },
      { value: '6-7', label: '6:00–7:00' },
      { value: '7-8', label: '7:00–8:00' },
      { value: '8-9', label: '8:00–9:00' },
      { value: 'after9', label: 'אחרי 9:00' },
    ],
  },
  {
    id: 'big_meals', kind: 'single', title: 'כמה ארוחות גדולות את/ה אוכל/ת ביום?',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4+', label: '4 ומעלה' },
    ],
  },
  {
    id: 'small_meals', kind: 'single', title: 'כמה ארוחות קטנות או נשנושים את/ה אוכל/ת ביום?',
    options: [
      { value: '0', label: '0' },
      { value: '1-2', label: '1–2' },
      { value: '3-4', label: '3–4' },
      { value: '5+', label: '5 ומעלה' },
    ],
  },
  {
    id: 'walks', kind: 'single', title: 'כמה הליכות את/ה עושה בשבוע?',
    options: [
      { value: 'no', label: 'לא הולך/ת' },
      { value: 'sometimes', label: 'לפעמים' },
      { value: '1-2', label: '1–2 בשבוע' },
      { value: '3-4', label: '3–4 בשבוע' },
      { value: '5+', label: '5 ומעלה בשבוע' },
    ],
  },
  {
    id: 'trains', kind: 'single', title: 'את/ה מתאמן/ת באופן קבוע?',
    options: [
      { value: 'yes', label: 'כן' },
      { value: 'stopped', label: 'לא, התאמנתי והפסקתי' },
      { value: 'never', label: 'לא, אף פעם' },
    ],
  },
  {
    id: 'training_types', kind: 'multi', title: 'איזה סוגי אימונים?', subtitle: 'אפשר לבחור כמה', when: trains,
    options: [
      { value: 'strength', label: 'כוח' },
      { value: 'running', label: 'ריצה' },
      { value: 'cycling', label: 'אופניים' },
      { value: 'team', label: 'ספורט קבוצתי' },
      { value: 'swimming', label: 'שחייה' },
      { value: 'martial', label: 'אומנויות לחימה' },
      { value: 'other', label: 'אחר' },
    ],
  },
  {
    id: 'training_duration', kind: 'single', title: 'כמה זמן את/ה מתאמן/ת ברצף?', when: trains,
    options: [
      { value: 'lt1m', label: 'פחות מחודש' },
      { value: '1-2m', label: '1–2 חודשים' },
      { value: '2-6m', label: '2–6 חודשים' },
      { value: 'gt6m', label: 'יותר מחצי שנה' },
    ],
  },
  ...perTypeQuestions,
  { id: 'strength_per_week', kind: 'single', title: 'כמה אימוני כוח את/ה עושה בשבוע?', when: doesStrength, options: PER_WEEK },
  {
    id: 'strength_location', kind: 'single', title: 'איפה את/ה מתאמן/ת כוח?', when: doesStrength,
    options: [
      { value: 'gym', label: 'חדר כושר' },
      { value: 'home_equipment', label: 'בית עם ציוד' },
      { value: 'home_none', label: 'בית בלי ציוד' },
    ],
  },
  {
    id: 'session_length', kind: 'single', title: 'כמה זמן לוקח כל אימון?', when: trains,
    options: [
      { value: 'le30', label: "עד 30 דק'" },
      { value: '30-45', label: "30–45 דק'" },
      { value: '45-60', label: "45–60 דק'" },
      { value: 'gt60', label: 'יותר משעה' },
    ],
  },
  // ── Everyone: what the body can do today, injuries, where to train ──
  { id: 'max_pullups', kind: 'number', title: 'כמה מתח את/ה מצליח/ה לעשות?', unit: 'חזרות', min: 0, max: 50, step: 1 },
  { id: 'max_pushups', kind: 'number', title: 'כמה שכיבות סמיכה את/ה מצליח/ה לעשות?', unit: 'חזרות', min: 0, max: 150, step: 1 },
  { id: 'max_squats', kind: 'number', title: 'כמה סקוואטים את/ה מצליח/ה לעשות?', unit: 'חזרות', min: 0, max: 300, step: 1 },
  {
    id: 'injuries', kind: 'single', title: 'האם יש פציעות?',
    subtitle: 'פריקות כתף, או דברים שאנחנו צריכים לדעת שיכולים לפגוע באימון שלך',
    options: [
      { value: 'no', label: 'לא' },
      { value: 'yes', label: 'כן' },
    ],
    details: { value: 'yes', placeholder: 'מה חשוב שנדע?' },
  },
  {
    id: 'medical', kind: 'single', title: 'יש מצב רפואי שחשוב שנדע?',
    subtitle: 'למשל לחץ דם, סוכרת, בעיות לב, אסתמה, היריון או תרופות קבועות',
    options: [
      { value: 'no', label: 'לא' },
      { value: 'yes', label: 'כן' },
    ],
    details: { value: 'yes', placeholder: 'מה חשוב שנדע?' },
  },
  {
    id: 'preferred_location', kind: 'single', title: 'איפה את/ה מעדיף/ה להתאמן?',
    options: [
      { value: 'gym', label: 'בחדר כושר' },
      { value: 'home_equipment', label: 'בבית עם ציוד' },
      { value: 'park', label: 'בפארק' },
    ],
  },
  {
    id: 'goal', kind: 'multi', title: 'מה המטרה הגופנית שלך?', subtitle: 'אפשר לבחור כמה',
    options: [
      { value: 'fat_loss', label: 'לרדת בשומן' },
      { value: 'toning', label: 'חיטוב' },
      { value: 'muscle', label: 'לעלות במסת שריר' },
      { value: 'fitness', label: 'לשפר כושר' },
      { value: 'healthy', label: 'אורח חיים בריא יותר' },
    ],
  },
  { id: 'target_weight', kind: 'number', title: 'מה משקל המטרה שלך?', unit: 'ק"ג', min: 30, max: 300, step: 0.5, decimals: true },
  {
    id: 'photos', kind: 'photos', optional: true, title: 'תמונות התחלה',
    subtitle: 'אותה תאורה, בגדים צמודים. התמונות פרטיות: רק את/ה והצוות רואים אותן.',
  },
  {
    id: 'measurements', kind: 'measurements', optional: true, title: 'מדידות היקפים',
    subtitle: 'סרט מדידה רך, צמוד לגוף בלי ללחוץ',
  },
];

/** The questions that apply given the answers so far, in order. */
export function activeQuestions(a: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.when || q.when(a));
}

/** "Other" picked on a choice question: the trainee types it in. */
export const otherKey = (id: string) => `${id}_other`;
export function picksOther(q: Question, a: Answers): boolean {
  const v = a[q.id];
  if (q.kind !== 'single' && q.kind !== 'multi') return false;
  const asks = ['other', ...(q.details ? [q.details.value] : [])];
  return asks.some((x) => v === x || (Array.isArray(v) && v.includes(x)));
}

export function isAnswered(q: Question, a: Answers): boolean {
  const v = a[q.id];
  if (picksOther(q, a)) {
    const typed = a[otherKey(q.id)];
    if (typeof typed !== 'string' || typed.trim().length < 2) return false;
  }
  switch (q.kind) {
    case 'text':
      return typeof v === 'string' && v.trim().length >= 2;
    case 'number':
      return typeof v === 'number' && v >= q.min && v <= q.max;
    case 'single':
      return typeof v === 'string' && q.options.some((o) => o.value === v);
    case 'multi':
      return Array.isArray(v) && v.length > 0;
    case 'photos':
    case 'measurements':
      return true;
  }
}

/* ── Plan derived from the answers (saved on the profile) ─────────────────── */

const perWeekNumber = (v: unknown) => (v === '5+' ? 5 : Number(v) || null);

export interface DerivedPlan {
  /** NULL → no strength plan at this stage. */
  strength_sessions_per_week: number | null;
  weekly_walks_target: number;
  regular_activities: { type: string; per_week: number | null }[];
}

export function derivePlan(a: Answers): DerivedPlan {
  const t = types(a);
  const consistent = a.training_duration === '2-6m' || a.training_duration === 'gt6m';

  const strength_sessions_per_week =
    doesStrength(a) && consistent ? perWeekNumber(a.strength_per_week) : null;

  const regular_activities = doesOther(a)
    ? t.filter((x) => x !== 'strength').map((type) => ({ type, per_week: perWeekNumber(a[perWeekId(type)] ?? a.other_per_week) }))
    : [];

  // None / sometimes → 2 a week; 1–2 → 3; already 3+ → keep what they do today.
  const weekly_walks_target =
    a.walks === '1-2' ? 3 : a.walks === '3-4' ? 3 : a.walks === '5+' ? 5 : 2;

  return { strength_sessions_per_week, weekly_walks_target, regular_activities };
}

export type PermissionKey = 'steps' | 'notifications' | 'background';
export type PermissionResult = 'granted' | 'denied' | 'skipped' | 'unavailable';
