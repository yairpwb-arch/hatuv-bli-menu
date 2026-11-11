// The workout bot (bot_workout_plans): builds a trainee's workout plan from the
// coaches' principles (bot_settings.workout_principles), their template
// workouts (workout_templates), the exercise library and the opening
// questionnaire. A plan it builds waits for a coach (status 'pending'); the
// coach approves it in the admin and only then it's written into the app.
//   initial: after the opening questionnaire. One workout that opens with the
//            weeks 5–6 video, two more with the weeks 9–10 video.
//   request: the trainee asked in the group for more / other workouts (test
//            group only, [בקשת_אימון]), or a coach asked in the admin.

import Anthropic from 'npm:@anthropic-ai/sdk';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { claudeUsage, logUsage, setting } from '../_shared/botkit.ts';
import { TEST_GROUP_ID, alertPhones, sendAndLog } from '../_shared/wa.ts';
import { loadPlan, makeRefs, planText } from './workouts.ts';

type Row = Record<string, any>;

/** The plan is real coaching work: the strong model, with room to think. */
const PLAN_MODEL = 'claude-sonnet-5-5';
const anthropic = Deno.env.get('ANTHROPIC_API_KEY') ? new Anthropic() : null;
/** Plans built in one cron run, at most. */
const PER_RUN = 3;
const STAGE_UNLOCK: Record<string, string | null> = { '1': 'workout_1', '2': 'workout_2', now: null };

// ── The coaches' structure: which track, how many days, what each day is ─────
//
// Decided here, by the questionnaire (not by the model); the model only fills
// each day with exercises.
//   - not training strength regularly for over two months (beginners):
//       men   1 full body at the first workouts video, 1 more at the second;
//       women 1 full body at the first video, 2 more at the second;
//   - strength for over two months, up to 2 a week: open from the start,
//       men 1 full body, women 2;
//   - strength for over two months, 3+ a week: open from the start,
//       men ABC (legs / chest-triceps-shoulders / back-biceps-abs),
//       women LLU (legs+abs, legs+abs, upper body).
// Extras offered in weeks 9–10 (the trainee taps "add"): pull-ups (men), abs (women).

interface DaySpec { stage: '1' | '2' | 'now'; focus: string }
interface Track { key: string; label: string; days: DaySpec[] }

const FULL_M = 'פול באדי: תרגילים מורכבים, דגש על גב וחזה';
const FULL_F = 'פול באדי: תרגילים מורכבים, דגש על רגליים ובטן';
const OTHER = ' (תרגילים אחרים מהאימונים האחרים שלו, שיגוון)';

export const EXTRAS: Record<string, { label: string; days: DaySpec[] }> = {
  extra_pullups: {
    label: 'אימון מתח נוסף (מההצעה בשבועות 9–10)',
    days: [{ stage: 'now', focus: 'אימון מתח: להשתפר במתח, לפי כמה מתח הוא מצליח היום (max_pullups). מי שעוד לא עושה מתח: תרגילי ההתקדמות מהספרייה (מתח שלילי, החזקות, מתח עם קפיצה), ועוד תרגילי גב וליבה שעוזרים למתח.' }],
  },
  extra_abs: {
    label: 'אימון בטן נוסף (מההצעה בשבועות 9–10)',
    days: [{ stage: 'now', focus: 'אימון בטן: חיזוק הבטן והליבה, מגוון (ישרה, אלכסונית, תחתונה, ייצוב), ברמה שמתאימה לה.' }],
  },
};

