import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')!;
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')!;
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET');

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

  const ios     = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
  const android = tokens.filter((t) => t.platform === 'android').map((t) => t.token);
  const unknown = tokens.filter((t) => t.platform !== 'ios' && t.platform !== 'android').map((t) => t.token);

  const sendBatch = async (extra: Record<string, unknown>) => {
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
        priority: 10,              // HIGH priority — bypasses Android Doze / battery optimization
        android_visibility: 1,     // lock screen visibility: public
        android_channel_id: 'general', // explicit channel — must match createChannel() id in app
        ...extra,
      }),
    });
    const json = await res.json();
    console.log(`[push] type=${data?.type ?? '?'} sent=${json.recipients ?? 0} errors=${JSON.stringify(json.errors ?? [])} full=${JSON.stringify(json)}`);
    return json;
  };

  const results: unknown[] = [];
  const promises: Promise<void>[] = [];
  if (ios.length > 0)     promises.push(sendBatch({ include_ios_tokens: ios }).then(r => { results.push({ios: r}); }));
  if (android.length > 0) promises.push(sendBatch({ include_android_reg_ids: android }).then(r => { results.push({android: r}); }));
  if (unknown.length > 0) promises.push(sendBatch({ include_player_ids: unknown }).then(r => { results.push({unknown: r}); }));
  await Promise.all(promises);
  console.log('[push] OneSignal results:', JSON.stringify(results));
  return results;
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

// ── Notification handlers ─────────────────────────────────────────────────────

/** 1. משפט יומי — כל יום ב-10:00 */
async function handleDailyQuote() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token, device_platform')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null);

  const tokens: TokenRecord[] = (users ?? []).map((u) => ({
    token: u.push_token as string,
    platform: u.device_platform as string | null,
  }));
  return await sendPush(tokens, '💬 משפט יומי', 'יש לך משפט יומי מחכה לך באפליקציה', { type: 'daily_quote' });
}

/** 2. בדיקת מעבר שלב — כל שבת ב-19:00 */
async function handlePhaseCheck() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token, device_platform, start_date')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null)
    .not('start_date', 'is', null);

  const eligible: TokenRecord[] = [];

  for (const user of users ?? []) {
    const nextWeek = getWeekNumber(user.start_date) + 1;
    const { data: newHabits } = await supabase
      .from('habit_definitions')
      .select('id')
      .eq('week_start', nextWeek)
      .is('user_id', null)
      .limit(1);

    if (newHabits && newHabits.length > 0) {
      eligible.push({ token: user.push_token, platform: user.device_platform });
    }
  }

  await sendPush(
    eligible,
    '🎉 שלב חדש מחכה לך!',
    'השלמת את השלב הנוכחי! מחר מתחילים הרגלים חדשים — תמשיך כך!',
    { type: 'phase_check' },
  );
}

/** 3. הרגלים חדשים — כל ראשון ב-09:00 */
async function handleNewHabits() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token, device_platform, start_date')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null)
    .not('start_date', 'is', null);

  const eligible: TokenRecord[] = [];

  for (const user of users ?? []) {
    const dayInProgram = getDayInProgram(user.start_date);
    const isFirstDayOfNewWeek = dayInProgram > 1 && (dayInProgram - 1) % 7 === 0;
    if (!isFirstDayOfNewWeek) continue;

    const currentWeek = getWeekNumber(user.start_date);
    const { data: newHabits } = await supabase
      .from('habit_definitions')
      .select('id')
      .eq('week_start', currentWeek)
      .is('user_id', null)
      .limit(1);

    if (newHabits && newHabits.length > 0) {
      eligible.push({ token: user.push_token, platform: user.device_platform });
    }
  }

  await sendPush(
    eligible,
    '🔥 שבוע חדש — הרגלים חדשים!',
    'היום מתחיל שבוע חדש עם הרגלים חדשים — פתח את האפליקציה לראות מה מחכה לך!',
    { type: 'new_habits' },
  );
}

/** 4. תזכורת שקילה + שאלון — כל חמישי ב-20:00 */
async function handleWeighReminder() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token, device_platform')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null);

  const tokens: TokenRecord[] = (users ?? []).map((u) => ({
    token: u.push_token as string,
    platform: u.device_platform as string | null,
  }));
  await sendPush(
    tokens,
    '⚖️ תזכורת שקילה',
    'מחר בבוקר שקילה! זכור לשקול ולמלא את השאלון השבועי 📋',
    { type: 'weigh_reminder' },
  );
}

/** 5. תזכורת שאלון אם עוד לא ענה — שישי ב-12:00 ושבת ב-16:00 */
async function handleSurveyFollowup() {
  const { data: users } = await supabase
    .from('profiles')
    .select('id, push_token, device_platform, start_date')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null)
    .not('start_date', 'is', null);

  const eligible: TokenRecord[] = [];

  for (const user of users ?? []) {
    const week = getWeekNumber(user.start_date);
    const { data: checkin } = await supabase
      .from('weekly_checkin')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_number', week)
      .maybeSingle();

    if (!checkin) {
      eligible.push({ token: user.push_token, platform: user.device_platform });
    }
  }

  await sendPush(
    eligible,
    '📋 שאלון שבועי ממתין',
    'עוד לא מילאת את השאלון השבועי שלך — לוקח רק 2 דקות! פתח את האפליקציה ✅',
    { type: 'survey_followup' },
  );
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

    // register_device accepts any valid Supabase user JWT — check auth per-case
    if (!isServiceRole && !isCron && type !== 'register_device') {
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
        const { token, platform } = body as { token?: string; platform?: string };
        if (!token) return new Response(JSON.stringify({ error: 'missing token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        onesignalResult = await sendPush(
          [{ token, platform: platform ?? 'android' }],
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
          // Admin call: accept user_id from body
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('push_token, device_platform')
          .eq('id', userId)
          .maybeSingle();
        if (!profile?.push_token) {
          return new Response(JSON.stringify({ error: 'No push token' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const deviceType = profile.device_platform === 'ios' ? 0 : 1;
        const res = await fetch('https://onesignal.com/api/v1/players', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            device_type: deviceType,
            identifier: profile.push_token,
            notification_types: 1,
            language: 'he',
          }),
        });
        onesignalResult = await res.json();
        console.log('[push] register_device', JSON.stringify(onesignalResult));
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
