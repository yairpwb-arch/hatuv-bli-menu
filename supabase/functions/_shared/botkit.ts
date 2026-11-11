// Shared by the WhatsApp bot's functions: settings, embeddings, and the cost of
// every model call (bot_usage).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, any>;

/** US$ per million tokens: input, output, cache read, cache write. */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-opus-5-5': [4, 20, 0.2, 5],
  // OpenAI caches by itself: no write price; cached input is "cache read".
  'gpt-6.1-terra': [1, 5, 0.05, 0],
  'text-embedding-3-small': [0.02, 0, 0, 0],
};
/** OpenAI transcription, per minute of audio. */
const TRANSCRIBE_PER_MIN = 0.006;

export interface Usage {
  kind: 'reply' | 'profile' | 'embed' | 'transcribe' | 'eval' | 'judge' | 'review' | 'plan';
  model: string;
  chatId?: string | null;
  userId?: string | null;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** Transcription: minutes of audio (estimated). */
  minutes?: number;
}

export function costOf(u: Usage): number {
  if (u.kind === 'transcribe') return (u.minutes ?? 0) * TRANSCRIBE_PER_MIN;
  const key = Object.keys(PRICES).find((k) => u.model.startsWith(k));
  if (!key) return 0;
  const [i, o, r, w] = PRICES[key];
  return ((u.input ?? 0) * i + (u.output ?? 0) * o + (u.cacheRead ?? 0) * r + (u.cacheWrite ?? 0) * w) / 1_000_000;
}

export async function logUsage(db: SupabaseClient, u: Usage) {
  const { error } = await db.from('bot_usage').insert({
    kind: u.kind,
    model: u.model,
    chat_id: u.chatId ?? null,
    user_id: u.userId ?? null,
    input_tokens: u.input ?? 0,
    output_tokens: u.output ?? 0,
    cache_read_tokens: u.cacheRead ?? 0,
    cache_write_tokens: u.cacheWrite ?? 0,
    cost_usd: costOf(u),
  });
  if (error) console.error('[bot] usage not saved', error.message);
}

/** Usage from a Claude response. */
export const claudeUsage = (r: Row) => ({
  input: r?.usage?.input_tokens ?? 0,
  output: r?.usage?.output_tokens ?? 0,
  cacheRead: r?.usage?.cache_read_input_tokens ?? 0,
  cacheWrite: r?.usage?.cache_creation_input_tokens ?? 0,
});

/** A bot_settings value (text or JSON), or null. */
export async function setting<T = unknown>(db: SupabaseClient, key: string): Promise<T | null> {
  const { data } = await db.from('bot_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

// ── Embeddings (OpenAI; Claude has none) ──────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
export const EMBED_MODEL = 'text-embedding-3-small';

/** One vector per text (1536 numbers), or null if it couldn't be made. */
export async function embed(db: SupabaseClient, texts: string[], kind: Usage['kind'] = 'embed'): Promise<number[][] | null> {
  if (!OPENAI_API_KEY || texts.length === 0) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  }).catch(() => null);
  if (!res?.ok) {
    console.error('[bot] embed failed', res?.status, res ? await res.text() : '');
    return null;
  }
  const data = (await res.json()) as { data: { embedding: number[] }[]; usage?: { total_tokens?: number } };
  await logUsage(db, { kind, model: EMBED_MODEL, input: data.usage?.total_tokens ?? 0 });
  return data.data.map((d) => d.embedding);
}

/** pgvector's text form of a vector. */
export const vectorLiteral = (v: number[]) => `[${v.join(',')}]`;
