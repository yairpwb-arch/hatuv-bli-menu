// The bot learns from the coaches. Two ways in:
//   1. A coach writes the bot in private how it should answer ("אל תענה ככה", "מעכשיו…").
//   2. A coach writes in a group right after the bot (correcting it, or adding what it missed).
// Each becomes a lesson (bot_lessons): a short general rule that brain.ts puts into every
// answer, until a coach writes "בטל" or switches it off in the admin.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { runModel } from './brain.ts';
import { TEST_GROUP_ID, alertPhones, sendAndLog, sleep } from '../_shared/wa.ts';

type Row = Record<string, any>;

/** At most this many lessons go into an answer (the newest). */
const MAX_LESSONS = 40;
/** A coach message this soon after the bot's is read as a reaction to it. */
const AFTER_BOT_MS = 30 * 60_000;
/** The coach may write a few messages: they're read together, this long after the first. */
const GATHER_MS = 60_000;

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

/** The lessons, as a prompt section ('' when none). */
export async function lessonsSection(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('bot_lessons').select('lesson').eq('active', true).order('created_at', { ascending: false }).limit(MAX_LESSONS);
  const list = ((data ?? []) as Row[]).map((l) => l.lesson as string).reverse();
  if (!list.length) return '';
  return `# לקחים מהמאמנים (גוברים על הכללים ועל תדריך הסגנון אם יש סתירה)\nהמאמנים תיקנו אותך בעבר. ככה הם רוצים שתענה:\n${list.map((l) => `- ${l}`).join('\n')}`;
}

const chatLines = (rows: Row[], me: string) =>
  rows.map((m) => `${m.sender === 'bot' ? me : m.sender === 'coach' ? 'מאמן' : 'מתאמן'}: ${m.type === 'image' ? '[תמונה] ' : ''}${m.text ?? ''}`).join('\n');

const PRIVATE_SYSTEM = `אתה הבוט של "חטוב בלי תפריט", שעונה למתאמנים בקבוצות וואטסאפ. מאמן מהצוות כתב לך עכשיו בפרטי.
תחליט: האם ההודעה שלו היא הנחיה כללית לגבי איך לענות למתאמנים בקבוצות (סגנון, תוכן, מה לעשות או לא לעשות, תיקון של תשובה שנתת)? למשל: "אל תענה ככה", "מעכשיו כשמישהו שולח תמונה של אוכל תתייחס לחלבון", "אל תשתמש בסמיילי הזה", "תכתוב יותר קצר".
לא הנחיה כללית: שאלה, בקשה לבדוק אימון של מתאמן, אישור או תיקון של הצעה לתוכנית אימונים, "מי בתור", שיחה רגילה.
אם זו הנחיה: נסח אותה ככלל קצר וברור (משפט או שניים), כללי, שיתאים גם למתאמנים אחרים ולמצבים דומים. אם הוא מתקן תשובה ספציפית שלך מהקבוצה, הבן מהשיחה בקבוצה מה הייתה הבעיה ונסח את הכלל שמונע אותה.
החזר JSON בלבד: {"lesson": "הכלל" או null, "reply": "תשובה קצרה למאמן בעברית, שמאשרת מה הבנת ושמעכשיו תענה ככה"}`;

/**
 * A coach wrote the bot in private: if it's a lesson, it's kept and answered (true);
 * otherwise false, and the private chat goes on as before (workout reviews, plans).
 */
