import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarSync, Check, ChevronLeft, ChevronRight, Clock, Dumbbell, Footprints, Lock, Moon, Plus, Sun, Utensils, UtensilsCrossed } from 'lucide-react';
import { eatStyle } from '@/lib/eventStyle';
import { ActivitySheet } from '@/components/activities/ActivitySheet';
import { useRunBuiltWorkout } from '@/hooks/useRunBuiltWorkout';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { CalEvent, EVENT_COLORS, eventDay, isPointEvent, useCalendar } from '@/hooks/useCalendar';
import { EventEditor } from '@/components/calendar/EventEditor';
import { Card, EmptyState, SecondaryButton } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { isDeviceCalendarAvailable, syncToDeviceCalendar } from '@/lib/deviceCalendar';

type View = 'week' | 'month';
/** The app header's height: the sticky block sits right under it. */
const HEADER_TOP = 'calc(3.5rem + var(--app-safe-top))';
const WEEK_OPTS = { weekStartsOn: 0 as const };
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function EventRow({ event, onEdit, onDone, onUndo }: { event: CalEvent; onEdit?: () => void; onDone: () => void; onUndo: () => void }) {
  // A workout/walk can be ticked any time on its day; a custom event once its time has come.
  const allDay = !event.hasTime || event.source === 'workout' || event.source === 'walk';
  const past = allDay ? event.start.getTime() < new Date().setHours(0, 0, 0, 0) + 86_400_000 : event.start.getTime() < Date.now();
  const eat = eatStyle(event);
  return (
    <div className={cn('flex min-h-[52px] items-center gap-3 rounded-inner px-3 py-2', eat ? eat.card : 'bg-card-inner')}>
      {/* Eating window: green / red cutlery (closing adds a lock); wake-up / bedtime a sun / moon;
          workout / walk their own icon; everything else its colour dot. */}
      {eat ? (
        <span className={cn('flex shrink-0 items-center gap-0.5', eat.tint)} aria-hidden>
          {event.type === 'eat_stop' ? <UtensilsCrossed className="h-4 w-4" strokeWidth={2} /> : <Utensils className="h-4 w-4" strokeWidth={2} />}
          {event.type === 'eat_stop' && <Lock className="h-3 w-3" strokeWidth={2.5} />}
        </span>
      ) : event.source === 'habit' ? (
        <Utensils className={cn('shrink-0 text-muted-foreground', event.size === 'small' ? 'h-3 w-3' : 'h-4 w-4')} strokeWidth={2} aria-hidden />
      ) : event.source === 'workout' ? (
        <Dumbbell className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
      ) : event.source === 'walk' ? (
        <Footprints className="h-4 w-4 shrink-0 text-success" strokeWidth={2} aria-hidden />
      ) : event.source === 'sleep' ? (
        event.type === 'wake' ? (
          <Sun className="h-4 w-4 shrink-0 text-primary-soft" strokeWidth={2} aria-hidden />
        ) : (
          <Moon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
        )
      ) : (
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-pill', EVENT_COLORS[event.type].dot)} aria-hidden />
      )}
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className="min-w-0 flex-1 text-right disabled:cursor-default"
      >
        <p className={cn('truncate text-body font-semibold', event.done && 'text-muted-foreground')}>{event.title}</p>
        <p className={cn('text-label tabular-nums', eat ? eat.tint : 'text-muted-foreground')}>
          {event.hasTime ? (
            // Times read left to right even inside Hebrew ("18:00–19:00", never reversed).
            <span dir="ltr">
              {event.end && !isPointEvent(event)
                ? `${format(event.start, 'HH:mm')}–${format(event.end, 'HH:mm')}`
                : format(event.start, 'HH:mm')}
            </span>
          ) : (
            'במהלך היום'
          )}
          {event.optional ? ' · לא חובה' : ''}
        </p>
      </button>
      {/* One look everywhere: done = green V "בוצע" (a status — tapping offers to undo);
          not done yet = an orange-outlined "סמן בוצע" button. */}
      {event.done ? (
        <button
          type="button"
          onClick={onUndo}
          aria-label="בוצע. פרטים וביטול"
          className="inline-flex min-h-[44px] items-center gap-1 text-label font-semibold text-success"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          בוצע
        </button>
      ) : past && !event.readOnly ? (
        <button
          type="button"
          onClick={onDone}
          className="h-11 shrink-0 rounded-pill border border-primary px-4 text-label font-semibold text-primary"
        >
          סמן בוצע
        </button>
      ) : null}
    </div>
  );
}

