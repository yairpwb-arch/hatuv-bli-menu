import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { applySequentialGate } from '@/lib/contentGate';

export type TabKey = 'home' | 'workouts' | 'content' | 'progress';

/** Which tabs show a dot. Add a key here to badge another tab. */
export type TabBadges = Partial<Record<TabKey, boolean>>;

const seenKey = (userId: string) => `seenUnlockedVideos:${userId}`;

function readSeen(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(userId: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...ids]));
  } catch {
    // Storage blocked — the dot just won't be remembered across launches.
  }
}

/**
 * - content: a video unlocked since the trainee last opened the content tab
 *   and not yet marked watched.
 * Re-checked on every navigation so the dots clear as soon as the trainee acts.
 */
export function useTabBadges(): TabBadges {
  const { user, currentDay, currentWeek } = useAuth();
  const { pathname } = useLocation();
  const [badges, setBadges] = useState<TabBadges>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [contentRes, progressRes] = await Promise.all([
        supabase
          .from('program_content')
          .select('id, content_type, week_range, unlock_day')
          .filter('archived_at', 'is', null)
          .order('sort_order', { ascending: true }),
        supabase.from('content_progress').select('content_id').eq('user_id', user.id),
      ]);
      if (cancelled) return;

      const completed = new Set((progressRes.data || []).map((p) => p.content_id));
      const unlockedVideos = applySequentialGate(
        (contentRes.data || []).map((item) => ({
          ...item,
          dateUnlocked: currentDay >= item.unlock_day,
          isCompleted: completed.has(item.id),
        })),
      )
        .filter((item) => item.isUnlocked && item.content_type === 'video')
        .map((item) => item.id);

      let seen = readSeen(user.id);
      // First run, or the trainee is on the content tab right now: everything
      // currently open counts as seen.
      if (!seen || pathname.startsWith('/app/content')) {
        seen = new Set([...(seen ?? []), ...unlockedVideos]);
        writeSeen(user.id, seen);
      }
      const hasNewVideo = unlockedVideos.some((id) => !seen!.has(id) && !completed.has(id));

      setBadges({
        content: hasNewVideo,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, currentDay, currentWeek, pathname]);

  return badges;
}
