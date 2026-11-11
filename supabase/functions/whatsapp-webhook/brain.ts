// The bot's answer. Its prompt:
//   system: the rules + the coaches' style guide (both in bot_settings, cached)
//   message: now · the client's app data · what we know about the client ·
//            from our program (closest chunks the client has reached) ·
//            our closest past answers · the group's last messages
// → Claude → up to two short WhatsApp messages, and whether to hand off to us.

import Anthropic from 'npm:@anthropic-ai/sdk';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { claudeUsage, costOf, embed, logUsage, setting, vectorLiteral } from '../_shared/botkit.ts';
import { REVIEW_END_TAG, REVIEW_START_TAG, reviewSection } from './workouts.ts';

// Chosen after the model test (Haiku 5.5 vs Sonnet 5.5).
export const MODEL = 'claude-sonnet-5-5';
const anthropic = Deno.env.get('ANTHROPIC_API_KEY') ? new Anthropic() : null;
export const brainReady = () => !!anthropic;

/** Used only if bot_settings has no "rules" (they're edited in the dashboard). */
const FALLBACK_RULES = `אתה "העוזר הדיגיטלי של חטוב בלי תפריט". אתה כותב בשם הצוות ("אנחנו"), קצר וחם, עד 2 הודעות קצרות מופרדות בשורה ---. לא עצה רפואית; כאב, פציעה, מחלה, הריון, אכילה לא בריאה, רצון לעזוב או תלונה: אומרים שתעביר למאמנים ומסמנים [העבר]. אם אין צורך לענות, כתוב רק: [שקט]`;

/**
 * When the client is stuck (an obstacle, "I don't know"): offer concrete solutions and ask
 * if they'd work, instead of asking him for the solution or only empathizing. Always in the prompt.
 */
const OBSTACLES = `# כשהלקוח נתקע במכשול (גובר על הסגנון אם יש סתירה)
כשהלקוח מספר על מכשול (יום עמוס, ישיבות, אירוע, עבודה, עייפות, "לא הספקתי") או עונה "לא יודע":
- לא שואלים אותו "מה יכול לעזור לך?" או "מה גרם לזה?": הוא לא יודע, בגלל זה הוא כאן. אנחנו המאמנים: אנחנו מביאים את הפתרון.
- ככה המאמנים עושים את זה (זה הסגנון):
  1. אם חסר פרט כדי לתת פתרון שמתאים לו: שאלה אחת קצרה וממוקדת על המצב, לא על הרגשות. "בימים כאלה בשטח יש לך אפשרות לקחת חלבון מאיפשהו?", "הבורקסים מאיפה? מהבית?" לא יותר משאלה אחת או שתיים כאלה.
  2. פתרון אחד, קונקרטי, שבנוי על מה שהוא סיפר, בתור שאלה: "ואם תביא בימים כאלה קופסה קטנה עם כמה דברים מהבית, זה אפשרי?"
  3. משפט קצר למה: "שלא תסיים יום כזה בלי לאכול בכלל, ויהיה יותר מסודר."
  דוגמה אמיתית: הלקוח: "יום זוועה, ישיבות ונסיעות, לא אכלתי מסודר. מה שהצלחתי זה מספר בורקסים". המאמן: "בורקסים מאיפה? מהבית?" → "לא, היה בישיבה" → "הבנתי אותך. ואם תביא בימים כאלה קופסה קטנה עם כמה דברים מהבית, זה אפשרי? שלא תסיים יום כזה בלי לאכול בכלל, ויהיה יותר מסודר."
- אם כבר ברור מה המצב: ישר לפתרון, בלי שאלת הבהרה.
- אם הוא אומר "לא" לפתרון, או "לא יודע": שואלים בקצרה מה לא מתאים בו, ומציעים פתרון אחר שעוקף את זה. לא מוותרים, ולא עונים "מבינים" ונעצרים.
- "מבינים", "קורה", "יש ימים כאלה": לכל היותר פעם אחת בשיחה, ורק אם זה באמת מוסיף. אם כבר נאמר, לא חוזרים עליו: ישר לפתרון.
- לא רק תומכים ומרגיעים: מותר, ולפעמים צריך, להגיד לו את האמת ישר, בקצרה ובלי להעליב. למשל: "תכלס, יום עם ישיבות הוא בדיוק היום שבו צריך לתכנן מראש, אחרת זה יחזור כל שבוע." ואז ישר לפתרון.
- מסיימים בשאלה שמזיזה אותו לפעולה (כן / לא, או בחירה), לא בשאלה פתוחה וכללית.`;

