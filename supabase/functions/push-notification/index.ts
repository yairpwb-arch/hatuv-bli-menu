import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')!;
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')!;
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET');

if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
  console.error('[push] ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY not set in secrets!');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── OneSignal helper ──────────────────────────────────────────────────────────
// Routes each token to the correct OneSignal field based on device platform:
//   iOS     → include_ios_tokens       (raw APNs device token)
//   Android → include_android_reg_ids  (raw FCM registration ID)
//   unknown → include_player_ids       (OneSignal Player ID fallback)

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
  if (tokens.length === 0) return;

  // All tokens in the DB are OneSignal Player IDs (registered via /players endpoint).
  // include_player_ids works for both iOS and Android — no need to split by platform.
  const playerIds = tokens.map((t) => t.token);

  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      headings: { he: title, en: title },
      contents: { he: body, en: body },
      data: data ?? {},
      priority: 10,
      android_visibility: 1,
      include_player_ids: playerIds,
    }),
  });
  const json = await res.json();
  console.log(`[push] type=${data?.type ?? '?'} sent=${json.recipients ?? 0} errors=${JSON.stringify(json.errors ?? [])} full=${JSON.stringify(json)}`);
  return [{ all: json }];
}

// ── User week helpers ─────────────────────────────────────────────────────────

function getWeekNumber(startDate: string): number {
  const diffMs = Date.now() - new Date(startDate).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.ceil((diffDays + 1) / 7);
}

