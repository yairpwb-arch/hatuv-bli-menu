import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')!;
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')!;
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET');
const FIREBASE_SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Firebase FCM v1 direct (Android) ─────────────────────────────────────────
// Bypasses OneSignal for Android — sends directly to FCM v1 API using
// a Service Account JWT, avoiding credential configuration issues in OneSignal.

async function signRs256Jwt(header: object, payload: object, pemKey: string): Promise<string> {
  const body = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const b64u = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    return btoa(String.fromCharCode(...bytes))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };
  const sigInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput));
  const b64uRaw = (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${sigInput}.${b64uRaw(sig)}`;
}

async function getFcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signRs256Jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`FCM auth failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function sendFcmBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; errors: string[] }> {
  if (!FIREBASE_SA_JSON) {
    console.error('[push] FIREBASE_SERVICE_ACCOUNT_JSON not set — cannot send to Android');
    return { sent: 0, errors: ['FIREBASE_SERVICE_ACCOUNT_JSON not configured'] };
  }

  let sa: { project_id: string; client_email: string; private_key: string };
  try {
    // Secret is stored as base64 to avoid shell-escaping issues with JSON quotes
    const decoded = atob(FIREBASE_SA_JSON);
    sa = JSON.parse(decoded);
  } catch (e) {
    return { sent: 0, errors: [`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e}`] };
  }

  let accessToken: string;
  try {
    accessToken = await getFcmAccessToken(sa);
  } catch (e) {
    console.error('[push] FCM auth error:', e);
    return { sent: 0, errors: [String(e)] };
  }

  let sent = 0;
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: data ?? {},
              android: {
                priority: 'high',
                notification: { channel_id: 'general' },
              },
            },
          }),
        },
      );
      const json = await res.json();
      console.log(`[push] FCM direct [...${token.slice(-8)}]: ${JSON.stringify(json)}`);
      if (json.name) {
        sent++;
      } else {
        errors.push(JSON.stringify(json.error ?? json));
      }
    } catch (e) {
      errors.push(String(e));
    }
  }

  return { sent, errors };
}

// ── OneSignal helper (iOS only) ───────────────────────────────────────────────

interface TokenRecord {
  token: string;
  platform: string | null;
}

async function sendPush(
  tokens: TokenRecord[],
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  if (tokens.length === 0) return [];

  const ios: string[] = [];
  const android: string[] = [];
  const unknown: string[] = [];

  for (const t of tokens) {
    if (t.platform === 'ios') ios.push(t.token);
    else if (t.platform === 'android') android.push(t.token);
    else unknown.push(t.token);
  }

  const results: unknown[] = [];

  // iOS via OneSignal (raw APNs tokens) — working
  if (ios.length > 0) {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        headings: { he: title, en: title },
        contents: { he: body, en: body },
        data: data ?? {},
        priority: 10,
        android_visibility: 1,
        include_ios_tokens: ios,
      }),
    });
    const json = await res.json();
    console.log(`[push] OneSignal iOS batch: recipients=${json.recipients ?? 0} errors=${JSON.stringify(json.errors ?? [])}`);
    results.push(json);
  }

  // Android via FCM v1 direct — bypasses OneSignal credential dependency
  if (android.length > 0) {
    results.push(await sendFcmBatch(android, title, body, data));
  }

  // Unknown platform via OneSignal player IDs
  if (unknown.length > 0) {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        headings: { he: title, en: title },
        contents: { he: body, en: body },
        data: data ?? {},
        priority: 10,
        include_player_ids: unknown,
      }),
    });
    results.push(await res.json());
  }

  return results;
}

// ── User week helpers ─────────────────────────────────────────────────────────

