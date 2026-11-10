import { useState } from 'react';
import { format } from 'date-fns';
import { Check, ClipboardCheck, Dumbbell, Eye, Footprints, Play, Watch, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, Pill, PrimaryButton, SecondaryButton } from '@/components/ds';
import { Button } from '@/components/ui/button';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import type { WatchWorkout } from '@/lib/watchWorkouts';
import { estimateMinutes, muscleTags } from '@/lib/exerciseLabels';
import { setsRepsLabel } from '@/lib/hebrewTime';
import { cn } from '@/lib/utils';

export const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** today = can start now; done = logged; planned = later this week; missed = day passed without it. */
export type DayStatus = 'today' | 'done' | 'planned' | 'missed';

/** The green "done" pill is a button: it opens the details / undo sheet. */
function DonePill({ label, onTap }: { label: string; onTap?: () => void }) {
  const pill = <Pill tone="success" icon={Check}>{label}</Pill>;
  if (!onTap) return pill;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${label}. פרטים וביטול`}
      className="relative shrink-0 rounded-pill after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
    >
      {pill}
    </button>
  );
}

const shortDate = (iso: string) => format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso), 'd/M');
const exerciseCount = (n: number) => (n === 1 ? 'תרגיל אחד' : `${n} תרגילים`);

// ── Workout ───────────────────────────────────────────────────────────────────

export function WorkoutCard({
  day, weekday, exercises, status, doneAt, onStart, onManual, onViewSummary, onDoneTap, time, onTime,
}: {
  day: WorkoutPlanDay;
  weekday: number;
  exercises: WorkoutPlanExercise[] | undefined;
  status: DayStatus;
  doneAt?: string;
  onStart: () => void;
  /** "I did it without the app" — offered while the day can still be marked. */
  onManual?: () => void;
  onViewSummary?: () => void;
  onDoneTap?: () => void;
  /** "HH:mm" from the calendar, and choosing another. */
  time?: string;
  onTime?: () => void;
}) {
  const meta = exercises
    ? exercises.length > 0
      ? `${exerciseCount(exercises.length)} · כ-${estimateMinutes(exercises)} דק'`
      : 'אין תרגילים'
    : null;

  return (
    <Card className={cn('space-y-3', status === 'today' && 'border-primary/60')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-inner', status === 'done' ? 'bg-success/15 text-success' : 'bg-primary-tint text-primary')}>
          {status === 'done' ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Dumbbell className="h-5 w-5" strokeWidth={2} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title leading-tight">{day.name}</h3>
          <p className="text-label text-muted-foreground">
            יום {WEEKDAY_SHORT[weekday]}{meta ? ` · ${meta}` : ''}
          </p>
        </div>
        {status === 'today' && <Pill tone="brand">היום</Pill>}
        {status === 'done' && <DonePill label={`בוצע${doneAt ? ` · ${shortDate(doneAt)}` : ''}`} onTap={onDoneTap} />}
        {status === 'planned' && <Pill>מתוכנן</Pill>}
        {status === 'missed' && <Pill>לא בוצע</Pill>}
      </div>
      {time && status !== 'done' && <TimeChip time={time} onTap={onTime} />}

      {exercises === undefined ? (
        <Skeleton className="h-24 rounded-inner" />
      ) : exercises.length > 0 ? (
        <ol className="divide-y divide-border rounded-inner bg-card-inner">
          {exercises.map((pe, i) => {
            const muscle = muscleTags(pe.exercises.muscle_groups)[0];
            return (
              <li key={pe.id} className="flex min-h-[44px] items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-label font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-body">{pe.exercises.name}</span>
                <span className="shrink-0 text-label tabular-nums text-muted-foreground" dir="ltr">{setsRepsLabel(pe.sets, pe.reps_min, pe.reps_max)}</span>
                {muscle && <span className="shrink-0 rounded-pill bg-card px-2 py-0.5 text-[0.75rem] font-semibold text-muted-foreground">{muscle}</span>}
              </li>
            );
          })}
        </ol>
      ) : null}

      {status === 'today' && (
        <PrimaryButton icon={Play} onClick={onStart} disabled={!exercises || exercises.length === 0}>התחל אימון</PrimaryButton>
      )}
      {(status === 'today' || status === 'missed') && onManual && (
        <SecondaryButton icon={ClipboardCheck} className="w-full" onClick={onManual}>ביצעתי בלי האפליקציה</SecondaryButton>
      )}
      {status === 'done' && onViewSummary && (
        <SecondaryButton icon={Eye} className="w-full" onClick={onViewSummary}>צפה בסיכום</SecondaryButton>
      )}
    </Card>
  );
}

/** The time from the calendar: tap to choose another. */
function TimeChip({ time, onTap }: { time: string; onTap?: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`השעה ${time}. לחיצה לשינוי`}
      className="flex min-h-[48px] w-full items-center gap-2 rounded-inner bg-primary-tint px-3 text-right"
    >
      <Clock className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
      <span className="text-card-title font-bold tabular-nums text-foreground" dir="ltr">{time}</span>
      <span className="flex-1 text-left text-label font-semibold text-primary-soft">שינוי שעה</span>
    </button>
  );
}

// ── Walk ──────────────────────────────────────────────────────────────────────

export function WalkCard({
  weekday, status, watchWalk, onMark, onManual, onStartGps, onDoneTap, time, onTime, onRemove,
}: {
  weekday: number;
  status: DayStatus;
  /** A walk the watch/health app logged that day, if any. */
  watchWalk?: WatchWorkout;
  onMark: (source: 'manual' | 'late' | 'watch') => Promise<boolean>;
  /** Opens the "I walked" sheet (minutes, km). */
  onManual?: () => void;
  /** Starts a GPS-tracked walk. */
  onStartGps?: () => void;
  onDoneTap?: () => void;
  /** "HH:mm" from the calendar, and choosing another. */
  time?: string;
  onTime?: () => void;
  /** Takes the walk out of the plan (from weeks 7–8, when steps are what counts). */
  onRemove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const mark = async (source: 'manual' | 'late' | 'watch') => {
    setBusy(true);
    await onMark(source);
    setBusy(false);
  };
  const missed = status === 'missed';

  return (
    <Card className={cn('space-y-3', status === 'today' && 'border-primary/60')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-inner', status === 'done' ? 'bg-success/15 text-success' : 'bg-card-inner text-muted-foreground')}>
          {status === 'done' ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Footprints className="h-5 w-5" strokeWidth={2} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title leading-tight">הליכה</h3>
          <p className="text-label text-muted-foreground">⁦20–30⁩ דק' · קצב רגיל · יום {WEEKDAY_SHORT[weekday]}</p>
        </div>
        {status === 'today' && <Pill tone="brand">היום</Pill>}
        {status === 'done' && <DonePill label="בוצעה" onTap={onDoneTap} />}
        {status === 'planned' && <Pill>מתוכננת</Pill>}
        {missed && <Pill>פוספס</Pill>}
      </div>
      {time && status !== 'done' && <TimeChip time={time} onTap={onTime} />}

      {watchWalk && (status === 'today' || missed) && (
        <div className="space-y-3 rounded-inner bg-primary-tint p-3">
          <p className="flex items-start gap-2 text-body">
            <Watch className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
            השעון רשם הליכה{watchWalk.duration_min ? ` של ${Math.round(watchWalk.duration_min)} דק'` : ''} ב-{format(new Date(watchWalk.started_at), 'HH:mm')}. לסמן אותה?
          </p>
          <PrimaryButton size="default" icon={Check} disabled={busy} onClick={() => mark('watch')}>כן, סמנו</PrimaryButton>
        </div>
      )}

      {/* Live walk tracking isn't built yet, so "I walked" is the main action today. */}
      {status === 'today' && !watchWalk && onStartGps && (
        <PrimaryButton icon={Play} disabled={busy} onClick={onStartGps}>התחל הליכה</PrimaryButton>
      )}
      {status === 'today' && !watchWalk && onManual && (
        <SecondaryButton icon={Footprints} className="w-full" disabled={busy} onClick={onManual}>ביצעתי הליכה</SecondaryButton>
      )}
      {missed && !watchWalk && onManual && (
        <SecondaryButton icon={Footprints} className="w-full" disabled={busy} onClick={onManual}>ביצעתי הליכה</SecondaryButton>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="min-h-[44px] w-full text-label font-semibold text-muted-foreground">
          הסרת ההליכה מהתוכנית
        </button>
      )}
    </Card>
  );
}

// ── Planned by the trainee ────────────────────────────────────────────────────

/**
 * A walk / workout the trainee added to the calendar (once or on fixed days):
 * the same card as the program's, in green so it's told apart, with the same
 * actions — start it in the app, or mark it done.
 */
export function OwnPlanCard({
  type, title, time, minutes, repeat, exercises, status, onStart, onDone, onDoneTap, onMore,
}: {
  type: 'walk' | 'workout';
  title: string;
  /** "HH:mm" */
  time: string;
  minutes?: number;
  repeat?: boolean;
  /** A workout from "האימונים שלי": how many exercises. */
  exercises?: number;
  status: DayStatus;
  /** Start it: the GPS walk, or the workout player. */
  onStart?: () => void;
  /** "I did it" — marks it done. */
  onDone?: () => Promise<void>;
  onDoneTap?: () => void;
  /** The planned item's sheet: the calendar, cancelling it. */
  onMore: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const Icon = type === 'walk' ? Footprints : Dumbbell;
  const done = async () => {
    if (!onDone) return;
    setBusy(true);
    await onDone();
    setBusy(false);
  };
  const rest = [
    minutes ? `${minutes} דק'` : null,
    exercises ? exerciseCount(exercises) : null,
    repeat ? 'קבוע' : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card className={cn('space-y-3 border-success/40', status === 'today' && 'border-success/70')}>
      <button type="button" onClick={onMore} className="flex w-full items-start gap-3 text-right" aria-label={`${title}: אפשרויות`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner bg-success/15 text-success">
          {status === 'done' ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Icon className="h-5 w-5" strokeWidth={2} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-card-title leading-tight">{title}</span>
          <span className="block text-label text-muted-foreground"><span dir="ltr">{time}</span>{rest ? ` · ${rest}` : ''}</span>
        </span>
        {status === 'done' ? null : <Pill tone="success">שלי</Pill>}
      </button>
      {status === 'done' && (
        <div className="flex justify-start">
          <DonePill label={type === 'walk' ? 'בוצעה' : 'בוצע'} onTap={onDoneTap} />
        </div>
      )}

      {status === 'today' && onStart && (
        <Button size="lg" className="w-full bg-success text-base font-bold text-success-foreground hover:bg-success/90" onClick={onStart} disabled={busy}>
          <Play strokeWidth={2} aria-hidden />
          {type === 'walk' ? 'התחל הליכה' : 'התחל אימון'}
        </Button>
      )}
      {(status === 'today' || status === 'missed') && onDone && (
        <SecondaryButton icon={type === 'walk' ? Footprints : ClipboardCheck} className="w-full" disabled={busy} onClick={done}>
          {type === 'walk' ? 'ביצעתי הליכה' : 'ביצעתי אימון'}
        </SecondaryButton>
      )}
    </Card>
  );
}
