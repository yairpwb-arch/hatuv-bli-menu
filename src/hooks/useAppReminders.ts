import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCalendar } from '@/hooks/useCalendar';
import { listenForNavigate } from '@/lib/appNavigate';
import { CALENDAR_CHANGED, cancelBedtimeReminders, listenForReminderTaps, scheduleActivityReminders } from '@/lib/localReminders';

// notification_settings.prefs isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Mounted once inside the router: delivers notification taps to the right
 * screen, and keeps the coming week's workout and walk reminders in step with
 * the calendar (re-run when the app opens and when a time or day changes).
 */
export function useAppReminders(userId: string | undefined) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [from, to] = useMemo(() => [new Date(), addDays(new Date(), 7)], []);
  const { events, isLoading, reload } = useCalendar(userId, from, to);

  useEffect(() => listenForNavigate((path) => navigate(path)), [navigate]);

  useEffect(() => {
    let off: (() => void) | undefined;
    listenForReminderTaps().then((f) => (off = f));
    return () => off?.();
  }, []);

  // The bedtime "daily summary" nudges are gone: clear what older versions scheduled.
  useEffect(() => {
    void cancelBedtimeReminders();
  }, []);

  // Coming back from a screen that can move things, or a change made on it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    const was = lastPath.current;
    lastPath.current = pathname;
    if (was !== pathname && (was.startsWith('/app/calendar') || was.startsWith('/app/workouts'))) void reload();
  }, [pathname, reload]);
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(CALENDAR_CHANGED, onChange);
    return () => window.removeEventListener(CALENDAR_CHANGED, onChange);
  }, [reload]);

  useEffect(() => {
    if (!userId || isLoading) return;
    (async () => {
      const prefs = await db.from('notification_settings').select('prefs').eq('user_id', userId).maybeSingle();
      await scheduleActivityReminders(events, prefs.data?.prefs?.workout_walk !== false);
    })();
  }, [userId, events, isLoading]);
}
