// Bunny Stream: signed player links for the app.
//
// POST { action: 'sign', videoId }  → { url, expires, signed }   (any signed-in trainee)
// POST { action: 'list' }           → { videos: [...] }           (admins: picking videos to test / attach)
//
// The player link carries a token valid for 2 hours, so a copied link stops
// working outside the app. That needs, in Bunny: Stream → the library →
// Security → "Embed view token authentication" ON, and its key in the
// BUNNY_TOKEN_KEY secret. Secrets: BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_TOKEN_KEY.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const LINK_SECONDS = 2 * 60 * 60;

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // The library id is public (it's in every player link); the secret only overrides it.
  const LIBRARY = Deno.env.get('BUNNY_LIBRARY_ID') ?? '795868';
  const API_KEY = Deno.env.get('BUNNY_API_KEY');
  const TOKEN_KEY = Deno.env.get('BUNNY_TOKEN_KEY');

  // Signed-in users only.
  const auth = req.headers.get('authorization') ?? '';
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: ANON } });
  if (!userRes.ok) return json({ error: 'Not signed in' }, 401);
  const user = await userRes.json();

  const { action, videoId } = await req.json().catch(() => ({}));

  if (action === 'sign') {
    if (typeof videoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(videoId)) return json({ error: 'Bad videoId' }, 400);
    const expires = Math.floor(Date.now() / 1000) + LINK_SECONDS;
    const base = `https://iframe.mediadelivery.net/embed/${LIBRARY}/${videoId}`;
    if (!TOKEN_KEY) return json({ url: base, expires, signed: false });
    const token = await sha256Hex(TOKEN_KEY + videoId + expires);
    return json({ url: `${base}?token=${token}&expires=${expires}`, expires, signed: true });
  }

  if (action === 'list') {
    const roles = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user.id}&role=eq.admin&select=id`, {
      headers: { authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
    }).then((r) => r.json());
    if (!Array.isArray(roles) || roles.length === 0) return json({ error: 'Admins only' }, 403);
    if (!API_KEY) return json({ error: 'BUNNY_API_KEY is not set' }, 500);
    const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY}/videos?page=1&itemsPerPage=100&orderBy=title`, {
      headers: { AccessKey: API_KEY, accept: 'application/json' },
    });
    if (!res.ok) return json({ error: `Bunny: ${res.status}` }, 502);
    const data = await res.json();
    return json({
      videos: (data.items ?? []).map((v: { guid: string; title: string; length: number; status: number }) => ({
        guid: v.guid,
        title: v.title,
        seconds: Math.round(v.length),
        // 4 = ready to play
        ready: v.status === 4,
      })),
    });
  }

  return json({ error: 'Unknown action' }, 400);
});
