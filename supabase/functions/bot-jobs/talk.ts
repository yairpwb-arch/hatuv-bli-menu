// What the bot says by itself, for bot-jobs:
//   replies():   a new conversation, 5 minutes after the client wrote (if none of us answered);
//   proactive(): the check-in, after a workout or walk, Friday feedback, Shabbat shalom.
// Only groups with the bot on and in the allowed list (for now: the test group only).
//
// Rules for every message the bot starts:
//   - at most 2 a day per client (a conversation the client opened doesn't count);
//   - not in the client's sleep hours, and not from candle lighting to havdalah
//     (Shabbat and holidays, Jerusalem times from Hebcal; a holiday eve is like Friday);
//   - not if one of us wrote in the group in the last 6 hours.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { buildPrompt, composeReply, maxParts, runModel, toReply } from '../whatsapp-webhook/brain.ts';
import { TEST_GROUP_ID, alertHandoff, deliver, readChat, sendTyping } from '../_shared/wa.ts';
import { REVIEW_OPEN_TASK, afterReply, openReview, reviewDue, reviewTimeouts, startReview } from '../whatsapp-webhook/workouts.ts';
import { requestFromGroup } from '../whatsapp-webhook/planBuilder.ts';
import { setTodayTimes } from '../whatsapp-webhook/schedule.ts';
import { latestStage, markLatestWatched } from '../whatsapp-webhook/content.ts';

type Row = Record<string, any>;
const MIN = 60_000;
const HOUR = 60 * MIN;
/** A job runs every 15 minutes; a moment is caught within this. */
const WINDOW = 20 * MIN;
const MAX_A_DAY = 2;

// ── Israel time ───────────────────────────────────────────────────────────────

function israel(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) % 24 * 60 + Number(p.minute), weekday };
}

/** UTC instant of an Israel-time clock reading today. */
function todayAt(hhmm: string, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const il = israel(now);
  return new Date(now.getTime() + ((h * 60 + m) - il.minutes) * MIN - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds()));
}

/** Midnight in Israel, today, as a UTC instant. */
const israelMidnight = (now = new Date()) => new Date(now.getTime() - israel(now).minutes * MIN - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds()));

// ── Shabbat and holidays (Hebcal, Jerusalem) ──────────────────────────────────

