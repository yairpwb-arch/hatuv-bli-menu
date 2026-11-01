import { useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarDays, Check, Pencil } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PrimaryButton, SecondaryButton, SectionHeader } from '@/components/ds';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import type { WatchWorkout } from '@/lib/watchWorkouts';
import { selectionHaptic, successHaptic } from '@/lib/native';
import { toast } from 'sonner';
import { showUndo } from '@/lib/undoToast';
import {
  canUndo, countSessionSets, deleteManualWalks, logManualWalk, logManualWorkout, manualSessionIds, markedAt, readManualWalk,
} from '@/lib/activityMarks';
import { ManualDone, ManualDoneSheet } from './ManualDoneSheet';
import { DoneDetails, DoneSheet } from './DoneSheet';
import { cn } from '@/lib/utils';
import { EditDaysDialog } from './EditDaysDialog';
import { SessionSummaryDialog } from './SessionSummaryDialog';
import { DayStatus, WEEKDAY_SHORT, WalkCard, WorkoutCard } from './WeekCards';

interface Session {
  id: string;
  completed_at: string;
  plan_day_id: string;
  duration_minutes?: number | null;
  difficulty?: string | null;
}

const localDay = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

export function WeekView({
  userId, currentWeek, planDays, sessions, watchWorkouts, onStart, onChanged, activityDays, onAddActivity, onStartWalk,
}: {
  userId: string;
  currentWeek: number;
  planDays: WorkoutPlanDay[];
  sessions: Session[];
  watchWorkouts: WatchWorkout[];
  onStart: (day: WorkoutPlanDay, exercises: WorkoutPlanExercise[]) => void;
  /** A mark was added or undone — the page refreshes its weekly summary. */
  onChanged?: () => void;
  /** Days (yyyy-MM-dd) with an activity outside the plan — a dot in the week strip. */
  activityDays?: Set<string>;
  onAddActivity?: (day: string) => void;
  onStartWalk?: (day: string) => void;
}) {
  const plan = useWeekPlan(userId, currentWeek, planDays);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selected, setSelected] = useState(today);
  const [editOpen, setEditOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  // The "done" sheet: what's shown, and how to undo it.
  const [done, setDone] = useState<{ details: DoneDetails; undo: () => Promise<boolean> } | null>(null);
  // The "I did it without the app" sheet: which workout (or the walk) and which day.
  const [manual, setManual] = useState<{ kind: 'workout' | 'walk'; day: string; planDayId?: string } | null>(null);

  const saveManual = async (v: ManualDone) => {
    if (!manual) return;
    const { kind, day, planDayId } = manual;
    let ok: boolean;
    let undoIt: () => Promise<boolean>;
    if (kind === 'workout' && planDayId) {
      const sessionId = await logManualWorkout(userId, planDayId, day, v.durationMin, v.difficulty);
      ok = !!sessionId && (await plan.markActivity('workout', day, 'manual'));
      if (sessionId) await plan.refreshMarks();
      undoIt = () => (sessionId ? plan.unmarkWorkoutSession(sessionId, day) : plan.unmark('workout', day));
    } else {
      ok = await plan.markActivity('walk', day, day === today ? 'manual' : 'late');
      if (ok) await logManualWalk(userId, day, v);
      undoIt = async () => {
        await deleteManualWalks(userId, day);
        return plan.unmark('walk', day);
      };
    }
    setManual(null);
    if (!ok) {
      toast.error('לא הצלחנו לשמור, נסו שוב');
      return;
    }
    successHaptic();
    onChanged?.();
    showUndo('סומן כבוצע', async () => afterUndo(await undoIt()));
  };

  const afterUndo = (ok: boolean) => {
    if (ok) {
      onChanged?.();
      toast('הסימון בוטל');
    } else {
      toast.error('לא הצלחנו לבטל, נסו שוב');
    }
  };

  const openWalkDone = async (day: string) => {
    const watch = watchWorkouts.find((w) => w.kind === 'walk' && localDay(w.started_at) === day);
    const typed = await readManualWalk(userId, day);
    setDone({
      details: {
        kind: 'walk',
        day,
        markedAt: await markedAt(userId, 'walk', day),
        durationMin: watch?.duration_min ?? typed?.durationMin ?? null,
        distanceKm: typed?.distanceKm ?? null,
        canUndo: canUndo(day),
      },
      undo: async () => {
        await deleteManualWalks(userId, day);
        return plan.unmark('walk', day);
      },
    });
  };

  const openWorkoutDone = async (dayId: string, day: string) => {
    const session = sessionFor(dayId, day);
    const watch = watchWorkouts.find((w) => w.kind === 'strength' && localDay(w.started_at) === day);
    setDone({
      details: {
        kind: 'workout',
        day,
        markedAt: session?.completed_at ?? (await markedAt(userId, 'workout', day)),
        durationMin: session?.duration_minutes ?? watch?.duration_min ?? null,
        sets: session ? await countSessionSets(session.id) : 0,
        difficulty: session?.difficulty ?? null,
        manual: session ? (await manualSessionIds(userId, [session.id])).has(session.id) : false,
        canUndo: canUndo(day),
      },
      undo: () => (session ? plan.unmarkWorkoutSession(session.id, day) : plan.unmark('workout', day)),
    });
  };

  const weekdayOf = new Map(plan.schedule.map((r) => [r.plan_day_id, r.weekday]));
  const daysOn = (wd: number) => planDays.filter((d) => weekdayOf.get(d.id) === wd);
  const walksOn = (wd: number) => plan.walks.filter((w) => w.day_of_week === wd);
  const unscheduled = planDays.filter((d) => !weekdayOf.has(d.id));

  const sessionFor = (dayId: string, date: string) => sessions.find((s) => s.plan_day_id === dayId && localDay(s.completed_at) === date);
  const loggedAs = (type: 'walk' | 'workout', date: string) => plan.logs.some((l) => l.activity_type === type && l.completed_at === date);

  const statusOf = (date: string, done: boolean): DayStatus =>
    done ? 'done' : date === today ? 'today' : date < today ? 'missed' : 'planned';

  /** Workout done that day: its own session, or a workout marked from the watch. */
  const workoutDone = (dayId: string, date: string, onlyWorkoutThatDay: boolean) =>
    !!sessionFor(dayId, date) || (onlyWorkoutThatDay && loggedAs('workout', date));

  const dayInfo = (date: string, wd: number) => {
    const ws = daysOn(wd);
    const wk = walksOn(wd);
    const allDone =
      ws.length + wk.length > 0 &&
      ws.every((d) => workoutDone(d.id, date, ws.length === 1)) &&
      (wk.length === 0 || loggedAs('walk', date));
    return { hasWorkout: ws.length > 0, hasWalk: wk.length > 0, allDone };
  };

  const selWd = new Date(`${selected}T12:00:00`).getDay();
  const selWorkouts = daysOn(selWd);
  const selWalks = walksOn(selWd);
  const watchWalk = watchWorkouts.find((w) => w.kind === 'walk' && localDay(w.started_at) === selected);

  return (
    <div className="space-y-card-gap">
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="ימי השבוע">
        {plan.week.map((date, wd) => {
          const info = dayInfo(date, wd);
          const isSel = date === selected;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={isSel}
              aria-label={`${format(new Date(`${date}T12:00:00`), 'EEEE d בMMMM', { locale: he })}${info.hasWorkout ? ', אימון' : ''}${info.hasWalk ? ', הליכה' : ''}${info.allDone ? ', הכל בוצע' : ''}`}
              onClick={() => {
                selectionHaptic();
                setSelected(date);
              }}
              className={cn(
                'relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-inner border-2 transition-colors',
                isToday ? 'border-primary' : 'border-transparent',
                isSel ? 'bg-card-inner' : 'bg-transparent',
              )}
            >
              <span className={cn('text-body font-bold', isSel || isToday ? 'text-foreground' : 'text-muted-foreground')}>{WEEKDAY_SHORT[wd]}</span>
              <span className="text-[0.7rem] tabular-nums text-muted-foreground">{format(new Date(`${date}T12:00:00`), 'd')}</span>
              <span className="flex h-2 items-center gap-1" aria-hidden>
                {info.hasWorkout && <span className="h-1.5 w-1.5 rounded-pill bg-primary" />}
                {info.hasWalk && <span className="h-1.5 w-1.5 rounded-pill bg-muted-foreground" />}
                {activityDays?.has(date) && <span className="h-1.5 w-1.5 rounded-pill bg-sky-400" />}
              </span>
              {info.allDone && (
                <Check className="absolute left-1 top-1 h-3.5 w-3.5 text-success" strokeWidth={3} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <SectionHeader
        title={selected === today ? 'היום' : format(new Date(`${selected}T12:00:00`), 'EEEE, d בMMMM', { locale: he })}
        action={{ label: 'עריכת ימים', icon: Pencil, onClick: () => setEditOpen(true) }}
      />

      {plan.isLoading ? (
        <div className="space-y-card-gap">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
        </div>
      ) : selWorkouts.length + selWalks.length === 0 ? (
        <div>
          <EmptyState
            icon={CalendarDays}
            title="אין אימון או הליכה ביום הזה"
            description="יום מנוחה. אפשר לשבץ אימונים והליכות בעריכת הימים"
          />
          {(onStartWalk || onAddActivity) && selected <= today && (
            <div className="grid grid-cols-2 gap-3">
              {onStartWalk && <PrimaryButton onClick={() => onStartWalk(selected)}>התחל הליכה</PrimaryButton>}
              {onAddActivity && <SecondaryButton onClick={() => onAddActivity(selected)}>הוסף פעילות</SecondaryButton>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-card-gap">
          {selWorkouts.map((d) => {
            const session = sessionFor(d.id, selected);
            const done = workoutDone(d.id, selected, selWorkouts.length === 1);
            return (
              <WorkoutCard
                key={d.id}
                day={d}
                weekday={selWd}
                exercises={plan.exercisesByDay[d.id] ?? []}
                status={statusOf(selected, done)}
                doneAt={session?.completed_at ?? (done ? selected : undefined)}
                onStart={() => onStart(d, plan.exercisesByDay[d.id] ?? [])}
                onManual={canUndo(selected) ? () => setManual({ kind: 'workout', day: selected, planDayId: d.id }) : undefined}
                onViewSummary={session ? () => setSummaryId(session.id) : undefined}
                onDoneTap={() => openWorkoutDone(d.id, selected)}
              />
            );
          })}
          {selWalks.map((w) => (
            <WalkCard
              key={w.id}
              weekday={selWd}
              status={statusOf(selected, loggedAs('walk', selected))}
              watchWalk={watchWalk}
              onDoneTap={() => openWalkDone(selected)}
              onManual={canUndo(selected) ? () => setManual({ kind: 'walk', day: selected }) : undefined}
              onStartGps={onStartWalk ? () => onStartWalk(selected) : undefined}
              onMark={async (source) => {
                const day = selected;
                const ok = await plan.markActivity('walk', day, source);
                if (ok) {
                  successHaptic();
                  onChanged?.();
                  showUndo(source === 'late' ? 'ההליכה סומנה בדיעבד' : 'ההליכה סומנה כבוצעה', async () => {
                    afterUndo(await plan.unmark('walk', day));
                  });
                } else {
                  toast.error('לא הצלחנו לסמן, נסו שוב');
                }
                return ok;
              }}
            />
          ))}
        </div>
      )}

      {!plan.isLoading && unscheduled.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-inner bg-card-inner px-4 py-3">
          <p className="text-label text-muted-foreground">
            {unscheduled.length === 1 ? `האימון "${unscheduled[0].name}" עוד לא שובץ ליום` : `${unscheduled.length} אימונים עוד לא שובצו ליום`}
          </p>
          <button type="button" onClick={() => setEditOpen(true)} className="min-h-[44px] shrink-0 text-label font-semibold text-primary-soft">
            שיבוץ
          </button>
        </div>
      )}

      <EditDaysDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        planDays={planDays}
        schedule={plan.schedule}
        walks={plan.walks}
        onSave={plan.saveDays}
      />
      <SessionSummaryDialog sessionId={summaryId} onClose={() => setSummaryId(null)} />
      <ManualDoneSheet
        kind={manual?.kind ?? 'workout'}
        open={!!manual}
        onOpenChange={(o) => !o && setManual(null)}
        onSave={saveManual}
      />
      <DoneSheet
        details={done?.details ?? null}
        onClose={() => setDone(null)}
        onUndo={async () => {
          if (!done) return;
          const ok = await done.undo();
          setDone(null);
          afterUndo(ok);
        }}
      />
    </div>
  );
}
