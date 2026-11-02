import { useEffect, useMemo, useRef, useState } from 'react';
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
  // The coming week from today; moves on when the app comes back on a later day.
  const [today, setToday] = useState(() => new Date().toDateString());
  const todayRef = useRef(today);
  todayRef.current = today;
  const [from, to] = useMemo(() => [new Date(), addDays(new Date(), 7)], [today]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Back in the foreground: rebuild, in case anything changed meanwhile.
  useEffect(() => {
    let handle: { remove: () => void } | undefined;
    let gone = false;
    import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          const now = new Date().toDateString();
          // A new day moves the week (and reloads with it); the same day just reloads.
          if (todayRef.current === now) void reload();
          else setToday(now);
        }),
      )
      .then((h) => {
        if (gone) void h.remove();
        else handle = h;
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      handle?.remove();
    };
  }, [reload]);
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(CALENDAR_CHANGED, onChange);
    return () => window.removeEventListener(CALENDAR_CHANGED, onChange);
  }, [reload]);

  useEffect(() => {
    if (!userId || isLoading) return;
    (async () => {
      // Off with the main notifications switch, or with its own one in Settings.
      const { data } = await db.from('notification_settings').select('notifications_enabled, prefs').eq('user_id', userId).maybeSingle();
      const on = data?.notifications_enabled !== false && data?.prefs?.workout_walk !== false;
      await scheduleActivityReminders(events, on);
    })();
  }, [userId, events, isLoading]);
}
