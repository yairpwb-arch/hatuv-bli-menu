// Supabase Edge Function: bot-jobs
//
// The WhatsApp bot's background work, called by pg_cron (trigger_bot_job) or by
// an admin from the dashboard. Never sends a message to a client.
//   { job: 'knowledge' }  content changed in the dashboard → its chunks rebuilt;
//                         then every chunk without an embedding gets one
//   { job: 'examples' }   yesterday's answers of ours (and approved drafts) join bot_examples
//   { job: 'profiles' }   a weekly profile (≤200 words) per active client
//   { job: 'replies' }    a new conversation answered 5 minutes later (talk.ts)
//   { job: 'proactive' }  messages the bot starts: check-in, after a workout, Friday, Shabbat (talk.ts)
//   { job: 'plans' }      the workout bot: a plan for each opening questionnaire just finished (planBuilder.ts)
//   { job: 'build_plan', user_id, request?, note? }  admin: build (or rebuild) a trainee's plan
//   { job: 'approve_plan', draft_id }                admin: write an approved plan into the app
//
// Auth: x-cron-secret = PUSH_CRON_SECRET (the same secret as the notifications),
// or an admin's session.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { claudeUsage, embed, logUsage, vectorLiteral } from '../_shared/botkit.ts';
import { buildPrompt, runModel } from '../whatsapp-webhook/brain.ts';
import { proactive, replies } from './talk.ts';
import { approveDraft, jobPlans, startBuild } from '../whatsapp-webhook/planBuilder.ts';

type Row = Record<string, any>;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? '';
const TEST_GROUP_ID = Deno.env.get('TEST_GROUP_ID') ?? '';
const anthropic = Deno.env.get('ANTHROPIC_API_KEY') ? new Anthropic() : null;
const PROFILE_MODEL = 'claude-sonnet-5-5';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ── Text helpers ──────────────────────────────────────────────────────────────

/** A guide's text as plain lines: every string in its blocks, marks removed. */
function flatten(node: unknown, out: string[] = []): string[] {
  const SKIP = new Set(['type', 'visual', 'icon', 'to', 'target', 'id', 'key', 'color', 'size']);
  if (typeof node === 'string') {
    const t = node
      .replace(/\*\*|==/g, '')
      .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, '$1/$2') // {male|female}
      .trim();
    if (t) out.push(t);
  } else if (Array.isArray(node)) node.forEach((n) => flatten(n, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!SKIP.has(k)) flatten(v, out);
  return out;
}