export default function AppCalendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [editor, setEditor] = useState<{ open: boolean; event?: CalEvent | null; date?: Date }>({ open: false });
  const [isSyncing, setIsSyncing] = useState(false);
  // "הוסף פעילות ליום הזה" — the activity sheet for one day.
  const [activityDay, setActivityDay] = useState<Date | null>(null);
  const runBuiltWorkout = useRunBuiltWorkout(() => cal.reload());

  const range = useMemo(() => {
    if (view === 'week') return { from: startOfWeek(cursor, WEEK_OPTS), to: endOfWeek(cursor, WEEK_OPTS) };
    return { from: startOfWeek(startOfMonth(cursor), WEEK_OPTS), to: endOfWeek(endOfMonth(cursor), WEEK_OPTS) };
  }, [view, cursor]);

  const cal = useCalendar(user?.id, range.from, range.to);
  const days = useMemo(() => {
    const list: Date[] = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) list.push(d);
    return list;
  }, [range]);
  const eventsOn = (d: Date) => cal.events.filter((e) => eventDay(e) === format(d, 'yyyy-MM-dd'));

  const step = (dir: 1 | -1) => setCursor((c) => (view === 'week' ? addWeeks(c, dir) : addMonths(c, dir)));
  const title =
    view === 'week'
      ? `${format(range.from, 'd/M')} – ${format(range.to, 'd/M')}`
      : format(cursor, 'LLLL yyyy', { locale: he });

  const openEditor = (event?: CalEvent | null, date?: Date) => setEditor({ open: true, event, date });

  // ── Sticky top block: its border shows only once the list has scrolled under it ──
  const stickyRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /** Puts today's card just under the sticky block, or goes back to the top. */
  const landOnToday = (behavior: ScrollBehavior) => {
    const card = todayRef.current;
    const bar = stickyRef.current?.getBoundingClientRect().bottom ?? 0;
    if (!card) return window.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: Math.max(0, card.getBoundingClientRect().top + window.scrollY - bar - 12), behavior });
  };

  // On open, and after moving to another week/month: today if it's in view, else the top.
  const rangeKey = `${view}:${format(range.from, 'yyyy-MM-dd')}`;
  const landedFor = useRef<string | null>(null);
  useEffect(() => {
    if (cal.isLoading || landedFor.current === rangeKey) return;
    const first = landedFor.current === null;
    landedFor.current = rangeKey;
    requestAnimationFrame(() => landOnToday(first ? 'auto' : 'smooth'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal.isLoading, rangeKey]);

  const sync = async () => {
    if (!user) return;
    setIsSyncing(true);
    const upcoming = cal.events.filter((e) => e.start.getTime() >= new Date().setHours(0, 0, 0, 0));
    const res = await syncToDeviceCalendar(user.id, upcoming);
    setIsSyncing(false);
    if (res.status === 'ok') toast.success(res.added ? `נוספו ${res.added} אירועים ליומן של הטלפון` : 'היומן של הטלפון כבר מעודכן');
    else if (res.status === 'denied') toast.error('אין הרשאה ליומן. אפשר לאשר בהגדרות הטלפון');
    else toast('הסנכרון זמין באפליקציה בטלפון');
  };

  const renderDayEvents = (d: Date) => {
    const list = eventsOn(d);
    if (list.length === 0) return <p className="px-1 text-label text-muted-foreground">אין אירועים</p>;
    return list.map((e) => (
      <EventRow
        key={e.key}
        event={e}
        onEdit={
          e.source === 'custom'
            ? () => openEditor(e)
            : e.source === 'habit' && e.explanation
            ? () => toast(e.title, { description: e.explanation ?? undefined })
            : undefined
        }
        onDone={() => cal.markDone(e)}
        onUndo={() =>
          toast(`${e.title} · בוצע`, {
            action: { label: 'בטל סימון', onClick: () => cal.unmarkDone(e) },
          })
        }
      />
    ));
  };

  return (
    <div className="min-h-screen space-y-card-gap px-4 pb-24">
      {/* Fixed part: title, week/month switch and navigation. Opaque, so the
          days never show through; only what's below it scrolls. */}
      <div
        ref={stickyRef}
        className={cn(
          'sticky z-30 -mx-4 space-y-3 border-b bg-[#0E0E11] px-4 pb-3 pt-4 transition-colors duration-150',
          scrolled ? 'border-[#26262D]' : 'border-transparent',
        )}
        style={{ top: HEADER_TOP }}
      >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="חזרה"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-pill text-muted-foreground"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2} />
          </button>
          <h2 className="text-screen-title">היומן שלי</h2>
        </div>
        <button
          type="button"
          onClick={() => openEditor(null, selected)}
          aria-label="הוספת אירוע"
          className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-primary text-primary-foreground"
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
        </button>
      </header>

      <div role="tablist" aria-label="תצוגה" className="grid grid-cols-2 gap-1 rounded-inner bg-card-inner p-1">
        {(['week', 'month'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'min-h-[44px] rounded-button text-body font-semibold transition-colors',
              view === v ? 'bg-card text-foreground' : 'text-muted-foreground',
            )}
          >
            {v === 'week' ? 'שבוע' : 'חודש'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} aria-label="הקודם" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner">
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="text-card-title">{title}</p>
        <button type="button" onClick={() => step(1)} aria-label="הבא" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner">
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
      </div>

      {cal.isLoading ? (
        <Skeleton className="h-96 rounded-card" />
      ) : view === 'week' ? (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.toISOString()} ref={isToday(d) ? todayRef : undefined}>
            <Card className={cn('space-y-2 p-4', isToday(d) && 'border-2 border-primary')}>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => navigate(`/app/calendar/day/${format(d, 'yyyy-MM-dd')}`)}
                  aria-label={`תצוגת יום ${format(d, 'd/M')}`}
                  className="flex min-h-[44px] items-center gap-2 text-body font-bold"
                >
                  {format(d, 'EEEE', { locale: he })} <span className="text-muted-foreground font-normal">{format(d, 'd/M')}</span>
                  {isToday(d) && (
                    <span className="rounded-pill bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">היום</span>
                  )}
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => openEditor(null, d)}
                  aria-label={`הוספת אירוע ל-${format(d, 'd/M')}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-muted-foreground"
                >
                  <Plus className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              {renderDayEvents(d)}
              <button
                type="button"
                onClick={() => setActivityDay(d)}
                className="min-h-[44px] w-full text-right text-label font-semibold text-primary-soft"
              >
                + הוסף פעילות ליום הזה
              </button>
            </Card>
            </div>
          ))}
        </div>
      ) : (
        <>
          <Card className="p-3">
            <div className="grid grid-cols-7 text-center text-label text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1">{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {days.map((d) => {
                const list = eventsOn(d);
                const isSel = isSameDay(d, selected);
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setSelected(d)}
                    aria-pressed={isSel}
                    aria-label={`${format(d, 'd/M')}${list.length ? `, ${list.length} אירועים` : ''}`}
                    className={cn(
                      'flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-inner text-body tabular-nums',
                      !isSameMonth(d, cursor) && 'text-muted-foreground/50',
                      isSel && 'bg-primary-tint',
                      isToday(d) && 'font-bold text-primary-soft',
                    )}
                  >
                    {format(d, 'd')}
                    <span className="flex h-1.5 gap-0.5">
                      {list.slice(0, 3).map((e) => (
                        <span key={e.key} className={cn('h-1.5 w-1.5 rounded-pill', EVENT_COLORS[e.type].dot, e.done && 'opacity-40')} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="space-y-2 p-4">
            <p className="text-body font-bold">{format(selected, 'EEEE d/M', { locale: he })}</p>
            {renderDayEvents(selected)}
          </Card>
        </>
      )}

      {!cal.isLoading && cal.events.length === 0 && view === 'week' && (
        <EmptyState
          icon={Clock}
          title="השבוע עוד ריק"
          description="אפשר להוסיף הליכה, אימון, ארוחה או שינה"
        />
      )}

      {isDeviceCalendarAvailable() && (
        <SecondaryButton icon={CalendarSync} className="w-full" onClick={sync} disabled={isSyncing}>
          {isSyncing ? 'מסנכרן...' : 'סנכרון ליומן של הטלפון'}
        </SecondaryButton>
      )}

      <ActivitySheet
        open={!!activityDay}
        onOpenChange={(o) => {
          if (!o) {
            setActivityDay(null);
            cal.reload();
          }
        }}
        defaultDate={activityDay ?? undefined}
        onRunWorkout={runBuiltWorkout}
      />

      <EventEditor
        open={editor.open}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        event={editor.event}
        defaultDate={editor.date}
        actions={cal}
      />
    </div>
  );
}
