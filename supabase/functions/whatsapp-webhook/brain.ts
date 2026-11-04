// The bot's answer: the client's data from the app, the group's recent messages,
// our closest past answers (bot_examples) and the style guide → Claude → up to
// three short WhatsApp messages.

import Anthropic from 'npm:@anthropic-ai/sdk';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MODEL = 'claude-sonnet-5-5';
const anthropic = Deno.env.get('ANTHROPIC_API_KEY') ? new Anthropic() : null;
export const brainReady = () => !!anthropic;

// Stable instructions (cached); the style guide is appended from bot_settings.
const RULES = `אתה "העוזר הדיגיטלי של חטוב בלי תפריט" — תהליך ליווי לירידה במשקל דרך הרגלים, בלי דיאטה.
אתה משתתף בקבוצת וואטסאפ של לקוח אחד, יחד עם המאמנים (יאיר לוזון וזיגר). אתה כותב בשם הצוות ("אנחנו"), לא מתחזה לאף מאמן.
אם שואלים מי אתה: העוזר הדיגיטלי של חטוב בלי תפריט, שעוזר למאמנים ללוות את הלקוח בין ההודעות שלהם.

איך לכתוב:
- כמו המאמנים: קצר, חם, ישיר, בעברית מדוברת, בגוף שני לפי מין הלקוח (לא בלוכסן).
- עד 3 הודעות קצרות. כל הודעה בשורה/פסקה משלה, ובין הודעות שורה שבה רק ---
- בלי רשימות, בלי כותרות, בלי הדגשות, בלי "כמובן", בלי הרצאות. לכל היותר אימוג'י אחד, ולא בכל הודעה.
- הגב קצר למה שהלקוח כתב, ובדרך כלל המשך בשאלה אחת שמבררת פרטים או עוזרת לו להתקדם.
- השתמש בנתונים מהאפליקציה כשהם רלוונטיים (שלב, הרגלים, שקילות, אימונים, צעדים), במספרים מדויקים. אל תמציא נתונים שלא קיבלת.

גבולות:
- לא עצה רפואית, לא שינוי תרופות או טיפול. כאב, פציעה, מחלה, תרופות: מגיבים באמפתיה ואומרים שתעביר למאמנים.
- לא מבטיחים בשם המאמנים (מחירים, שינויים בתוכנית, פגישות): אומרים שתעביר להם.
- לא תפריטים ולא ספירת קלוריות. אנחנו משנים הרגלים.
- הדוגמאות שתקבל הן תשובות אמיתיות של המאמנים ללקוחות אחרים, בשביל הסגנון בלבד. אסור להזכיר מהן עובדות, אנשים או מקרים.
- לא "משימות השבוע" ולא "המשפט היומי".
- אם אין צורך לענות (למשל הודעה של המאמנים לעצמם, או "👍" שסוגר שיחה), כתוב רק: [שקט]`;

type Row = Record<string, any>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400_000));

