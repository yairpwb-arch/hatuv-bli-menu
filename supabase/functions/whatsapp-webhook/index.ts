// Supabase Edge Function: whatsapp-webhook
//
// Green API (unofficial WhatsApp, the bot's own number) posts every message
// here. Stage 1: every message in a known group is saved with who sent it
// (client / coach / bot). The bot doesn't answer in real groups yet; in the test
// group only it still answers "קיבלתי", to check the line end to end.
//
// The bot lives only in WhatsApp. The app is just its data source.
//
// Secrets (Supabase → Edge Functions → Secrets; never in code):
//   GREEN_API_URL      e.g. https://7103.api.greenapi.com (apiUrl in the Green API console)
//   GREEN_ID_INSTANCE  idInstance
//   GREEN_API_TOKEN    apiTokenInstance
//   WEBHOOK_TOKEN      a password of ours; the same one is set as webhookUrlToken in Green API
//   TEST_GROUP_ID      the test group's chatId (…@g.us), from the logs
//
// verify_jwt is off for this function (supabase/config.toml): Green API has no
// Supabase JWT. It's checked by WEBHOOK_TOKEN instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const GREEN_API_URL = Deno.env.get('GREEN_API_URL') ?? '';
const ID_INSTANCE = Deno.env.get('GREEN_ID_INSTANCE') ?? '';
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN') ?? '';
const WEBHOOK_TOKEN = Deno.env.get('WEBHOOK_TOKEN') ?? '';
const TEST_GROUP_ID = Deno.env.get('TEST_GROUP_ID') ?? '';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ── Green API ────────────────────────────────────────────────────────────────

