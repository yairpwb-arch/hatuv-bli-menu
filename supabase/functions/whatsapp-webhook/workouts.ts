// Workout reviews (bot_workout_reviews), for now only in the test group:
//   1. interview: in the trainee's group the bot asks how the workouts go (what's
//      hard, what's easy, the weights they really use: most don't log sets);
//      it ends with "אעבור על האימון שלך…" and [סיום_בחינה];
//   2. proposed: it writes the coach (in private) what came up and the changes it
//      suggests, and talks them over with the coach;
//   3. applied: the coach wrote "מאשר": the bot changes the plan in the app and
//      tells the trainee what changed.
// It starts every 4 weeks once workouts are open, when the trainee brings up a
// workout problem ([בחינת_אימון]), or when the coach asks in private.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { buildPrompt, maxParts, runModel, toReply } from './brain.ts';
import { TEST_GROUP_ID, alertPhones, deliver, sendAndLog } from '../_shared/wa.ts';

type Row = Record<string, any>;
const DAY = 86400_000;
export const REVIEW_START_TAG = '[בחינת_אימון]';
export const REVIEW_END_TAG = '[סיום_בחינה]';
/** A scheduled review: this long after workouts opened, and after the last review. */
const EVERY_MS = 28 * DAY;
/** An interview nobody finished: closed after this. */
const INTERVIEW_TIMEOUT_MS = 72 * 3600_000;

export const REVIEW_OPEN_TASK =
  'פותחים "בדיקת אימון": משפט קצר וחם שרוצים לעבור איתו על האימונים כדי לשפר אותם, ומיד השאלה הראשונה לפי ההנחיות של בדיקת האימון (אם התרגילים לא נרשמו: רשימת התרגילים, ולבקש משקל וחזרות ליד כל אחד). הודעה אחת.';

// ── The plan and what was logged ─────────────────────────────────────────────

interface PlanExercise { id: string; dayId: string; exerciseId: string; name: string; sets: number; repsMin: number; repsMax: number; rest: number; timed: boolean; notes: string | null; sort: number }
interface PlanDay { id: string; name: string; number: number; open: boolean; openedAt: number | null }
interface Plan { id: string; ownerId: string | null; days: PlanDay[]; exercises: PlanExercise[] }
/** E1/D1 → ids, kept with the changes so they apply to what the coach saw. */
type Refs = Record<string, { id: string; name: string; day?: string }>;

export async function loadPlan(db: SupabaseClient, userId: string): Promise<Plan | null> {
  const { data: a } = await db.from('user_workout_assignments').select('plan_id, start_date').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!a) return null;
  const [{ data: plan }, { data: days }, { data: watched }] = await Promise.all([
    db.from('workout_plans').select('id, user_id').eq('id', a.plan_id).maybeSingle(),
    db.from('workout_plan_days').select('id, day_number, name, unlocks_with').eq('plan_id', a.plan_id).order('day_number'),
    db.from('content_progress').select('completed_at, program_content(unlocks)').eq('user_id', userId),
  ]);
  if (!plan) return null;
  // What each video opened, and when it was marked watched.
  const opened = new Map<string, number>();
  for (const w of (watched ?? []) as Row[]) {
    const key = w.program_content?.unlocks;
    if (key && w.completed_at) opened.set(key, Math.min(opened.get(key) ?? Infinity, new Date(w.completed_at).getTime()));
  }
  const start = a.start_date ? new Date(`${a.start_date}T00:00:00`).getTime() : null;
  const ds: PlanDay[] = ((days ?? []) as Row[]).map((d) => {
    const at = d.unlocks_with ? opened.get(d.unlocks_with) ?? null : start;
    return { id: d.id, name: d.name, number: d.day_number, open: !d.unlocks_with || opened.has(d.unlocks_with), openedAt: at };
  });
  const { data: exs } = ds.length
    ? await db.from('workout_plan_exercises').select('id, plan_day_id, exercise_id, sets, reps_min, reps_max, rest_seconds, is_duration, notes, sort_order, exercises(name)').in('plan_day_id', ds.map((d) => d.id)).order('sort_order')
    : { data: [] };
  const order = new Map(ds.map((d, i) => [d.id, i]));
  const exercises = ((exs ?? []) as Row[])
    .map((e) => ({
      id: e.id, dayId: e.plan_day_id, exerciseId: e.exercise_id, name: e.exercises?.name ?? '?', sets: e.sets, repsMin: e.reps_min, repsMax: e.reps_max,
      rest: e.rest_seconds, timed: !!e.is_duration, notes: e.notes ?? null, sort: e.sort_order ?? 0,
    }))
    .sort((x, y) => (order.get(x.dayId)! - order.get(y.dayId)!) || x.sort - y.sort);
  return { id: plan.id, ownerId: plan.user_id ?? null, days: ds, exercises };
}

