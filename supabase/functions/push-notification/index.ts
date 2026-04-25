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

async function sendPush(playerIds: string[], title: string, body: string, data?: Record<string, string>) {
  if (playerIds.length === 0) return;

  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { he: title, en: title },
      contents: { he: body, en: body },
      data: data ?? {},
      android_channel_id: 'general',
    }),
  });

  const json = await res.json();
  console.log(`[push] type=${data?.type ?? '?'} sent=${json.recipients ?? 0} errors=${json.errors ?? 0}`);
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
    .select('push_token')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null);

  const tokens = (users ?? []).map((u) => u.push_token as string);
  await sendPush(tokens, '💬 משפט יומי', 'יש לך משפט יומי מחכה לך באפליקציה', { type: 'daily_quote' });
}

/** 2. בדיקת מעבר שלב — כל שבת ב-19:00 */
async function handlePhaseCheck() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token, start_date')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null)
    .not('start_date', 'is', null);

  const eligible: string[] = [];

  for (const user of users ?? []) {
    const nextWeek = getWeekNumber(user.start_date) + 1;
    const { data: newHabits } = await supabase
      .from('habit_definitions')
      .select('id')
      .eq('week_start', nextWeek)
      .is('user_id', null)
      .limit(1);

    if (newHabits && newHabits.length > 0) {
      eligible.push(user.push_token);
    }
  }

  await sendPush(
    eligible,
    '🎉 שלב חדש מחכה לך!',
    'השלמת את השלב הנוכחי! מחר מתחילים הרגלים חדשים — תמשיך כך!',
    { type: 'phase_check' }
  );
}

/** 3. הרגלים חדשים — כל ראשון ב-09:00 (ראשון = יום ראשון של שבוע חדש) */
async function handleNewHabits() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token, start_date')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null)
    .not('start_date', 'is', null);

  const eligible: string[] = [];

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
      eligible.push(user.push_token);
    }
  }

  await sendPush(
    eligible,
    '🔥 שבוע חדש — הרגלים חדשים!',
    'היום מתחיל שבוע חדש עם הרגלים חדשים — פתח את האפליקציה לראות מה מחכה לך!',
    { type: 'new_habits' }
  );
}

/** 4. תזכורת שקילה + שאלון — כל חמישי ב-20:00 */
async function handleWeighReminder() {
  const { data: users } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null);

  const tokens = (users ?? []).map((u) => u.push_token as string);
  await sendPush(
    tokens,
    '⚖️ תזכורת שקילה',
    'מחר בבוקר שקילה! זכור לשקול ולמלא את השאלון השבועי 📋',
    { type: 'weigh_reminder' }
  );
}

/** 5. תזכורת שאלון אם עוד לא ענה — שישי ב-12:00 ושבת ב-16:00 */
async function handleSurveyFollowup() {
  const { data: users } = await supabase
    .from('profiles')
    .select('id, push_token, start_date')
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .not('push_token', 'is', null)
    .not('start_date', 'is', null);

  const eligible: string[] = [];

  for (const user of users ?? []) {
    const week = getWeekNumber(user.start_date);
    const { data: checkin } = await supabase
      .from('weekly_checkin')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_number', week)
      .maybeSingle();

    if (!checkin) {
      eligible.push(user.push_token);
    }
  }

  await sendPush(
    eligible,
    '📋 שאלון שבועי ממתין',
    'עוד לא מילאת את השאלון השבועי שלך — לוקח רק 2 דקות! פתח את האפליקציה ✅',
    { type: 'survey_followup' }
  );
}

// ── Server ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: accept service role JWT or cron secret
    const auth = req.headers.get('authorization') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    const isServiceRole = auth.includes(SERVICE_ROLE_KEY);
    const isCron = CRON_SECRET && cronHeader === CRON_SECRET;

    if (!isServiceRole && !isCron) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { type } = body;

    switch (type) {
      case 'daily_quote':    await handleDailyQuote(); break;
      case 'phase_check':    await handlePhaseCheck(); break;
      case 'new_habits':     await handleNewHabits(); break;
      case 'weigh_reminder': await handleWeighReminder(); break;
      case 'survey_followup':await handleSurveyFollowup(); break;
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ ok: true, type }), {
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