async function sendMessage(chatId: string, message: string): Promise<string | null> {
  const res = await fetch(`${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  if (!res.ok) {
    console.error('[wa] sendMessage failed', res.status, await res.text());
    return null;
  }
  const data = await res.json().catch(() => ({}));
  return (data as { idMessage?: string }).idMessage ?? null;
}

/** Sends from the bot and saves it as the bot's message. */
async function sendAndLog(chatId: string, userId: string | null, text: string) {
  const id = await sendMessage(chatId, text);
  if (id) await saveMessage({ chat_id: chatId, user_id: userId, sender: 'bot', text, type: 'text', wa_message_id: id });
}

// ── Messages ─────────────────────────────────────────────────────────────────

type Kind = 'text' | 'image' | 'other';

/** The message's text, type and media link, whatever its Green API shape. */
function readMessage(m: any): { text: string | null; type: Kind; mediaUrl: string | null } {
  switch (m?.typeMessage) {
    case 'textMessage':
      return { text: m.textMessageData?.textMessage ?? null, type: 'text', mediaUrl: null };
    case 'extendedTextMessage':
      return { text: m.extendedTextMessageData?.text ?? null, type: 'text', mediaUrl: null };
    case 'quotedMessage':
      return { text: m.extendedTextMessageData?.text ?? null, type: 'text', mediaUrl: null };
    case 'imageMessage':
      return { text: m.fileMessageData?.caption || null, type: 'image', mediaUrl: m.fileMessageData?.downloadUrl ?? null };
    default:
      // Voice, video, sticker, document, poll…: kept with their kind and any caption.
      return {
        text: m?.fileMessageData?.caption || (m?.typeMessage ? `[${m.typeMessage}]` : null),
        type: 'other',
        mediaUrl: m?.fileMessageData?.downloadUrl ?? null,
      };
  }
}

interface MessageRow {
  chat_id: string;
  user_id: string | null;
  sender: 'client' | 'coach' | 'bot';
  sender_phone?: string | null;
  sender_name?: string | null;
  text: string | null;
  type: Kind;
  media_url?: string | null;
  wa_message_id: string | null;
  created_at?: string;
}

async function saveMessage(row: MessageRow) {
  const { error } = await supabase.from('whatsapp_messages').upsert(row, { onConflict: 'wa_message_id', ignoreDuplicates: true });
  if (error) console.error('[wa] save failed', error.message);
}

/** "972501234567@c.us" → "972501234567"; "050-1234567" → "972501234567". */
function digits(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/@.*$/, '').replace(/\D/g, '');
  return d.startsWith('0') ? `972${d.slice(1)}` : d;
}

// Our numbers, read at most once a minute.
let coachCache: { at: number; phones: Set<string> } | null = null;
async function coachPhones(): Promise<Set<string>> {
  if (coachCache && Date.now() - coachCache.at < 60_000) return coachCache.phones;
  const { data } = await supabase.from('bot_settings').select('value').eq('key', 'coach_phones').maybeSingle();
  const list = Array.isArray(data?.value) ? (data!.value as string[]) : [];
  coachCache = { at: Date.now(), phones: new Set(list.map(digits)) };
  return coachCache.phones;
}

// ── The work, after Green API already has its 200 ────────────────────────────

async function handle(body: any) {
  const type: string = body.typeWebhook;
  const chatId: string = body.senderData?.chatId ?? '';
  const senderPhone = digits(body.senderData?.sender);
  const senderName: string | null = body.senderData?.senderName || body.senderData?.chatName || null;
  const msg = readMessage(body.messageData);
  const waId: string | null = body.idMessage ?? null;
  const at = body.timestamp ? new Date(body.timestamp * 1000).toISOString() : undefined;

  // How the test group's id is found: it's in this line in the function's logs.
  console.log(JSON.stringify({ type, chatId, sender: senderPhone, senderName, chatName: body.senderData?.chatName, text: msg.text }));

  const isTest = !!TEST_GROUP_ID && chatId === TEST_GROUP_ID;
  const { data: group } = await supabase
    .from('whatsapp_groups')
    .select('chat_id, user_id, bot_enabled, draft_mode')
    .eq('chat_id', chatId)
    .maybeSingle();
  // A chat that isn't a trainee's group (and isn't the test group): nothing is kept.
  if (!group && !isTest) return;
  const userId: string | null = group?.user_id ?? null;

  // Who wrote it.
  let sender: MessageRow['sender'];
  if (type === 'outgoingAPIMessageReceived') sender = 'bot'; // sent through the API (normally saved when sent; a duplicate is skipped)
  else if (type === 'outgoingMessageReceived') sender = 'coach'; // typed by a person on the bot's own phone
  else sender = (await coachPhones()).has(senderPhone) ? 'coach' : 'client';

  await saveMessage({
    chat_id: chatId,
    user_id: userId,
    sender,
    sender_phone: senderPhone || null,
    sender_name: senderName,
    text: msg.text,
    type: msg.type,
    media_url: msg.mediaUrl,
    wa_message_id: waId,
    ...(at ? { created_at: at } : {}),
  });

  // Stage 1: answers only in the test group, and never to itself.
  if (isTest && type === 'incomingMessageReceived' && msg.text) {
    await sendAndLog(chatId, userId, `קיבלתי (${sender === 'coach' ? 'מאמן' : 'לקוח'}): ${msg.text}`);
  }
}

Deno.serve(async (req) => {
  // Green API sends webhookUrlToken in the Authorization header (taken with or without "Bearer ").
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!WEBHOOK_TOKEN || auth !== WEBHOOK_TOKEN) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  // Messages only (in, typed on the bot's phone, or sent by the API); state and status hooks are ignored.
  const wanted = ['incomingMessageReceived', 'outgoingMessageReceived', 'outgoingAPIMessageReceived'];
  if (!wanted.includes(body?.typeWebhook)) return new Response('ignored', { status: 200 });

  // 200 right away, or Green API sends it again; the work goes on after the answer.
  EdgeRuntime.waitUntil(
    handle(body).catch((err) => console.error('[wa] handle failed', err instanceof Error ? err.message : err)),
  );
  return new Response('ok', { status: 200 });
});
