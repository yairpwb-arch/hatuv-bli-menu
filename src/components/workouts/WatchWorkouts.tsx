import { useCallback, useEffect, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { Activity, Check, Flame, HeartPulse, Watch, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { Card, Pill, PrimaryButton, SecondaryButton } from '@/components/ds';
import { successHaptic } from '@/lib/native';
import { showUndo } from '@/lib/undoToast';
import { unmarkActivity } from '@/lib/activityMarks';
import {
  KIND_LABELS, WatchWorkout, connectWatch, fetchWatchWorkouts, isWatchConnected, isWatchSupported,
  syncWatchWorkouts,
} from '@/lib/watchWorkouts';

/** Watch workouts for the trainee + connect/sync state. Syncs on mount only if already connected. */
export function useWatchWorkouts(userId: string | undefined) {
  const [workouts, setWorkouts] = useState<WatchWorkout[]>([]);
  const [connected, setConnected] = useState(() => (userId ? isWatchConnected(userId) : false));
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const since = new Date();
    since.setDate(since.getDate() - 60);
    setWorkouts(await fetchWatchWorkouts(userId, since));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      if (isWatchConnected(userId)) {
        try {
          await syncWatchWorkouts(userId);
        } catch (err) {
          console.warn('[watch] background sync failed', err);
        }
      }
      await refresh();
    })();
  }, [userId, refresh]);

  const connect = async () => {
    if (!userId) return;
    setIsBusy(true);
    try {
      const res = await connectWatch(userId);
      if (res === 'connected') {
        setConnected(true);
        const n = await syncWatchWorkouts(userId);
        await refresh();
        successHaptic();
        toast.success(n ? `השעון חובר. נמצאו ${n} אימונים מהחודש האחרון` : 'השעון חובר. אימונים חדשים ייכנסו אוטומטית');
      } else if (res === 'denied') {
        toast.error('לא ניתנה הרשאה. אפשר לאשר בהגדרות הבריאות של הטלפון');
      } else if (res === 'needs-health-connect') {
        toast('צריך להתקין את Health Connect ואז לנסות שוב');
      } else {
        toast('החיבור לשעון זמין באפליקציה בטלפון');
      }
    } catch (err) {
      console.error('[watch] connect failed', err);
      toast.error('החיבור נכשל, נסו שוב');
    } finally {
      setIsBusy(false);
    }
  };

  return { workouts, connected, isBusy, connect, refresh };
}

/* ── Connect card ─────────────────────────────────────────────────────────── */

export function WatchConnectCard({ connected, isBusy, onConnect }: { connected: boolean; isBusy: boolean; onConnect: () => void }) {
  if (!isWatchSupported()) return null;
  const store = Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect';
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-label text-muted-foreground">
        <Watch className="h-4 w-4 text-success" strokeWidth={2} />
        שעון מחובר דרך {store}. אימונים מהשעון נכנסים להיסטוריה אוטומטית.
      </div>
    );
  }
  return (
    <Card className="flex items-center gap-3 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary-tint">
        <Watch className="h-5 w-5 text-primary" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold">מתאמנים עם שעון?</p>
        <p className="text-label text-muted-foreground">האימונים ייכנסו להיסטוריה לבד, דרך {store}</p>
      </div>
      <SecondaryButton size="sm" onClick={onConnect} disabled={isBusy}>
        {isBusy ? 'מחבר...' : 'חבר שעון'}
      </SecondaryButton>
    </Card>
  );
}

/* ── History card for a watch workout ─────────────────────────────────────── */

export function WatchWorkoutCard({ workout }: { workout: WatchWorkout }) {
  const start = new Date(workout.started_at);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-card-inner">
          <Activity className="h-5 w-5 text-primary" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-body font-semibold">{KIND_LABELS[workout.kind]}</h4>
          <p className="text-label text-muted-foreground">
            {format(start, 'HH:mm')}
            {workout.source_name ? ` · ${workout.source_name}` : ''}
          </p>
        </div>
        <Pill tone="neutral" icon={Watch}>מהשעון</Pill>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-label text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Timer className="h-4 w-4" strokeWidth={2} />{workout.duration_min} דק'</span>
        {workout.calories != null && (
          <span className="inline-flex items-center gap-1"><Flame className="h-4 w-4" strokeWidth={2} />{workout.calories} קלוריות</span>
        )}
        {workout.avg_heart_rate != null && (
          <span className="inline-flex items-center gap-1"><HeartPulse className="h-4 w-4" strokeWidth={2} />דופק ממוצע {workout.avg_heart_rate}</span>
        )}
      </div>
    </Card>
  );
}

/* ── "Your watch logged a workout — mark the planned one as done?" ───────── */

interface MatchSuggestionProps {
  userId: string;
  watchWorkouts: WatchWorkout[];
  plannedToday: { workout: boolean; walk: boolean };
  doneToday: { workout: boolean; walk: boolean };
  onMarked: () => void;
}