/** Lines → chunks of about 300–500 words (a short text stays whole). */
function chunk(lines: string[]): string[] {
  const total = lines.join(' ').split(/\s+/).length;
  const n = Math.max(1, Math.ceil(total / 500));
  const target = total / n;
  const out: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const l of lines) {
    cur.push(l);
    words += l.split(/\s+/).length;
    if (words >= target && out.length < n - 1) {
      out.push(cur.join('\n'));
      cur = [];
      words = 0;
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

const TYPE_LABEL: Record<string, string> = { video: 'סרטון', guide: 'מדריך', content: 'טיפ' };

// ── knowledge ─────────────────────────────────────────────────────────────────

async function jobKnowledge() {
  const { data: queue } = await db.from('bot_knowledge_queue').select('content_id').order('queued_at').limit(60);
  let rebuilt = 0;
  for (const { content_id } of (queue ?? []) as Row[]) {
    const { data: c } = await db.from('program_content').select('*').eq('id', content_id).maybeSingle();
    // Guide / stage / shopping chunks are rebuilt from the content; video transcripts are loaded by SQL.
    await db.from('bot_knowledge').delete().eq('content_id', content_id).neq('source', 'video');
    if (c && !c.archived_at) {
      const rows: Row[] = [];
      const label = TYPE_LABEL[c.content_type] ?? 'תוכן';
      // The stage map: what opens when, one line per item.
      rows.push({
        source: 'stage',
        text: `${c.week_range ?? ''} · ${label} · ${c.title}${c.description ? `: ${c.description}` : ''} (נפתח ביום ${c.unlock_day} בתהליך${c.is_bonus ? ', בונוס' : ''})`,
      });
      const blocks = Array.isArray(c.body) ? (c.body as Row[]) : null;
      if (blocks?.length) {
        const shopping = blocks.some((b) => b.type === 'shopping_list');
        chunk(flatten(blocks)).forEach((t) => rows.push({ source: shopping ? 'shopping' : 'guide', text: t }));
      }
      const { error } = await db.from('bot_knowledge').insert(
        rows.map((r, i) => ({ ...r, content_id, title: c.title, unlock_day: c.unlock_day ?? 1, chunk_index: i, embedding: null })),
      );
      if (error) console.error('[bot-jobs] knowledge insert', content_id, error.message);
      else rebuilt++;
    }
    await db.from('bot_knowledge_queue').delete().eq('content_id', content_id);
  }

  // Embeddings for every chunk that has none yet (videos included), 50 at a time.
  let embedded = 0;
  for (let round = 0; round < 6; round++) {
    const { data: todo } = await db.from('bot_knowledge').select('id, title, text').is('embedding', null).limit(50);
    if (!todo?.length) break;
    const vectors = await embed(db, (todo as Row[]).map((r) => `${r.title}\n${r.text}`));
    if (!vectors) break;
    for (const [i, r] of (todo as Row[]).entries()) {
      await db.from('bot_knowledge').update({ embedding: vectorLiteral(vectors[i]), updated_at: new Date().toISOString() }).eq('id', r.id);
    }
    embedded += todo.length;
  }
  return { rebuilt, embedded };
}

// ── examples ──────────────────────────────────────────────────────────────────

const TRIVIAL = /^(👍|👌|🙌|💪|🙏|❤️|סבבה|אחלה|מעולה|יופי|תותח|תותחית|אלוף|אלופה|קיבלתי|אוקיי?|סגור|בסדר|בסדר גמור|הבנתי|פצצה|מדהים|נהדר|חח+|[\s!.?,]*)+$/u;
const meaningful = (t: string) => {
  const s = t.replace(/[\p{Extended_Pictographic}\s!.?,]/gu, '');
  return s.length >= 6 && !TRIVIAL.test(t.trim());
};

/** Yesterday, Israel time, as an ISO range. */
function yesterdayRange() {
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const offset = now.getTime() - today.getTime(); // Israel → UTC
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { from: new Date(start.getTime() + offset).toISOString(), to: new Date(end.getTime() + offset).toISOString() };
}

async function jobExamples() {
  const { from, to } = yesterdayRange();
  // Context reaches back a little before the day.
  const lookback = new Date(new Date(from).getTime() - 6 * 3600_000).toISOString();
  const { data: msgs } = await db
    .from('whatsapp_messages')
    .select('chat_id, user_id, sender, text, wa_message_id, created_at')
    .gte('created_at', lookback)
    .lt('created_at', to)
    .neq('chat_id', TEST_GROUP_ID || '-')
    .order('created_at');
  const byChat = new Map<string, Row[]>();
  for (const m of (msgs ?? []) as Row[]) if (m.user_id) (byChat.get(m.chat_id) ?? byChat.set(m.chat_id, []).get(m.chat_id)!).push(m);

  const rows: Row[] = [];
  for (const [chatId, list] of byChat) {
    const { data: p } = await db.from('profiles').select('full_name').eq('id', list[0].user_id).maybeSingle();
    const names = String(p?.full_name ?? '').split(/\s+/).filter((w) => w.length >= 2);
    const scrub = (t: string) => {
      let s = t.replace(/https?:\/\/\S+/g, '[קישור]').replace(/(\+?972|0)5\d[-\s]?\d{3}[-\s]?\d{4}/g, '[טלפון]').replace(/@\S+/g, '{שם}');
      for (const n of names) s = s.split(n).join('{שם}');
      return s;
    };
    // Turns: one side's messages within 10 minutes. The bot's own messages end a turn and never count.
    type Turn = { side: 'client' | 'coach' | 'bot'; texts: string[]; first: Row; end: number };
    const turns: Turn[] = [];
    for (const m of list) {
      if (!m.text) continue;
      const side = m.sender as Turn['side'];
      const last = turns[turns.length - 1];
      const t = new Date(m.created_at).getTime();
      if (last && last.side === side && t - last.end < 10 * 60_000) {
        last.texts.push(m.text);
        last.end = t;
      } else turns.push({ side, texts: [m.text], first: m, end: t });
    }
    for (let i = 1; i < turns.length; i++) {
      const a = turns[i - 1];
      const b = turns[i];
      if (a.side !== 'client' || b.side !== 'coach') continue;
      if (b.first.created_at < from) continue; // yesterday's answers only
      const coach = b.texts.filter(meaningful);
      if (!coach.length) continue;
      const before = turns[i - 2]?.side === 'coach' ? turns[i - 2].texts.join(' ⏎ ') : null;
      const day = new Date(b.first.created_at);
      rows.push({
        source: 'live',
        source_key: `live:${chatId}:${b.first.wa_message_id ?? b.first.created_at}`,
        context: before ? scrub(before) : null,
        client: scrub(a.texts.join(' ⏎ ')),
        coach: scrub(coach.join(' ⏎ ')),
        weekday: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][day.getDay()],
        hour: Number(day.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false })),
      });
    }
  }

  // Drafts we approved (or rewrote) yesterday: our final version.
  const { data: drafts } = await db
    .from('bot_drafts')
    .select('id, client_text, final_text, decided_at')
    .in('status', ['approved', 'edited'])
    .gte('decided_at', from)
    .lt('decided_at', to);
  for (const d of (drafts ?? []) as Row[]) {
    if (!d.client_text || !d.final_text || !meaningful(d.final_text)) continue;
    rows.push({ source: 'draft', source_key: `draft:${d.id}`, context: null, client: d.client_text, coach: d.final_text, weekday: null, hour: null });
  }

  if (rows.length) {
    const { error } = await db.from('bot_examples').upsert(rows, { onConflict: 'source_key', ignoreDuplicates: true });
    if (error) console.error('[bot-jobs] examples', error.message);
  }
  return { added: rows.length };
}