interface Holy { candles: Date[]; havdalah: Date[] }
let holyCache: { at: number; value: Holy } | null = null;
async function holyTimes(): Promise<Holy> {
  if (holyCache && Date.now() - holyCache.at < 6 * HOUR) return holyCache.value;
  const day = (off: number) => new Date(Date.now() + off * 86400_000).toISOString().slice(0, 10);
  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&c=on&M=on&geonameid=281184&start=${day(-3)}&end=${day(4)}`;
  const res = await fetch(url).catch(() => null);
  const items = res?.ok ? (((await res.json()) as { items?: Row[] }).items ?? []) : [];
  const value = {
    candles: items.filter((i) => i.category === 'candles').map((i) => new Date(i.date)).sort((a, b) => +a - +b),
    havdalah: items.filter((i) => i.category === 'havdalah').map((i) => new Date(i.date)).sort((a, b) => +a - +b),
  };
  if (!value.candles.length) console.error('[bot-jobs] no Hebcal times');
  holyCache = { at: Date.now(), value };
  return value;
}

/** From candle lighting to havdalah. */
function inHolyTime(h: Holy, now = new Date()) {
  const lit = [...h.candles].reverse().find((c) => c <= now);
  if (!lit) return false;
  const out = h.havdalah.find((x) => x > lit);
  return !!out && now < out;
}

// ── Shared checks ─────────────────────────────────────────────────────────────

const toMin = (t: string | null | undefined, fallback: string) => {
  const [h, m] = String(t || fallback).split(':').map(Number);
  return h * 60 + (m || 0);
};
/** Inside the client's sleep hours (bedtime → wake time, over midnight). */
function asleep(profile: Row, now = new Date()) {
  const m = israel(now).minutes;
  const bed = toMin(profile.sleep_time, '23:00');
  const wake = toMin(profile.wake_time, '07:00');
  return bed > wake ? m >= bed || m < wake : m >= bed && m < wake;
}

/** The groups the bot may talk in by itself: on, with a client, and (for now) only the test group. */
async function talkingGroups(db: SupabaseClient) {
  const { data } = await db.from('whatsapp_groups').select('chat_id, user_id, bot_enabled').eq('bot_enabled', true).not('user_id', 'is', null);
  return ((data ?? []) as Row[]).filter((g) => g.chat_id === TEST_GROUP_ID);
}

// ── A new conversation, 5 minutes later ───────────────────────────────────────

export async function replies(db: SupabaseClient) {
  const { data: due } = await db.from('bot_pending_replies').select('*').lte('due_at', new Date().toISOString());
  let answered = 0;
  for (const p of (due ?? []) as Row[]) {
    // Taken by this run (another run that got here first leaves nothing to delete).
    const { data: mine } = await db.from('bot_pending_replies').delete().eq('chat_id', p.chat_id).eq('due_at', p.due_at).select('chat_id');
    if (!mine?.length) continue;
    if (p.chat_id !== TEST_GROUP_ID) continue; // real groups: never
    const { data: since } = await db.from('whatsapp_messages').select('sender, text, created_at').eq('chat_id', p.chat_id).gte('created_at', p.first_at).order('created_at');
    const msgs = (since ?? []) as Row[];
    // One of us answered meanwhile (or the bot already did): quiet.
    if (msgs.some((m) => m.sender === 'coach' || m.sender === 'bot')) continue;
    let latest = [...msgs].reverse().find((m) => m.sender === 'client' && m.text)?.text;
    if (!latest) continue;
    let seenUntil = msgs[msgs.length - 1].created_at as string;
    await readChat(p.chat_id);
    await sendTyping(p.chat_id, 8000);
    let r = await composeReply(db, p.chat_id, p.user_id, latest);
    // He wrote more (or a photo arrived) while it was written: written again, over everything.
    const { data: more } = await db.from('whatsapp_messages').select('text, created_at').eq('chat_id', p.chat_id).eq('sender', 'client').gt('created_at', seenUntil).order('created_at');
    if ((more ?? []).length) {
      const m = more as Row[];
      latest = [...m].reverse().find((x) => x.text)?.text ?? latest;
      seenUntil = m[m.length - 1].created_at;
      r = await composeReply(db, p.chat_id, p.user_id, latest!);
    }
    // Those messages may have queued a reply of their own: this one covers them.
    await db.from('bot_pending_replies').delete().eq('chat_id', p.chat_id).lte('first_at', seenUntil);
    const { parts, handoff, review, planRequest, todayTimes, watched } = r;
    if (handoff) await alertHandoff(db, p.chat_id, p.user_id, parts.join('\n'), true);
    await deliver(db, p.chat_id, p.user_id, parts);
    await afterReply(db, p.chat_id, p.user_id, review);
    // Asked for more / other workouts: the workout bot builds them, a coach approves.
    if (planRequest) await requestFromGroup(db, p.chat_id, p.user_id);
    // He said when he'll train / walk today: the app's calendar moves there.
    if (todayTimes?.length) await setTodayTimes(db, p.user_id, todayTimes);
    // He said he watched the new content: marked in the app too.
    if (watched) await markLatestWatched(db, p.user_id);
    answered++;
  }
  return { answered };
}

// ── Messages the bot starts ───────────────────────────────────────────────────

const TASKS = {
  checkin:
    'הודעת "מה קורה?" ללקוח שלא עדכן כבר יומיים (לא כתב בקבוצה, לא נשקל, לא סימן אימון או הליכה). חמה ואישית, בלי אשמה ובלי לציין שעברו יומיים. אפשר להתייחס לשלב שלו או להרגל שעבד לו. הודעה אחת קצרה, עם שאלה אחת.',
  after_done:
    'הלקוח סימן היום שהוא ביצע את {item}. שואלים "איך היה?" בקצרה ובחום, ומשאירים מקום לספר (קל/קשה, כאב, הישג). הודעה אחת.',
  after_missed:
    'היום היה מתוכנן {item} ב-{time}, ועוד לא סומן שבוצע. שאלה עדינה אחת אם יצא לו היום, בלי לחץ ובלי אשמה. הודעה אחת.',
  friday:
    'משוב שבועי לפני שבת, כמו שמאמן אמיתי כותב למתאמן שלו אחרי שעבר על השבוע: טבעי, אישי וזורם, לא רשימה של נתונים ולא משפטים טלגרפיים ("השבוע עשית הליכה של 30 דקות וחלבון קיבל 8" זה לא טוב). ' +
    'אין הגבלת אורך בהודעה הזו: כתוב כמה שצריך כדי לעבור באמת על השבוע. אפשר עד 3–4 הודעות מופרדות ב---. ' +
    'עבור על כל הנתונים: השאלון השבועי (הציונים שלו לכל הרגל), סימוני ההרגלים באפליקציה, צעדים, אימונים, משקל. ' +
    '1) מה עבד טוב, ספציפי ולמה זה חשוב. ' +
    '2) מה לא עבד: כל ההרגלים שהיו חלשים השבוע (ציון נמוך או מעט סימונים), לא רק אחד. לכל אחד בקצרה מה קרה ומה עושים בשבוע הבא, עם פתרון קונקרטי. אם יש הרבה, מתחילים מהחשובים. ' +
    '3) שאלה אחת בסוף על מה שהכי מפריע לו, כדי להבין ולעזור. {weight}',
  shabbat:
    'הודעת "שבת שלום" קצרה וטבעית, כמו שמאמן כותב: "שבת שלום, תנוח ותן בראש 💪". {trend} ' +
    'לא מציינים כמה ירד מתחילת התהליך ולא זורקים נתון שלא קשור. הודעה אחת, בלי שאלה.',
};

/** What the client logged lately: the latest moment of any update, and today's activity. */
async function lastUpdate(db: SupabaseClient, chatId: string, userId: string) {
  const [msg, weight, act, log, session] = await Promise.all([
    db.from('whatsapp_messages').select('created_at').eq('chat_id', chatId).eq('sender', 'client').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('weight_log').select('created_at, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('activities').select('started_at').eq('user_id', userId).eq('status', 'done').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('activity_log').select('completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('workout_session_logs').select('completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const times = [
    msg.data?.created_at,
    weight.data?.created_at ?? (weight.data?.recorded_at ? `${weight.data.recorded_at}T12:00:00Z` : null),
    act.data?.started_at,
    log.data?.completed_at ? `${log.data.completed_at}T20:00:00Z` : null,
    session.data?.completed_at,
  ].filter(Boolean).map((t) => new Date(t as string).getTime());
  return times.length ? Math.max(...times) : 0;
}

/** Today's planned workouts and walks, at their calendar time (else 18:00, like the app without a layout). */
async function todaysPlan(db: SupabaseClient, userId: string) {
  const il = israel();
  const [sched, walks, placed] = await Promise.all([
    db.from('workout_day_schedule').select('plan_day_id, workout_plan_days(name)').eq('user_id', userId).eq('weekday', il.weekday),
    db.from('user_walking_schedule').select('id').eq('user_id', userId).eq('is_active', true).eq('day_of_week', il.weekday),
    db.from('calendar_placements').select('item_key, scope, day, weekday, start_time, valid_from').eq('user_id', userId),
  ]);
  const list = (placed.data ?? []) as Row[];
  const timeOf = (key: string) => {
    const dated = list.find((p) => p.item_key === key && p.scope === 'date' && p.day === il.date);
    const weekly = list
      .filter((p) => p.item_key === key && p.scope === 'weekday' && p.weekday === il.weekday && (p.valid_from ?? '0000') <= il.date)
      .sort((a, b) => ((a.valid_from ?? '') < (b.valid_from ?? '') ? 1 : -1))[0];
    return String((dated ?? weekly)?.start_time ?? '18:00').slice(0, 5);
  };
  const items: { kind: 'workout' | 'walk'; name: string; time: string }[] = [];
  for (const s of (sched.data ?? []) as Row[]) items.push({ kind: 'workout', name: `האימון "${s.workout_plan_days?.name ?? ''}"`, time: timeOf(`workout:${s.plan_day_id}`) });
  if ((walks.data ?? []).length) items.push({ kind: 'walk', name: 'ההליכה', time: timeOf('walk') });
  return items;
}

/** Done today? (the app's marks, a logged activity, or a finished workout) */
async function doneToday(db: SupabaseClient, userId: string, kind: 'workout' | 'walk') {
  const il = israel();
  const from = israelMidnight().toISOString();
  const [log, acts, session] = await Promise.all([
    db.from('activity_log').select('id').eq('user_id', userId).eq('activity_type', kind).eq('completed_at', il.date).limit(1),
    db.from('activities').select('kind').eq('user_id', userId).eq('status', 'done').gte('started_at', from),
    kind === 'workout' ? db.from('workout_session_logs').select('id').eq('user_id', userId).gte('completed_at', from).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const actKinds = ((acts.data ?? []) as Row[]).map((a) => a.kind);
  const actMatch = kind === 'walk' ? actKinds.some((k) => k === 'walk' || k === 'hike') : actKinds.some((k) => k !== 'walk' && k !== 'hike');
  return !!(log.data ?? []).length || actMatch || !!((session as { data: unknown[] | null }).data ?? []).length;
}

/** The week's numbers for Friday's feedback. */
async function weekData(db: SupabaseClient, userId: string) {
  const il = israel();
  const since = (days: number) => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const [weights, steps, acts, prof, ticks] = await Promise.all([
    db.from('weight_log').select('weight, recorded_at').eq('user_id', userId).gte('recorded_at', since(35)).order('recorded_at'),
    db.from('steps_log').select('date, steps').eq('user_id', userId).gte('date', since(7)).gt('steps', 0),
    db.from('activities').select('kind, custom_name, day, duration_min').eq('user_id', userId).eq('status', 'done').gte('day', since(7)),
    db.from('profiles').select('start_date').eq('id', userId).maybeSingle(),
    db.from('daily_habits_log').select('habit_id, completed_at').eq('user_id', userId).gte('completed_at', since(6)),
  ]);
  // Each habit of this stage: on how many of the last 7 days he ticked it (the app's daily check-ins).
  let habitsLine = '';
  const start = prof.data?.start_date as string | undefined;
  if (start) {
    const day = Math.floor((Date.now() - new Date(`${start}T00:00:00`).getTime()) / 86400_000) + 1;
    const { data: defs } = await db.from('habit_definitions').select('id, name, is_bonus, day_start, day_end')
      .lte('day_start', day).or(`day_end.gte.${day},day_end.is.null`).or(`user_id.is.null,user_id.eq.${userId}`);
    const done = new Map<string, number>();
    for (const t of (ticks.data ?? []) as Row[]) done.set(t.habit_id, (done.get(t.habit_id) ?? 0) + 1);
    const hs = ((defs ?? []) as Row[]).filter((h) => h.day_end !== 0);
    if (hs.length) {
      habitsLine = 'סימוני ההרגלים באפליקציה ב-7 הימים האחרונים (בכמה ימים סימן שעשה, מתוך הימים שההרגל היה פתוח): ' +
        hs.map((h) => `${h.name}${h.is_bonus ? ' (בונוס)' : ''}: ${done.get(h.id) ?? 0}/${Math.min(7, Math.max(1, day - h.day_start + 1))}`).join('; ') + '.';
    }
  }
  const ws = (weights.data ?? []) as Row[];
  const weighedToday = ws.some((w) => w.recorded_at === il.date);
  // This week's change: the latest weigh-in against the one before it (about a week earlier).
  const lastW = ws[ws.length - 1];
  const prevW = [...ws].reverse().find((w) => !!lastW && w.recorded_at <= since(5) && w.recorded_at < lastW.recorded_at);
  const change = lastW && prevW && lastW.recorded_at >= since(7) ? Math.round((lastW.weight - prevW.weight) * 10) / 10 : null;
  const st = (steps.data ?? []) as Row[];
  const avg = st.length ? Math.round(st.reduce((s, x) => s + x.steps, 0) / st.length) : null;
  const ac = (acts.data ?? []) as Row[];
  return {
    weighedToday,
    change,
    text: [
      `שקילות ב-5 השבועות האחרונים: ${ws.map((w) => `${w.recorded_at} ${w.weight}`).join(', ') || 'אין'}.`,
      `נשקל היום: ${weighedToday ? 'כן' : 'לא'}.`,
      change != null ? `השינוי במשקל השבוע: ${change > 0 ? '+' : ''}${change} ק"ג (${prevW!.recorded_at} → ${lastW!.recorded_at}).` : 'אין שינוי שבועי במשקל לחשב (חסרה שקילה).',
      habitsLine,
      `צעדים ב-7 הימים האחרונים: ${avg != null ? `ממוצע ${avg} (${st.length} ימים עם נתונים)` : 'אין נתונים'}.`,
      `אימונים והליכות השבוע: ${ac.map((a) => `${a.day} ${a.custom_name ?? a.kind}${a.duration_min ? ` ${a.duration_min} דק'` : ''}`).join(', ') || 'לא סומנו'}.`,
    ].filter(Boolean).join('\n'),
  };
}

