// Supabase Edge Function: whatsapp-webhook
//
// Green API (unofficial WhatsApp, the bot's own number) posts every message
// here. Every message in a known group is saved with who sent it (client /
// coach / bot). The bot answers only in the test group (TEST_GROUP_ID); in a
// real group it never answers or sends anything.
//
// How it answers a client:
//   - a live conversation (the bot wrote in the last 20 minutes): after ~10 s,
//     messages in a row answered together;
//   - a new one: it waits 5 minutes (bot_pending_replies, answered by bot-jobs
//     'replies'), and stays quiet if one of us answered meanwhile.
// Roles in the test group come from bot_settings.test_group (a coach can play
// the client there); alerts go to its alert_phones.
//
// The bot lives only in WhatsApp. The app is just its data source.
//
// Secrets (Supabase → Edge Functions → Secrets; never in code):
//   GREEN_API_URL, GREEN_ID_INSTANCE, GREEN_API_TOKEN, WEBHOOK_TOKEN, TEST_GROUP_ID,
//   ANTHROPIC_API_KEY, OPENAI_API_KEY
// verify_jwt is off (supabase/config.toml): Green API has no Supabase JWT; WEBHOOK_TOKEN instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { brainReady, composeReply } from './brain.ts';
import { afterReply, coachTurn, reviewCoaches } from './workouts.ts';
import { logUsage } from '../_shared/botkit.ts';
import { TEST_GROUP_ID, alertHandoff, coachPhones, deliver, digits, readChat, sendTyping, sleep } from '../_shared/wa.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const WEBHOOK_TOKEN = Deno.env.get('WEBHOOK_TOKEN') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

/** The bot wrote within this → the conversation is live. */
export const LIVE_MS = 20 * 60_000;
/** A live conversation: answered after this (messages in a row become one answer). */
const LIVE_WAIT_MS = 10_000;
/** A new conversation: the bot waits this long for one of us first. */
const NEW_WAIT_MS = 5 * 60_000;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ── Voice notes → text (OpenAI; Claude doesn't take audio) ─────────────────────

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
      // Voice notes are Opus at about 16 kbit/s: ~120 KB a minute (an estimate, for the cost).
      await logUsage(supabase, { kind: 'transcribe', model, minutes: audio.size / 120_000 });
      return text?.trim() || null;
    }
    console.error('[wa] transcribe failed', model, res?.status, res ? await res.text() : '');
  }
  return null;
}

// ── Messages ─────────────────────────────────────────────────────────────────

type Kind = 'text' | 'image' | 'other';