/** Short names for the plan's days and exercises; ones already named keep their name. */
export function makeRefs(plan: Plan, prev: Refs = {}): Refs {
  const refs: Refs = {};
  const byId = new Map(Object.entries(prev).map(([k, v]) => [v.id, k]));
  let d = Math.max(0, ...Object.keys(prev).filter((k) => k.startsWith('D')).map((k) => Number(k.slice(1)) || 0));
  let e = Math.max(0, ...Object.keys(prev).filter((k) => k.startsWith('E')).map((k) => Number(k.slice(1)) || 0));
  const dayRef = new Map<string, string>();
  for (const day of plan.days) {
    const k = byId.get(day.id) ?? `D${++d}`;
    refs[k] = { id: day.id, name: day.name };
    dayRef.set(day.id, k);
  }
  for (const ex of plan.exercises) refs[byId.get(ex.id) ?? `E${++e}`] = { id: ex.id, name: ex.name, day: dayRef.get(ex.dayId) };
  return refs;
}

const target = (e: { timed: boolean; repsMin: number; repsMax: number }) =>
  `${e.repsMin === e.repsMax ? e.repsMin : `${e.repsMin}–${e.repsMax}`} ${e.timed ? 'שניות' : 'חזרות'}`;

export function planText(plan: Plan, refs: Refs): string {
  const refOf = new Map(Object.entries(refs).map(([k, v]) => [v.id, k]));
  return plan.days.map((day) => {
    const list = plan.exercises.filter((x) => x.dayId === day.id);
    return `${refOf.get(day.id)} "${day.name}"${day.open ? '' : ' (עוד נעול למתאמן)'}:\n` + (list.length
      ? list.map((x) => `  ${refOf.get(x.id)} ${x.name}: ${x.sets} סטים × ${target(x)}, מנוחה ${x.rest} שנ'${x.notes ? `. הערה: ${x.notes}` : ''}`).join('\n')
      : '  (אין תרגילים)');
  }).join('\n') || 'אין ימי אימון.';
}

