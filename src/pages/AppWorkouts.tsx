import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { showUndo } from '@/lib/undoToast';
import { deleteWorkoutSession } from '@/lib/activityMarks';
import { Dumbbell } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, EmptyState } from '@/components/ds';
import { format } from 'date-fns';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import { useActiveWorkout } from '@/contexts/ActiveWorkoutContext';
import { selectionHaptic } from '@/lib/native';
import {
  WatchConnectCard, WatchMatchSuggestion, WeekSummaryCard, useWatchWorkouts, useWeekSummary,
} from '@/components/workouts/WatchWorkouts';
import { WorkoutsCalendar } from '@/components/workouts/WorkoutsCalendar';
import { HistoryTab } from '@/components/workouts/HistoryList';
import { WeekView } from '@/components/workouts/WeekView';
import { ActivitySheet } from '@/components/activities/ActivitySheet';
import { ActivitiesHistory, withoutDuplicates } from '@/components/activities/ActivitiesHistory';
import { useRunBuiltWorkout } from '@/hooks/useRunBuiltWorkout';
import { ActivityRow, useActivities } from '@/hooks/useActivities';
import type { ActivityKind } from '@/lib/activityKinds';
import { Plus } from 'lucide-react';
import { startOfWeek } from 'date-fns';

type View = 'week' | 'calendar' | 'history';
const VIEWS: { value: View; label: string }[] = [
  { value: 'week', label: 'השבוע' },
  { value: 'calendar', label: 'לוח שנה' },
  { value: 'history', label: 'היסטוריה' },
];