export function WatchMatchSuggestion({ userId, watchWorkouts, plannedToday, doneToday, onMarked }: MatchSuggestionProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todays = watchWorkouts.filter((w) => format(new Date(w.started_at), 'yyyy-MM-dd') === today);
  const match: 'workout' | 'walk' | null =
    plannedToday.workout && !doneToday.workout && todays.some((w) => w.kind === 'strength')
      ? 'workout'
      : plannedToday.walk && !doneToday.walk && todays.some((w) => w.kind === 'walk')
      ? 'walk'
      : null;
  const [dismissed, setDismissed] = useState(false);
  if (!match || dismissed) return null;

  const mark = async () => {
    const { error } = await supabase
      .from('activity_log')
      .insert({ user_id: userId, activity_type: match, completed_at: today });
    if (error) {
      toast.error('לא הצלחנו לסמן, נסו שוב');
      return;
    }
    successHaptic();
    const type = match;
    showUndo(type === 'workout' ? 'האימון סומן כבוצע' : 'ההליכה סומנה כבוצעה', async () => {
      await unmarkActivity(userId, type, today);
      onMarked();
      setDismissed(false);
    });
    onMarked();
    setDismissed(true);
  };

  return (
    <Card className="space-y-3 border-primary/40">
      <div className="flex items-start gap-3">
        <Watch className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
        <p className="text-body">
          השעון רשם היום {match === 'workout' ? 'אימון כוח' : 'הליכה'}. לסמן את {match === 'workout' ? 'האימון המתוכנן' : 'ההליכה המתוכננת'} כבוצע?
        </p>
      </div>
      <div className="flex gap-2">
        <PrimaryButton size="default" icon={Check} onClick={mark} className="flex-1">כן, סמנו</PrimaryButton>
        <SecondaryButton onClick={() => setDismissed(true)}>לא עכשיו</SecondaryButton>
      </div>
    </Card>
  );
}

/* ── Weekly summary at the top of history ─────────────────────────────────── */

export function useWeekSummary(userId: string | undefined, watchWorkouts: WatchWorkout[], sessionDates: string[], refreshKey: number) {
  const [data, setData] = useState<{ workoutsPlanned: number; walksPlanned: number; workoutsDone: number; walksDone: number; doneToday: { workout: boolean; walk: boolean }; plannedToday: { workout: boolean; walk: boolean } } | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekday = new Date().getDay();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [workoutDays, walkDays, logs] = await Promise.all([
        db.from('workout_day_schedule').select('weekday').eq('user_id', userId),
        db.from('user_walking_schedule').select('day_of_week').eq('user_id', userId).eq('is_active', true).not('day_of_week', 'is', null),
        supabase.from('activity_log').select('activity_type, completed_at').eq('user_id', userId).gte('completed_at', weekStart),
      ]);
      const wd = ((workoutDays.data || []) as { weekday: number }[]).map((r) => r.weekday);
      const walkd = ((walkDays.data || []) as { day_of_week: number }[]).map((r) => r.day_of_week);
      const log = (logs.data || []) as { activity_type: string; completed_at: string }[];
      const inWeek = (iso: string) => iso.slice(0, 10) >= weekStart;
      const watchThisWeek = watchWorkouts.filter((w) => inWeek(format(new Date(w.started_at), 'yyyy-MM-dd')));

      // A day counts once, whichever way it was logged.
      const workoutDaysDone = new Set([
        ...log.filter((l) => l.activity_type === 'workout').map((l) => l.completed_at),
        ...sessionDates.filter(inWeek),
        ...watchThisWeek.filter((w) => w.kind === 'strength').map((w) => format(new Date(w.started_at), 'yyyy-MM-dd')),
      ]);
      const walkDaysDone = new Set([
        ...log.filter((l) => l.activity_type === 'walk').map((l) => l.completed_at),
        ...watchThisWeek.filter((w) => w.kind === 'walk').map((w) => format(new Date(w.started_at), 'yyyy-MM-dd')),
      ]);

      setData({
        workoutsPlanned: wd.length,
        walksPlanned: walkd.length,
        workoutsDone: workoutDaysDone.size,
        walksDone: walkDaysDone.size,
        plannedToday: { workout: wd.includes(weekday), walk: walkd.includes(weekday) },
        doneToday: {
          workout: log.some((l) => l.activity_type === 'workout' && l.completed_at === today) || sessionDates.includes(today),
          walk: log.some((l) => l.activity_type === 'walk' && l.completed_at === today),
        },
      });
    })();
  }, [userId, watchWorkouts, sessionDates, refreshKey]);

  return data;
}

export function WeekSummaryCard({ summary, activities }: { summary: NonNullable<ReturnType<typeof useWeekSummary>>; activities?: number }) {
  const item = (label: string, done: number, planned: number) => (
    <div className="flex-1 rounded-inner bg-card-inner px-3 py-3 text-center">
      <p className="text-stat tabular-nums" dir="ltr">
        {done}
        <span className="text-body text-muted-foreground">/{planned}</span>
      </p>
      <p className="text-label text-muted-foreground">{label}</p>
    </div>
  );
  return (
    <Card className="space-y-3">
      <h3 className="text-card-title">השבוע</h3>
      <div className="flex gap-3">
        {item('אימונים', summary.workoutsDone, summary.workoutsPlanned)}
        {item('הליכות', summary.walksDone, summary.walksPlanned)}
        {activities != null && (
          <div className="flex-1 rounded-inner bg-card-inner px-3 py-3 text-center">
            <p className="text-stat tabular-nums">{activities}</p>
            <p className="text-label text-muted-foreground">פעילויות</p>
          </div>
        )}
      </div>
    </Card>
  );
}
