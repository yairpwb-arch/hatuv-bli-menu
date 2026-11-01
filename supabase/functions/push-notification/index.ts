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

async function handlePhaseCheck() {
  const users = await fetchEligibleUsers(true, 'new_content');
  const eligible: (TokenRecord & { userId: string })[] = [];

  for (const u of users as any[]) {
    if (getUserLocalHour(u.timezone) !== 19) continue;
    if (await alreadySentToday(u.user_id, 'phase_check')) continue;

    const startDate = u.profiles?.start_date;
    if (!startDate) continue;
    const currentWeek = getWeekNumber(startDate);
    const nextWeek = currentWeek + 1;

    const [{ data: nextHabits }, { data: currentHabits }] = await Promise.all([
      supabase.from('habit_definitions').select('id').eq('week_start', nextWeek).is('user_id', null).limit(1),
      supabase.from('habit_definitions').select('id').eq('week_start', currentWeek).is('user_id', null).limit(1),
    ]);

    const nextPhaseExists = (nextHabits?.length ?? 0) > 0;
    const currentIsPhaseStart = (currentHabits?.length ?? 0) > 0;

    if (nextPhaseExists && !currentIsPhaseStart) {
      eligible.push({ userId: u.user_id, token: u.player_id, platform: u.device_platform });
    }
  }

  if (eligible.length === 0) return;
  await sendPush(
    eligible,
    '🎉 שלב חדש מחכה לך!',
    'השלמת את השלב הנוכחי! מחר מתחילים הרגלים חדשים — תמשיך כך!',
    { type: 'phase_check' },
  );
  await logSent(eligible.map((u) => u.userId), 'phase_check');
}

async function handleNewHabits() {
  const users = await fetchEligibleUsers(true, 'habits');
  const eligible: (TokenRecord & { userId: string })[] = [];

  for (const u of users as any[]) {
    if (getUserLocalHour(u.timezone) !== 9) continue;
    if (await alreadySentToday(u.user_id, 'new_habits')) continue;

    const startDate = u.profiles?.start_date;
    if (!startDate) continue;
    const dayInProgram = getDayInProgram(startDate);
    // Habits unlock on Sunday (day 2 of each program week): days 2, 9, 16, 23...
    // The cron fires on Sunday; check if today is a habit-unlock Sunday (day >= 9).
    const isHabitUnlockDay = dayInProgram >= 9 && (dayInProgram - 2) % 7 === 0;
    if (!isHabitUnlockDay) continue;

    const currentWeek = getWeekNumber(startDate);
    const { data: newHabits } = await supabase
      .from('habit_definitions')
      .select('id')
      .eq('week_start', currentWeek)
      .is('user_id', null)
      .limit(1);

    if (newHabits && newHabits.length > 0) {
      eligible.push({ userId: u.user_id, token: u.player_id, platform: u.device_platform });
    }
  }

  if (eligible.length === 0) return;
  await sendPush(
    eligible,
    '🔥 שבוע חדש — הרגלים חדשים!',
    'היום מתחיל שבוע חדש עם הרגלים חדשים — פתח את האפליקציה לראות מה מחכה לך!',
    { type: 'new_habits' },
  );
  await logSent(eligible.map((u) => u.userId), 'new_habits');
}

async function handleWeighReminder() {
  const users = await fetchEligibleUsers(false, 'weigh');
  const eligible: (TokenRecord & { userId: string })[] = [];

  // Friday morning, from 8:00 — or the first hour after the trainee wakes up
  // (quiet hours are filtered above), at most once.
  for (const u of users as any[]) {
    const hour = getUserLocalHour(u.timezone);
    const local = new Date(new Date().toLocaleString('en-US', { timeZone: u.timezone || 'Asia/Jerusalem' }));
    if (local.getDay() !== 5 || hour < 8 || hour >= 12) continue;
    if (await alreadySentToday(u.user_id, 'weigh_reminder')) continue;
    eligible.push({ userId: u.user_id, token: u.player_id, platform: u.device_platform });
  }

  if (eligible.length === 0) return;
  await sendPush(
    eligible,
    'בוקר של שקילה',
    'לפני האוכל ואחרי השירותים. לחיצה פותחת את הוספת השקילה',
    { type: 'weigh_reminder' },
  );
  await logSent(eligible.map((u) => u.userId), 'weigh_reminder');
}

// The weekly survey was replaced by the bedtime daily summary; nothing to chase.
async function handleSurveyFollowup() {
  return;
  const users = await fetchEligibleUsers(true, 'weekly_summary');
  const eligible: (TokenRecord & { userId: string })[] = [];

  for (const u of users as any[]) {
    const localHour = getUserLocalHour(u.timezone);
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: u.timezone || 'Asia/Jerusalem' }));
    const isValidTime = (localHour === 12 && now.getDay() === 5) || (localHour === 16 && now.getDay() === 6);
    if (!isValidTime) continue;
    if (await alreadySentToday(u.user_id, 'survey_followup')) continue;

    const startDate = u.profiles?.start_date;
    if (!startDate) continue;
    const week = getWeekNumber(startDate);
    const { data: checkin } = await supabase
      .from('weekly_checkin')
      .select('id')
      .eq('user_id', u.user_id)
      .eq('week_number', week)
      .maybeSingle();

    if (!checkin) {
      eligible.push({ userId: u.user_id, token: u.player_id, platform: u.device_platform });
    }
  }

  if (eligible.length === 0) return;
  await sendPush(
    eligible,
    '📋 שאלון שבועי ממתין',
    'עוד לא מילאת את השאלון השבועי שלך — לוקח רק 2 דקות! פתח את האפליקציה ✅',
    { type: 'survey_followup' },
  );
  await logSent(eligible.map((u) => u.userId), 'survey_followup');
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
      // Daily quotes were removed; the old cron job may still call this.
      case 'daily_quote':     result = 'skipped';                    break;
      case 'phase_check':     result = await handlePhaseCheck();     break;
      case 'new_habits':      result = await handleNewHabits();      break;
      case 'weigh_reminder':  result = await handleWeighReminder();  break;
      case 'survey_followup': result = await handleSurveyFollowup(); break;

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
