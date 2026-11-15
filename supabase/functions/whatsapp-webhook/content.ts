// The latest stage's content (the videos and guides that opened on the same day, bonus ones aside):
// what's still unwatched, for the bot's two reminders (bot-jobs/talk.ts), and marking it watched
// when the trainee tells the bot he saw it ([צפה_בתכנים], brain.ts).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, any>;

/** He said he watched the new content: the app marks it (if the app hasn't yet). */
export const WATCHED_TAG = '[צפה_בתכנים]';

/** The trainee's program day (day 1 = the start date), or null. */
async function programDay(db: SupabaseClient, userId: string): Promise<number | null> {
  const { data } = await db.from('profiles').select('start_date').eq('id', userId).maybeSingle();
  if (!data?.start_date) return null;
  return Math.floor((Date.now() - new Date(`${data.start_date}T00:00:00`).getTime()) / 86400_000) + 1;
}

/** The stage that opened last for him: its items, which are unwatched, and how many days ago it opened. */
export async function latestStage(db: SupabaseClient, userId: string) {
  const day = await programDay(db, userId);
  if (day == null || day < 1) return null;
  const { data: opened } = await db.from('program_content').select('id, title, week_range, unlock_day, content_type')
    .is('archived_at', null).eq('is_bonus', false).lt('part_number', 5).lte('unlock_day', day);
  const list = (opened ?? []) as Row[];
  if (!list.length) return null;
  const lastDay = Math.max(...list.map((c) => c.unlock_day));
  const items = list.filter((c) => c.unlock_day === lastDay);
  const { data: seen } = await db.from('content_progress').select('content_id').eq('user_id', userId).in('content_id', items.map((c) => c.id));
  const seenIds = new Set(((seen ?? []) as Row[]).map((r) => r.content_id));
  return {
    week: items[0].week_range as string,
    daysAgo: day - lastDay,
    items,
    unwatched: items.filter((c) => !seenIds.has(c.id)),
    /** The stage's videos he hasn't watched (the reminders are about these). */
    unwatchedVideos: items.filter((c) => c.content_type === 'video' && !seenIds.has(c.id)),
  };
}

/**
 * He told the bot he watched the new content: marked watched in the app, so what it opens
 * (a walk, a workout) opens too. Only for a stage that opened in the last 3 days.
 */
export async function markLatestWatched(db: SupabaseClient, userId: string | null): Promise<number> {
  if (!userId) return 0;
  const stage = await latestStage(db, userId);
  if (!stage || stage.daysAgo > 3 || !stage.unwatched.length) return 0;
  const { error } = await db.from('content_progress').upsert(
    stage.unwatched.map((c) => ({ user_id: userId, content_id: c.id })),
    { onConflict: 'user_id,content_id', ignoreDuplicates: true },
  );
  if (error) {
    console.error('[content] mark watched failed', error.message);
    return 0;
  }
  console.log(`[content] ${userId}: ${stage.unwatched.length} items of ${stage.week} marked watched (said so in the group)`);
  return stage.unwatched.length;
}