/** The last 4 weeks: workouts marked, sets logged (most trainees don't log). */
async function historyText(db: SupabaseClient, userId: string, plan: Plan | null): Promise<string> {
  const since = new Date(Date.now() - 28 * DAY).toISOString();
  const [sessions, sets, acts, marks] = await Promise.all([
    db.from('workout_session_logs').select('*').eq('user_id', userId).gte('completed_at', since).order('completed_at'),
    db.from('workout_set_logs').select('logged_at, exercise_id, set_number, reps, weight_kg, exercises(name)').eq('user_id', userId).gte('logged_at', since).order('logged_at'),
    db.from('activities').select('day, kind, custom_name, duration_min').eq('user_id', userId).eq('status', 'done').gte('day', since.slice(0, 10)),
    db.from('activity_log').select('completed_at').eq('user_id', userId).eq('activity_type', 'workout').gte('completed_at', since.slice(0, 10)),
  ]);
  const dayName = new Map((plan?.days ?? []).map((d) => [d.id, d.name]));
  const date = (t: string) => t.slice(5, 10).split('-').reverse().join('.');
  const lines: string[] = [];
  const ss = (sessions.data ?? []) as Row[];
  if (ss.length) lines.push('אימונים שהסתיימו באפליקציה: ' + ss.map((s) => `${date(s.completed_at)} ${dayName.get(s.plan_day_id) ?? 'אימון'}${s.duration_minutes ? ` ${s.duration_minutes} דק'` : ''}${s.difficulty ? `, קושי ${s.difficulty}` : ''}`).join('; ') + '.');
  const others = [
    ...((acts.data ?? []) as Row[]).filter((a) => a.kind !== 'walk' && a.kind !== 'hike').map((a) => `${date(a.day)} ${a.custom_name ?? a.kind}`),
    ...((marks.data ?? []) as Row[]).map((m) => `${date(m.completed_at)} אימון`),
  ];
  if (others.length) lines.push('אימונים שסומנו כבוצעו: ' + others.join('; ') + '.');
  // Sets, per exercise and day: "12.5×10, 12.5×9".
  const per = new Map<string, Map<string, string[]>>();
  for (const s of (sets.data ?? []) as Row[]) {
    const name = s.exercises?.name ?? '?';
    const byDay = per.get(name) ?? new Map<string, string[]>();
    const d = date(s.logged_at);
    byDay.set(d, [...(byDay.get(d) ?? []), `${s.weight_kg != null ? `${Number(s.weight_kg)}×` : ''}${s.reps ?? '?'}`]);
    per.set(name, byDay);
  }
  if (per.size) lines.push('סטים שנרשמו (משקל×חזרות):\n' + [...per].map(([n, byDay]) => `  ${n}: ` + [...byDay].map(([d, v]) => `${d} ${v.join(', ')}`).join(' | ')).join('\n'));
  lines.push('חשוב: רוב המתאמנים מתאמנים בלי לסמן סטים באפליקציה. תרגיל או אימון בלי רישום לא אומר שלא בוצע: מה שהמתאמן אומר בשיחה קובע.');
  return lines.join('\n');
}

async function library(db: SupabaseClient): Promise<Row[]> {
  const { data } = await db.from('exercises').select('id, name, equipment, muscle_groups').order('name').limit(1000);
  return (data ?? []) as Row[];
}
const libraryText = (lib: Row[]) =>
  lib.map((x) => `${x.name}${x.equipment ? ` [${x.equipment}]` : ''}${x.muscle_groups?.length ? ` (${x.muscle_groups.join(', ')})` : ''}`).join('\n');

async function trainee(db: SupabaseClient, userId: string): Promise<{ name: string; facts: string }> {
  const [{ data: p }, { data: ob }] = await Promise.all([
    db.from('profiles').select('full_name, gender, current_weight').eq('id', userId).maybeSingle(),
    db.from('onboarding_responses').select('answers').eq('user_id', userId).maybeSingle(),
  ]);
  const a = (ob as Row | null)?.answers ?? {};
  const keys = ['trains', 'training_types', 'training_duration', 'strength_per_week', 'strength_location', 'session_length', 'max_pullups', 'max_pushups', 'max_squats', 'injuries', 'injuries_other', 'preferred_location', 'goal'];
  const bits = keys.filter((k) => a[k] != null && a[k] !== '').map((k) => `${k}=${Array.isArray(a[k]) ? a[k].join('/') : a[k]}`);
  const name = (p as Row | null)?.full_name || 'המתאמן';
  return {
    name,
    facts: `${name} (${(p as Row | null)?.gender === 'female' ? 'אישה' : 'גבר'}${(p as Row | null)?.current_weight ? `, ${(p as Row).current_weight} ק"ג` : ''}). שאלון פתיחה: ${bits.join(', ') || 'אין'}.`,
  };
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function openReview(db: SupabaseClient, userId: string | null): Promise<Row | null> {
  if (!userId) return null;
  const { data } = await db.from('bot_workout_reviews').select('*').eq('user_id', userId).in('status', ['interview', 'proposed']).order('started_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function startReview(db: SupabaseClient, userId: string, chatId: string, reason: 'scheduled' | 'client' | 'coach', coachChat?: string) {
  const { data, error } = await db.from('bot_workout_reviews').insert({ user_id: userId, chat_id: chatId, reason, coach_chat: coachChat ?? null }).select('*').maybeSingle();
  if (error) console.error('[review] start failed', error.message); // e.g. one is already open
  return (data as Row | null) ?? null;
}

/** For the bot's prompt in the trainee's group: the open review's brief, or how to open one. */
/** Asking for more / other workouts: the workout bot builds them (planBuilder.ts). Test group only. */
const PLAN_REQUEST_TEXT = `# אם הוא מבקש עוד אימונים או אימון אחר
אם הלקוח מבקש במפורש אימון נוסף, עוד ימי אימון, אימון לבית / לחופשה / לחדר כושר, או תוכנית אחרת (לא שינוי קטן בתרגיל אחד, ולא קושי באימון: לזה יש בדיקת אימון): אם חסר פרט חשוב לבנייה (איפה הוא יתאמן, איזה ציוד יש לו, כמה זמן יש לו), שואלים קודם, בהודעה אחת. כשיש מספיק: עונים לו שאנחנו בונים לו את זה ושזה יגיע אליו לאפליקציה בקרוב, ומוסיפים בסוף [בקשת_אימון]. מול הלקוח האימונים פשוט שלנו: לא מספרים לו על בוט או על אישור של מאמן.`;

export async function reviewSection(db: SupabaseClient, userId: string | null, chatId: string): Promise<string> {
  if (!userId || chatId !== TEST_GROUP_ID) return '';
  const inner = await reviewInner(db, userId, chatId);
  const open = await openReview(db, userId);
  // In the middle of a review, the review leads; otherwise a request for workouts can come up any time.
  return open ? inner : [inner, PLAN_REQUEST_TEXT].filter(Boolean).join('\n\n');
}

async function reviewInner(db: SupabaseClient, userId: string, chatId: string): Promise<string> {
  const review = await openReview(db, userId);
  // In front of the client the workouts are simply ours: no "the coaches will check / approve".
  const ours = 'מול הלקוח, האימונים פשוט שלנו ("אנחנו"): לא כותבים לו שמעבירים למאמנים, שמחכים לאישור, או שמשהו "עוד לא נבדק". ההתייעצות עם המאמן קורית בפרטי, בלי לספר לו.';
  if (review?.status === 'proposed') {
    return `# בדיקת האימון שלו\nכבר שאלת אותו על האימונים, ואנחנו עוברים עכשיו על השיפורים. אם הוא שואל: אומרים שאנחנו על זה ונחזור אליו בקרוב. אל תמציא שינויים בעצמך.\n${ours}`;
  }
  const plan = await loadPlan(db, userId);
  if (!plan || !plan.exercises.length) return '';
  if (!review) {
    // A review closed lately: what was changed is done, in the app.
    const { data: last } = await db.from('bot_workout_reviews').select('status, result, closed_at').eq('user_id', userId).eq('status', 'applied').gte('closed_at', new Date(Date.now() - 21 * DAY).toISOString()).order('closed_at', { ascending: false }).limit(1).maybeSingle();
    let done = '';
    if (last) {
      const when = new Date(last.closed_at);
      const { data: since } = await db.from('workout_session_logs').select('id').eq('user_id', userId).gte('completed_at', last.closed_at).limit(1);
      const { data: marked } = await db.from('activities').select('id').eq('user_id', userId).eq('status', 'done').gte('started_at', last.closed_at).not('kind', 'in', '(walk,hike)').limit(1);
      const trained = !!(since ?? []).length || !!(marked ?? []).length;
      done =
        `# עדכון האימון האחרון שלו (כבר בוצע)\n` +
        `ב-${when.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })} עדכנו לו את האימון באפליקציה, וזה סופי:\n${(last.result ?? '').split('\n').filter((l: string) => l.startsWith('✅')).map((l: string) => l.replace(/^✅\s*/, '- ')).join('\n')}\n` +
        `- זה כבר עודכן ונכנס לתוקף. אל תגיד שזה לא עודכן או שזה עוד לא נבדק, ואל תעביר את זה שוב.\n` +
        (trained
          ? '- מאז הוא כבר התאמן: אפשר לשאול איך הלך עם השינויים.\n'
          : '- הוא עוד לא התאמן עם השינויים: לא שואלים "איך הרגיש" לפני שהוא עשה את האימון הבא. אם הוא שואל, מסבירים מה השתנה.\n');
    }
    return `${done}# אם הוא מעלה קושי באימונים\nאם הלקוח מספר על בעיה באימונים (תרגיל קשה או קל מדי, לא מתקדם, משעמם, ארוך מדי, לא נוח, אין ציוד), פותחים איתו בדיקת אימון: עונים לו בקצרה, שואלים כדי להבין, ומוסיפים בסוף ${REVIEW_START_TAG}. ${ours} רק כאב או פציעה: כמו תמיד, להעביר אלינו.`;
  }
  const refs = makeRefs(plan);
  return `# בדיקת אימון פתוחה (מ-${new Date(review.started_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })})
אתה באמצע שיחה עם הלקוח כדי להבין איך הולכים לו האימונים, כדי שנשפר לו את התוכנית.
- קצר ויעיל: לא עוברים איתו תרגיל אחרי תרגיל. מעט הודעות, כל אחת מכסה הרבה. התרגילים בשמם (לא מספרי E/D).
- אם התרגילים לא נרשמו באפליקציה (או רק חלק): בהודעה אחת רושמים לו את התרגילים של האימון, אחד בכל שורה, ומבקשים שיכתוב ליד כל אחד באיזה משקל ובכמה חזרות הוא עושה אותו, ואם יש תרגיל קשה מדי, קל מדי או לא נוח. להודעה הזו מותר להיות ארוכה מהרגיל, בשביל הרשימה. לא מניחים שלא התאמן. מה שכבר נרשם לא שואלים שוב.
- אחרי התשובה: לכל היותר 1–2 שאלות המשך, רק על מה שלא ברור (למשל אם הוא מסיים את כל הסטים, כמה זמן לוקח האימון, ציוד שיש לו).
- עכשיו רק שואלים ומקשיבים: לא נותנים שינויים או המלצות לתוכנית.
- ${ours}
- רק כאב או פציעה: אומרים שנעביר למאמנים ומסמנים [העבר], כרגיל.
- כשיש מספיק כדי לשפר (בדרך כלל אחרי 2–3 הודעות שלו), או אם הוא רוצה לסיים: הודעה אחת בנוסח "אוקי, אעבור על האימון שלך ואחזור אליך עם שיפורים 💪", ובסוף ${REVIEW_END_TAG}.

## התוכנית שלו
${planText(plan, refs)}

## מה נרשם באפליקציה ב-4 השבועות האחרונים
${await historyText(db, userId, plan)}`;
}

/** After the bot answered in a trainee's group: a review it opened or finished. */
export async function afterReply(db: SupabaseClient, chatId: string, userId: string | null, review: 'start' | 'finish' | null | undefined) {
  if (!review || !userId || chatId !== TEST_GROUP_ID) return;
  if (review === 'start') {
    if (!(await openReview(db, userId))) await startReview(db, userId, chatId, 'client');
    return;
  }
  const open = await openReview(db, userId);
  if (open?.status === 'interview') await finishInterview(db, open);
}

// ── The changes ───────────────────────────────────────────────────────────────

interface Change { op: 'update' | 'swap' | 'add' | 'remove'; ex?: string; day?: string; to?: string; sets?: number; reps_min?: number; reps_max?: number; rest_seconds?: number; notes?: string; why?: string }

const OPS_HELP = `פעולות (רק השדות שמשתנים):
{"op":"update","ex":"E3","sets":4,"reps_min":8,"reps_max":10,"rest_seconds":90,"notes":"12.5 ק\\"ג","why":"..."}
{"op":"swap","ex":"E2","to":"שם מדויק מהספרייה","why":"..."}  (אפשר גם sets/reps_min/reps_max/rest_seconds/notes)
{"op":"add","day":"D1","to":"שם מדויק מהספרייה","sets":3,"reps_min":10,"reps_max":12,"rest_seconds":60,"why":"..."}
{"op":"remove","ex":"E4","why":"..."}
המלצת משקל נכתבת בשדה notes. תרגיל חדש: רק בשם מדויק מהספרייה.`;

function fieldsText(c: Change) {
  const f: string[] = [];
  if (c.sets != null) f.push(`${c.sets} סטים`);
  if (c.reps_min != null || c.reps_max != null) f.push(`${c.reps_min ?? c.reps_max}${c.reps_max != null && c.reps_max !== c.reps_min ? `–${c.reps_max}` : ''} חזרות`);
  if (c.rest_seconds != null) f.push(`מנוחה ${c.rest_seconds} שנ'`);
  if (c.notes) f.push(`הערה: "${c.notes}"`);
  return f.join(', ');
}

function changesText(changes: Change[], refs: Refs): string {
  if (!changes.length) return 'אין שינויים מוצעים.';
  const ex = (k?: string) => (k && refs[k] ? refs[k].name : k ?? '?');
  const day = (k?: string) => (k && refs[k] ? `"${refs[k].name}"` : k ?? '?');
  return changes.map((c, i) => {
    const where = c.ex && refs[c.ex]?.day ? ` (${day(refs[c.ex].day)})` : '';
    const f = fieldsText(c);
    const line =
      c.op === 'update' ? `${ex(c.ex)}${where}: ${f}` :
      c.op === 'swap' ? `${c.to} במקום ${ex(c.ex)}${where}${f ? `, ${f}` : ''}` :
      c.op === 'add' ? `להוסיף ל${day(c.day)}: ${c.to}${f ? `, ${f}` : ''}` :
      `להוריד: ${ex(c.ex)}${where}`;
    return `${i + 1}. ${line}${c.why ? `\n   למה: ${c.why}` : ''}`;
  }).join('\n');
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : undefined);
function fields(c: Change) {
  const f: Row = {};
  const sets = num(c.sets, 1, 10); if (sets != null) f.sets = sets;
  const lo = num(c.reps_min, 1, 600); if (lo != null) f.reps_min = lo;
  const hi = num(c.reps_max, 1, 600); if (hi != null) f.reps_max = hi;
  const rest = num(c.rest_seconds, 0, 600); if (rest != null) f.rest_seconds = rest;
  if (typeof c.notes === 'string') f.notes = c.notes.trim() || null;
  return f;
}

/** Applies the agreed changes to the trainee's own plan; one line per change. */
async function applyChanges(db: SupabaseClient, userId: string, changes: Change[], refs: Refs): Promise<string[]> {
  const plan = await loadPlan(db, userId);
  if (!plan) return ['⚠️ לא מצאתי לו תוכנית אימונים פעילה, אז לא שיניתי כלום.'];
  if (plan.ownerId !== userId) return ['⚠️ התוכנית שלו משותפת גם למתאמנים אחרים, אז לא שיניתי אותה. צריך לשנות ידנית באדמין.'];
  const lib = await library(db);
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const byName = new Map(lib.map((x) => [norm(x.name), x]));
  const exIds = new Set(plan.exercises.map((x) => x.id));
  const dayIds = new Set(plan.days.map((d) => d.id));
  const out: string[] = [];
  for (const c of changes) {
    const label = changesText([c], refs).replace(/^1\. /, '').split('\n')[0];
    const target = c.ex ? refs[c.ex]?.id : undefined;
    let error: string | null = null;
    if (c.op === 'update' || c.op === 'remove' || c.op === 'swap') {
      if (!target || !exIds.has(target)) error = 'התרגיל כבר לא בתוכנית';
    }
    const lib1 = c.to ? byName.get(norm(c.to)) : undefined;
    if ((c.op === 'swap' || c.op === 'add') && !lib1) error = `אין בספרייה תרגיל בשם "${c.to}"`;
    if (!error) {
      const f = fields(c);
      const res =
        c.op === 'update' ? await db.from('workout_plan_exercises').update(f).eq('id', target!) :
        c.op === 'remove' ? await db.from('workout_plan_exercises').delete().eq('id', target!) :
        c.op === 'swap' ? await db.from('workout_plan_exercises').update({ ...f, exercise_id: lib1!.id }).eq('id', target!) :
        await (async () => {
          const dayId = c.day ? refs[c.day]?.id : undefined;
          if (!dayId || !dayIds.has(dayId)) return { error: { message: 'יום האימון לא נמצא' } };
          const last = Math.max(-1, ...plan.exercises.filter((x) => x.dayId === dayId).map((x) => x.sort));
          return await db.from('workout_plan_exercises').insert({ plan_day_id: dayId, exercise_id: lib1!.id, sets: 3, reps_min: 10, reps_max: 12, rest_seconds: 60, ...f, sort_order: last + 1 });
        })();
      if (res.error) error = res.error.message;
    }
    out.push(error ? `⚠️ ${label}: לא עודכן (${error})` : `✅ ${label}`);
  }
  return out;
}

/** The model's JSON (the first {...} in its text), or null. */
function json(text: string): Row | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
const asChanges = (v: unknown): Change[] => (Array.isArray(v) ? (v as Change[]).filter((c) => c && ['update', 'swap', 'add', 'remove'].includes(c.op)) : []);

// ── 2. The proposal, to the coach ─────────────────────────────────────────────

const PROPOSAL_SYSTEM = `אתה עוזר מקצועי לצוות האימון של "חטוב בלי תפריט". יש לך את תוכנית האימונים של מתאמן, מה שנרשם באפליקציה, ושיחה שבה שאלת אותו איך הולכים לו האימונים. תציע למאמן שיפורים מעשיים לתוכנית. המאמן מחליט.
עקרונות:
- מעט שינויים וממוקדים (בדרך כלל 1–5), כל אחד עם סיבה ממה שהמתאמן אמר או מהנתונים.
- התקדמות הדרגתית: קודם חזרות, אחר כך משקל, בקפיצות קטנות.
- קל מדי → להעלות. קשה מדי או לא מסיים → להוריד, או להחליף לגרסה קלה יותר.
- תרגיל לא נוח: להחליף בתרגיל מהספרייה שמתאים לציוד שלו. כאב אמיתי או פציעה: לא לתכנן סביב זה, אלא לכתוב בממצאים שהמאמן צריך לבדוק.
- אין רישום באפליקציה ≠ לא התאמן. מה שהוא אמר בשיחה קובע.
- כותבים למאמן בעברית, קצר ומקצועי.
${OPS_HELP}
פורמט: JSON בלבד, בלי שום טקסט אחר:
{"findings":"2–5 שורות קצרות: מה עלה בשיחה ובנתונים","changes":[...]}
אם אין מה לשנות: "changes": [].`;

async function finishInterview(db: SupabaseClient, review: Row) {
  // Taken by this call (a second one finds it already moved on).
  const { data: mine } = await db.from('bot_workout_reviews').update({ status: 'proposed', proposed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', review.id).eq('status', 'interview').select('id');
  if (!mine?.length) return;
  const userId = review.user_id as string;
  const [plan, who, lib, { data: talk }] = await Promise.all([
    loadPlan(db, userId),
    trainee(db, userId),
    library(db),
    db.from('whatsapp_messages').select('sender, text, created_at').eq('chat_id', review.chat_id).gte('created_at', new Date(new Date(review.started_at).getTime() - 30 * 60_000).toISOString()).order('created_at').limit(80),
  ]);
  const refs = plan ? makeRefs(plan) : {};
  const chat = ((talk ?? []) as Row[]).map((m) => `${m.sender === 'client' ? 'מתאמן' : m.sender === 'bot' ? 'אתה' : 'מאמן'}: ${m.text ?? ''}`).join('\n');
  const prompt = {
    system: PROPOSAL_SYSTEM,
    user: `# המתאמן\n${who.facts}\n\n# התוכנית\n${plan ? planText(plan, refs) : 'אין תוכנית פעילה.'}\n\n# מה נרשם ב-4 השבועות האחרונים\n${await historyText(db, userId, plan)}\n\n# השיחה איתו על האימונים\n${chat}\n\n# ספריית התרגילים\n${libraryText(lib)}`,
  };
  const { text } = await runModel(db, prompt, { chatId: review.chat_id, userId, kind: 'review' });
  const out = json(text);
  const findings = String(out?.findings ?? text ?? '').trim() || 'לא עלה משהו מיוחד.';
  const changes = asChanges(out?.changes);
  const phones = await alertPhones(db, review.chat_id);
  const coachChat = review.coach_chat ?? (phones[0] ? `${phones[0]}@c.us` : null);
  // Into the coach's queue: sent now if the coach isn't on another trainee, else when that one closes.
  await db.from('bot_workout_reviews').update({ findings, changes, refs, coach_chat: coachChat, sent_at: null, updated_at: new Date().toISOString() }).eq('id', review.id);
  if (coachChat) await sendNext(db, coachChat);
}

// ── The coach's queue: one trainee at a time ─────────────────────────────────

/** Proposals waiting for this coach, oldest first. */
async function queued(db: SupabaseClient, coachChat: string): Promise<Row[]> {
  const { data } = await db.from('bot_workout_reviews').select('*').eq('status', 'proposed').is('sent_at', null).eq('coach_chat', coachChat).order('proposed_at');
  return (data ?? []) as Row[];
}

/** The proposal the coach is on now (sent, not yet closed). */
async function onNow(db: SupabaseClient, coachChat: string): Promise<Row | null> {
  const { data } = await db.from('bot_workout_reviews').select('*').eq('status', 'proposed').not('sent_at', 'is', null).eq('coach_chat', coachChat).order('sent_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Row | null) ?? null;
}

/** If the coach is free: the next proposal in the queue, with how many still wait. */
async function sendNext(db: SupabaseClient, coachChat: string) {
  if (await onNow(db, coachChat)) return;
  const [next, ...rest] = await queued(db, coachChat);
  if (!next) return;
  // Taken once (two closings at the same moment send it once).
  const { data: mine } = await db.from('bot_workout_reviews').update({ sent_at: new Date().toISOString() }).eq('id', next.id).is('sent_at', null).select('id');
  if (!mine?.length) return;
  const who = await trainee(db, next.user_id);
  const msg =
    `🏋️ הצעה לשיפור האימון של ${who.name}${next.chat_id === TEST_GROUP_ID ? ' (קבוצת ניסיון)' : ''}\n\n` +
    `מה עלה:\n${next.findings ?? ''}\n\n` +
    `מה אני מציע:\n${changesText(asChanges(next.changes), (next.refs ?? {}) as Refs)}\n\n` +
    `אפשר לשאול, לשנות או להוסיף. כשסגרנו, כתוב "מאשר" ואעדכן לו באפליקציה.` +
    (rest.length ? `\n\n(עוד ${rest.length} ממתינים בתור אחריו. "דלג" מעביר אותו לסוף התור.)` : '');
  await sendAndLog(db, coachChat, next.user_id, msg);
}

// ── 3. Talking it over with the coach (private chat) ──────────────────────────

const COACH_SYSTEM = `אתה העוזר של צוות "חטוב בלי תפריט", ומדבר בפרטי עם מאמן על הצעה לשיפור תוכנית האימונים של מתאמן. המאמן מחליט.
- תענה לו קצר ולעניין, בעברית, כמו עמית למקצוע: מסבירים כשהוא שואל, ומעדכנים את ההצעה לפי מה שהוא אומר. אם הוא מחליט אחרת, אפשר להעיר פעם אחת, ואז עושים כמו שהוא אומר.
- אישור ברור לרשימה הנוכחית ("מאשר", "סגור", "תעדכן", "יאללה"): approved=true.
- "בטל" או "לא צריך": cancel=true.
${OPS_HELP}
פורמט: JSON בלבד, בלי שום טקסט אחר:
{"reply":"ההודעה למאמן","changes":[הרשימה המלאה המעודכנת],"approved":false,"cancel":false,"client_message":""}
כש-approved=true: client_message הוא הודעה קצרה וחמה למתאמן בקבוצה, בשם הצוות ("אנחנו"), שמספרת מה שינינו באימון ולמה, בלי מספרי E/D. אחרת: ריק.`;

/** Coaches who may talk the reviews over in private (for now: the test group's alert numbers). */
export async function reviewCoaches(db: SupabaseClient): Promise<Set<string>> {
  return new Set(TEST_GROUP_ID ? await alertPhones(db, TEST_GROUP_ID) : []);
}

/** A coach wrote the bot in private. */
export async function coachTurn(db: SupabaseClient, coachChat: string, text: string) {
  // The proposal the coach is on; else an interview still running (theirs or no one's yet).
  const active = await onNow(db, coachChat);
  const waiting = await queued(db, coachChat);
  const { data: asking } = active ? { data: [] } : await db.from('bot_workout_reviews').select('*').eq('status', 'interview').order('started_at', { ascending: false }).limit(10);
  const interview = ((asking ?? []) as Row[]).find((r) => !r.coach_chat || r.coach_chat === coachChat) ?? null;
  const review = active ?? interview;
  const say = (t: string, userId: string | null = review?.user_id ?? null) => sendAndLog(db, coachChat, userId, t);

  // The queue: who's waiting.
  if (/(מי בתור|מה בתור|מי מחכה|כמה מחכים|התור)/.test(text)) {
    const names = await Promise.all(waiting.map(async (r) => (await trainee(db, r.user_id)).name));
    const now = active ? `עכשיו: ${(await trainee(db, active.user_id)).name}.` : 'אין כרגע הצעה פתוחה.';
    return say(`${now}\n${names.length ? `בתור: ${names.map((n, i) => `${i + 1}. ${n}`).join(', ')}.` : 'אין אף אחד בתור.'}`);
  }
  // Later: this one to the end of the queue, on to the next.
  if (active && /(דלג|אחר כך|אח"כ|תדחה|נחזור לזה)/.test(text)) {
    if (!waiting.length) return say('אין אף אחד אחר בתור, אז נשארים עם זה. כשתרצה, אפשר להמשיך.');
    await db.from('bot_workout_reviews').update({ sent_at: null, proposed_at: new Date().toISOString() }).eq('id', active.id);
    await say(`בסדר, ${(await trainee(db, active.user_id)).name} עובר לסוף התור.`);
    return sendNext(db, coachChat);
  }

  if (!review) {
    const { data: g } = await db.from('whatsapp_groups').select('chat_id, user_id').eq('chat_id', TEST_GROUP_ID).maybeSingle();
    const who = g?.user_id ? await trainee(db, g.user_id) : null;
    if (g?.user_id && /אימונ?/.test(text) && /(תבדוק|בדוק|תבחן|בחינ|בדיק|תעבור|עבור על|תשאל)/.test(text)) {
      const started = await startReview(db, g.user_id, g.chat_id, 'coach', coachChat);
      if (!started) return say('לא הצלחתי לפתוח בדיקה (אולי כבר יש אחת פתוחה).', g.user_id);
      await openInGroup(db, g.chat_id, g.user_id);
      return say(`פתחתי עם ${who!.name} שיחה על האימונים. כשאסיים, אשלח לך מה אני מציע.`, g.user_id);
    }
    // Nothing open, but proposals wait: on to the next.
    if (waiting.length) return sendNext(db, coachChat);
    return say(`אין כרגע בדיקת אימון פתוחה. כדי שאבדוק, כתוב לי למשל: "תבדוק את האימון של ${who?.name ?? 'המתאמן'}".`, g?.user_id ?? null);
  }

  if (review.status === 'interview') {
    if (/(תסיים|סיים|מספיק|תציע)/.test(text)) {
      await finishInterview(db, { ...review, coach_chat: coachChat });
      return;
    }
    const who = await trainee(db, review.user_id);
    return say(`אני עוד באמצע לשאול את ${who.name} על האימונים. אם תרצה שאסיים עכשיו עם מה שיש, כתוב "תסיים".`);
  }

  // proposed: the coach and the bot talk it over.
  const userId = review.user_id as string;
  const [plan, who, lib, { data: dm }] = await Promise.all([
    loadPlan(db, userId),
    trainee(db, userId),
    library(db),
    // Only the talk about this trainee: from when their proposal was sent.
    db.from('whatsapp_messages').select('sender, text').eq('chat_id', coachChat).gte('created_at', new Date(new Date(review.sent_at ?? review.proposed_at ?? review.started_at).getTime() - 5_000).toISOString()).order('created_at').limit(40),
  ]);
  const refs = plan ? makeRefs(plan, (review.refs ?? {}) as Refs) : ((review.refs ?? {}) as Refs);
  const current = asChanges(review.changes);
  const talk = ((dm ?? []) as Row[]).map((m) => `${m.sender === 'bot' ? 'אתה' : 'המאמן'}: ${m.text ?? ''}`).join('\n');
  const prompt = {
    system: COACH_SYSTEM,
    user:
      `# המתאמן\n${who.facts}\n\n# התוכנית\n${plan ? planText(plan, refs) : 'אין תוכנית פעילה.'}\n\n` +
      `# מה עלה בשיחה איתו\n${review.findings ?? ''}\n\n# ההצעה הנוכחית\n${changesText(current, refs)}\n(JSON: ${JSON.stringify(current)})\n\n` +
      `# ספריית התרגילים\n${libraryText(lib)}\n\n# השיחה עם המאמן (האחרונה בסוף)\n${talk}`,
  };
  const { text: out } = await runModel(db, prompt, { chatId: coachChat, userId, kind: 'review' });
  const r = json(out);
  if (!r) return say(out.trim() || 'לא הבנתי, אפשר לנסח שוב?');
  const changes = r.changes !== undefined ? asChanges(r.changes) : current;
  const now = new Date().toISOString();

  // The coach's text is one message: the model's "---" splits become line breaks.
  const oneMessage = (t: unknown) => String(t ?? '').split(/\n\s*---\s*\n/).map((s) => s.trim()).filter(Boolean).join('\n');
  // Approving or cancelling is taken once: a second message from the coach meanwhile finds it closed.
  const close = async (status: 'applied' | 'cancelled') => {
    const { data: mine } = await db.from('bot_workout_reviews').update({ status, closed_at: now, updated_at: now }).eq('id', review.id).eq('status', 'proposed').select('id');
    return !!mine?.length;
  };

  if (r.cancel) {
    if (!(await close('cancelled'))) return;
    await say(`${who.name}: ${oneMessage(r.reply) || 'בוטל. לא שיניתי כלום.'}`);
    return sendNext(db, coachChat);
  }
  if (r.approved) {
    if (!(await close('applied'))) return;
    const lines = await applyChanges(db, userId, changes, refs);
    await db.from('bot_workout_reviews').update({ changes, refs, result: lines.join('\n') }).eq('id', review.id);
    await say(`${who.name}: ${oneMessage(r.reply) || 'מעולה.'}\n\nמה עודכן באפליקציה:\n${lines.join('\n')}`);
    const okCount = lines.filter((l) => l.startsWith('✅')).length;
    // To the trainee as the bot's usual short messages (split on "---", at most 2).
    const toClient = toReply(String(r.client_message ?? ''), 2).parts;
    if (okCount && toClient.length && review.chat_id === TEST_GROUP_ID) await deliver(db, review.chat_id, userId, toClient);
    return sendNext(db, coachChat);
  }
  await db.from('bot_workout_reviews').update({ changes, refs, coach_chat: coachChat, updated_at: now }).eq('id', review.id);
  return say(`${who.name}: ${oneMessage(r.reply)}${r.changes !== undefined ? `\n\nההצעה עכשיו:\n${changesText(changes, refs)}` : ''}`);
}

/** The bot opens the review in the trainee's group (a coach asked, or it's time). */
export async function openInGroup(db: SupabaseClient, chatId: string, userId: string) {
  const prompt = await buildPrompt(db, chatId, userId, 'בדיקת אימון: איך הולכים לך האימונים', false, undefined, undefined, REVIEW_OPEN_TASK);
  const { text, refused, model } = await runModel(db, prompt, { chatId, userId });
  if (refused) return false;
  const { parts } = toReply(text, maxParts(model));
  if (!parts.length) return false;
  await deliver(db, chatId, userId, parts);
  return true;
}

// ── For the scheduled job ─────────────────────────────────────────────────────

/** Time for the 4-weekly review: workouts open 4 weeks, the last review 4 weeks ago, none open. */
export async function reviewDue(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: last } = await db.from('bot_workout_reviews').select('status, started_at').eq('user_id', userId).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (last && (['interview', 'proposed'].includes(last.status) || Date.now() - new Date(last.started_at).getTime() < EVERY_MS)) return false;
  const plan = await loadPlan(db, userId);
  if (!plan) return false;
  const withExercises = new Set(plan.exercises.map((x) => x.dayId));
  const opened = plan.days.filter((d) => d.open && withExercises.has(d.id) && d.openedAt != null).map((d) => d.openedAt!);
  return opened.length > 0 && Date.now() - Math.min(...opened) >= EVERY_MS;
}

/** An interview left hanging: after 72 hours, on with what there is (or dropped if they never answered). */
export async function reviewTimeouts(db: SupabaseClient) {
  const { data } = await db.from('bot_workout_reviews').select('*').eq('status', 'interview').lt('started_at', new Date(Date.now() - INTERVIEW_TIMEOUT_MS).toISOString());
  for (const r of (data ?? []) as Row[]) {
    const { data: said } = await db.from('whatsapp_messages').select('id').eq('chat_id', r.chat_id).eq('sender', 'client').gte('created_at', r.started_at).limit(1);
    if ((said ?? []).length) await finishInterview(db, r);
    else await db.from('bot_workout_reviews').update({ status: 'cancelled', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id);
  }
}