// ── profiles ──────────────────────────────────────────────────────────────────

const PROFILE_RULES = `אתה כותב "תיק לקוח" קצר לצוות של חטוב בלי תפריט (ליווי לירידה במשקל דרך הרגלים), מתוך השיחות בקבוצת הוואטסאפ של הלקוח ומהתיק הקודם.
כתוב עד 200 מילים, בעברית, בחמש שורות עם הכותרות האלה בדיוק:
מטרה (במילים שלו):
מה עובד לו:
איפה נתקע:
הקשר חיים:
איך הוא אוהב שמדברים איתו:
כללים:
- רק מה שכתוב בשיחות או בתיק הקודם. בלי ניחושים ובלי פרשנות. אם אין מידע לשורה, כתוב "עוד לא ידוע".
- מידע רפואי: רק מה שהלקוח עצמו כתב, במילים שלו, בלי להוסיף או להסיק.
- מידע חדש גובר על ישן; מה שעדיין נכון מהתיק הקודם נשאר.
- אם התיק הקודם נערך ידנית על ידי המאמנים, הוא הבסיס: לא מוחקים ממנו, רק מוסיפים או מעדכנים לפי מידע חדש.
- כתוב רק את התיק, בלי הקדמה.`;

async function jobProfiles() {
  if (!anthropic) return { error: 'ANTHROPIC_API_KEY missing' };
  const { data: groups } = await db.from('whatsapp_groups').select('chat_id, user_id').not('user_id', 'is', null);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  let written = 0;
  for (const g of (groups ?? []) as Row[]) {
    const [{ data: p }, { data: msgs }, { data: prev }, { data: ob }] = await Promise.all([
      db.from('profiles').select('full_name, is_active').eq('id', g.user_id).maybeSingle(),
      db.from('whatsapp_messages').select('sender, sender_name, text, created_at').eq('chat_id', g.chat_id).gte('created_at', weekAgo).order('created_at'),
      db.from('client_profiles').select('profile, edited_by, edited_at, updated_at').eq('user_id', g.user_id).maybeSingle(),
      db.from('onboarding_responses').select('answers').eq('user_id', g.user_id).maybeSingle(),
    ]);
    if (!p?.is_active) continue;
    const chat = ((msgs ?? []) as Row[]).filter((m) => m.text).map((m) => `${m.sender === 'client' ? 'לקוח' : m.sender === 'coach' ? 'מאמן' : 'עוזר'}: ${m.text}`).join('\n');
    if (!chat) continue; // nothing new this week
    const manual = !!prev?.edited_at && (!prev.updated_at || prev.edited_at >= prev.updated_at);
    const goal = (ob as Row | null)?.answers?.goal;
    const r = (await anthropic.messages.create({
      model: PROFILE_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: PROFILE_RULES,
      messages: [{
        role: 'user',
        content:
          `לקוח: ${p.full_name ?? ''}\n` +
          (goal ? `מטרה מהשאלון: ${Array.isArray(goal) ? goal.join(', ') : goal}\n` : '') +
          `\n# התיק הקודם${manual ? ' (נערך ידנית על ידי המאמנים)' : ''}\n${prev?.profile || 'אין'}\n\n# השיחות מהשבוע האחרון\n${chat.slice(-30000)}`,
      }],
    } as any)) as Row;
    await logUsage(db, { kind: 'profile', model: PROFILE_MODEL, chatId: g.chat_id, userId: g.user_id, ...claudeUsage(r) });
    const text = ((r.content ?? []) as Row[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text || r.stop_reason === 'refusal') continue;
    const { error } = await db.from('client_profiles').upsert({ user_id: g.user_id, profile: text, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) console.error('[bot-jobs] profile', g.user_id, error.message);
    else written++;
  }
  return { written };
}

// ── eval: one question of the model test ──────────────────────────────────────

const ALL_EVAL_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'gpt-6.1-terra'];
async function jobEvalCase(body: Row) {
  const runId = String(body.run_id ?? '');
  const { data: c } = await db.from('bot_eval_cases').select('*').eq('no', body.case_no).maybeSingle();
  if (!c || !runId) return { error: 'no case' };

  // The conversation as the bot would see it: the history, then the question.
  const lines = ((c.history ?? []) as Row[]).map((h) => `${h.side === 'coach' ? 'מאמן' : 'לקוח'}: ${h.text}`);
  lines.push(`לקוח: ${c.question}`);
  const chat = lines.join('\n');
  const prompt = await buildPrompt(db, 'eval', null, c.question, true, chat, { ctx: c.ctx, day: c.day });

  // The models to run, the same prompt: the ones asked for (e.g. only Terra), else Haiku and Sonnet.
  const EVAL_MODELS = Array.isArray(body.models) && body.models.length ? ALL_EVAL_MODELS.filter((m) => body.models.includes(m)) : ALL_EVAL_MODELS.slice(0, 2);
  if (!EVAL_MODELS.length) return { error: 'no such model' };
  const answers = await Promise.all(EVAL_MODELS.map((model) => runModel(db, prompt, { model, kind: 'eval' })));

  // Only what code can check by itself; the rest is read by us.
  const checks = (c.checks ?? []) as Row[];
  const handoffRequired = checks.some((k) => k.id === 'handoff_required');
  const rows = EVAL_MODELS.map((model, i) => {
    const text = answers[i].text;
    const hasHandoff = text.includes('[העבר]');
    const silent = !text || text.includes('[שקט]');
    const out: Row[] = [
      { id: 'handoff', text: 'יש [העבר]', passed: hasHandoff, why: handoffRequired ? 'חובה בשאלה הזו' : 'לא חובה בשאלה הזו' },
      { id: 'silent', text: 'הבוט שתק', passed: silent, why: '' },
      { id: 'messages', text: 'מספר הודעות', passed: true, why: String(silent ? 0 : text.split(/\n\s*---\s*\n/).filter((x) => x.trim()).length) },
    ];
    return {
      run_id: runId,
      case_no: c.no,
      model,
      answer: text,
      score: null,
      passed: handoffRequired ? hasHandoff : null,
      checks: out,
      note: answers[i].refused ? 'המודל סירב לענות' : null,
      cost_usd: answers[i].cost,
    };
  });
  const { error } = await db.from('bot_eval_results').upsert(rows, { onConflict: 'run_id,case_no,model' });
  if (error) console.error('[bot-jobs] eval save', error.message);
  return { case_no: c.no, results: rows.map((x) => ({ model: x.model, score: x.score, passed: x.passed })) };
}

// ── Server ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let allowed = !!CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET;
  let adminId: string | null = null;
  if (!allowed) {
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const { data: who } = await db.auth.getUser(token);
    if (who?.user) {
      const { data: role } = await db.from('user_roles').select('id').eq('user_id', who.user.id).eq('role', 'admin').maybeSingle();
      allowed = !!role;
      if (allowed) adminId = who.user.id;
    }
  }
  if (!allowed) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const job = body?.job ?? null;
  try {
    if (job === 'knowledge') return json(await jobKnowledge());
    if (job === 'examples') return json(await jobExamples());
    if (job === 'profiles') return json(await jobProfiles());
    if (job === 'eval_case') return json(await jobEvalCase(body));
    if (job === 'replies') return json(await replies(db));
    if (job === 'proactive') return json(await proactive(db));
    if (job === 'plans') return json(await jobPlans(db));
    if (job === 'build_plan' && body.user_id) {
      // The first plan if there are no workout days yet, else a request (add / replace days).
      // The latest plan, on or off (the first plan the bot built waits switched off).
      const { data: a } = await db.from('user_workout_assignments').select('plan_id').eq('user_id', body.user_id).order('is_active', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const { count } = a ? await db.from('workout_plan_days').select('id', { count: 'exact', head: true }).eq('plan_id', a.plan_id) : { count: 0 };
      const kind = body.kind === 'initial' || body.kind === 'request' ? body.kind : (count ?? 0) > 0 ? 'request' : 'initial';
      return json(await startBuild(db, body.user_id, { kind, request: body.request ?? null, note: body.note ?? null }));
    }
    if (job === 'approve_plan' && body.draft_id) return json(await approveDraft(db, body.draft_id, adminId));
    return json({ error: 'unknown job' }, 400);
  } catch (err) {
    console.error('[bot-jobs]', job, err instanceof Error ? err.message : err);
    return json({ error: 'failed' }, 500);
  }
});