/** The message's text, type and media link, whatever its Green API shape. */
function readMessage(m: any): { text: string | null; type: Kind; mediaUrl: string | null } {
  switch (m?.typeMessage) {
    case 'textMessage':
      return { text: m.textMessageData?.textMessage ?? null, type: 'text', mediaUrl: null };
    case 'extendedTextMessage':
    case 'quotedMessage':
      return { text: m.extendedTextMessageData?.text ?? null, type: 'text', mediaUrl: null };
    case 'imageMessage':
      return { text: m.fileMessageData?.caption || null, type: 'image', mediaUrl: m.fileMessageData?.downloadUrl ?? null };
    case 'audioMessage':
      // A voice note: its text comes from transcribe().
      return { text: null, type: 'other', mediaUrl: m.fileMessageData?.downloadUrl ?? null };
    default:
      // Video, sticker, document, poll…: kept with their kind and any caption.
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

// ── The work, after Green API already has its 200 ────────────────────────────

async function handle(body: any) {
  const type: string = body.typeWebhook;
  const chatId: string = body.senderData?.chatId ?? '';
  const senderPhone = digits(body.senderData?.sender);
  const senderName: string | null = body.senderData?.senderName || body.senderData?.chatName || null;
  const msg = readMessage(body.messageData);
  const waId: string | null = body.idMessage ?? null;
  const at = body.timestamp ? new Date(body.timestamp * 1000).toISOString() : new Date().toISOString();

  // How a group's id is found: it's in this line in the function's logs.
  console.log(JSON.stringify({ type, chatId, sender: senderPhone, senderName, chatName: body.senderData?.chatName, text: msg.text }));

  // A coach writing the bot in private: talking a workout review over (for now: the test group's coach).
  if (chatId.endsWith('@c.us')) {
    if (type !== 'incomingMessageReceived' || !brainReady() || !(await reviewCoaches(supabase)).has(senderPhone)) return;
    if (body.messageData?.typeMessage === 'audioMessage' && msg.mediaUrl) {
      msg.text = await transcribe(msg.mediaUrl, body.messageData?.fileMessageData?.mimeType);
    }
    if (!msg.text) return;
    await saveMessage({ chat_id: chatId, user_id: null, sender: 'coach', sender_phone: senderPhone, sender_name: senderName, text: msg.text, type: msg.type, media_url: msg.mediaUrl, wa_message_id: waId, created_at: at });
    // Messages in a row are answered once, by the last one ("מאשר" + "תעדכן אותו" = one answer).
    await sleep(LIVE_WAIT_MS);
    const { data: newer } = await supabase.from('whatsapp_messages').select('id').eq('chat_id', chatId).eq('sender', 'coach').gt('created_at', at).limit(1);
    if ((newer ?? []).length) return;
    await readChat(chatId);
    await sendTyping(chatId, 6000);
    await coachTurn(supabase, chatId, msg.text);
    return;
  }

  const isTest = !!TEST_GROUP_ID && chatId === TEST_GROUP_ID;
  const { data: group } = await supabase.from('whatsapp_groups').select('chat_id, user_id, bot_enabled, draft_mode').eq('chat_id', chatId).maybeSingle();
  // A chat that isn't a trainee's group (and isn't the test group): nothing is kept.
  if (!group && !isTest) return;
  const userId: string | null = group?.user_id ?? null;

  // A voice note is kept (and answered) as its words.
  if (body.messageData?.typeMessage === 'audioMessage' && msg.mediaUrl) {
    const words = await transcribe(msg.mediaUrl, body.messageData?.fileMessageData?.mimeType);
    msg.text = words ? `[הודעה קולית] ${words}` : '[הודעה קולית שלא הצלחנו לתמלל]';
  }
  // A photo without a caption still has content to answer.
  if (msg.type === 'image' && !msg.text) msg.text = '[תמונה]';

  // Who wrote it.
  let sender: MessageRow['sender'];
  if (type === 'outgoingAPIMessageReceived') sender = 'bot'; // sent through the API (normally saved when sent)
  else if (type === 'outgoingMessageReceived') sender = 'coach'; // typed by a person on the bot's own phone
  else sender = (await coachPhones(supabase, chatId)).has(senderPhone) ? 'coach' : 'client';

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
    created_at: at,
  });

  // The bot answers only the client, and only in the test group.
  if (!isTest || type !== 'incomingMessageReceived' || sender !== 'client' || !msg.text || !brainReady()) return;

  const { data: lastBot } = await supabase
    .from('whatsapp_messages')
    .select('created_at')
    .eq('chat_id', chatId)
    .eq('sender', 'bot')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const live = !!lastBot && new Date(at).getTime() - new Date(lastBot.created_at).getTime() <= LIVE_MS;

  if (!live) {
    // A new conversation: answered in 5 minutes by bot-jobs, unless one of us answers first.
    // The first message sets the time; more messages meanwhile are answered with it.
    await supabase
      .from('bot_pending_replies')
      .upsert({ chat_id: chatId, user_id: userId, first_at: at, due_at: new Date(new Date(at).getTime() + NEW_WAIT_MS).toISOString() }, { onConflict: 'chat_id', ignoreDuplicates: true });
    return;
  }

  // A live conversation: answer in ~10 s; a newer message in the meantime takes over.
  await sleep(LIVE_WAIT_MS);
  const { data: newer } = await supabase
    .from('whatsapp_messages')
    .select('sender')
    .eq('chat_id', chatId)
    .neq('sender', 'bot')
    .gt('created_at', at)
    .limit(5);
  if ((newer ?? []).some((m: { sender: string }) => m.sender === 'client')) return; // the newer one answers
  if ((newer ?? []).some((m: { sender: string }) => m.sender === 'coach')) return; // one of us took over

  await readChat(chatId);
  await sendTyping(chatId, 8000);
  const { parts, handoff, review } = await composeReply(supabase, chatId, userId, msg.text);
  // The test group always gets the answer; a real group in draft mode would get only our alert.
  const toGroup = isTest || !group?.draft_mode;
  if (handoff) await alertHandoff(supabase, chatId, userId, parts.join('\n'), toGroup);
  if (toGroup) await deliver(supabase, chatId, userId, parts, true);
  if (toGroup) await afterReply(supabase, chatId, userId, review);
}

Deno.serve(async (req) => {
  // Green API sends webhookUrlToken in the Authorization header (taken with or without "Bearer ").
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!WEBHOOK_TOKEN || auth !== WEBHOOK_TOKEN) return new Response('unauthorized', { status: 401 });

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
  EdgeRuntime.waitUntil(handle(body).catch((err) => console.error('[wa] handle failed', err instanceof Error ? err.message : err)));
  return new Response('ok', { status: 200 });
});
