// WhatsApp (Green API) for the bot's functions: sending, typing, read marks,
// the bot's own messages saved, roles and alert numbers (with the test group's
// own settings), and the hand-off alert.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const GREEN_API_URL = Deno.env.get('GREEN_API_URL') ?? '';
const ID_INSTANCE = Deno.env.get('GREEN_ID_INSTANCE') ?? '';
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN') ?? '';
export const TEST_GROUP_ID = Deno.env.get('TEST_GROUP_ID') ?? '';

type Row = Record<string, any>;
const green = (method: string) => `${GREEN_API_URL}/waInstance${ID_INSTANCE}/${method}/${API_TOKEN}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "972501234567@c.us" → "972501234567"; "050-1234567" → "972501234567". */
export function digits(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/@.*$/, '').replace(/\D/g, '');
  return d.startsWith('0') ? `972${d.slice(1)}` : d;
}

export async function sendMessage(chatId: string, message: string): Promise<string | null> {
  const res = await fetch(green('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  }).catch(() => null);
  if (!res?.ok) {
    console.error('[wa] sendMessage failed', res?.status, res ? await res.text() : '');
    return null;
  }
  const data = (await res.json().catch(() => ({}))) as { idMessage?: string };
  return data.idMessage ?? null;
}

/** Marks the chat's messages as read (blue ticks). */
export async function readChat(chatId: string) {
  const res = await fetch(green('readChat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId }),
  }).catch(() => null);
  if (!res?.ok) console.error('[wa] readChat failed', res?.status);
}

/** Shows "typing…" in the chat for `ms` (Green API takes 1–20 s). */
export async function sendTyping(chatId: string, ms: number) {
  const typingTime = Math.min(Math.max(Math.round(ms), 1000), 20000);
  const res = await fetch(green('sendTyping'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, typingTime }),
  }).catch(() => null);
  if (!res?.ok) console.error('[wa] sendTyping failed', res?.status);
}

/** Sends from the bot and saves it as the bot's message. */
export async function sendAndLog(db: SupabaseClient, chatId: string, userId: string | null, text: string) {
  const id = await sendMessage(chatId, text);
  if (!id) return false;
  const { error } = await db
    .from('whatsapp_messages')
    .upsert({ chat_id: chatId, user_id: userId, sender: 'bot', text, type: 'text', wa_message_id: id }, { onConflict: 'wa_message_id', ignoreDuplicates: true });
  if (error) console.error('[wa] save failed', error.message);
  return true;
}

/** The bot's messages, one after the other, each "typed" for about as long as a person would (10 characters a second). */
export async function deliver(db: SupabaseClient, chatId: string, userId: string | null, parts: string[], quick = false) {
  for (const [i, part] of parts.entries()) {
    const typing = Math.min(Math.max(part.length * 100, 1500), quick ? 4000 : 8000);
    if (i) await sleep(1200);
    await sendTyping(chatId, typing);
    await sleep(i ? typing : Math.min(typing, 2500));
    await sendAndLog(db, chatId, userId, part);
  }
}

// ── Roles and alert numbers ───────────────────────────────────────────────────

let cache: { at: number; settings: Map<string, unknown> } | null = null;
async function settings(db: SupabaseClient) {
  if (cache && Date.now() - cache.at < 60_000) return cache.settings;
  const { data } = await db.from('bot_settings').select('key, value').in('key', ['coach_phones', 'alert_phones', 'test_group']);
  cache = { at: Date.now(), settings: new Map(((data ?? []) as Row[]).map((r) => [r.key, r.value])) };
  return cache.settings;
}
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).map(digits) : []);

/**
 * Our numbers (a message from one of them is a coach's). The test group has its
 * own (bot_settings.test_group.coach_phones), so a coach can play the client there.
 */
export async function coachPhones(db: SupabaseClient, chatId: string): Promise<Set<string>> {
  const s = await settings(db);
  const test = chatId === TEST_GROUP_ID ? (s.get('test_group') as Row | undefined) : undefined;
  return new Set(list(test?.coach_phones ?? s.get('coach_phones')));
}

/** Where alerts go; the test group's own list while testing. */
export async function alertPhones(db: SupabaseClient, chatId: string): Promise<string[]> {
  const s = await settings(db);
  const test = chatId === TEST_GROUP_ID ? (s.get('test_group') as Row | undefined) : undefined;
  return list(test?.alert_phones ?? s.get('alert_phones'));
}

/**
 * The bot marked [העבר]: a private message to us with the client's name, what
 * they wrote, and what the bot answered. Kept in bot_handoffs too.
 */
export async function alertHandoff(db: SupabaseClient, chatId: string, userId: string | null, botText: string, sentToGroup: boolean) {
  const [{ data: profile }, { data: recent }] = await Promise.all([
    userId ? db.from('profiles').select('full_name').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
    db.from('whatsapp_messages').select('sender, text').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10),
  ]);
  // The client's last messages (after the bot's reply that's being alerted on), oldest first.
  const theirs: string[] = [];
  let seenClient = false;
  for (const m of (recent ?? []) as Row[]) {
    if (m.sender === 'client') {
      seenClient = true;
      if (m.text) theirs.unshift(m.text);
    } else if (seenClient) break;
  }
  const clientText = theirs.join('\n');
  const name = (profile as Row | null)?.full_name || 'לקוח';
  await db.from('bot_handoffs').insert({ chat_id: chatId, user_id: userId, client_text: clientText, bot_text: botText, sent_to_group: sentToGroup });
  const alert =
    `⚠️ העברה מהבוט: ${name}${chatId === TEST_GROUP_ID ? ' (קבוצת ניסיון)' : ''}\n\n` +
    `הלקוח כתב:\n${clientText || '—'}\n\n` +
    `${sentToGroup ? 'הבוט ענה' : 'הבוט היה עונה (מצב טיוטה, לא נשלח)'}:\n${botText || '—'}`;
  for (const phone of await alertPhones(db, chatId)) await sendMessage(`${phone}@c.us`, alert);
}