export async function privateLesson(db: SupabaseClient, coachChat: string, coachPhone: string, text: string): Promise<boolean> {
  // "בטל" right after the bot told him about a lesson: that lesson is switched off.
  if (/^\s*(בטל|תבטל|לבטל)\s*[.!]?\s*$/.test(text)) {
    const { data: told } = await db.from('whatsapp_messages').select('text').eq('chat_id', coachChat).eq('sender', 'bot')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!String(told?.text ?? '').includes('כדי לבטל, כתוב')) return false;
    const { data: last } = await db.from('bot_lessons').select('id, lesson').eq('active', true)
      .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!last) return false;
    await db.from('bot_lessons').update({ active: false }).eq('id', last.id);
    await sendAndLog(db, coachChat, null, `ביטלתי: "${last.lesson}"`);
    return true;
  }
  const [{ data: group }, { data: dm }] = await Promise.all([
    TEST_GROUP_ID
      ? db.from('whatsapp_messages').select('sender, text, type').eq('chat_id', TEST_GROUP_ID).order('created_at', { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
    db.from('whatsapp_messages').select('sender, text, type').eq('chat_id', coachChat).order('created_at', { ascending: false }).limit(7),
  ]);
  const prompt = {
    system: PRIVATE_SYSTEM,
    user:
      `# השיחה האחרונה בקבוצה (האחרונה בסוף)\n${chatLines(((group ?? []) as Row[]).reverse(), 'אתה')}\n\n` +
      `# השיחה בפרטי עם המאמן (האחרונה בסוף; ההודעה החדשה שלו היא האחרונה)\n${chatLines(((dm ?? []) as Row[]).reverse(), 'אתה')}`,
  };
  const { text: out } = await runModel(db, prompt, { chatId: coachChat, kind: 'review' });
  const r = json(out);
  const lesson = typeof r?.lesson === 'string' ? r.lesson.trim() : '';
  if (!lesson) return false;
  await db.from('bot_lessons').insert({ lesson, source: 'private', coach_phone: coachPhone });
  await sendAndLog(db, coachChat, null, `${String(r?.reply ?? '').trim() || 'הבנתי, מעכשיו אענה ככה.'}\n\nרשמתי כלל: "${lesson}"\n(כדי לבטל, כתוב "בטל")`);
  console.log(`[lessons] private from ${coachPhone}: ${lesson}`);
  return true;
}

const GROUP_SYSTEM = `אתה בודק את הבוט של "חטוב בלי תפריט", שעונה למתאמנים בקבוצות וואטסאפ בשם הצוות. מיד אחרי הודעה של הבוט, מאמן אמיתי כתב בקבוצה.
תחליט: האם מה שהמאמן כתב מראה שהבוט טעה או פספס משהו? למשל: המאמן תיקן מידע, ענה על משהו שהבוט התעלם ממנו, ניסח אחרת כי התשובה של הבוט הייתה רובוטית / לא מדויקת / לא בסגנון, או הוסיף דבר חשוב שהבוט היה צריך לומר.
לא לקח: המאמן פשוט המשיך את השיחה, הוסיף מילה חמה, או דיבר על נושא חדש שלא קשור לתשובה של הבוט.
אם יש לקח: נסח כלל קצר וכללי (משפט או שניים) שיגרום לבוט לענות כמו המאמן בפעם הבאה, גם עם מתאמנים אחרים. לא שמות, לא פרטים אישיים של המתאמן.
החזר JSON בלבד: {"lesson": "הכלל" או null}`;

/**
 * A coach wrote in a group: if it's right after the bot, the bot may have missed something.
 * Waits a minute (the coach may write more), then a lesson, if there is one, is kept,
 * and the coaches hear about it in private (they can write "בטל").
 */
export async function learnFromGroup(db: SupabaseClient, chatId: string, coachPhone: string, at: string) {
  const { data: lastBot } = await db.from('whatsapp_messages').select('created_at').eq('chat_id', chatId).eq('sender', 'bot')
    .lt('created_at', at).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!lastBot || new Date(at).getTime() - new Date(lastBot.created_at).getTime() > AFTER_BOT_MS) return;
  // Only the coach's first message after the bot starts this (the next ones are read with it).
  const { data: before } = await db.from('whatsapp_messages').select('id').eq('chat_id', chatId).eq('sender', 'coach')
    .gt('created_at', lastBot.created_at).lt('created_at', at).limit(1);
  if ((before ?? []).length) return;
  await sleep(GATHER_MS);

  const { data: rows } = await db.from('whatsapp_messages').select('sender, text, type, created_at').eq('chat_id', chatId)
    .order('created_at', { ascending: false }).limit(30);
  const all = ((rows ?? []) as Row[]).reverse();
  const coachSaid = all.filter((m) => m.sender === 'coach' && m.created_at >= at).map((m) => m.text ?? '').join('\n').trim();
  if (!coachSaid) return;
  const prompt = {
    system: GROUP_SYSTEM,
    user: `# השיחה בקבוצה (האחרונה בסוף)\n${chatLines(all, 'הבוט')}\n\n# מה שהמאמן כתב אחרי הבוט\n${coachSaid}`,
  };
  const { text: out } = await runModel(db, prompt, { chatId, kind: 'review' });
  const lesson = String(json(out)?.lesson ?? '').trim();
  if (!lesson || lesson === 'null') return;
  const botLine = [...all].reverse().find((m) => m.sender === 'bot')?.text ?? null;
  const clientLine = [...all].reverse().find((m) => m.sender === 'client' && m.created_at < lastBot.created_at)?.text ?? null;
  await db.from('bot_lessons').insert({
    lesson, source: 'group', coach_phone: coachPhone, chat_id: chatId,
    example: { client: clientLine, bot: botLine, coach: coachSaid },
  });
  console.log(`[lessons] group ${chatId} from ${coachPhone}: ${lesson}`);
  // The coach who corrected it hears what was learned (and can cancel it).
  const to = (await alertPhones(db, chatId)).includes(coachPhone) ? coachPhone : (await alertPhones(db, chatId))[0];
  if (to) await sendAndLog(db, `${to}@c.us`, null, `למדתי מהתיקון שלך בקבוצה:\n"${lesson}"\nמעכשיו אענה ככה. כדי לבטל, כתוב לי "בטל".`);
}
