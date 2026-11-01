import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Answers, PermissionKey, PermissionResult } from '@/lib/onboarding';

export interface OnboardingRow {
  user_id: string;
  answers: Answers;
  current_step: string | null;
  questionnaire_completed_at: string | null;
  intro_video_watched_at: string | null;
  permissions: Partial<Record<PermissionKey, PermissionResult>>;
  permissions_completed_at: string | null;
}

export type OnboardingStage = 'questionnaire' | 'video' | 'permissions' | 'done';

// onboarding_responses isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from('onboarding_responses');

/**
 * Where a trainee is in onboarding. Any read error resolves to "done" —
 * never lock a trainee out of the app because of a backend hiccup.
 */
export function stageOf(row: OnboardingRow | null, hasIntroVideo: boolean): OnboardingStage {
  if (!row || !row.questionnaire_completed_at) return 'questionnaire';
  if (hasIntroVideo && !row.intro_video_watched_at) return 'video';
  if (!row.permissions_completed_at) return 'permissions';
  return 'done';
}

export function useOnboarding(userId: string | undefined) {
  const [row, setRow] = useState<OnboardingRow | null>(null);
  const [introVideoUrl, setIntroVideoUrl] = useState('');
  const [stage, setStage] = useState<OnboardingStage | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [rowRes, videoRes] = await Promise.all([
      table().select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', 'onboarding_video_url').maybeSingle(),
    ]);
    if (rowRes.error) {
      console.warn('[onboarding] status unavailable, letting the trainee in:', rowRes.error.message);
      setStage('done');
      return;
    }
    const url = (videoRes.data?.value || '').trim();
    setRow(rowRes.data);
    setIntroVideoUrl(url);
    setStage(stageOf(rowRes.data, !!url));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Upsert part of the row; keeps local state in step. */
  const save = useCallback(
    async (patch: Partial<OnboardingRow>) => {
      if (!userId) return false;
      const next = { ...(row ?? { answers: {}, permissions: {} }), ...patch, user_id: userId } as OnboardingRow;
      setRow(next);
      const { error } = await table().upsert(
        { ...patch, user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) console.error('[onboarding] save failed:', error.message);
      return !error;
    },
    [userId, row],
  );

  const advance = useCallback(
    (nextRow: OnboardingRow) => setStage(stageOf(nextRow, !!introVideoUrl)),
    [introVideoUrl],
  );

  return { row, stage, introVideoUrl, save, advance, reload: load };
}