export default function AppWorkouts() {
  const { user, currentWeek } = useAuth();
  const { assignment, plan, planDays, isLoading } = useWorkoutPlan();
  const { sessions, logSession, deleteSession, isLoading: isSessionsLoading } = useWorkoutSession();
  const { start } = useActiveWorkout();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('week');
  const watch = useWatchWorkouts(user?.id);
  const [summaryKey, setSummaryKey] = useState(0);
  const sessionDates = useMemo(
    () => sessions.map((s) => format(new Date(s.completed_at), 'yyyy-MM-dd')),
    [sessions],
  );
  const summary = useWeekSummary(user?.id, watch.workouts, sessionDates, summaryKey);
  const acts = useActivities(user?.id);
  const navigate = useNavigate();
  const runBuiltWorkout = useRunBuiltWorkout(() => setSummaryKey((k) => k + 1));
  // The activity sheet: new (optionally for a day / a kind) or editing one.
  const [sheet, setSheet] = useState<{ open: boolean; date?: Date; kind?: ActivityKind; existing?: ActivityRow | null }>({ open: false });
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  const doneActs = acts.activities.filter((a) => a.status === 'done');
  const activitiesThisWeek = doneActs.filter((a) => a.day >= weekStart).length;
  // Activities outside the plan (not a plan workout's own record) get a dot in the week strip.
  const activityDays = useMemo(() => new Set(doneActs.filter((a) => !a.session_id).map((a) => a.day)), [doneActs]);
  const replaceable = summary
    ? { workout: summary.plannedToday.workout && !summary.doneToday.workout, walk: summary.plannedToday.walk && !summary.doneToday.walk }
    : undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen space-y-card-gap px-4 pb-24 pt-4">
        <Skeleton className="h-8 w-40 rounded-inner" />
        <Skeleton className="h-12 rounded-inner" />
        <Skeleton className="h-16 rounded-inner" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    );
  }

  if (!assignment || !plan) {
    return (
      <div className="flex min-h-screen items-center px-4 pb-24 pt-4">
        <Card className="w-full">
          <EmptyState icon={Dumbbell} title="אין תוכנית אימון פעילה" description="פנו למאמן כדי להתחיל תוכנית" />
        </Card>
      </div>
    );
  }

  const handleStartSession = (planDay: WorkoutPlanDay, exercises: WorkoutPlanExercise[]) => {
    start({
      planDay,
      exercises,
      onFinish: async (result) => {
        const sessionId = await logSession(planDay.id, result.durationMinutes, result.logs, {
          clientSessionId: result.clientSessionId,
          difficulty: result.difficulty,
          setsDone: result.setsDone,
          totalVolumeKg: result.totalVolumeKg,
        });
        setSummaryKey((k) => k + 1);
        // Saved by mistake? Five seconds to take it back (sets included).
        if (sessionId && user) {
          const day = format(new Date(), 'yyyy-MM-dd');
          showUndo('האימון סומן כבוצע', async () => {
            await deleteWorkoutSession(user.id, sessionId, day);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['workout-sessions', user.id] }),
              queryClient.invalidateQueries({ queryKey: ['activity-week', user.id] }),
            ]);
            setSummaryKey((k) => k + 1);
          });
        }
      },
    });
  };

  return (
    <div className="min-h-screen space-y-card-gap px-4 pb-24 pt-4" dir="rtl">
      <header>
        <h1 className="text-screen-title">אימונים</h1>
        <p className="text-body text-muted-foreground">{plan.name}</p>
      </header>

      {/* One switch for the whole page */}
      <div role="tablist" aria-label="תצוגה" className="grid grid-cols-3 gap-1 rounded-inner bg-card-inner p-1">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            onClick={() => {
              selectionHaptic();
              setView(v.value);
            }}
            className={cn(
              'min-h-[44px] rounded-button text-body font-semibold transition-colors',
              view === v.value ? 'bg-card text-foreground' : 'text-muted-foreground',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {user && view === 'week' && (
        <>
          {summary && (
            <WatchMatchSuggestion
              userId={user.id}
              watchWorkouts={watch.workouts}
              // Walks have their own suggestion inside the walk card.
              plannedToday={{ workout: summary.plannedToday.workout, walk: false }}
              doneToday={summary.doneToday}
              onMarked={() => {
                setSummaryKey((k) => k + 1);
                queryClient.invalidateQueries({ queryKey: ['activity-week', user.id] });
              }}
            />
          )}
          <WeekView
            userId={user.id}
            currentWeek={currentWeek}
            planDays={planDays}
            sessions={sessions}
            watchWorkouts={watch.workouts}
            onStart={handleStartSession}
            onChanged={() => setSummaryKey((k) => k + 1)}
            activityDays={activityDays}
            onAddActivity={(day) => setSheet({ open: true, date: new Date(`${day}T12:00:00`) })}
            onStartWalk={() => navigate('/app/walk')}
          />
          <WatchConnectCard connected={watch.connected} isBusy={watch.isBusy} onConnect={watch.connect} />
        </>
      )}

      {user && view === 'calendar' && (
        <WorkoutsCalendar
          userId={user.id}
          planDays={planDays.map((d) => ({ id: d.id, name: d.name }))}
          watchWorkouts={watch.workouts}
        />
      )}

      {view === 'history' && (
        <div className="space-y-card-gap">
          {summary && <WeekSummaryCard summary={summary} activities={activitiesThisWeek} />}
          <ActivitiesHistory
            activities={acts.activities}
            onEdit={(a) => setSheet({ open: true, existing: a })}
            onDelete={async (a) => {
              const ok = await acts.remove(a);
              setSummaryKey((k) => k + 1);
              return ok;
            }}
          />
          <HistoryTab
            sessions={sessions}
            isLoading={isSessionsLoading}
            onDeleteSession={deleteSession}
            // A watch workout already logged as an activity is shown once.
            watchWorkouts={withoutDuplicates(watch.workouts, acts.activities)}
          />
        </div>
      )}
      {/* Add an activity — any sport, any day */}
      <button
        type="button"
        onClick={() => setSheet({ open: true })}
        aria-label="הוספת פעילות"
        className="fixed left-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        style={{ bottom: 'calc(3.5rem + 1px + var(--app-safe-bottom) + 16px)' }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <ActivitySheet
        open={sheet.open}
        onOpenChange={(o) => {
          setSheet((s) => ({ ...s, open: o }));
          if (!o) setSummaryKey((k) => k + 1);
        }}
        defaultDate={sheet.date}
        initialKind={sheet.kind}
        existing={sheet.existing}
        replaceable={replaceable}
        onRunWorkout={runBuiltWorkout}
      />
    </div>
  );
}