function getDayInProgram(startDate: string): number {
  const diffMs = Date.now() - new Date(startDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

/** Returns the current local hour (0-23) for a given IANA timezone. */
function getUserLocalHour(timezone: string | null): number {
  const tz = timezone || 'Asia/Jerusalem';
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  return local.getHours();
}

// ── notification_logs helpers ─────────────────────────────────────────────────

/** Returns true if this notification type was already sent to userId today (IST). */
async function alreadySentToday(userId: string, type: string): Promise<boolean> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD
  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', type)
    .gte('sent_at', `${today}T00:00:00+03:00`)
    .lt('sent_at', `${today}T23:59:59+03:00`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Inserts a row into notification_logs for each userId after successful send. */
async function logSent(userIds: string[], type: string): Promise<void> {
  if (userIds.length === 0) return;
  const rows = userIds.map((user_id) => ({ user_id, notification_type: type }));
  const { error } = await supabase.from('notification_logs').insert(rows);
  if (error) console.warn('[push] notification_logs insert error:', error.message);
}

// ── Fetch active users with push tokens ───────────────────────────────────────
// Reads from notification_settings (source of truth) joined with profiles for
// is_active and start_date. Filters out rows without a player_id.

async function fetchEligibleUsers(includeStartDate = false) {
  const selectCols = includeStartDate
    ? 'user_id, player_id, device_platform, timezone, profiles!inner(is_active, start_date)'
    : 'user_id, player_id, device_platform, timezone, profiles!inner(is_active)';

  const { data, error } = await supabase
    .from('notification_settings')
    .select(selectCols)
    .eq('notifications_enabled', true)
    .not('player_id', 'is', null);

  if (error) {
    console.error('[push] fetchEligibleUsers error:', error.message);
    return [];
  }

  // Keep only active users (inner join guarantees profile exists; filter is_active here)
  return (data ?? []).filter((s: any) => s.profiles?.is_active === true);
}

// ── Notification handlers ─────────────────────────────────────────────────────

/** 1. משפט יומי — כל יום ב-10:00 IST */
async function handleDailyQuote() {
  const users = await fetchEligibleUsers(false);

  const eligible: (TokenRecord & { userId: string })[] = [];
  for (const u of users as any[]) {
    if (getUserLocalHour(u.timezone) !== 10) continue;
    if (await alreadySentToday(u.user_id, 'daily_quote')) continue;
    eligible.push({ userId: u.user_id, token: u.player_id, platform: u.device_platform });
  }

  if (eligible.length === 0) return;
  await sendPush(eligible, '💬 משפט יומי', 'יש לך משפט יומי מחכה לך באפליקציה', { type: 'daily_quote' });
  await logSent(eligible.map((u) => u.userId), 'daily_quote');
}

/** 2. בדיקת מעבר שלב — כל שבת ב-19:00 IST */
async function handlePhaseCheck() {
  const users = await fetchEligibleUsers(true);

  const eligible: (TokenRecord & { userId: string })[] = [];
  for (const u of users as any[]) {
    if (getUserLocalHour(u.timezone) !== 19) continue;
    if (await alreadySentToday(u.user_id, 'phase_check')) continue;

    const startDate = u.profiles?.start_date;
    if (!startDate) continue;
    const nextWeek = getWeekNumber(startDate) + 1;
    const { data: newHabits } = await supabase
      .from('habit_definitions')
      .select('id')
      .eq('week_start', nextWeek)
      .is('user_id', null)
      .limit(1);

    if (newHabits && newHabits.length > 0) {
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

/** 3. הרגלים חדשים — כל ראשון ב-09:00 IST */
async function handleNewHabits() {
  const users = await fetchEligibleUsers(true);

  const eligible: (TokenRecord & { userId: string })[] = [];
  for (const u of users as any[]) {
    if (getUserLocalHour(u.timezone) !== 9) continue;
    if (await alreadySentToday(u.user_id, 'new_habits')) continue;

    const startDate = u.profiles?.start_date;
    if (!startDate) continue;
    const dayInProgram = getDayInProgram(startDate);
    const isFirstDayOfNewWeek = dayInProgram > 1 && (dayInProgram - 1) % 7 === 0;
    if (!isFirstDayOfNewWeek) continue;

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

/** 4. תזכורת שקילה + שאלון — כל חמישי ב-20:00 IST */
async function handleWeighReminder() {
  const users = await fetchEligibleUsers(false);

  const eligible: (TokenRecord & { userId: string })[] = [];
  for (const u of users as any[]) {
    if (getUserLocalHour(u.timezone) !== 20) continue;
    if (await alreadySentToday(u.user_id, 'weigh_reminder')) continue;
    eligible.push({ userId: u.user_id, token: u.player_id, platform: u.device_platform });
  }

  if (eligible.length === 0) return;
  await sendPush(
    eligible,
    '⚖️ תזכורת שקילה',
    'מחר בבוקר שקילה! זכור לשקול ולמלא את השאלון השבועי 📋',
    { type: 'weigh_reminder' },
  );
  await logSent(eligible.map((u) => u.userId), 'weigh_reminder');
}

/** 5. תזכורת שאלון אם עוד לא ענה — שישי ב-12:00 ושבת ב-16:00 IST */
async function handleSurveyFollowup() {
  const users = await fetchEligibleUsers(true);

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

    // Parse body first so we can check type for register_device auth bypass
    const body = await req.json().catch(() => ({}));
    const { type } = body;

    // register_device and send_test accept any valid Supabase user JWT — check auth per-case
    if (!isServiceRole && !isCron && type !== 'register_device' && type !== 'send_test') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let onesignalResult: unknown;
    switch (type) {
      case 'daily_quote':     onesignalResult = await handleDailyQuote();     break;
      case 'phase_check':     onesignalResult = await handlePhaseCheck();     break;
      case 'new_habits':      onesignalResult = await handleNewHabits();      break;
      case 'weigh_reminder':  onesignalResult = await handleWeighReminder();  break;
      case 'survey_followup': onesignalResult = await handleSurveyFollowup(); break;
      case 'check_delivery': {
        const { id } = body as { id?: string };
        if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const r = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${ONESIGNAL_APP_ID}`, {
          headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` },
        });
        onesignalResult = await r.json();
        break;
      }
      case 'send_test': {
        let pushToken: string;
        let pushPlatform: string;

        if (isServiceRole) {
          // Admin call: token + platform supplied directly in body
          const { token, platform } = body as { token?: string; platform?: string };
          if (!token) return new Response(JSON.stringify({ error: 'missing token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          pushToken = token;
          pushPlatform = platform ?? 'ios';
        } else {
          // User call: decode JWT payload directly to extract user_id
          const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
          let userId: string | null = null;
          try {
            const [, rawPayload] = jwt.split('.');
            const b64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(b64));
            userId = payload.sub ?? null;
          } catch { /* invalid JWT */ }
          if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          // Read push token from notification_settings (source of truth)
          const { data: ns } = await supabase
            .from('notification_settings')
            .select('player_id, device_platform')
            .eq('user_id', userId)
            .maybeSingle();
          if (!(ns as any)?.player_id) {
            return new Response(JSON.stringify({ ok: false, error: 'no_push_token', detail: 'לא נמצא push token — ודא שהתראות מופעלות במכשיר זה' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          pushToken = (ns as any).player_id as string;
          pushPlatform = ((ns as any).device_platform as string) ?? 'android';
        }

        onesignalResult = await sendPush(
          [{ token: pushToken, platform: pushPlatform }],
          '🧪 בדיקה',
          'אם קיבלת הודעה זו — ההתראות עובדות!',
          { type: 'test' },
        );
        break;
      }
      case 'register_device': {
        // Verify caller is an authenticated user (not just service role)
        let userId: string | null = null;
        if (isServiceRole) {
          const { user_id } = body as { user_id?: string };
          userId = user_id ?? null;
        } else {
          const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
          const { data: { user } } = await supabase.auth.getUser(token);
          userId = user?.id ?? null;
        }
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Read push token from notification_settings (source of truth)
        const { data: ns } = await supabase
          .from('notification_settings')
          .select('player_id, device_platform')
          .eq('user_id', userId)
          .maybeSingle();
        if (!(ns as any)?.player_id) {
          return new Response(JSON.stringify({ error: 'No push token' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const deviceType = (ns as any).device_platform === 'ios' ? 0 : 1;
        const res = await fetch('https://onesignal.com/api/v1/players', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            device_type: deviceType,
            identifier: (ns as any).player_id,
            notification_types: 1,
            language: 'he',
          }),
        });
        onesignalResult = await res.json();
        console.log('[push] register_device', JSON.stringify(onesignalResult));

        // Save the OneSignal Player ID back to notification_settings so all future
        // sends use include_player_ids (more reliable than raw FCM/APNs tokens).
        const onesignalPlayerId = (onesignalResult as any)?.id;
        if (onesignalPlayerId) {
          await supabase
            .from('notification_settings')
            .update({ player_id: onesignalPlayerId })
            .eq('user_id', userId);
          console.log('[push] OneSignal Player ID saved:', onesignalPlayerId);
        }
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ ok: true, type, onesignal: onesignalResult }), {
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
