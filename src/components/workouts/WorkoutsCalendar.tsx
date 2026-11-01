import { useMemo, useState } from 'react';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import { he } from 'date-fns/locale';
import { Check, ChevronLeft, ChevronRight, Dumbbell, Footprints, Plus, Watch } from 'lucide-react';
import { toast } from 'sonner';
import { Card, SecondaryButton } from '@/components/ds';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EVENT_COLORS, useCalendar } from '@/hooks/useCalendar';
import { KIND_LABELS, WatchWorkout } from '@/lib/watchWorkouts';
import { cn } from '@/lib/utils';

const WEEK_OPTS = { weekStartsOn: 0 as const };
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DEFAULT_HOUR = 18;

interface WorkoutsCalendarProps {
  userId: string;
  /** The plan's workout days, offered in "add a workout to this day". */
  planDays: { id: string; name: string }[];
  watchWorkouts: WatchWorkout[];
}

/** Month view of workouts, walks and watch sessions; tap a day to see / add. */
export function WorkoutsCalendar({ userId, planDays, watchWorkouts }: WorkoutsCalendarProps) {
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [isPicking, setIsPicking] = useState(false);

  const from = startOfWeek(startOfMonth(cursor), WEEK_OPTS);
  const to = endOfWeek(endOfMonth(cursor), WEEK_OPTS);
  const cal = useCalendar(userId, from, to);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  // Only training-related items belong on this calendar.
  const eventsOn = (d: Date) => cal.events.filter((e) => (e.type === 'workout' || e.type === 'walk') && isSameDay(e.start, d));
  const watchOn = (d: Date) => watchWorkouts.filter((w) => isSameDay(new Date(w.started_at), d));

  const add = async (title: string, type: 'workout' | 'walk') => {
    const start = new Date(selected);
    start.setHours(DEFAULT_HOUR, 0, 0, 0);
    const ok = await cal.create({ type, title, starts_at: start.toISOString(), ends_at: null });
    setIsPicking(false);
    if (ok) toast.success(`נוסף ל-${format(selected, 'd/M')}. אפשר לשנות שעה ביומן`);
    else toast.error('לא הצלחנו להוסיף, נסו שוב');
  };

  const selEvents = eventsOn(selected);
  const selWatch = watchOn(selected);

  return (
    <div className="space-y-card-gap">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="החודש הקודם" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner">
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="text-card-title">{format(cursor, 'LLLL yyyy', { locale: he })}</p>
        <button type="button" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="החודש הבא" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner">
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      {cal.isLoading ? (
        <Skeleton className="h-80 rounded-card" />
      ) : (
        <Card className="p-3">
          <div className="grid grid-cols-7 text-center text-label text-muted-foreground">
            {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((d) => {
              const evs = eventsOn(d);
              const watch = watchOn(d);
              const anyDone = evs.some((e) => e.done) || watch.length > 0;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setSelected(d)}
                  aria-pressed={isSameDay(d, selected)}
                  aria-label={`${format(d, 'd/M')}${evs.length ? `, ${evs.length} מתוכננים` : ''}${anyDone ? ', בוצע' : ''}`}
                  className={cn(
                    'relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-inner text-body tabular-nums',
                    !isSameMonth(d, cursor) && 'text-muted-foreground/50',
                    isSameDay(d, selected) && 'bg-primary-tint',
                    isToday(d) && 'ring-1 ring-primary font-bold',
                  )}
                >
                  {format(d, 'd')}
                  <span className="flex h-1.5 gap-0.5">
                    {evs.slice(0, 2).map((e) => <span key={e.key} className={cn('h-1.5 w-1.5 rounded-pill', EVENT_COLORS[e.type].dot)} />)}
                    {watch.length > 0 && <span className="h-1.5 w-1.5 rounded-pill bg-foreground" />}
                  </span>
                  {anyDone && <Check className="absolute left-1 top-1 h-3 w-3 text-success" strokeWidth={3} aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-label text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-pill bg-primary" />אימון</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-pill bg-success" />הליכה</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-pill bg-foreground" />מהשעון</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3 w-3 text-success" strokeWidth={3} />בוצע</span>
          </div>
        </Card>
      )}

      <Card className="space-y-2 p-4">
        <p className="text-body font-bold">{format(selected, 'EEEE d/M', { locale: he })}</p>
        {selEvents.length === 0 && selWatch.length === 0 && (
          <p className="text-label text-muted-foreground">אין אימון או הליכה ביום הזה</p>
        )}
        {selEvents.map((e) => (
          <div key={e.key} className="flex min-h-[48px] items-center gap-3 rounded-inner bg-card-inner px-3">
            {e.type === 'walk' ? <Footprints className="h-5 w-5 text-success" strokeWidth={2} /> : <Dumbbell className="h-5 w-5 text-primary" strokeWidth={2} />}
            <span className="flex-1 text-body">{e.title}</span>
            <span className="text-label text-muted-foreground">{e.hasTime ? format(e.start, 'HH:mm') : ''}</span>
            {e.done && <Check className="h-4 w-4 text-success" strokeWidth={2} aria-label="בוצע" />}
          </div>
        ))}
        {selWatch.map((w) => (
          <div key={w.id} className="flex min-h-[48px] items-center gap-3 rounded-inner bg-card-inner px-3">
            <Watch className="h-5 w-5 text-foreground" strokeWidth={2} />
            <span className="flex-1 text-body">{KIND_LABELS[w.kind]} · {w.duration_min} דק'</span>
            <Check className="h-4 w-4 text-success" strokeWidth={2} aria-label="בוצע" />
          </div>
        ))}
        <SecondaryButton icon={Plus} className="w-full" onClick={() => setIsPicking(true)}>
          הוסף אימון ליום הזה
        </SecondaryButton>
      </Card>

      <Dialog open={isPicking} onOpenChange={setIsPicking}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>מה מוסיפים ל-{format(selected, 'd/M')}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {planDays.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(`אימון: ${p.name}`, 'workout')}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-inner border border-border bg-card px-4 text-right text-body font-semibold"
              >
                <Dumbbell className="h-5 w-5 text-primary" strokeWidth={2} />
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => add('הליכה', 'walk')}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-inner border border-border bg-card px-4 text-right text-body font-semibold"
            >
              <Footprints className="h-5 w-5 text-success" strokeWidth={2} />
              הליכה
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