function trackOf(a: Row, gender: string | null | undefined): Track {
  const female = (gender ?? a.gender) === 'female';
  const types = Array.isArray(a.training_types) ? (a.training_types as string[]) : [];
  const regular = a.trains === 'yes' && types.includes('strength') && (a.training_duration === '2-6m' || a.training_duration === 'gt6m');
  const many = ['3', '4', '5+'].includes(String(a.strength_per_week ?? ''));
  const who = female ? 'אישה' : 'גבר';
  if (!regular) {
    return female
      ? { key: 'beginner_f', label: `מתחילה (לא מתאמנת כוח קבוע מעל חודשיים) · ${who}`, days: [{ stage: '1', focus: FULL_F }, { stage: '2', focus: FULL_F + OTHER }, { stage: '2', focus: FULL_F + OTHER }] }
      : { key: 'beginner_m', label: `מתחיל (לא מתאמן כוח קבוע מעל חודשיים) · ${who}`, days: [{ stage: '1', focus: FULL_M }, { stage: '2', focus: FULL_M + OTHER }] };
  }
  if (!many) {
    return female
      ? { key: 'regular_f', label: `מתאמנת כוח מעל חודשיים, עד 2 בשבוע · ${who}`, days: [{ stage: 'now', focus: FULL_F }, { stage: 'now', focus: FULL_F + OTHER }] }
      : { key: 'regular_m', label: `מתאמן כוח מעל חודשיים, עד 2 בשבוע · ${who}`, days: [{ stage: 'now', focus: FULL_M }] };
  }
  return female
    ? { key: 'llu_f', label: `מתאמנת כוח מעל חודשיים, 3+ בשבוע: LLU · ${who}`, days: [
        { stage: 'now', focus: 'L · רגליים ובטן' },
        { stage: 'now', focus: 'L · רגליים ובטן' + OTHER },
        { stage: 'now', focus: 'U · פלג גוף עליון' },
      ] }
    : { key: 'abc_m', label: `מתאמן כוח מעל חודשיים, 3+ בשבוע: ABC · ${who}`, days: [
        { stage: 'now', focus: 'A · רגליים' },
        { stage: 'now', focus: 'B · חזה, יד אחורית וכתפיים' },
        { stage: 'now', focus: 'C · גב, יד קדמית ובטן' },
      ] };
}

const STAGE_TEXT: Record<DaySpec['stage'], string> = { '1': 'נפתח עם סרטון האימונים הראשון', '2': 'נפתח עם סרטון האימונים השני', now: 'פתוח מיד' };
const specText = (days: DaySpec[]) => days.map((d, i) => `${i + 1}. ${d.focus} (${STAGE_TEXT[d.stage]})`).join('\n');

/** One exercise in a built plan (what's saved in bot_workout_plans.plan). */
export interface BuiltExercise { exercise_id: string; name: string; sets: number; reps_min: number; reps_max: number; rest_seconds: number; is_duration: boolean; notes: string | null }
export interface BuiltDay { stage: '1' | '2' | 'now'; name: string; replaces?: string | null; replaces_name?: string | null; exercises: BuiltExercise[] }

// ── What the bot knows ────────────────────────────────────────────────────────

async function knowledge(db: SupabaseClient) {
  const [principles, { data: templates }] = await Promise.all([
    setting<string>(db, 'workout_principles'),
    db.from('workout_templates').select('name, audience, body').order('sort_order').order('created_at'),
  ]);
  return { principles: (principles ?? '').trim(), templates: (templates ?? []) as Row[] };
}

/** The library with short codes (L1…), so the model picks real exercises only. */
async function libraryCodes(db: SupabaseClient) {
  const { data } = await db.from('exercises').select('id, name, equipment, muscle_groups, difficulty').order('name').limit(1500);
  const rows = (data ?? []) as Row[];
  const byCode = new Map<string, Row>();
  const lines = rows.map((x, i) => {
    const code = `L${i + 1}`;
    byCode.set(code, x);
    return `${code} ${x.name}${x.equipment ? ` [${x.equipment}]` : ''}${x.muscle_groups?.length ? ` (${x.muscle_groups.join(', ')})` : ''}${x.difficulty ? ` · ${x.difficulty}` : ''}`;
  });
  return { text: lines.join('\n'), byCode };
}

