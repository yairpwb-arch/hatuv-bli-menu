import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** What a video opens once it's watched (program_content.unlocks). */
export type ActivityUnlock = 'walk_1' | 'walk_2' | 'workout_1' | 'workout_2';

// These columns aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * What's open for this trainee: the walks and workouts whose video they've
 * marked watched. Which video opens what is data (program_content.unlocks), and
 * a workout day waits for one through workout_plan_days.unlocks_with.
 */
export function useActivityUnlocks(userId: string | undefined) {
  const query = useQuery({
    queryKey: ['activity-unlocks', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [content, progress] = await Promise.all([
        db.from('program_content').select('id, unlocks').not('unlocks', 'is', null).filter('archived_at', 'is', null),
        db.from('content_progress').select('content_id').eq('user_id', userId),
      ]);
      const watched = new Set(((progress.data ?? []) as { content_id: string }[]).map((p) => p.content_id));
      return ((content.data ?? []) as { id: string; unlocks: ActivityUnlock | null }[])
        .filter((c) => c.unlocks && watched.has(c.id))
        .map((c) => c.unlocks as ActivityUnlock);
    },
  });
  return { unlocked: new Set<string>(query.data ?? []), isLoading: !!userId && query.isLoading };
}