function getDayInProgram(startDate: string): number {
  const diffMs = Date.now() - new Date(startDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

// Must match dayToWeek() in src/pages/admin/AdminHabits.tsx exactly, since both
// resolve the same habit_definitions.week_start values. Day 1 = program start
// (Saturday), habits unlock day 2 (Sunday of week 1), day 9 (Sunday of week 2), etc.
function getWeekNumber(startDate: string): number {
  const day = getDayInProgram(startDate);
  return Math.max(1, Math.floor((day - 2) / 7) + 1);
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getUserLocalHour(timezone: string | null): number {
  const tz = timezone || 'Asia/Jerusalem';
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  return local.getHours();
}

// ── Quiet hours ───────────────────────────────────────────────────────────────
// No push goes out between a trainee's bedtime and wake-up (profiles.sleep_time
// / wake_time, set in Settings). Unset → 23:00–07:00.

function toMinutes(t: string | null | undefined, fallback: string): number {
  const [h, m] = (t || fallback).slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}

function isQuietHours(timezone: string | null, sleepTime: string | null, wakeTime: string | null): boolean {
  const tz = timezone || 'Asia/Jerusalem';
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const now = local.getHours() * 60 + local.getMinutes();
  const bed = toMinutes(sleepTime, '23:00');
  const wake = toMinutes(wakeTime, '07:00');
  return bed <= wake ? now >= bed && now < wake : now >= bed || now < wake;
}

// ── notification_logs helpers ─────────────────────────────────────────────────

function getIsraelTodayRange(): { start: string; end: string } {
  const tz = 'Asia/Jerusalem';
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

  // Detect actual Israel UTC offset (UTC+3 summer, UTC+2 winter)
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
  const tzPart = fmt.formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+3';
  const match = tzPart.match(/GMT([+-]\d+(?::\d+)?)/);
  let offsetStr = '+03:00';
  if (match) {
    const raw = match[1]; // e.g. "+3" or "+2"
    const h = Math.abs(parseInt(raw));
    offsetStr = `${raw.startsWith('-') ? '-' : '+'}${String(h).padStart(2, '0')}:00`;
  }

  return {
    start: `${today}T00:00:00${offsetStr}`,
    end:   `${today}T23:59:59.999${offsetStr}`,
  };
}

async function alreadySentToday(userId: string, type: string): Promise<boolean> {
  const { start, end } = getIsraelTodayRange();
  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', type)
    .gte('sent_at', start)
    .lte('sent_at', end)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function logSent(userIds: string[], type: string): Promise<void> {
  if (userIds.length === 0) return;
  const rows = userIds.map((user_id) => ({ user_id, notification_type: type }));
  const { error } = await supabase.from('notification_logs').insert(rows);
  if (error) console.warn('[push] notification_logs insert error:', error.message);
}

// ── Fetch active users with push tokens ───────────────────────────────────────

// pref: the per-type switch in Settings (notification_settings.prefs). A
// missing key means on, so users who never touched the switches get everything.
async function fetchEligibleUsers(includeStartDate = false, pref?: string) {
  const selectCols = includeStartDate
    ? 'user_id, player_id, device_platform, timezone, prefs, profiles!inner(is_active, start_date, sleep_time, wake_time)'
    : 'user_id, player_id, device_platform, timezone, prefs, profiles!inner(is_active, sleep_time, wake_time)';

  const { data, error } = await supabase
    .from('notification_settings')
    .select(selectCols)
    .eq('notifications_enabled', true)
    .not('player_id', 'is', null);

  if (error) {
    console.error('[push] fetchEligibleUsers error:', error.message);
    return [];
  }

  return (data ?? []).filter(
    (s: any) =>
      s.profiles?.is_active === true &&
      (!pref || s.prefs?.[pref] !== false) &&
      !isQuietHours(s.timezone, s.profiles?.sleep_time, s.profiles?.wake_time),
  );
}

// ── Notification handlers ─────────────────────────────────────────────────────

// One cron every 15 minutes ('tick'): each notification's time is checked in the
// trainee's own clock, so the fixed times hold through daylight saving, and
// notification_logs keeps each one to once a day.
const TICK_WINDOW_MIN = 20;
const SATURDAY = 6;
const SUNDAY = 0;
const THURSDAY = 4;
const FRIDAY = 5;
// The step goal, as in the app (src/lib/stepGoal.ts): each steps habit sets a
// floor from the day it opens (6,000 from day 44, 8,000 from day 86). The
// average since the start, taken up to that day, is the baseline: at the floor
// already → baseline + 2,000, else the floor. It stays until the next habit.
const STEP_STAGES = [
  { fromDay: 44, floor: 6000 },
  { fromDay: 86, floor: 8000 },
];
const STEPS_FROM_DAY = STEP_STAGES[0].fromDay;
const STEP_RAISE = 2000;
function stepGoalFor(day: number, startDate: string, rows: { date: string; steps: number }[]): number {
  const stage = [...STEP_STAGES].reverse().find((s) => day >= s.fromDay)!;
  const opens = new Date(startDate + 'T12:00:00Z');
  opens.setUTCDate(opens.getUTCDate() + stage.fromDay - 1);
  const cutoff = opens.toISOString().slice(0, 10);
  const before = rows.filter((l) => l.steps > 0 && l.date < cutoff);
  const baseline = before.length ? before.reduce((sum, l) => sum + l.steps, 0) / before.length : null;
  return baseline != null && baseline >= stage.floor ? Math.round((baseline + STEP_RAISE) / 100) * 100 : stage.floor;
}
const HOURS_BEFORE_BED = 4;

type Local = { weekday: number; minutes: number; date: string; yesterday: string };

function localNow(timezone: string | null): Local {
  const tz = timezone || 'Asia/Jerusalem';
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const before = new Date(local);
  before.setDate(before.getDate() - 1);
  return { weekday: local.getDay(), minutes: local.getHours() * 60 + local.getMinutes(), date: iso(local), yesterday: iso(before) };
}

const isAt = (now: Local, weekday: number, hour: number, minute = 0) => {
  const t = hour * 60 + minute;
  return now.weekday === weekday && now.minutes >= t && now.minutes < t + TICK_WINDOW_MIN;
};

interface StageVideo { id: string; unlock_day: number; part_number: number; week_range: string; title: string }

async function handleTick() {
  const users = await fetchEligibleUsers(true);
  const { data: videoRows } = await supabase
    .from('program_content')
    .select('id, unlock_day, part_number, week_range, title, is_bonus')
    .eq('content_type', 'video')
    .is('archived_at', null)
    .order('sort_order', { ascending: true });
  const videos = ((videoRows ?? []) as (StageVideo & { is_bonus: boolean })[]).filter((v) => !v.is_bonus);

  const send = async (u: any, type: string, title: string, body: string) => {
    if (await alreadySentToday(u.user_id, type)) return;
    await sendPush([{ userId: u.user_id, token: u.player_id, platform: u.device_platform } as any], title, body, { type });
    await logSent([u.user_id], type);
  };

  for (const u of users as any[]) {
    const startDate = u.profiles?.start_date;
    if (!startDate) continue;
    const now = localNow(u.timezone);
    const day = getDayInProgram(startDate);
    const prefOn = (key: string) => u.prefs?.[key] !== false;

    // ── A new week / part: what opened in the last week, and whether it was watched ──
    const stageTime = isAt(now, SATURDAY, 17, 30) || isAt(now, SATURDAY, 21) || isAt(now, SUNDAY, 10);
    if (stageTime && prefOn('new_content')) {
      const newest = videos.filter((v) => v.unlock_day <= day && v.unlock_day > day - 7);
      if (newest.length > 0) {
        const { data: seen } = await supabase
          .from('content_progress')
          .select('content_id')
          .eq('user_id', u.user_id)
          .in('content_id', newest.map((v) => v.id));
        const seenIds = new Set((seen ?? []).map((r: { content_id: string }) => r.content_id));
        const unwatched = newest.filter((v) => !seenIds.has(v.id));
        const first = newest[0];
        const isPart = first.title.startsWith('חלק ');
        if (isAt(now, SATURDAY, 17, 30)) {
          await send(u, 'new_stage', isPart ? 'נפתח לך חלק חדש' : 'נפתח לך שבוע חדש', `הסרטון של ${first.week_range} מחכה לך בתכנים.`);
        } else if (unwatched.length > 0 && isAt(now, SATURDAY, 21)) {
          await send(u, 'new_stage_nudge', 'הסרטון החדש עוד מחכה לך', 'כמה דקות עכשיו, ומחר מתחילים את ההרגלים החדשים.');
        } else if (unwatched.length > 0 && isAt(now, SUNDAY, 10)) {
          await send(u, 'new_stage_nudge_2', 'היום מתחילים הרגלים חדשים', `עוד לא ראית את הסרטון של ${first.week_range}. כדאי לראות אותו לפני שממשיכים.`);
        }
      }
    }

    // ── Thursday evening: tomorrow is weigh-in day (kept from the old schedule) ──
    if (isAt(now, THURSDAY, 20) && prefOn('weigh')) {
      await send(u, 'weigh_reminder', 'מחר בבוקר שקילה', 'שישי בבוקר, לפני האוכל ואחרי השירותים.');
    }

    // ── Friday: weighing, and the weekly survey for whoever hasn't filled it in ──
    if (isAt(now, FRIDAY, 8) && prefOn('weigh')) {
      await send(u, 'weigh_survey', 'בוקר של שקילה', 'לפני האוכל ואחרי השירותים. ובהמשך היום מחכה לך גם השאלון השבועי.');
    }
    const surveyNudge = isAt(now, FRIDAY, 12) ? 1 : isAt(now, FRIDAY, 14) ? 2 : 0;
    if (surveyNudge && prefOn('weekly_summary')) {
      const { data: filled } = await supabase
        .from('weekly_checkin')
        .select('id')
        .eq('user_id', u.user_id)
        .gte('submitted_at', new Date(Date.now() - 24 * 3600_000).toISOString())
        .limit(1);
      if (!filled?.length) {
        if (surveyNudge === 1) await send(u, 'survey_nudge', 'השאלון השבועי מחכה לך', '2 דקות, וזה עוזר לנו לכוון אותך.');
        else await send(u, 'survey_nudge_2', 'עוד לא מילאת את השאלון השבועי', 'נשאר רק היום. 2 דקות וזה מאחוריך.');
      }
    }

    // ── Steps: 4 hours before bedtime, behind today and also yesterday ──
    if (day >= STEPS_FROM_DAY && prefOn('steps')) {
      const bed = toMinutes(u.profiles?.sleep_time, '23:00');
      const at = (bed - HOURS_BEFORE_BED * 60 + 1440) % 1440;
      if (now.minutes >= at && now.minutes < at + TICK_WINDOW_MIN) {
        const { data: logs } = await supabase
          .from('steps_log')
          .select('date, steps')
          .eq('user_id', u.user_id)
          .gte('date', startDate)
          .gt('steps', 0);
        const rows = (logs ?? []) as { date: string; steps: number }[];
        const goal = stepGoalFor(day, startDate, rows);
        const stepsOn = (date: string) => rows.find((l) => l.date === date)?.steps ?? 0;
        const today = stepsOn(now.date);
        if (today < goal && stepsOn(now.yesterday) < goal) {
          await send(u, 'steps_behind', 'עוד קצת צעדים היום', `עוד ${(goal - today).toLocaleString('he-IL')} צעדים ליעד של ${goal.toLocaleString('he-IL')}. יש לך עוד 4 שעות.`);
        }
      }
    }
  }
  return 'ok';
}

// ── Server ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get('authorization') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    const isServiceRole = auth.includes(SERVICE_ROLE_KEY);
    const isCron = CRON_SECRET && cronHeader === CRON_SECRET;

    const body = await req.json().catch(() => ({}));
    const { type } = body;

    if (!isServiceRole && !isCron && type !== 'send_test') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: unknown;
    switch (type) {
      case 'tick': result = await handleTick(); break;
      // The old cron jobs, until they're unscheduled (run_push_tick.sql).
      case 'daily_quote':
      case 'phase_check':
      case 'new_habits':
      case 'weigh_reminder':
      case 'survey_followup': result = 'skipped'; break;

      case 'send_test': {
        let pushToken: string;
        let pushPlatform: string;

        if (isServiceRole) {
          const { token, platform } = body as { token?: string; platform?: string };
          if (!token) return new Response(JSON.stringify({ error: 'missing token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          pushToken = token;
          pushPlatform = platform ?? 'android';
        } else {
          const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
          let userId: string | null = null;
          try {
            const [, rawPayload] = jwt.split('.');
            const b64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(b64));
            userId = payload.sub ?? null;
          } catch { /* invalid JWT */ }
          if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          const { data: ns } = await supabase
            .from('notification_settings')
            .select('player_id, device_platform')
            .eq('user_id', userId)
            .maybeSingle();

          if (!(ns as any)?.player_id) {
            return new Response(JSON.stringify({ ok: false, error: 'no_push_token', detail: 'לא נמצא push token — ודא שהתראות מופעלות במכשיר זה' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          pushToken = (ns as any).player_id as string;
          pushPlatform = ((ns as any).device_platform as string) ?? 'android';
        }

        result = await sendPush(
          [{ token: pushToken, platform: pushPlatform }],
          '🧪 בדיקה',
          'אם קיבלת הודעה זו — ההתראות עובדות!',
          { type: 'test' },
        );
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ ok: true, type, onesignal: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[push-notification]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
