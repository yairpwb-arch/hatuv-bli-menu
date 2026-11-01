import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useSleepSchedule } from '@/hooks/useSleepSchedule';
import { listenForNavigate } from '@/lib/appNavigate';
import { listenForReminderTaps, scheduleBedtimeReminders } from '@/lib/localReminders';

// notification_settings.prefs / daily_summaries aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Mounted once inside the router: delivers notification taps to the right
 * screen, and keeps this week's bedtime reminders in step with the sleep
 * hours (re-run whenever they change or the app opens).
 */
export function useAppReminders(userId: string | undefined) {
  const navigate = useNavigate();
  const { schedule } = useSleepSchedule(userId);

  useEffect(() => listenForNavigate((path) => navigate(path)), [navigate]);

  useEffect(() => {
    let off: (() => void) | undefined;
    listenForReminderTaps().then((f) => (off = f));
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [prefs, todays] = await Promise.all([
        db.from('notification_settings').select('prefs').eq('user_id', userId).maybeSingle(),
        db.from('daily_summaries').select('id').eq('user_id', userId).eq('summary_date', today).maybeSingle(),
      ]);
      await scheduleBedtimeReminders(schedule, {
        enabled: prefs.data?.prefs?.daily_summary !== false,
        skipDay: todays.data ? today : null,
      });
    })();
  }, [userId, schedule]);
}