export const HANDOFF_TAG = '[העבר]';
/** The client asked for more / other workouts: the workout bot builds them (planBuilder.ts). */
export const PLAN_REQUEST_TAG = '[בקשת_אימון]';

type Row = Record<string, any>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400_000));
const WD = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** The client's day in the program (day 1 = start date), or null. */
async function programDay(db: SupabaseClient, userId: string | null): Promise<number | null> {
  if (!userId) return null;
  const { data } = await db.from('profiles').select('start_date').eq('id', userId).maybeSingle();
  if (!data?.start_date) return null;
  return Math.floor((Date.now() - new Date(`${data.start_date}T00:00:00`).getTime()) / 86400_000) + 1;
}

/** What the app knows about the client, as short Hebrew lines. */
async function clientContext(db: SupabaseClient, userId: string | null, day: number | null): Promise<string> {
  if (!userId) return 'אין לקוח משויך לקבוצה הזו (קבוצת ניסיון): אין נתונים מהאפליקציה.';
  const [profile, onboarding, weights, steps, acts, checkin, schedule, walks] = await Promise.all([
    db.from('profiles').select('full_name, gender, initial_weight, current_weight, target_weight, sleep_time, wake_time').eq('id', userId).maybeSingle(),
    db.from('onboarding_responses').select('answers').eq('user_id', userId).maybeSingle(),
    db.from('weight_log').select('weight, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(6),
    db.from('steps_log').select('date, steps').eq('user_id', userId).gte('date', daysAgo(7)).order('date'),
    db.from('activities').select('kind, custom_name, day, duration_min, status').eq('user_id', userId).gte('day', daysAgo(10)).order('day'),
    db.from('weekly_checkin').select('week_number, answers').eq('user_id', userId).order('week_number', { ascending: false }).limit(1),
    db.from('workout_day_schedule').select('weekday, workout_plan_days(name)').eq('user_id', userId),
    db.from('user_walking_schedule').select('day_of_week, is_active').eq('user_id', userId),
  ]);
  const p = profile.data as Row | null;
  const lines: string[] = [];
  if (p) {
    lines.push(`לקוח: ${p.full_name ?? 'לא ידוע'} (${p.gender === 'female' ? 'אישה' : p.gender === 'male' ? 'גבר' : 'מין לא ידוע'}).`);
    if (day != null) lines.push(day >= 1
      ? `יום ${day} בתהליך, שבוע ${Math.ceil(day / 7)}.`
      : `התהליך עוד לא התחיל: מתחיל בעוד ${1 - day} ימים (ביום שבת). אין לו עדיין הרגלים, סרטונים או משימות, והתוכן באפליקציה נעול עד אז. אל תיתן לו משימות ואל תדבר על הרגלים או תוכן מהתוכנית; אפשר לענות על שאלות, להרגיע ולהגיד שמתחילים בשבת.`);
    lines.push(`משקל התחלה ${p.initial_weight ?? '?'}, נוכחי ${p.current_weight ?? '?'}, יעד ${p.target_weight ?? '?'} ק"ג. שינה ${p.sleep_time ?? '?'}–${p.wake_time ?? '?'}.`);
  }
  // This stage's habits (what the client works on now).
  if (day != null && day >= 1) {
    const { data: defs } = await db
      .from('habit_definitions')
      .select('name, is_bonus, day_end')
      .lte('day_start', day)
      .or(`day_end.gte.${day},day_end.is.null`)
      .or(`user_id.is.null,user_id.eq.${userId}`);
    const hs = ((defs ?? []) as Row[]).filter((h) => h.day_end !== 0);
    if (hs.length) lines.push('ההרגלים בשלב הנוכחי: ' + hs.map((h) => h.name + (h.is_bonus ? ' (בונוס)' : '')).join('; ') + '.');
  }
  const ws = (weights.data ?? []) as Row[];
  if (ws.length) lines.push('שקילות אחרונות: ' + ws.map((w) => `${w.recorded_at} ${w.weight}`).join(', ') + '.');
  const st = (steps.data ?? []) as Row[];
  if (st.length) lines.push('צעדים (7 ימים): ' + st.map((s) => `${s.date.slice(5)} ${s.steps}`).join(', ') + '.');
  const ac = ((acts.data ?? []) as Row[]).filter((a) => a.status === 'done');
  if (ac.length) lines.push('פעילויות שבוצעו (10 ימים): ' + ac.map((a) => `${a.day.slice(5)} ${a.custom_name ?? a.kind}${a.duration_min ? ` ${a.duration_min} דק'` : ''}`).join(', ') + '.');
  const sch = (schedule.data ?? []) as Row[];
  const wk = ((walks.data ?? []) as Row[]).filter((w) => w.is_active && w.day_of_week != null);
  if (sch.length || wk.length) {
    lines.push('לו"ז קבוע: ' + [
      ...sch.map((s) => `אימון "${s.workout_plan_days?.name ?? ''}" ביום ${WD[s.weekday]}`),
      ...wk.map((w) => `הליכה ביום ${WD[w.day_of_week]}`),
    ].join(', ') + '.');
  }
  const ci = (checkin.data ?? [])[0] as Row | undefined;
  if (ci?.answers?.items) lines.push(`שאלון שבועי אחרון (שבוע ${ci.week_number}): ` + (ci.answers.items as Row[]).map((i) => `${i.question} → ${i.answer}`).join('; ') + '.');
  const ob = (onboarding.data as Row | null)?.answers;
  if (ob) {
    const pick = ['occupation', 'sleep_hours', 'big_meals', 'small_meals', 'walks', 'trains', 'training_types', 'goal', 'max_pullups', 'max_pushups', 'max_squats', 'injuries', 'injuries_other', 'preferred_location'];
    const bits = pick.filter((k) => ob[k] != null && ob[k] !== '').map((k) => `${k}=${Array.isArray(ob[k]) ? ob[k].join('/') : ob[k]}`);
    if (bits.length) lines.push('שאלון פתיחה: ' + bits.join(', ') + '.');
  }
  return lines.join('\n') || 'אין נתונים מהאפליקציה.';
}

/** The program's chunks closest to the question, from what the client has reached. */
async function fromProgram(db: SupabaseClient, question: string, day: number | null): Promise<string> {
  // Before the start date nothing of the program is open to the client yet.
  if (day != null && day < 1) return '';
  const v = await embed(db, [question]);
  if (!v) return '';
  const { data, error } = await db.rpc('match_bot_knowledge', { q: vectorLiteral(v[0]), max_day: Math.max(1, day ?? 1), k: 4 });
  if (error) console.error('[bot] knowledge search failed', error.message);
  const kinds: Record<string, string> = { video: 'סרטון', guide: 'מדריך', stage: 'שלב', shopping: 'רשימת הקניות' };
  return ((data ?? []) as Row[]).map((c) => `[${kinds[c.source] ?? c.source}: ${c.title}]\n${c.text}`).join('\n\n');
}

/** The group's last messages, oldest first. */
async function recentChat(db: SupabaseClient, chatId: string, everyoneIsClient: boolean): Promise<string> {
  const { data } = await db
    .from('whatsapp_messages')
    .select('sender, sender_name, text, type, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(40);
  const label = { client: 'לקוח', coach: 'מאמן', bot: 'אתה (העוזר)' } as Record<string, string>;
  return ((data ?? []) as Row[])
    .reverse()
    .map((m) => {
      const t = new Date(m.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit' });
      const who = everyoneIsClient && m.sender !== 'bot' ? 'client' : m.sender;
      return `[${t}] ${label[who] ?? who}${who === 'coach' && m.sender_name ? ` (${m.sender_name})` : ''}: ${m.type === 'image' ? '[תמונה] ' : ''}${m.text ?? ''}`;
    })
    .join('\n');
}

export interface Reply {
  /** The messages to send (the hand-off tag already removed); empty = stay quiet. */
  parts: string[];
  /** The bot marked [העבר]: we get an alert in private. */
  handoff: boolean;
  /** A workout review the bot opened ([בחינת_אימון]) or finished asking about ([סיום_בחינה]). */
  review?: 'start' | 'finish' | null;
  /** The client asked for more / other workouts ([בקשת_אימון]). */
  planRequest?: boolean;
}

export interface PromptParts {
  system: string;
  user: string;
}

/** Everything the model gets for one answer (also used by the model test). */
export async function buildPrompt(
  db: SupabaseClient,
  chatId: string,
  userId: string | null,
  latest: string,
  everyoneIsClient = false,
  /** The model test passes the conversation as it was, instead of the live one. */
  chatOverride?: string,
  /** The model test's client: their data as text, and their day (instead of a real client). */
  testClient?: { ctx: string; day: number },
  /** A message the bot starts itself (check-in, after a workout, Friday): what to write, instead of a reply. */
  task?: string,
  /** Extra data for that message (e.g. the week's numbers on Friday). */
  extra?: string,
): Promise<PromptParts> {
  const day = testClient ? testClient.day : await programDay(db, userId);
  const [rules, guide, examples, ctx, program, profileRow, chat, review] = await Promise.all([
    setting<string>(db, 'rules'),
    setting<string>(db, 'style_guide'),
    db.rpc('match_bot_examples', { q: latest, k: 12 }),
    testClient ? Promise.resolve(testClient.ctx) : clientContext(db, userId, day),
    fromProgram(db, latest, day),
    userId ? db.from('client_profiles').select('profile').eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    chatOverride != null ? Promise.resolve(chatOverride) : recentChat(db, chatId, everyoneIsClient),
    // A workout review (asking the client about their workouts); not in the model test.
    testClient || day == null || day < 1 ? Promise.resolve('') : reviewSection(db, userId, chatId),
  ]);
  const ex = ((examples.data ?? []) as Row[])
    .map((e, i) => `דוגמה ${i + 1}:${e.context ? `\n(לפני כן המאמן כתב: ${e.context})` : ''}\nלקוח: ${e.client}\nמאמן: ${e.coach}`)
    .join('\n\n');
  const known = ((profileRow as { data: Row | null }).data?.profile as string | undefined)?.trim();
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

  return {
    system: `${rules?.trim() || FALLBACK_RULES}\n\n# תדריך הסגנון של המאמנים\n${guide ?? ''}\n\n${OBSTACLES}`,
    user:
      `# עכשיו\n${now}\n\n# נתוני הלקוח מהאפליקציה\n${ctx}\n\n` +
      (known ? `# מה שאנחנו יודעים על הלקוח\n${known}\n\n` : '') +
      (program ? `# מהתוכנית שלנו\n${program}\n\n` : '') +
      (review ? `${review}\n\n` : '') +
      `# תשובות אמיתיות של המאמנים במצבים דומים (סגנון בלבד)\n${ex}\n\n` +
      (extra ? `# נתונים להודעה הזו\n${extra}\n\n` : '') +
      `# השיחה בקבוצה (האחרונה בסוף)\n${chat || '(אין עדיין הודעות)'}\n\n` +
      (task
        ? `# ההודעה שאתה יוזם עכשיו\n${task}\nרק את הטקסט שיישלח, בלי הסברים. אם אין טעם לשלוח עכשיו, כתוב רק: [שקט]`
        : `כתוב את התשובה שלך להודעות האחרונות של הלקוח. רק את הטקסט שיישלח, בלי הסברים.`),
  };
}

/** One model call on a prompt: the raw text and its cost (logged). */
export async function runModel(
  db: SupabaseClient,
  prompt: PromptParts,
  opts: { model?: string; kind?: 'reply' | 'eval' | 'review'; chatId?: string | null; userId?: string | null } = {},
): Promise<{ text: string; refused: boolean; cost: number; model: string }> {
  // The live model is bot_settings.model (switched without a deploy), else MODEL.
  const model = opts.model ?? (await setting<string>(db, 'model')) ?? MODEL;
  if (model.startsWith('gpt-')) return { ...(await runOpenAI(db, prompt, model, opts)), model };
  if (!anthropic) return { text: '', refused: false, cost: 0, model };
  const request = {
    model,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt.user }],
  };
  // Sonnet: if its safeguards decline, the request is rerun on a fallback model in the same call.
  const r = (model.startsWith('claude-sonnet-5-5')
    ? await anthropic.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any)
    : await anthropic.messages.create(request as any)) as Row;
  const u = claudeUsage(r);
  await logUsage(db, { kind: opts.kind ?? 'reply', model, chatId: opts.chatId, userId: opts.userId, ...u });
  const text = ((r.content ?? []) as Row[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text, refused: r.stop_reason === 'refusal', cost: costOf({ kind: 'reply', model, ...u }), model };
}

/** How many messages an answer may be: Terra writes 2–3 short ones (its own rules), Claude up to 2. */
export const maxParts = (model: string) => (model.startsWith('gpt-') ? 3 : 2);

/**
 * An OpenAI model (for the model test only), the same prompt: the system part as
 * instructions, the message as input. Responses API, low reasoning effort.
 */
async function runOpenAI(
  db: SupabaseClient,
  prompt: PromptParts,
  model: string,
  opts: { kind?: 'reply' | 'eval' | 'review'; chatId?: string | null; userId?: string | null },
): Promise<{ text: string; refused: boolean; cost: number }> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return { text: '', refused: false, cost: 0 };
  // The same prompt, plus the rules written for OpenAI models (bot_settings.rules_openai).
  const extra = await setting<string>(db, 'rules_openai');
  const instructions = extra ? `${prompt.system}\n\n# תוספת לכללים (גוברת על מה שלמעלה)\n${extra}` : prompt.system;
  const call = (withEffort: boolean) =>
    fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions,
        input: prompt.user,
        max_output_tokens: 4000,
        ...(withEffort ? { reasoning: { effort: 'low' } } : {}),
      }),
    });
  let res = await call(true);
  // A model without the reasoning setting: the same request without it.
  if (res.status === 400) res = await call(false);
  if (!res.ok) {
    console.error('[brain] openai', res.status, await res.text());
    return { text: '', refused: false, cost: 0 };
  }
  const r = (await res.json()) as Row;
  const content = ((r.output ?? []) as Row[]).filter((o) => o.type === 'message').flatMap((o) => (o.content ?? []) as Row[]);
  const text = content.filter((c) => c.type === 'output_text').map((c) => c.text).join('\n').trim();
  const cached = r.usage?.input_tokens_details?.cached_tokens ?? 0;
  const u = { input: (r.usage?.input_tokens ?? 0) - cached, output: r.usage?.output_tokens ?? 0, cacheRead: cached, cacheWrite: 0 };
  await logUsage(db, { kind: opts.kind ?? 'reply', model, chatId: opts.chatId, userId: opts.userId, ...u });
  return { text, refused: content.some((c) => c.type === 'refusal'), cost: costOf({ kind: 'reply', model, ...u }) };
}

