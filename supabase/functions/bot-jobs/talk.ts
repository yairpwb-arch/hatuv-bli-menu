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
    const { data: since } = await db.from('whatsapp_messages').select('sender, text').eq('chat_id', p.chat_id).gte('created_at', p.first_at).order('created_at');
    const msgs = (since ?? []) as Row[];
    // One of us answered meanwhile (or the bot already did): quiet.
    if (msgs.some((m) => m.sender === 'coach' || m.sender === 'bot')) continue;
    const latest = [...msgs].reverse().find((m) => m.sender === 'client' && m.text)?.text;
    if (!latest) continue;
    await readChat(p.chat_id);
    await sendTyping(p.chat_id, 8000);
    const { parts, handoff, review, planRequest } = await composeReply(db, p.chat_id, p.user_id, latest);
    if (handoff) await alertHandoff(db, p.chat_id, p.user_id, parts.join('\n'), true);
    await deliver(db, p.chat_id, p.user_id, parts);
    await afterReply(db, p.chat_id, p.user_id, review);
    // Asked for more / other workouts: the workout bot builds them, a coach approves.
    if (planRequest) await requestFromGroup(db, p.chat_id, p.user_id);
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
    'משוב שבועי לפני שבת. הודעה אחת (לכל היותר שתיים): מה עבד טוב השבוע, ספציפי ועם מספרים מהנתונים; ההרגל שהכי כדאי לשפר בשבוע הבא; ושאלה אחת כדי להבין מה מפריע בו. {weight}',
  shabbat:
    'הודעת "שבת שלום" קצרה ואישית ללקוח, עם משהו קטן מהשבוע שלו. לא אותה הודעה לכולם. הודעה אחת, בלי שאלה.',
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
  const [weights, steps, acts] = await Promise.all([
    db.from('weight_log').select('weight, recorded_at').eq('user_id', userId).gte('recorded_at', since(35)).order('recorded_at'),
    db.from('steps_log').select('date, steps').eq('user_id', userId).gte('date', since(7)).gt('steps', 0),
    db.from('activities').select('kind, custom_name, day, duration_min').eq('user_id', userId).eq('status', 'done').gte('day', since(7)),
  ]);
  const ws = (weights.data ?? []) as Row[];
  const weighedToday = ws.some((w) => w.recorded_at === il.date);
  const st = (steps.data ?? []) as Row[];
  const avg = st.length ? Math.round(st.reduce((s, x) => s + x.steps, 0) / st.length) : null;
  const ac = (acts.data ?? []) as Row[];
  return {
    weighedToday,
    text: [
      `שקילות ב-5 השבועות האחרונים: ${ws.map((w) => `${w.recorded_at} ${w.weight}`).join(', ') || 'אין'}.`,
      `נשקל היום: ${weighedToday ? 'כן' : 'לא'}.`,
      `צעדים ב-7 הימים האחרונים: ${avg != null ? `ממוצע ${avg} (${st.length} ימים עם נתונים)` : 'אין נתונים'}.`,
      `אימונים והליכות השבוע: ${ac.map((a) => `${a.day} ${a.custom_name ?? a.kind}${a.duration_min ? ` ${a.duration_min} דק'` : ''}`).join(', ') || 'לא סומנו'}.`,
    ].join('\n'),
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
        kind = 'shabbat';
        task = TASKS.shabbat;
        query = 'שבת שלום';
      }
    }

    if (!kind && !sentSince('after', 14 * HOUR)) {
      for (const item of await todaysPlan(db, g.user_id)) {
        if (!at(new Date(todayAt(item.time, now).getTime() + 2 * HOUR))) continue;
        // Already talked about it today: no need to ask.
        const { data: mentioned } = await db.from('whatsapp_messages').select('id').eq('chat_id', g.chat_id).eq('sender', 'client')
          .gte('created_at', midnight).or('text.ilike.%אימון%,text.ilike.%התאמנ%,text.ilike.%הליכ%,text.ilike.%הלכתי%').limit(1);
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
    const prompt = await buildPrompt(db, g.chat_id, g.user_id, query, false, undefined, undefined, task, extra);
    const { text, refused, model } = await runModel(db, prompt, { chatId: g.chat_id, userId: g.user_id });
    const { parts, handoff } = refused ? { parts: [], handoff: false } : toReply(text, maxParts(model));
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
