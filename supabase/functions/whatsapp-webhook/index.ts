// Supabase Edge Function: whatsapp-webhook
//
// Green API (unofficial WhatsApp, the bot's own number) posts every message
// here. Every message in a known group is saved with who sent it (client /
// coach / bot). The bot doesn't answer in real groups yet. In the test group it
// answers with Claude (brain.ts), as if everyone there were the client; without
// ANTHROPIC_API_KEY it only answers "קיבלתי".
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
import { brainReady, composeReply } from './brain.ts';

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

// ── Voice notes → text (OpenAI; Claude doesn't take audio) ─────────────────────

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

/** The voice note's words, or null if it couldn't be transcribed. */
async function transcribe(url: string, mime: string | undefined): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const audio = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
  if (!audio) return null;
  for (const model of ['gpt-4o-transcribe', 'whisper-1']) {
    const form = new FormData();
    form.append('file', new File([audio], 'voice.ogg', { type: mime || 'audio/ogg' }));
    form.append('model', model);
    form.append('language', 'he');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    }).catch(() => null);
    if (res?.ok) {
      const { text } = (await res.json()) as { text?: string };
      return text?.trim() || null;
    }
    console.error('[wa] transcribe failed', model, res?.status, res ? await res.text() : '');
  }
  return null;
}

/** Marks the chat's messages as read (blue ticks). */
async function readChat(chatId: string) {
  const res = await fetch(`${GREEN_API_URL}/waInstance${ID_INSTANCE}/readChat/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId }),
  }).catch(() => null);
  if (!res?.ok) console.error('[wa] readChat failed', res?.status);
}

/** Shows "typing…" in the chat for `ms` (Green API takes 1–20 s). */
async function sendTyping(chatId: string, ms: number) {
  const typingTime = Math.min(Math.max(Math.round(ms), 1000), 20000);
  const res = await fetch(`${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendTyping/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, typingTime }),
  }).catch(() => null);
  if (!res?.ok) console.error('[wa] sendTyping failed', res?.status);
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
    case 'audioMessage':
      // A voice note: its text comes from transcribe() below.
      return { text: null, type: 'other', mediaUrl: m.fileMessageData?.downloadUrl ?? null };
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

  // A voice note is kept (and answered) as its words.
  if (body.messageData?.typeMessage === 'audioMessage' && msg.mediaUrl) {
    const words = await transcribe(msg.mediaUrl, body.messageData?.fileMessageData?.mimeType);
    msg.text = words ? `[הודעה קולית] ${words}` : '[הודעה קולית שלא הצלחנו לתמלל]';
  }

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

  // Answers only in the test group for now, and never to itself.
  if (isTest && type === 'incomingMessageReceived' && msg.text) {
    if (!brainReady()) {
      await sendAndLog(chatId, userId, `קיבלתי (${sender === 'coach' ? 'מאמן' : 'לקוח'}): ${msg.text}`);
      return;
    }
    // A conversation already going (the client wrote within 20 s of the bot's last
    // message) gets a quick answer; a new one waits, like a person picking up the phone.
    const { data: lastBot } = await supabase
      .from('whatsapp_messages')
      .select('created_at')
      .eq('chat_id', chatId)
      .eq('sender', 'bot')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const sentAt = at ? new Date(at).getTime() : Date.now();
    const live = !!lastBot && sentAt - new Date(lastBot.created_at).getTime() <= LIVE_GAP_MS;
    const wait = live ? LIVE_WAIT_MS : BURST_WAIT_MS;

    // Messages in a row get one answer: wait, and if another one came in, that one answers.
    await sleep(wait);
    const { data: newer } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('chat_id', chatId)
      .neq('sender', 'bot')
      .gte('created_at', at ?? new Date(Date.now() - wait).toISOString())
      .neq('wa_message_id', waId ?? '')
      .limit(1);
    if (newer?.length) return;

    // Seen (blue ticks), then "typing…" while the answer is written.
    await readChat(chatId);
    await sendTyping(chatId, 8000);
    // In the test group everyone plays the client.
    const parts = await composeReply(supabase, chatId, userId, msg.text, true);
    for (const [i, part] of parts.entries()) {
      // Each message is "typed" for about as long as it would take a person (10 characters a second).
      const typing = Math.min(Math.max(part.length * 100, 1500), live ? 4000 : 8000);
      if (i) await sleep(1200);
      await sendTyping(chatId, typing);
      await sleep(i ? typing : Math.min(typing, 2500)); // the first one was already "being typed" while composing
      await sendAndLog(chatId, userId, part);
    }
  }
}

const BURST_WAIT_MS = 15_000; // a new conversation
const LIVE_GAP_MS = 20_000; // the client answered the bot within this → the conversation is live
const LIVE_WAIT_MS = 3_000; // … and gets an answer within about 10 s
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