/** What the app knows about the client, as short Hebrew lines. */
async function clientContext(db: SupabaseClient, userId: string | null): Promise<string> {
  if (!userId) return 'אין לקוח משויך לקבוצה הזו (קבוצת ניסיון): אין נתונים מהאפליקציה.';
  const [profile, onboarding, weights, steps, habitsLog, acts, checkin, summaries, schedule, walks] = await Promise.all([
    db.from('profiles').select('full_name, gender, start_date, initial_weight, current_weight, target_weight, sleep_time, wake_time').eq('id', userId).maybeSingle(),
    db.from('onboarding_responses').select('answers').eq('user_id', userId).maybeSingle(),
    db.from('weight_log').select('weight, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(6),
    db.from('steps_log').select('date, steps').eq('user_id', userId).gte('date', daysAgo(7)).order('date'),
    db.from('daily_habits_log').select('habit_id, completed_at').eq('user_id', userId).gte('completed_at', daysAgo(7)),
    db.from('activities').select('kind, custom_name, day, duration_min, status').eq('user_id', userId).gte('day', daysAgo(10)).order('day'),
    db.from('weekly_checkin').select('week_number, answers, weight_today').eq('user_id', userId).order('week_number', { ascending: false }).limit(1),
    db.from('daily_summaries').select('summary_date, energy, hunger, proud_of').eq('user_id', userId).order('summary_date', { ascending: false }).limit(3),
    db.from('workout_day_schedule').select('weekday, workout_plan_days(name)').eq('user_id', userId),
    db.from('user_walking_schedule').select('day_of_week, is_active').eq('user_id', userId),
  ]);
  const p = profile.data as Row | null;
  const lines: string[] = [];
  const WD = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  let day: number | null = null;
  if (p) {
    if (p.start_date) day = Math.floor((Date.now() - new Date(`${p.start_date}T00:00:00`).getTime()) / 86400_000) + 1;
    lines.push(`לקוח: ${p.full_name ?? 'לא ידוע'} (${p.gender === 'female' ? 'אישה' : p.gender === 'male' ? 'גבר' : 'מין לא ידוע'}).`);
    if (day != null) lines.push(day >= 1 ? `יום ${day} בתהליך, שבוע ${Math.ceil(day / 7)}.` : `התהליך מתחיל בעוד ${1 - day} ימים.`);
    lines.push(`משקל התחלה ${p.initial_weight ?? '?'}, נוכחי ${p.current_weight ?? '?'}, יעד ${p.target_weight ?? '?'} ק"ג. שינה ${p.sleep_time ?? '?'}–${p.wake_time ?? '?'}.`);
  }

  // This stage's habits and how many of the last 7 days each was ticked.
  if (day != null && day >= 1) {
    const { data: defs } = await db
      .from('habit_definitions')
      .select('id, name, is_bonus, day_start, day_end')
      .lte('day_start', day)
      .or(`day_end.gte.${day},day_end.is.null`)
      .or(`user_id.is.null,user_id.eq.${userId}`);
    const done = new Map<string, number>();
    for (const r of (habitsLog.data ?? []) as Row[]) done.set(r.habit_id, (done.get(r.habit_id) ?? 0) + 1);
    const hs = ((defs ?? []) as Row[]).filter((h) => !h.is_bonus && h.day_end !== 0);
    if (hs.length) lines.push('הרגלים בשלב הנוכחי (סומנו ב-7 הימים האחרונים): ' + hs.map((h) => `${h.name} ${done.get(h.id) ?? 0}/7`).join('; ') + '.');
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
  const sm = (summaries.data ?? []) as Row[];
  if (sm.length) lines.push('סיכומים יומיים אחרונים: ' + sm.map((s) => `${s.summary_date}: אנרגיה ${s.energy ?? '?'}, רעב ${s.hunger ?? '?'}${s.proud_of ? `, גאה ב: ${s.proud_of}` : ''}`).join(' | ') + '.');
  const ob = (onboarding.data as Row | null)?.answers;
  if (ob) {
    const pick = ['occupation', 'sleep_hours', 'big_meals', 'small_meals', 'walks', 'trains', 'training_types', 'goal', 'max_pullups', 'max_pushups', 'max_squats', 'injuries', 'injuries_other', 'preferred_location'];
    const bits = pick.filter((k) => ob[k] != null && ob[k] !== '').map((k) => `${k}=${Array.isArray(ob[k]) ? ob[k].join('/') : ob[k]}`);
    if (bits.length) lines.push('שאלון פתיחה: ' + bits.join(', ') + '.');
  }
  return lines.join('\n') || 'אין נתונים מהאפליקציה.';
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

/**
 * The bot's reply to the latest client message(s), as separate WhatsApp messages,
 * or [] when it should stay quiet.
 */
export async function composeReply(
  db: SupabaseClient,
  chatId: string,
  userId: string | null,
  latest: string,
  /** Test group: whoever writes plays the client, coaches included. */
  everyoneIsClient = false,
): Promise<string[]> {
  if (!anthropic) return [];
  const [guideRow, examples, ctx, chat] = await Promise.all([
    db.from('bot_settings').select('value').eq('key', 'style_guide').maybeSingle(),
    db.rpc('match_bot_examples', { q: latest, k: 12 }),
    clientContext(db, userId),
    recentChat(db, chatId, everyoneIsClient),
  ]);
  const guide = (guideRow.data?.value as string | undefined) ?? '';
  const ex = ((examples.data ?? []) as Row[])
    .map((e, i) => `דוגמה ${i + 1}:${e.context ? `\n(לפני כן המאמן כתב: ${e.context})` : ''}\nלקוח: ${e.client}\nמאמן: ${e.coach}`)
    .join('\n\n');
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: `${RULES}\n\n# תדריך הסגנון של המאמנים\n${guide}`, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content:
          `# עכשיו\n${now}\n\n# נתוני הלקוח מהאפליקציה\n${ctx}\n\n` +
          `# תשובות אמיתיות של המאמנים במצבים דומים (סגנון בלבד)\n${ex}\n\n` +
          `# השיחה בקבוצה (האחרונה בסוף)\n${chat}\n\n` +
          `כתוב את התשובה שלך להודעות האחרונות של הלקוח. רק את הטקסט שיישלח, בלי הסברים.`,
      },
    ],
  } as any);

  const r = response as any;
  console.log(JSON.stringify({ bot: 'usage', model: r.model, stop: r.stop_reason, usage: r.usage }));
  if (r.stop_reason === 'refusal') return [];
  const text = ((r.content ?? []) as Row[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text || text.includes('[שקט]')) return [];
  return text.split(/\n\s*---\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}
