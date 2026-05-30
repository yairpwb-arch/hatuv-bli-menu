import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin by checking their JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the calling user is an admin
    const callerToken = authHeader.replace('Bearer ', '');
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${callerToken}`,
        apikey: ANON_KEY,
      },
    });

    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerUser = await userRes.json();

    // Check if caller has admin role
    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${callerUser.id}&role=eq.admin&select=id`,
      {
        headers: {
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );

    const roles = await roleRes.json();
    if (!Array.isArray(roles) || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    const { email, password, full_name, start_date, height, initial_weight, gender, phone_number, birthdate, target_weight, plan_duration_days, subscription_type } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'email and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create user via admin API with email_confirm: true
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || '' },
      }),
    });

    const newUser = await createRes.json();

    if (!createRes.ok) {
      return new Response(JSON.stringify({ error: newUser.message || newUser.msg || 'Failed to create user' }), {
        status: createRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update profile — always activate admin-created users regardless of trigger default
    const updateData: Record<string, unknown> = {
      is_active: true,
      plan_duration_days: plan_duration_days ?? 168,
      subscription_type: subscription_type ?? 'program',
    };
    if (start_date) updateData.start_date = start_date;
    if (height) updateData.height = parseFloat(height);
    if (initial_weight) {
      updateData.initial_weight = parseFloat(initial_weight);
      updateData.current_weight = parseFloat(initial_weight);
    }
    if (gender) updateData.gender = gender;
    if (phone_number) updateData.phone_number = phone_number;
    if (birthdate) updateData.birthdate = birthdate;
    if (target_weight) updateData.target_weight = parseFloat(target_weight);

    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${newUser.id}`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(updateData),
      }
    );

    // Default walking schedule: 1 walk per week starting week 1
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_walking_schedule`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=ignore-duplicates',
        },
        body: JSON.stringify({
          user_id: newUser.id,
          walk_number: 1,
          week_start: 1,
          is_active: true,
        }),
      }
    );

    return new Response(JSON.stringify({ user: newUser }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
