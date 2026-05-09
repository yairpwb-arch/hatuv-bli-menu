import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract user ID from JWT payload directly (no extra network call)
    const auth = req.headers.get('authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    let userId: string | null = null;
    try {
      const [, rawPayload] = jwt.split('.');
      const b64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      userId = payload.sub ?? null;
    } catch { /* invalid JWT */ }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete all user data (profiles has ON DELETE CASCADE to most tables)
    const tables = [
      'notification_logs',
      'steps_log',
      'step_logs',
      'workout_day_schedule',
      'user_walking_schedule',
      'workout_exercise_logs',
      'workout_session_logs',
      'user_workout_assignments',
      'survey_responses',
      'weekly_checkin',
      'content_progress',
      'activity_log',
      'user_activity_schedule',
      'transformation_photos',
      'nutrition_log',
      'weight_log',
      'daily_habits_log',
      'user_roles',
    ];

    for (const table of tables) {
      await supabase.from(table as any).delete().eq('user_id', userId);
    }

    // Delete profile (cascade handles remaining FK relations)
    await supabase.from('profiles').delete().eq('id', userId);

    // Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('[delete-account] auth.admin.deleteUser error:', authError.message);
      // Non-fatal — data is already deleted
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-account]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