/** The trainee: profile and every answer of the opening questionnaire. */
async function traineeText(db: SupabaseClient, userId: string) {
  const [{ data: p }, { data: ob }] = await Promise.all([
    db.from('profiles').select('full_name, gender, age, height, current_weight, target_weight, start_date').eq('id', userId).maybeSingle(),
    db.from('onboarding_responses').select('answers').eq('user_id', userId).maybeSingle(),
  ]);
  const a = ((ob as Row | null)?.answers ?? {}) as Row;
  const skip = new Set(['photos', 'measurements', 'name']);
  const answers = Object.entries(a)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : typeof v === 'object' ? JSON.stringify(v) : v}`);
  const pr = (p ?? {}) as Row;
  const name = pr.full_name || 'המתאמן';
  return {
    name,
    answers: a,
    gender: (pr.gender as string | null) ?? null,
    text: [
      `${name}: ${pr.gender === 'female' ? 'אישה' : 'גבר'}${pr.age ? `, בן/בת ${pr.age}` : ''}${pr.height ? `, ${pr.height} ס"מ` : ''}${pr.current_weight ? `, ${pr.current_weight} ק"ג` : ''}${pr.target_weight ? ` (יעד ${pr.target_weight})` : ''}.`,
      `תשובות שאלון הפתיחה: ${answers.join(', ') || 'אין'}`,
    ].join('\n'),
  };
}

// ── The model ─────────────────────────────────────────────────────────────────

const SYSTEM = `אתה המאמן הבונה תוכניות אימון של "חטוב בלי תפריט". אתה בונה תוכנית אימונים אישית למתאמן, לפי השיטה של הצוות. מאמן אנושי עובר על התוכנית ומאשר אותה לפני שהיא מגיעה למתאמן.

# חובה
- השיטה של הצוות (העקרונות והתבניות למטה) גוברת על כל ידע כללי שלך. כשיש תבנית שמתאימה למתאמן, מתחילים ממנה ומתאימים אותה אליו.
- רק תרגילים מספריית התרגילים, לפי הקוד שלהם (L12). אין להמציא תרגילים.
- מתאימים לציוד ולמקום (בית / חדר כושר / בחוץ), לזמן שיש לו לאימון, לניסיון ולרמה שלו (מהשאלון: כמה מתח / שכיבות סמיכה / סקוואטים הוא מצליח).
- פציעה או מצב רפואי בשאלון: לא נותנים תרגיל שמעמיס על האזור. כותבים את זה במפורש בהסבר למאמן.
- סטים, טווח חזרות ומנוחה ריאליים. תרגיל בזמן (פלאנק, חבל, קרדיו): is_duration=true וה"חזרות" הן שניות.
- שמות לימי האימון: קצרים ובעברית (למשל "אימון A · גוף מלא"). כשיש בקשה, השם משקף אותה (למשל "רגליים · בית").
- בקשה של המתאמן או של המאמן היא חובה, לא המלצה. קודם מוציאים מהשיחה כל דבר שהוא ביקש במפורש: אזור או שריר לחזק (רגליים, בטן, גב…), תרגיל מסוים (סקוואט, מתח…), מקום, ציוד, זמן. כל אחד מהם חייב להופיע באימון שבונים:
  - תרגיל שביקש בשמו: נמצא באימון (או הגרסה שלו מהספרייה שמתאימה לציוד שלו).
  - אזור שביקש לחזק: הדגש של האימון. לפחות חצי מהתרגילים לאזור הזה, ואם ביקש רק אותו, כמעט הכול.
  - לא מעתיקים יום קיים שלו ומחליפים ציוד: בונים את מה שהוא ביקש.
  - אם בקשה סותרת את העקרונות או פציעה: מתאימים אותה (לא מוותרים עליה בשקט), וכותבים למאמן מה ולמה.

