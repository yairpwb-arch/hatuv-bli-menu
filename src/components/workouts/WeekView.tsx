import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarDays, Check, Pencil } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BottomSheet, EmptyState, PrimaryButton, SecondaryButton, SectionHeader, SheetActions } from '@/components/ds';
import type { ActivityRow } from '@/hooks/useActivities';
import { CalEvent, useCalendar } from '@/hooks/useCalendar';
import { savePlacement } from '@/hooks/usePlacements';
import { kindInfo } from '@/lib/activityKinds';
import { CALENDAR_CHANGED } from '@/lib/localReminders';
import { TimeScope, TimeSheet } from './TimeSheet';
import { WalkEntry, useWeekPlan } from '@/hooks/useWeekPlan';
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
import { PendingDay, StageDayPrompt } from './StageDayPrompt';

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
  activities, onOpenActivity, canRemoveWalks,
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
  /** Everything the trainee logged themselves: each shows on its own day. */
  activities?: ActivityRow[];
  onOpenActivity?: (a: ActivityRow) => void;
  /** From weeks 7–8 a walk can leave the plan: steps are what counts by then. */
  canRemoveWalks?: boolean;
}) {
  const plan = useWeekPlan(userId, currentWeek, planDays);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selected, setSelected] = useState(today);
  // This week's times, the ones the calendar shows.
  const [weekFrom, weekTo] = useMemo(() => [new Date(`${plan.week[0]}T12:00:00`), new Date(`${plan.week[6]}T12:00:00`)], [plan.week[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cal = useCalendar(userId, weekFrom, weekTo);
  const [timeFor, setTimeFor] = useState<CalEvent | null>(null);
  const [removeWalk, setRemoveWalk] = useState<WalkEntry | null>(null);
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

  // Just opened by a watched video, with no day yet: walks first, then workouts built ahead.
  const pendingWalk = plan.walks.find((w) => w.day_of_week === null);
  const pendingWorkout = unscheduled.find((d) => d.unlocks_with);
  const pendingDay: PendingDay | null = plan.isLoading
    ? null
    : pendingWalk
    ? {
        kind: 'walk',
        id: pendingWalk.id,
        name: pendingWalk.walk_number === 1 ? 'הליכה ראשונה' : 'הליכה שנייה',
        taken: plan.walks.flatMap((w) => (w.day_of_week === null ? [] : [w.day_of_week])),
      }
    : pendingWorkout
    ? { kind: 'workout', id: pendingWorkout.id, name: pendingWorkout.name, taken: plan.schedule.map((r) => r.weekday) }
    : null;
  const nothingOpenYet = !plan.isLoading && planDays.length === 0 && plan.walks.length === 0 && plan.removedWalks.length === 0;

  const eventFor = (itemKey: string) => cal.events.find((e) => e.itemKey === itemKey && (e.day ?? format(e.start, 'yyyy-MM-dd')) === selected);
  const timeOf = (e?: CalEvent) => (e ? format(e.start, 'HH:mm') : undefined);

  const saveTime = async (time: string, scope: TimeScope) => {
    const ev = timeFor;
    if (!ev?.itemKey) return;
    const ok = await savePlacement(userId, {
      item_key: ev.itemKey,
      scope,
      day: scope === 'date' ? selected : null,
      weekday: scope === 'weekday' ? selWd : null,
      start_time: time,
      duration_min: ev.end ? Math.round((ev.end.getTime() - ev.start.getTime()) / 60_000) : null,
    });
    setTimeFor(null);
    if (!ok) return void toast.error('לא נשמר, נסו שוב');
    successHaptic();
    await cal.reload();
    window.dispatchEvent(new Event(CALENDAR_CHANGED));
  };

  // Logged by the trainee on this day. A plan workout already has its own card.
  const selActivities = (activities ?? []).filter(
    (a) => a.status === 'done' && a.day === selected && !sessions.some((s) => s.id === a.session_id && s.plan_day_id),
  );

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
          {selActivities.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="אין אימון או הליכה ביום הזה"
              description="יום מנוחה. אפשר לשבץ אימונים והליכות בעריכת הימים"
            />
          )}
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
                time={timeOf(eventFor(`workout:${d.id}`))}
                onTime={() => setTimeFor(eventFor(`workout:${d.id}`) ?? null)}
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
              time={timeOf(eventFor('walk'))}
              onTime={() => setTimeFor(eventFor('walk') ?? null)}
              onRemove={canRemoveWalks ? () => setRemoveWalk(w) : undefined}
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

      {/* What was logged on this day */}
      {!plan.isLoading && selActivities.length > 0 && (
        <div className="space-y-2">
          {selActivities.map((a) => {
            const info = kindInfo(a.kind);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenActivity?.(a)}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-card border border-border bg-card p-3 text-right"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner bg-success/15 text-success">
                  <info.Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{a.custom_name ?? info.label}</span>
                  <span className="block text-label text-muted-foreground">
                    <span dir="ltr">{format(new Date(a.started_at), 'HH:mm')}</span>
                    {a.duration_min ? ` · ${a.duration_min} דק'` : ''}
                    {a.distance_m ? ` · ${(a.distance_m / 1000).toFixed(2)} ק"מ` : ''}
                  </span>
                </span>
                <Check className="h-5 w-5 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
              </button>
            );
          })}
        </div>
      )}

      {!plan.isLoading && plan.removedWalks.length > 0 && (
        <button
          type="button"
          onClick={async () => {
            await plan.setWalkActive(plan.removedWalks[0].id, true);
            onChanged?.();
          }}
          className="min-h-[44px] w-full text-label font-semibold text-primary-soft"
        >
          להחזיר הליכה לתוכנית
        </button>
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

      {nothingOpenYet && (
        <p className="rounded-inner bg-card-inner p-4 text-center text-body text-muted-foreground">
          ההליכה הראשונה שלך תיפתח אחרי שתצפו בסרטון של שבוע 1
        </p>
      )}

      <TimeSheet
        open={!!timeFor}
        onOpenChange={(o) => !o && setTimeFor(null)}
        title={timeFor?.source === 'walk' ? 'שעת ההליכה' : `שעת האימון: ${timeFor?.title ?? ''}`}
        time={timeFor ? format(timeFor.start, 'HH:mm') : '18:00'}
        weekday={selWd}
        onSave={saveTime}
      />
      <BottomSheet
        open={!!removeWalk}
        onOpenChange={(o) => !o && setRemoveWalk(null)}
        title="להסיר את ההליכה מהתוכנית?"
        description="מעכשיו מה שקובע הוא יעד הצעדים היומי. אפשר להחזיר אותה בכל רגע."
      >
        <SheetActions>
          <Button
            variant="outline"
            onClick={async () => {
              const w = removeWalk;
              setRemoveWalk(null);
              if (!w) return;
              const ok = await plan.setWalkActive(w.id, false);
              onChanged?.();
              if (ok) showUndo('ההליכה הוסרה מהתוכנית', async () => void (await plan.setWalkActive(w.id, true)));
              else toast.error('לא הצלחנו להסיר, נסו שוב');
            }}
          >
            הסרה
          </Button>
          <Button onClick={() => setRemoveWalk(null)}>השארה</Button>
        </SheetActions>
      </BottomSheet>
      <StageDayPrompt
        pending={pendingDay}
        onSave={async (p, weekday) => {
          await plan.saveDays(
            new Map(p.kind === 'workout' ? [[p.id, weekday]] : []),
            new Map(p.kind === 'walk' ? [[p.id, weekday]] : []),
          );
          onChanged?.();
          await cal.reload();
        }}
      />
      <EditDaysDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        planDays={planDays}
        schedule={plan.schedule}
        walks={plan.walks}
        onSave={async (workouts, walks) => {
          await plan.saveDays(workouts, walks);
          await cal.reload();
        }}
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
