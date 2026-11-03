// Supabase Edge Function: whatsapp-admin
//
// For the dashboard only (admins): the WhatsApp groups the bot's number is in,
// from Green API, so a trainee's card can pick theirs; and whether the number
// is connected. The Green API keys stay here, never in the app.
//
// Body: { action: 'list_groups' } → { groups: [{ chat_id, name }] }
//       { action: 'state' }       → { state }   ("authorized" = connected)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const GREEN_API_URL = Deno.env.get('GREEN_API_URL') ?? '';
const ID_INSTANCE = Deno.env.get('GREEN_ID_INSTANCE') ?? '';
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN') ?? '';
const green = (method: string) => `${GREEN_API_URL}/waInstance${ID_INSTANCE}/${method}/${API_TOKEN}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Admins only.
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: 'Invalid session' }, 401);
  const { data: role } = await admin.from('user_roles').select('id').eq('user_id', who.user.id).eq('role', 'admin').maybeSingle();
  if (!role) return json({ error: 'Not authorized' }, 403);

  if (!GREEN_API_URL || !ID_INSTANCE || !API_TOKEN) return json({ error: 'Green API secrets are not set' }, 500);
  const { action } = await req.json().catch(() => ({ action: null }));

  if (action === 'state') {
    const res = await fetch(green('getStateInstance'));
    const data = await res.json().catch(() => ({}));
    return json({ state: (data as { stateInstance?: string }).stateInstance ?? 'unknown' });
  }

  if (action === 'list_groups') {
    const res = await fetch(green('getContacts'));
    if (!res.ok) return json({ error: `Green API ${res.status}` }, 502);
    const contacts = (await res.json()) as { id: string; name?: string; contactName?: string; type?: string }[];
    const groups = contacts
      .filter((c) => c.type === 'group' || c.id?.endsWith('@g.us'))
      .map((c) => ({ chat_id: c.id, name: c.name || c.contactName || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return json({ groups });
  }

  return json({ error: 'Unknown action' }, 400);
});