export async function proactive(db: SupabaseClient) {
  const now = new Date();
  const il = israel(now);
  const holy = await holyTimes();
  if (inHolyTime(holy, now)) return { skipped: 'shabbat or holiday' };
  const nextCandles = holy.candles.find((c) => c > now) ?? null;
  const midnight = israelMidnight(now).toISOString();
  const sent: Row[] = [];
  // Workout interviews left hanging for 3 days: on to the coach with what there is.
  await reviewTimeouts(db);

  for (const g of await talkingGroups(db)) {
    const { data: profile } = await db.from('profiles').select('full_name, sleep_time, wake_time, start_date').eq('id', g.user_id).maybeSingle();
    if (!profile || asleep(profile, now)) continue;
    // Before the start date there's nothing to check in on: the bot only answers.
    const todayYmd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    if (!profile.start_date || profile.start_date > todayYmd) continue;
    const [{ data: today }, { data: coach }] = await Promise.all([
      db.from('bot_proactive').select('kind, sent_at').eq('chat_id', g.chat_id).gte('sent_at', new Date(now.getTime() - 3 * 86400_000).toISOString()),
      db.from('whatsapp_messages').select('id').eq('chat_id', g.chat_id).eq('sender', 'coach').gte('created_at', new Date(now.getTime() - 6 * HOUR).toISOString()).limit(1),
    ]);
    const recent = (today ?? []) as Row[];
    if (recent.filter((r) => r.sent_at >= midnight).length >= MAX_A_DAY) continue;
    if ((coach ?? []).length) continue; // one of us is in the conversation
    const sentSince = (kind: string, ms: number) => recent.some((r) => r.kind === kind && new Date(r.sent_at).getTime() > now.getTime() - ms);
    const at = (t: Date | null) => !!t && now >= t && now.getTime() < t.getTime() + WINDOW;

    // The new stage's content, unwatched: two fixed messages, the coaches' words. Saturday night
    // (after Shabbat) on the day it opened, and Sunday. Each only if he still hasn't watched.
    const contentMsg =
      il.weekday === 6 && il.minutes >= 21 * 60 + 30 && il.minutes < 21 * 60 + 50 ? { daysAgo: 0, text: 'יצא לך לראות היום כבר את התכנים החדשים?' }
      : il.weekday === 0 && il.minutes >= 19 * 60 && il.minutes < 19 * 60 + 20 ? { daysAgo: 1, text: 'מה קורה? ראית את התכנים?' }
      : null;
    if (contentMsg && !sentSince('content', 20 * HOUR)) {
      const stage = await latestStage(db, g.user_id);
      if (stage && stage.daysAgo === contentMsg.daysAgo && stage.unwatchedVideos.length > 0) {
        await deliver(db, g.chat_id, g.user_id, [contentMsg.text]);
        await db.from('bot_proactive').insert({ chat_id: g.chat_id, user_id: g.user_id, kind: 'content', text: contentMsg.text });
        sent.push({ chat: g.chat_id, kind: 'content' });
        continue;
      }
    }

    // Every 3 months from the start (days 91, 181, …), at noon: "חבר מביא חבר", and how to get
    // there in the app. The app sends a push at the same time that opens the page directly.
    const day = Math.floor((Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${profile.start_date}T00:00:00Z`)) / 86400_000) + 1;
    if (day > 1 && (day - 1) % 90 === 0 && il.minutes >= 12 * 60 && il.minutes < 12 * 60 + 20 && !sentSince('referral', 20 * HOUR)) {
      const { data: reward } = await db.from('app_settings').select('value').eq('key', 'referral_reward').maybeSingle();
      const first = String(profile.full_name ?? '').trim().split(/\s+/)[0];
      const text =
        `${first ? `${first}, ` : ''}כבר ${((day - 1) / 90) * 3} חודשים בתהליך 💪\n` +
        `מכירים מישהו שזה יכול לעזור לו? יש לנו "חבר מביא חבר": ${reward?.value?.trim() ? `על כל חבר שמצטרף דרככם מקבלים ${reward.value.trim()}.` : 'על כל חבר שמצטרף דרככם יש מתנה.'}\n\n` +
        `איך מגיעים: באפליקציה לוחצים על תמונת הפרופיל שלכם למעלה ← "חבר מביא חבר", כותבים את השם והטלפון שלו, ואנחנו כבר מדברים איתו.\n` +
        `(שלחנו גם התראה לטלפון: לחיצה עליה פותחת ישר את הדף.)`;
      await deliver(db, g.chat_id, g.user_id, [text]);
      await db.from('bot_proactive').insert({ chat_id: g.chat_id, user_id: g.user_id, kind: 'referral', text });
      sent.push({ chat: g.chat_id, kind: 'referral' });
      continue;
    }

    // The first that's due, in this order.
    let kind: string | null = null;
    let task = '';
    let extra: string | undefined;
    let query = '';

    if (nextCandles && at(new Date(nextCandles.getTime() - 150 * MIN)) && !sentSince('friday', 20 * HOUR)) {
      const w = await weekData(db, g.user_id);
      kind = 'friday';
      task = TASKS.friday.replace('{weight}', w.weighedToday
        ? 'אם המשקל עלה: בלי דרמה, עם ההסבר על תנודות (כמו במדריך השקילה).'
        : 'הלקוח עוד לא נשקל היום: מזכירים בעדינות להישקל לפני השבת, ובמשוב לא מתייחסים למשקל.');
      extra = w.text;
      query = 'משוב שבועי, שקילה, מה עבד השבוע';
    } else if (nextCandles && at(new Date(nextCandles.getTime() - 60 * MIN)) && !sentSince('shabbat', 20 * HOUR)) {
      const { data: talk } = await db.from('whatsapp_messages').select('sender, text, created_at').eq('chat_id', g.chat_id).gte('created_at', todayAt('06:00', now).toISOString());
      const msgs = (talk ?? []) as Row[];
      const botJustTalked = msgs.some((m) => m.sender === 'bot' && new Date(m.created_at).getTime() > now.getTime() - 15 * MIN);
      const saidAlready = msgs.some((m) => m.sender !== 'client' && /שבת שלום|חג שמח/.test(m.text ?? ''));
      if (!botJustTalked && !saidAlready) {
        // Only this week's weight says something: down → well done; up / same → a nudge to improve.
        const { change } = await weekData(db, g.user_id);
        kind = 'shabbat';
        task = TASKS.shabbat.replace('{trend}', change == null
          ? 'בלי להתייחס למשקל.'
          : change < 0
          ? `הוא ירד השבוע ${Math.abs(change)} ק"ג: אפשר להוסיף "כל הכבוד על ההתקדמות השבוע".`
          : 'המשקל לא ירד השבוע: אפשר להוסיף משפט קצר ומעודד שבשבוע הבא משפרים (בלי דרמה ובלי מספרים).');
        query = 'שבת שלום';
      }
    }

    if (!kind) {
      for (const item of await todaysPlan(db, g.user_id)) {
        const planned = todayAt(item.time, now);
        if (!at(new Date(planned.getTime() + 2 * HOUR))) continue;
        // Asked already since this time. A time he moved it to today (e.g. "at 18:00") gets its own check.
        if (recent.some((r) => r.kind === 'after' && new Date(r.sent_at).getTime() >= planned.getTime())) continue;
        // Already talked about it since then: no need to ask.
        const { data: mentioned } = await db.from('whatsapp_messages').select('id').eq('chat_id', g.chat_id).eq('sender', 'client')
          .gte('created_at', planned.toISOString()).or('text.ilike.%אימון%,text.ilike.%התאמנ%,text.ilike.%הליכ%,text.ilike.%הלכתי%').limit(1);
        if ((mentioned ?? []).length) break;
        const done = await doneToday(db, g.user_id, item.kind);
        kind = 'after';
        task = (done ? TASKS.after_done : TASKS.after_missed).replace('{item}', item.name).replace('{time}', item.time);
        query = done ? 'איך היה האימון' : 'לא יצא לי להתאמן היום';
        break;
      }
    }

    // Every 4 weeks once workouts are open: the bot asks how they go (17:00, not Friday or Saturday).
    let opensReview = false;
    if (!kind && il.minutes >= 17 * 60 && il.minutes < 17 * 60 + 20 && il.weekday !== 5 && il.weekday !== 6 && !sentSince('workout_review', 20 * HOUR) && (await reviewDue(db, g.user_id))) {
      if (await startReview(db, g.user_id, g.chat_id, 'scheduled')) {
        kind = 'workout_review';
        task = REVIEW_OPEN_TASK;
        query = 'בדיקת אימון: איך הולכים לך האימונים';
        opensReview = true;
      }
    }

    // Not in the middle of asking about the workouts.
    if (!kind && !(await openReview(db, g.user_id)) && il.minutes >= 16 * 60 && il.minutes < 16 * 60 + 20 && il.weekday !== 5 && il.weekday !== 6 && !sentSince('checkin', 48 * HOUR)) {
      const last = await lastUpdate(db, g.chat_id, g.user_id);
      if (now.getTime() - last >= 48 * HOUR) {
        kind = 'checkin';
        task = TASKS.checkin;
        query = 'מה קורה, לא שמענו ממך';
      }
    }

    if (!kind) continue;
    // His answer to our last question never came (e.g. "did you get to the workout?"): we go back to it first.
    const { data: lastMsgs } = await db.from('whatsapp_messages').select('sender, text, created_at').eq('chat_id', g.chat_id)
      .gte('created_at', new Date(now.getTime() - 3 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(3);
    const lastMsg = ((lastMsgs ?? []) as Row[]).find((m) => m.text);
    if (lastMsg && lastMsg.sender === 'bot' && /\?/.test(lastMsg.text) && kind !== 'friday' && kind !== 'shabbat') {
      task =
        `ההודעה האחרונה שלנו נשארה בלי תשובה: "${String(lastMsg.text).slice(0, 300)}". ` +
        'פותחים בזה: חוזרים לשאלה הזו בקצרה ובטבעיות (למשל אם עשה בסוף את האימון, ואם לא, מה קרה), לפני כל דבר אחר. ' +
        `אחר כך, אם זה עדיין מתאים: ${task}`;
    }
    const prompt = await buildPrompt(db, g.chat_id, g.user_id, query, false, undefined, undefined, task, extra);
    const { text, refused, model } = await runModel(db, prompt, { chatId: g.chat_id, userId: g.user_id });
    // Friday's feedback has room to go over the whole week.
    const { parts, handoff } = refused ? { parts: [], handoff: false } : toReply(text, kind === 'friday' ? 4 : maxParts(model));
    if (!parts.length) {
      // The opening never went out: no review hanging open.
      if (opensReview) await db.from('bot_workout_reviews').update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('user_id', g.user_id).eq('status', 'interview');
      continue;
    }
    if (handoff) await alertHandoff(db, g.chat_id, g.user_id, parts.join('\n'), true);
    await deliver(db, g.chat_id, g.user_id, parts);
    await db.from('bot_proactive').insert({ chat_id: g.chat_id, user_id: g.user_id, kind, text: parts.join('\n---\n') });
    sent.push({ chat: g.chat_id, kind });
  }
  return { sent };
}