/** Splits the model's text into messages; [שקט] → none; [העבר] noted and removed. */
export function toReply(text: string, max = 2): Reply {
  if (!text || text.includes('[שקט]')) return { parts: [], handoff: false };
  const handoff = text.includes(HANDOFF_TAG);
  const review = text.includes(REVIEW_END_TAG) ? 'finish' : text.includes(REVIEW_START_TAG) ? 'start' : null;
  const planRequest = text.includes(PLAN_REQUEST_TAG);
  const clean = [HANDOFF_TAG, REVIEW_START_TAG, REVIEW_END_TAG, PLAN_REQUEST_TAG].reduce((t, tag) => t.split(tag).join(''), text).trim();
  const all = clean.split(/\n\s*---\s*\n/).map((s) => s.trim()).filter(Boolean);
  // At most `max` messages: anything after the last joins it, so nothing is lost.
  const parts = all.length > max ? [...all.slice(0, max - 1), all.slice(max - 1).join('\n')] : all;
  return { parts, handoff, review, planRequest };
}

/** The bot's reply to the latest client message(s). */
export async function composeReply(
  db: SupabaseClient,
  chatId: string,
  userId: string | null,
  latest: string,
  /** Test group: whoever writes plays the client, coaches included. */
  everyoneIsClient = false,
): Promise<Reply> {
  const prompt = await buildPrompt(db, chatId, userId, latest, everyoneIsClient);
  // A refusal that the fallback didn't rescue is just silence.
  const { text, refused, model } = await runModel(db, prompt, { chatId, userId });
  if (refused) return { parts: [], handoff: false };
  return toReply(text, maxParts(model));
}
