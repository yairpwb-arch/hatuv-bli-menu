import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WorkoutPlanDay } from '@/hooks/useWorkoutPlan';
import type { WalkEntry } from '@/hooks/useWeekPlan';
import { useAuth } from '@/hooks/useAuth';
import { fetchPlacements, placementFor, savePlacements, type Placement } from '@/hooks/usePlacements';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { WEEKDAY_SHORT } from './WeekCards';

/** The calendar's key for an item's time (useCalendar.ts): a plan workout, or the day's walk. */
const workoutKey = (planDayId: string) => `workout:${planDayId}`;
const WALK_KEY = 'walk';
/** The time a day gets when it has none yet (the trainee can change it right there). */
const BASE_TIME = { workout: '18:00', walk: '19:00' } as const;

const near = (a: number, b: number) => a === b || (a + 1) % 7 === b || (b + 1) % 7 === a;

function DayPicker({
  label, value, onChange, blocked, time, onTime,
}: {
  label: string;
  value: number | null;
  onChange: (d: number | null) => void;
  /** Days this one can't take (another workout / walk there, or the day next to a workout). */
  blocked: Set<number>;
  time: string;
  onTime: (t: string) => void;
}) {
  const todayWd = new Date().getDay();
  return (
    <div className="space-y-2">
      <p className="text-body font-semibold">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {WEEKDAY_SHORT.map((d, wd) => {
          const off = blocked.has(wd) && value !== wd;
          return (
            <button
              key={wd}
              type="button"
              role="radio"
              aria-checked={value === wd}
              aria-disabled={off}
              disabled={off}
              onClick={() => onChange(value === wd ? null : wd)}
              className={cn(
                'h-11 flex-1 rounded-button text-label font-semibold transition-colors',
                value === wd
                  ? 'bg-primary text-primary-foreground'
                  : off
                  ? 'bg-card-inner text-muted-foreground opacity-30'
                  : wd === todayWd
                  ? 'border border-primary/50 bg-primary-tint text-primary-soft'
                  : 'bg-card-inner text-muted-foreground',
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      {/* A day chosen: its time, right there */}
      {value !== null && (
        <div className="flex items-center gap-3 rounded-inner bg-card-inner px-3 py-2">
          <span className="shrink-0 text-label text-muted-foreground">שעה ביום {WEEKDAY_SHORT[value]}</span>
          <Input
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            dir="ltr"
            aria-label={`שעה: ${label}`}
            className="h-11 flex-1 text-center text-body font-semibold tabular-nums"
          />
        </div>
      )}
    </div>
  );
}

/**
 * One editor for both the workout days and the walk days, and their times.
 * Rules: one workout a day with a rest day between workouts (when the week has room for it),
 * and one walk a day.
 */
export function EditDaysDialog({
  open, onOpenChange, planDays, schedule, walks, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  planDays: WorkoutPlanDay[];
  schedule: { plan_day_id: string; weekday: number }[];
  walks: WalkEntry[];
  onSave: (workoutDays: Map<string, number | null>, walkDays: Map<string, number | null>) => Promise<void>;
}) {
  const { user } = useAuth();
  const [workoutDraft, setWorkoutDraft] = useState(new Map<string, number | null>());
  const [walkDraft, setWalkDraft] = useState(new Map<string, number | null>());
  const [placements, setPlacements] = useState<Placement[]>([]);
  /** Times the trainee set here, by "<item key>|<weekday>". */
  const [times, setTimes] = useState(new Map<string, string>());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const byDay = new Map(schedule.map((r) => [r.plan_day_id, r.weekday]));
    setWorkoutDraft(new Map(planDays.map((d) => [d.id, byDay.get(d.id) ?? null])));
    setWalkDraft(new Map(walks.map((w) => [w.id, w.day_of_week])));
    setTimes(new Map());
    if (user) fetchPlacements(user.id).then(({ list }) => setPlacements(list));
  }, [open, planDays, schedule, walks, user]);

  // The time shown for an item on a weekday: set here, else its fixed time from the calendar,
  // else the base time (saved with the day, so the first time days are set they get times too).
  const today = format(new Date(), 'yyyy-MM-dd');
  const fixedTime = (key: string, wd: number) => {
    const p = placementFor(placements, key, today, wd);
    return p?.scope === 'weekday' ? p.start_time : null;
  };
  const baseOf = (key: string) => (key === WALK_KEY ? BASE_TIME.walk : BASE_TIME.workout);
  const timeOf = (key: string, wd: number | null) => {
    if (wd === null) return '';
    return times.get(`${key}|${wd}`) ?? fixedTime(key, wd) ?? baseOf(key);
  };
  const setTime = (key: string, wd: number | null, t: string) => {
    if (wd === null) return;
    setTimes((m) => new Map(m).set(`${key}|${wd}`, t));
  };

  // A rest day between workouts only when the week has room for it (up to 3 workouts).
  const chosenWorkouts = [...workoutDraft.values()].filter((v): v is number => v !== null);
  const restDay = planDays.length <= 3;
  const workoutBlocked = (id: string) => {
    const s = new Set<number>();
    workoutDraft.forEach((v, other) => {
      if (other === id || v === null) return;
      for (let wd = 0; wd < 7; wd++) if (restDay ? near(wd, v) : wd === v) s.add(wd);
    });
    return s;
  };
  const walkBlocked = (id: string) => {
    const s = new Set<number>();
    walkDraft.forEach((v, other) => {
      if (other !== id && v !== null) s.add(v);
    });
    return s;
  };

  // Days saved before these rules may break them: saving waits until they're fixed.
  const walkDays = [...walkDraft.values()].filter((v): v is number => v !== null);
  const workoutClash = chosenWorkouts.some((a, i) => chosenWorkouts.some((b, j) => i < j && (restDay ? near(a, b) : a === b)));
  const walkClash = new Set(walkDays).size !== walkDays.length;

  const save = async () => {
    setSaving(true);
    await onSave(workoutDraft, walkDraft);
    // The times set here, for each item on its chosen day.
    const items: Placement[] = [];
    const add = (key: string, wd: number | null, minutes: number) => {
      if (wd === null) return;
      // Set here; or no fixed time yet on that day: the base time.
      const t = times.get(`${key}|${wd}`) || (fixedTime(key, wd) ? null : baseOf(key));
      if (t) items.push({ item_key: key, scope: 'weekday', day: null, weekday: wd, start_time: t, duration_min: minutes });
    };
    workoutDraft.forEach((wd, id) => add(workoutKey(id), wd, 60));
    walkDraft.forEach((wd) => add(WALK_KEY, wd, 30));
    const ok = !user || !items.length || (await savePlacements(user.id, items));
    setSaving(false);
    if (!ok) return toast({ title: 'הימים נשמרו, אבל השעות לא. נסו שוב', variant: 'destructive' });
    onOpenChange(false);
    toast({ title: items.length ? 'הימים והשעות עודכנו' : 'הימים עודכנו' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת ימים</DialogTitle>
          <DialogDescription>
            באיזה יום בשבוע כל אימון וכל הליכה, ובאיזו שעה. לחיצה נוספת מבטלת.
            {restDay ? ' אימון אחד ביום, עם יום מנוחה בין אימונים.' : ' אימון אחד ביום.'} הליכה אחת ביום.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-4">
          <h3 className="text-label font-semibold text-muted-foreground">אימונים</h3>
          {planDays.map((d) => {
            const wd = workoutDraft.get(d.id) ?? null;
            return (
              <DayPicker
                key={d.id}
                label={d.name}
                value={wd}
                onChange={(v) => setWorkoutDraft((m) => new Map(m).set(d.id, v))}
                blocked={workoutBlocked(d.id)}
                time={timeOf(workoutKey(d.id), wd)}
                onTime={(t) => setTime(workoutKey(d.id), wd, t)}
              />
            );
          })}
        </section>

        {walks.length > 0 && (
          <section className="space-y-4 border-t border-border pt-4">
            <h3 className="text-label font-semibold text-muted-foreground">הליכות</h3>
            {walks.map((w) => {
              const wd = walkDraft.get(w.id) ?? null;
              return (
                <DayPicker
                  key={w.id}
                  label={w.walk_number === 1 ? 'הליכה ראשונה' : 'הליכה שנייה'}
                  value={wd}
                  onChange={(v) => setWalkDraft((m) => new Map(m).set(w.id, v))}
                  blocked={walkBlocked(w.id)}
                  time={timeOf(WALK_KEY, wd)}
                  onTime={(t) => setTime(WALK_KEY, wd, t)}
                />
              );
            })}
          </section>
        )}

        {(workoutClash || walkClash) && (
          <p className="text-label text-destructive">
            {workoutClash ? (restDay ? 'יש אימונים באותו יום או בימים צמודים. ' : 'יש שני אימונים באותו יום. ') : ''}
            {walkClash ? 'יש שתי הליכות באותו יום. ' : ''}
            צריך להזיז לפני השמירה.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button onClick={save} disabled={saving || workoutClash || walkClash}>{saving ? 'שומר...' : 'שמירה'}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
