import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/integrations/supabase/client';

export interface StepEntry {
  date: string; // yyyy-MM-dd, local day
  steps: number;
}

// The generated Supabase types don't include these RPCs yet.
type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
const rpc = (fn: string, args?: Record<string, unknown>) => (supabase as unknown as RpcClient).rpc(fn, args);

// Per-device token that lets the native background code upload steps without
// the user's login session (which expires after ~1 hour). Keyed by user so a
// different account on the same phone gets its own token.
const tokenKey = (userId: string) => `step_sync_token_${userId}`;

async function readToken(userId: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: tokenKey(userId) });
    return value || null;
  } catch {
    return null;
  }
}

async function registerToken(userId: string): Promise<string | null> {
  const { data, error } = await rpc('register_step_sync_token');
  if (error || typeof data !== 'string') return null;
  await Preferences.set({ key: tokenKey(userId), value: data }).catch(() => undefined);
  return data;
}

const inFlight = new Map<string, Promise<string | null>>();

export function getOrCreateStepSyncToken(userId: string): Promise<string | null> {
  let pending = inFlight.get(userId);
  if (!pending) {
    pending = (async () => (await readToken(userId)) ?? (await registerToken(userId)))();
    inFlight.set(userId, pending);
    pending.finally(() => inFlight.delete(userId)).catch(() => undefined);
  }
  return pending;
}

// Plain upsert with the logged-in session — used only if the sync RPCs aren't
// available (e.g. the database migration hasn't been applied yet), so saving
// steps from the open app never breaks.
async function directUpsert(userId: string, entries: StepEntry[]): Promise<boolean> {
  const { error } = await (supabase as unknown as {
    from: (t: string) => { upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }> };
  })
    .from('steps_log')
    .upsert(
      entries.map((e) => ({ user_id: userId, date: e.date, steps: e.steps, updated_at: new Date().toISOString() })),
      { onConflict: 'user_id,date' }
    );
  return !error;
}

/** Uploads step counts; a day's stored value only ever increases server-side. */
export async function syncStepEntries(userId: string, entries: StepEntry[]): Promise<boolean> {
  const valid = entries.filter((e) => e.steps > 0);
  if (valid.length === 0) return true;

  let token = await getOrCreateStepSyncToken(userId);
  if (!token) return directUpsert(userId, valid);

  const call = (t: string) => rpc('sync_steps_with_token', { p_token: t, p_entries: valid });

  let { error } = await call(token);
  if (error && /invalid sync token/i.test(error.message ?? '')) {
    await Preferences.remove({ key: tokenKey(userId) }).catch(() => undefined);
    token = await registerToken(userId);
    if (!token) return directUpsert(userId, valid);
    ({ error } = await call(token));
  }
  return error ? directUpsert(userId, valid) : true;
}