# מה מחזירים
JSON בלבד, בלי שום טקסט לפניו או אחריו:
{
  "template": "שם התבנית שממנה התחלת, או null",
  "asked": ["כל דבר שהמתאמן ביקש, ואיך הוא מופיע באימון. למשל: 'סקוואטים: סקוואט, סקוואט רחב, סקוואט קפיצה' או 'לחזק רגליים: 5 מתוך 6 תרגילים'. רשימה ריקה אם אין בקשה"],
  "rationale": "למאמן, 3–6 שורות: למה התוכנית הזו מתאימה למתאמן הזה, מה נלקח מהשאלון, ממה נזהרת",
  "days": [
    { "stage": "1" | "2" | "now", "name": "...", "replaces": "D2 או null", "exercises": [
      { "ex": "L12", "sets": 3, "reps_min": 8, "reps_max": 12, "rest_seconds": 90, "is_duration": false, "notes": "דגש קצר או null" }
    ] }
  ]
}`;

function parseJson(text: string): Row | null {
  const t = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

/** Builds a draft: fills plan / rationale and moves it to 'pending' (or 'failed'). */
export async function buildDraft(db: SupabaseClient, draftId: string): Promise<Row> {
  const { data: draft } = await db.from('bot_workout_plans').select('*').eq('id', draftId).maybeSingle();
  if (!draft) return { error: 'no draft' };
  const fail = async (error: string) => {
    await db.from('bot_workout_plans').update({ status: 'failed', error }).eq('id', draftId);
    return { error };
  };
  if (!anthropic) return fail('no ANTHROPIC_API_KEY');

  const [k, lib, who, plan] = await Promise.all([knowledge(db), libraryCodes(db), traineeText(db, draft.user_id), loadPlan(db, draft.user_id)]);
  const refs = plan ? makeRefs(plan) : {};
  const hasDays = !!plan && plan.days.length > 0;

  // The structure is fixed by the coaches' rules; the model fills in the exercises.
  const extra = draft.kind === 'request' && draft.request ? EXTRAS[draft.request] : undefined;
  const track = draft.kind === 'initial' ? trackOf(who.answers, who.gender) : null;
  const spec: DaySpec[] | null = track?.days ?? extra?.days ?? null;
  const head = track
    ? `המסלול שלו לפי השאלון: ${track.label}.`
    : extra
    ? `${extra.label}.${hasDays ? ' זה יום נוסף על הימים שכבר יש לו: לא נוגעים בהם.' : ''}`
    : '';
  const task = spec
    ? [
        head,
        `בנה בדיוק ${spec.length} ימי אימון, בסדר הזה (ה-stage של כל יום כמו שכתוב):`,
        specText(spec),
        track?.key.startsWith('beginner') ? 'האימון הראשון הוא ההיכרות שלו עם אימוני כוח: פשוט, בטוח, ושאפשר להצליח בו.' : '',
        'כל הימים מותאמים לתשובות שלו בשאלון: מקום, ציוד, זמן, רמה ופציעות.',
      ].filter(Boolean).join('\n')
    : `בקשה${draft.chat_id ? ' של המתאמן בקבוצה (השיחה, מהישן לחדש)' : ' של המאמן'}:\n"""\n${draft.request ?? ''}\n"""\n` +
      `כל מה שהוא ביקש בשיחה הזו (אזור לחזק, תרגילים מסוימים, מקום, ציוד, זמן) חייב להיות באימון, ורשום ב-"asked" איך. ` +
      `גם דברים שאמר בתחילת השיחה, לא רק בהודעה האחרונה.\nבנה רק את מה שצריך: ימים חדשים עם stage "now" (נפתחים מיד), או יום שמחליף יום קיים ("replaces": "D2", עם כל התרגילים של היום החדש). ${hasDays ? 'לא נוגעים בימים שלא ביקשו לשנות.' : 'אין לו עדיין ימי אימון.'}`;

  const user = [
    `# העקרונות של הצוות\n${k.principles || '(לא נכתבו)'}`,
    `# תבניות אימון\n${k.templates.length ? k.templates.map((t) => `## ${t.name}${t.audience ? ` (מתאים ל: ${t.audience})` : ''}\n${t.body}`).join('\n\n') : '(אין)'}`,
    `# המתאמן\n${who.text}`,
    hasDays ? `# התוכנית שיש לו עכשיו\n${planText(plan!, refs)}` : '',
    draft.note ? `# הערת המאמן לבנייה הזו (חובה ליישם)\n${draft.note}` : '',
    `# המשימה\n${task}`,
    `# ספריית התרגילים (קוד שם [ציוד] (שרירים))\n${lib.text}`,
  ].filter(Boolean).join('\n\n');

  let r: Row;
  try {
    r = (await anthropic.messages.create({
      model: PLAN_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    } as any)) as Row;
  } catch (err) {
    return fail(`model: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500));
  }
  await logUsage(db, { kind: 'plan', model: PLAN_MODEL, userId: draft.user_id, ...claudeUsage(r) });
  const text = ((r.content ?? []) as Row[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const out = parseJson(text);
  if (!out || !Array.isArray(out.days)) return fail('התשובה של המודל לא הייתה תוכנית תקינה');

  // Only real exercises, numbers in range; unknown codes are dropped (and noted).
  const dropped: string[] = [];
  const days: BuiltDay[] = (out.days as Row[]).map((d) => {
    const stage = (['1', '2', 'now'].includes(String(d.stage)) ? String(d.stage) : draft.kind === 'initial' ? '1' : 'now') as BuiltDay['stage'];
    const rep = d.replaces && refs[d.replaces] && refs[d.replaces].id && !refs[d.replaces].day ? d.replaces : null;
    const exercises = ((d.exercises ?? []) as Row[]).flatMap((e) => {
      const x = lib.byCode.get(String(e.ex));
      if (!x) {
        dropped.push(String(e.ex));
        return [];
      }
      const lo = clamp(e.reps_min, 1, 600, 8);
      return [{
        exercise_id: x.id,
        name: x.name,
        sets: clamp(e.sets, 1, 10, 3),
        reps_min: lo,
        reps_max: Math.max(lo, clamp(e.reps_max, 1, 600, lo)),
        rest_seconds: clamp(e.rest_seconds, 0, 600, 60),
        is_duration: !!e.is_duration,
        notes: e.notes ? String(e.notes).slice(0, 300) : null,
      }];
    });
    return { stage, name: String(d.name ?? 'אימון').slice(0, 80), replaces: rep, replaces_name: rep ? refs[rep].name : null, exercises };
  }).filter((d) => d.exercises.length > 0);
  if (days.length === 0) return fail('המודל לא החזיר תרגילים מהספרייה');
  // The coaches' structure wins: as many days as the track has, each opening when it says.
  if (spec) {
    days.splice(spec.length);
    days.forEach((d, i) => {
      d.stage = spec[i].stage;
      d.replaces = null;
      d.replaces_name = null;
    });
  }

  const asked = (Array.isArray(out.asked) ? out.asked : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 8);
  const rationale = [track ? `מסלול: ${track.label}` : extra ? extra.label : '', asked.length ? `מה שביקש ואיך זה באימון:\n${asked.map((s: string) => `• ${s}`).join('\n')}` : '', String(out.rationale ?? '').trim(), dropped.length ? `(הושמטו ${dropped.length} תרגילים שלא נמצאו בספרייה)` : ''].filter(Boolean).join('\n');
  await db.from('bot_workout_plans').update({
    status: 'pending', plan: { days }, rationale, template: out.template ? String(out.template).slice(0, 120) : null, model: PLAN_MODEL, error: null,
  }).eq('id', draftId);
  // The first plan goes straight into the trainee's plan, switched off: the coaches see it in the admin
  // (the weeks 5–6 day and the weeks 9–10 days) and switch it on when it's right.
  if (draft.kind === 'initial' && !hasDays) {
    const r = await approveDraft(db, draftId, null, { activate: false });
    if (!r.error) {
      await tellCoaches(db, { ...draft, status: 'approved' }, who.name, days);
      return { built: draftId, days: days.length, placed: 'off' };
    }
    console.error('[plan] placing the first plan failed', r.error); // stays pending: approve it as before
  }
  await tellCoaches(db, draft, who.name, days);
  return { built: draftId, days: days.length };
}

/** A private message to the coaches: a plan is waiting in the admin. */
async function tellCoaches(db: SupabaseClient, draft: Row, name: string, days: BuiltDay[]) {
  const { data: g } = await db.from('whatsapp_groups').select('chat_id').eq('user_id', draft.user_id).maybeSingle();
  const phones = await alertPhones(db, g?.chat_id ?? '');
  const what = draft.kind === 'initial' ? 'תוכנית ראשונה (אחרי שאלון הפתיחה)' : EXTRAS[draft.request ?? ''] ? EXTRAS[draft.request].label : `לפי בקשה: "…${(draft.request ?? '').slice(-160)}"`;
  const list = days.map((d) => `• ${d.name} (${d.exercises.length} תרגילים${d.stage === '1' ? ', נפתח בשבוע 5–6' : d.stage === '2' ? ', נפתח בשבוע 9–10' : ''})`).join('\n');
  if (draft.status === 'approved') {
    const off = `🏋️ הבוט בנה תוכנית אימון ל${name}\n${what}\n${list}\n\n` +
      `היא כבר בתוכנית שלו באדמין, כבויה: הוא עוד לא רואה אותה. אפשר לערוך שם, וכשהיא מוכנה מדליקים את "תוכנית אימון פעילה".\n(אדמין ← משתמשים ← ${name} ← אימון)`;
    for (const p of phones) await sendAndLog(db, `${p}@c.us`, draft.user_id, off);
    return;
  }
  const text =
    `🏋️ הבוט בנה תוכנית אימון ל${name}\n${what}\n${list}\n\n` +
    `לאישור כתבו כאן "מאשר". רוצים שינוי? כתבו מה לשנות ואבנה מחדש. לביטול: "דחייה".\n(כל התרגילים: אדמין ← משתמשים ← ${name} ← אימון)`;
  for (const p of phones) await sendAndLog(db, `${p}@c.us`, draft.user_id, text);
}

// ── Starting a build ──────────────────────────────────────────────────────────

/** A new draft for a trainee (an open one is replaced), built right away. */
export async function startBuild(
  db: SupabaseClient,
  userId: string,
  opts: { kind: 'initial' | 'request'; request?: string | null; note?: string | null; chatId?: string | null },
): Promise<Row> {
  await db.from('bot_workout_plans').update({ status: 'rejected', decided_at: new Date().toISOString(), error: 'הוחלף בבנייה חדשה' })
    .eq('user_id', userId).in('status', ['building', 'pending']);
  const { data, error } = await db.from('bot_workout_plans')
    .insert({ user_id: userId, kind: opts.kind, request: opts.request ?? null, note: opts.note ?? null, chat_id: opts.chatId ?? null })
    .select('id').single();
  if (error || !data) return { error: error?.message ?? 'not created' };
  return buildDraft(db, data.id);
}

/** Cron: a plan for every questionnaire finished since the bot was switched on (no plan yet, never built). */
export async function jobPlans(db: SupabaseClient): Promise<Row> {
  // Asked from the app (the weeks 9–10 offer): rows waiting to be built.
  const built: Row[] = [];
  const { data: waiting } = await db.from('bot_workout_plans').select('id, user_id').eq('status', 'building')
    .lt('created_at', new Date(Date.now() - 3 * 60_000).toISOString()).limit(PER_RUN);
  for (const w of (waiting ?? []) as Row[]) built.push({ user_id: w.user_id, ...(await buildDraft(db, w.id)) });

  const since = (await setting<string>(db, 'workout_builder_since')) ?? new Date().toISOString();
  const { data: done } = await db.from('onboarding_responses').select('user_id').gte('questionnaire_completed_at', since).limit(200);
  for (const { user_id } of (done ?? []) as Row[]) {
    if (built.length >= PER_RUN) break;
    const { data: any } = await db.from('bot_workout_plans').select('id').eq('user_id', user_id).limit(1);
    if ((any ?? []).length) continue; // built (or tried) before
    const plan = await loadPlan(db, user_id);
    if (plan && plan.days.length) continue; // a coach already built one
    built.push({ user_id, ...(await startBuild(db, user_id, { kind: 'initial' })) });
  }
  return { built };
}

/** The trainee asked in the group for more / other workouts. */
export async function requestFromGroup(db: SupabaseClient, chatId: string, userId: string | null) {
  if (!userId || chatId !== TEST_GROUP_ID) return;
  // The request is the recent conversation (the ask, our questions, their answers), not only the last line.
  const { data: recent } = await db.from('whatsapp_messages').select('sender, text, created_at').eq('chat_id', chatId)
    // A day back: the ask often comes hours before the last message (and "did it arrive?" after it).
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString()).order('created_at', { ascending: false }).limit(25);
  const talk = ((recent ?? []) as Row[]).reverse().filter((m) => m.text)
    .map((m) => `${m.sender === 'client' ? 'המתאמן' : 'אנחנו'}: ${m.text}`).join('\n');
  // Too long: the newest part is kept (it holds the ask and the answers to our questions).
  await startBuild(db, userId, { kind: 'request', request: talk.slice(-3000), chatId });
}

// ── Approving ─────────────────────────────────────────────────────────────────

/** A coach approved: the plan is written into the app (the trainee's own plan). */
export async function approveDraft(db: SupabaseClient, draftId: string, adminId: string | null, opts: { activate?: boolean } = {}): Promise<Row> {
  // activate: false: the days go into the trainee's plan, but the plan stays off (the coach switches it on).
  const activate = opts.activate !== false;
  const { data: draft } = await db.from('bot_workout_plans').select('*').eq('id', draftId).maybeSingle();
  if (!draft) return { error: 'no draft' };
  if (draft.status !== 'pending') return { error: `status is ${draft.status}` };
  // Only one approval: whoever moves it first.
  const { data: mine } = await db.from('bot_workout_plans').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId })
    .eq('id', draftId).eq('status', 'pending').select('id');
  if (!(mine ?? []).length) return { error: 'already decided' };

  const userId = draft.user_id as string;
  const days = ((draft.plan?.days ?? []) as BuiltDay[]);
  // The trainee's own plan (made if there's none yet).
  let planId: string | null = null;
  const { data: a } = await db.from('user_workout_assignments').select('id, plan_id, is_active, workout_plans(user_id)').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (a && (a as Row).workout_plans?.user_id === userId) {
    planId = (a as Row).plan_id;
    if (activate && !(a as Row).is_active) await db.from('user_workout_assignments').update({ is_active: true }).eq('id', (a as Row).id);
  } else {
    const { data: p } = await db.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const { data: plan, error } = await db.from('workout_plans').insert({ name: `תוכנית של ${p?.full_name ?? 'המתאמן'}`, user_id: userId, duration_weeks: 12, is_active: true }).select('id').single();
    if (error || !plan) return { error: error?.message ?? 'no plan' };
    planId = plan.id;
    if (a && activate) await db.from('user_workout_assignments').update({ is_active: false }).eq('user_id', userId);
    await db.from('user_workout_assignments').insert({ user_id: userId, plan_id: planId, is_active: activate, start_date: new Date().toISOString().slice(0, 10) });
  }

  const { data: existing } = await db.from('workout_plan_days').select('id, day_number').eq('plan_id', planId).order('day_number');
  let next = Math.max(0, ...((existing ?? []) as Row[]).map((d) => d.day_number)) + 1;
  const plan = await loadPlan(db, userId);
  const refs = plan ? makeRefs(plan) : {};
  for (const d of days) {
    let dayId: string | null = null;
    const replaced = d.replaces ? refs[d.replaces] : null;
    if (replaced && !replaced.day) {
      dayId = replaced.id;
      await db.from('workout_plan_days').update({ name: d.name }).eq('id', dayId);
      await db.from('workout_plan_exercises').delete().eq('plan_day_id', dayId);
    } else {
      const { data: row } = await db.from('workout_plan_days')
        .insert({ plan_id: planId, day_number: next++, name: d.name, unlocks_with: STAGE_UNLOCK[d.stage] ?? null })
        .select('id').single();
      dayId = row?.id ?? null;
    }
    if (!dayId) continue;
    await db.from('workout_plan_exercises').insert(d.exercises.map((e, i) => ({
      plan_day_id: dayId, exercise_id: e.exercise_id, sets: e.sets, reps_min: e.reps_min, reps_max: e.reps_max,
      rest_seconds: e.rest_seconds, is_duration: e.is_duration, notes: e.notes, sort_order: i,
    })));
  }

  // The trainee asked in the group: tell them it's ready (test group only).
  if (draft.kind === 'request' && draft.chat_id && draft.chat_id === TEST_GROUP_ID) {
    await sendAndLog(db, draft.chat_id, userId, `האימון החדש שלך מוכן באפליקציה 💪\n${days.map((d) => `• ${d.name}`).join('\n')}\nאפשר למצוא אותו בדף האימונים.`);
  }
  return { approved: draftId, days: days.length };
}

// ── The coach answers in private ──────────────────────────────────────────────

const REJECT = /(לא מאשר|לא לאשר|דחה|דחייה|דחיה|לבטל|תבטל|בטל את)/;
const APPROVE = /^\s*(מאשר|מאושר|אישור|אשר|אושר|כן|סגור|יאללה|סבבה|👍|✅)/;

/** The newest plan waiting for a coach (and when it was sent to them). */
export async function pendingPlan(db: SupabaseClient): Promise<Row | null> {
  const { data } = await db.from('bot_workout_plans').select('*').in('status', ['pending', 'building']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Row | null) ?? null;
}

/**
 * A coach wrote in private while a plan waits: "מאשר" writes it into the app,
 * "דחייה" drops it, anything else is a note and the plan is built again.
 */
export async function planCoachTurn(db: SupabaseClient, coachChat: string, text: string, draft: Row) {
  const { data: p } = await db.from('profiles').select('full_name').eq('id', draft.user_id).maybeSingle();
  const name = p?.full_name ?? 'המתאמן';
  const say = (t: string) => sendAndLog(db, coachChat, draft.user_id, t);

  if (draft.status === 'building') return say(`אני עוד בונה את התוכנית של ${name}. עוד דקה היא אצלך.`);
  if (REJECT.test(text)) {
    await db.from('bot_workout_plans').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', draft.id).eq('status', 'pending');
    return say(`בוטל. התוכנית של ${name} לא נכנסה לאפליקציה.`);
  }
  if (APPROVE.test(text)) {
    const r = await approveDraft(db, draft.id, null);
    if (r.error) return say(`לא הצלחתי להכניס את התוכנית של ${name} (${r.error}).`);
    const days = ((draft.plan?.days ?? []) as BuiltDay[]);
    const when = days.some((d) => d.stage !== 'now') ? 'הימים ייפתחו לו עם סרטוני האימונים.' : 'הימים כבר פתוחים לו באפליקציה.';
    const more = await pendingPlan(db);
    return say(`✅ התוכנית של ${name} נכנסה לאפליקציה. ${when}${more ? `\n\nמחכה עוד תוכנית: של ${more.user_id === draft.user_id ? name : 'מתאמן נוסף'}.` : ''}`);
  }
  if (text.trim().length < 3) return say(`התוכנית של ${name} מחכה. "מאשר" כדי להכניס אותה, או כתבו מה לשנות.`);
  await say(`בונה מחדש את התוכנית של ${name} לפי מה שכתבת…`);
  const note = [draft.note, text.trim()].filter(Boolean).join('\n');
  const r = await startBuild(db, draft.user_id, { kind: draft.kind, request: draft.request, note, chatId: draft.chat_id });
  if (r.error) return say(`הבנייה נכשלה (${r.error}). אפשר לנסות שוב מהאדמין.`);
}
